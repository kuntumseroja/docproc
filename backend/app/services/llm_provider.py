from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Type
import time


class ProviderType(str, Enum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    OLLAMA = "ollama"
    MISTRAL = "mistral"


@dataclass
class LLMConfig:
    provider: ProviderType
    model: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    temperature: float = 0.0
    max_tokens: int = 4096

    def get_model(self) -> str:
        """Return configured model or provider default."""
        if self.model:
            return self.model
        defaults = {
            ProviderType.ANTHROPIC: "claude-sonnet-4-20250514",
            ProviderType.OPENAI: "gpt-4o",
            ProviderType.OLLAMA: "llama3.1:8b",
            ProviderType.MISTRAL: "mistral-large-latest",
        }
        return defaults[self.provider]


@dataclass
class LLMResponse:
    content: str
    model: str
    provider: ProviderType
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: float = 0.0
    raw: dict[str, Any] = field(default_factory=dict)


class BaseLLMProvider(ABC):
    """Abstract base class for LLM providers."""

    def __init__(self, config: LLMConfig):
        self.config = config

    @abstractmethod
    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        ...

    @abstractmethod
    async def health_check(self) -> dict[str, Any]:
        ...

    @property
    def provider_type(self) -> ProviderType:
        return self.config.provider


class AnthropicProvider(BaseLLMProvider):
    """Anthropic Claude provider."""

    def __init__(self, config: LLMConfig):
        super().__init__(config)
        import anthropic
        self._client = anthropic.AsyncAnthropic(api_key=config.api_key)

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        start = time.time()
        model = self.config.get_model()

        # Extract system message if present
        system = None
        chat_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system = msg["content"]
            else:
                chat_messages.append(msg)

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": chat_messages,
            "max_tokens": max_tokens or self.config.max_tokens,
        }
        if temperature is not None:
            kwargs["temperature"] = temperature
        elif self.config.temperature > 0:
            kwargs["temperature"] = self.config.temperature
        if system:
            kwargs["system"] = system

        response = await self._client.messages.create(**kwargs)
        latency = (time.time() - start) * 1000

        return LLMResponse(
            content=response.content[0].text,
            model=model,
            provider=ProviderType.ANTHROPIC,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            latency_ms=latency,
        )

    async def health_check(self) -> dict[str, Any]:
        try:
            response = await self._client.messages.create(
                model=self.config.get_model(),
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=5,
            )
            return {"status": "ok", "provider": "anthropic", "model": self.config.get_model()}
        except Exception as e:
            return {"status": "error", "provider": "anthropic", "error": str(e)}


class OpenAIProvider(BaseLLMProvider):
    """OpenAI provider."""

    def __init__(self, config: LLMConfig):
        super().__init__(config)
        import openai
        self._client = openai.AsyncOpenAI(api_key=config.api_key)

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        start = time.time()
        model = self.config.get_model()

        response = await self._client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature if temperature is not None else self.config.temperature,
            max_tokens=max_tokens or self.config.max_tokens,
        )
        latency = (time.time() - start) * 1000

        choice = response.choices[0]
        usage = response.usage

        return LLMResponse(
            content=choice.message.content or "",
            model=model,
            provider=ProviderType.OPENAI,
            input_tokens=usage.prompt_tokens if usage else 0,
            output_tokens=usage.completion_tokens if usage else 0,
            latency_ms=latency,
        )

    async def health_check(self) -> dict[str, Any]:
        try:
            await self._client.chat.completions.create(
                model=self.config.get_model(),
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=5,
            )
            return {"status": "ok", "provider": "openai", "model": self.config.get_model()}
        except Exception as e:
            return {"status": "error", "provider": "openai", "error": str(e)}


