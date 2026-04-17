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
    DEEPSEEK = "deepseek"


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
            ProviderType.DEEPSEEK: "deepseek-chat",
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


class DeepSeekProvider(BaseLLMProvider):
    """DeepSeek provider (OpenAI-compatible API)."""

    def __init__(self, config: LLMConfig):
        super().__init__(config)
        import openai
        self._client = openai.AsyncOpenAI(
            api_key=config.api_key,
            base_url="https://api.deepseek.com/v1",
        )

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
            provider=ProviderType.DEEPSEEK,
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
            return {"status": "ok", "provider": "deepseek", "model": self.config.get_model()}
        except Exception as e:
            return {"status": "error", "provider": "deepseek", "error": str(e)}


class FallbackProvider(BaseLLMProvider):
    """Wraps a primary provider with automatic fallback on rate-limit / quota / billing errors."""

    def __init__(self, primary: BaseLLMProvider, fallback: BaseLLMProvider):
        super().__init__(primary.config)
        self._primary = primary
        self._fallback = fallback

    @staticmethod
    def _should_fallback(exc: Exception) -> bool:
        """Return True if the exception indicates we should retry with the fallback provider.

        Covers: rate limits, quota exhaustion, insufficient credits/balance,
        billing issues, and temporary 5xx service errors.
        """
        # Anthropic rate limit
        try:
            from anthropic import RateLimitError as AnthropicRateLimit
            if isinstance(exc, AnthropicRateLimit):
                return True
        except ImportError:
            pass

        # OpenAI rate limit (also covers DeepSeek)
        try:
            from openai import RateLimitError as OpenAIRateLimit
            if isinstance(exc, OpenAIRateLimit):
                return True
        except ImportError:
            pass

        # HTTP status: 429 (rate limit), 402 (payment required), 529 (Anthropic overloaded)
        status = getattr(exc, "status_code", None) or getattr(exc, "status", None)
        if status in (429, 402, 529):
            return True

        # Check message for billing/quota/overload phrases (case-insensitive)
        err_msg = str(exc).lower()
        fallback_phrases = [
            "rate limit", "rate_limit", "too many requests",
            "quota exceeded", "quota_exceeded", "insufficient_quota",
            "credit balance", "credit_balance", "billing",
            "plans & billing", "purchase credits", "upgrade",
            "insufficient funds", "insufficient balance",
            "overloaded", "service unavailable",
        ]
        if any(phrase in err_msg for phrase in fallback_phrases):
            return True

        return False

    # Backward-compat alias
    @classmethod
    def _is_rate_limit(cls, exc: Exception) -> bool:
        return cls._should_fallback(exc)

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        import logging
        logger = logging.getLogger("llm.fallback")

        try:
            return await self._primary.chat(messages, temperature, max_tokens)
        except Exception as exc:
            if self._should_fallback(exc):
                logger.warning(
                    "Primary provider %s failed (rate-limit/quota/billing), falling back to %s: %s",
                    self._primary.provider_type.value,
                    self._fallback.provider_type.value,
                    exc,
                )
                return await self._fallback.chat(messages, temperature, max_tokens)
            raise

    async def health_check(self) -> dict[str, Any]:
        primary_health = await self._primary.health_check()
        fallback_health = await self._fallback.health_check()
        return {
            "primary": primary_health,
            "fallback": fallback_health,
        }

    @property
    def provider_type(self) -> ProviderType:
        return self._primary.provider_type


class LLMProviderFactory:
    """Factory for creating LLM provider instances."""

    _providers: dict[ProviderType, type[BaseLLMProvider]] = {
        ProviderType.ANTHROPIC: AnthropicProvider,
        ProviderType.OPENAI: OpenAIProvider,
        ProviderType.OLLAMA: OllamaProvider,
        ProviderType.MISTRAL: MistralProvider,
        ProviderType.DEEPSEEK: DeepSeekProvider,
    }

    _api_key_map_fields: dict[ProviderType, str] = {
        ProviderType.ANTHROPIC: "ANTHROPIC_API_KEY",
        ProviderType.OPENAI: "OPENAI_API_KEY",
        ProviderType.MISTRAL: "MISTRAL_API_KEY",
        ProviderType.DEEPSEEK: "DEEPSEEK_API_KEY",
        ProviderType.OLLAMA: "",
    }

    @classmethod
    def create(cls, config: LLMConfig) -> BaseLLMProvider:
        provider_cls = cls._providers.get(config.provider)
        if not provider_cls:
            raise ValueError(f"Unsupported provider: {config.provider}")
        return provider_cls(config)

    @classmethod
    def _build_provider(cls, provider_type: ProviderType, model: str | None = None) -> BaseLLMProvider:
        """Build a single provider instance from settings."""
        from app.config import settings

        api_key_field = cls._api_key_map_fields.get(provider_type, "")
        api_key = getattr(settings, api_key_field, None) if api_key_field else None

        config = LLMConfig(
            provider=provider_type,
            model=model,
            api_key=api_key,
            base_url=settings.OLLAMA_BASE_URL if provider_type == ProviderType.OLLAMA else None,
        )
        return cls.create(config)

    @classmethod
    def from_settings(cls) -> BaseLLMProvider:
        """Create provider from application settings.

        If LLM_FALLBACK_PROVIDER is configured, wraps the primary provider
        with a FallbackProvider that auto-switches on rate-limit errors.
        """
        from app.config import settings

        provider_type = ProviderType(settings.LLM_PROVIDER)
        primary = cls._build_provider(provider_type, settings.LLM_MODEL)

        # Wrap with fallback if configured
        fallback_name = settings.LLM_FALLBACK_PROVIDER
        if fallback_name:
            try:
                fallback_type = ProviderType(fallback_name)
                fallback_key_field = cls._api_key_map_fields.get(fallback_type, "")
                fallback_key = getattr(settings, fallback_key_field, None) if fallback_key_field else None
                if fallback_key or fallback_type == ProviderType.OLLAMA:
                    fallback = cls._build_provider(fallback_type)
                    return FallbackProvider(primary, fallback)
            except ValueError:
                pass  # Invalid fallback provider name — skip silently

        return primary


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
    "deepseek": [
        {"id": "deepseek-chat", "name": "DeepSeek V3"},
        {"id": "deepseek-reasoner", "name": "DeepSeek R1"},
    ],
}