class OllamaProvider(BaseLLMProvider):
    """Ollama on-premise provider."""

    def __init__(self, config: LLMConfig):
        super().__init__(config)
        import httpx
        base_url = config.base_url or "http://localhost:11434"
        self._client = httpx.AsyncClient(base_url=base_url, timeout=120.0)

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        start = time.time()
        model = self.config.get_model()

        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": False,
            "options": {},
        }
        if temperature is not None:
            payload["options"]["temperature"] = temperature
        elif self.config.temperature > 0:
            payload["options"]["temperature"] = self.config.temperature
        if max_tokens or self.config.max_tokens:
            payload["options"]["num_predict"] = max_tokens or self.config.max_tokens

        response = await self._client.post("/api/chat", json=payload)
        response.raise_for_status()
        data = response.json()
        latency = (time.time() - start) * 1000

        return LLMResponse(
            content=data.get("message", {}).get("content", ""),
            model=model,
            provider=ProviderType.OLLAMA,
            input_tokens=data.get("prompt_eval_count", 0),
            output_tokens=data.get("eval_count", 0),
            latency_ms=latency,
            raw=data,
        )

    async def health_check(self) -> dict[str, Any]:
        try:
            response = await self._client.get("/api/tags")
            response.raise_for_status()
            models = [m["name"] for m in response.json().get("models", [])]
            return {"status": "ok", "provider": "ollama", "models": models}
        except Exception as e:
            return {"status": "error", "provider": "ollama", "error": str(e)}


class MistralProvider(BaseLLMProvider):
    """Mistral AI provider."""

    def __init__(self, config: LLMConfig):
        super().__init__(config)
        from mistralai import Mistral
        self._client = Mistral(api_key=config.api_key)

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        start = time.time()
        model = self.config.get_model()

        response = await self._client.chat.complete_async(
            model=model,
            messages=messages,
            temperature=temperature if temperature is not None else self.config.temperature,
            max_tokens=max_tokens or self.config.max_tokens,
        )
        latency = (time.time() - start) * 1000

        choice = response.choices[0]
        usage = response.usage

        return LLMResponse(
            content=choice.message.content or "",
            model=model,
            provider=ProviderType.MISTRAL,
            input_tokens=usage.prompt_tokens if usage else 0,
            output_tokens=usage.completion_tokens if usage else 0,
            latency_ms=latency,
        )

    async def health_check(self) -> dict[str, Any]:
        try:
            response = await self._client.models.list_async()
            models = [m.id for m in response.data] if response.data else []
            return {"status": "ok", "provider": "mistral", "models": models}
        except Exception as e:
            return {"status": "error", "provider": "mistral", "error": str(e)}


class LLMProviderFactory:
    """Factory for creating LLM provider instances."""

    _providers: dict[ProviderType, type[BaseLLMProvider]] = {
        ProviderType.ANTHROPIC: AnthropicProvider,
        ProviderType.OPENAI: OpenAIProvider,
        ProviderType.OLLAMA: OllamaProvider,
        ProviderType.MISTRAL: MistralProvider,
    }

    @classmethod
    def create(cls, config: LLMConfig) -> BaseLLMProvider:
        provider_cls = cls._providers.get(config.provider)
        if not provider_cls:
            raise ValueError(f"Unsupported provider: {config.provider}")
        return provider_cls(config)

    @classmethod
    def from_settings(cls) -> BaseLLMProvider:
        """Create provider from application settings."""
        from app.config import settings

        provider_type = ProviderType(settings.LLM_PROVIDER)

        api_key_map = {
            ProviderType.ANTHROPIC: settings.ANTHROPIC_API_KEY,
            ProviderType.OPENAI: settings.OPENAI_API_KEY,
            ProviderType.MISTRAL: settings.MISTRAL_API_KEY,
            ProviderType.OLLAMA: None,
        }

        config = LLMConfig(
            provider=provider_type,
            model=settings.LLM_MODEL,
            api_key=api_key_map.get(provider_type),
            base_url=settings.OLLAMA_BASE_URL if provider_type == ProviderType.OLLAMA else None,
        )
        return cls.create(config)


# Available models per provider (for UI display)
AVAILABLE_MODELS: dict[str, list[dict[str, str]]] = {
    "anthropic": [
        {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4"},
        {"id": "claude-haiku-4-5-20251001", "name": "Claude Haiku 4.5"},
    ],
    "openai": [
        {"id": "gpt-4o", "name": "GPT-4o"},
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
    ],
    "ollama": [
        {"id": "llama3.1:8b", "name": "Llama 3.1 8B"},
        {"id": "llama3.1:70b", "name": "Llama 3.1 70B"},
        {"id": "mistral:7b", "name": "Mistral 7B"},
    ],
    "mistral": [
        {"id": "mistral-large-latest", "name": "Mistral Large"},
        {"id": "mistral-small-latest", "name": "Mistral Small"},
    ],
}
