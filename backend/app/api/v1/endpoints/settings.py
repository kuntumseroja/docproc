from __future__ import annotations

import shutil
from typing import List

import httpx
from fastapi import APIRouter, HTTPException

from app.config import settings
from app.schemas.settings import (
    CurrentModelConfig,
    OCRConfig,
    ProviderHealth,
    ProviderModels,
    UpdateModelConfig,
    UpdateOCRConfig,
)
from app.services.llm_provider import (
    AVAILABLE_MODELS,
    LLMConfig,
    LLMProviderFactory,
    ProviderType,
)

router = APIRouter(prefix="/models", tags=["models"])


@router.get("/available", response_model=List[ProviderModels])
async def list_available_models():
    """List available models per provider. Ollama models are fetched live."""
    result = []
    for provider, models in AVAILABLE_MODELS.items():
        if provider == "ollama":
            continue  # handled below with live fetch
        result.append(ProviderModels(provider=provider, models=models))

    # Fetch Ollama models live
    ollama_models = []
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            resp.raise_for_status()
            for m in resp.json().get("models", []):
                name = m.get("name", "")
                # Skip embedding-only models
                if "embed" in name.lower():
                    continue
                ollama_models.append({"id": name, "name": name})
    except Exception:
        # Ollama not running — fall back to hardcoded list
        ollama_models = AVAILABLE_MODELS.get("ollama", [])

    result.append(ProviderModels(provider="ollama", models=ollama_models))
    return result


@router.get("/current", response_model=CurrentModelConfig)
async def get_current_model():
    """Get current active LLM configuration."""
    provider_type = ProviderType(settings.LLM_PROVIDER)
    config = LLMConfig(provider=provider_type, model=settings.LLM_MODEL)
    return CurrentModelConfig(
        provider=settings.LLM_PROVIDER,
        model=config.get_model(),
    )


@router.put("/current", response_model=CurrentModelConfig)
async def update_current_model(body: UpdateModelConfig):
    """Switch LLM provider and model. Changes apply at runtime (not persisted to .env)."""
    try:
        provider_type = ProviderType(body.provider)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {body.provider}")

    # Update runtime settings
    settings.LLM_PROVIDER = body.provider
    settings.LLM_MODEL = body.model

    config = LLMConfig(provider=provider_type, model=body.model)
    return CurrentModelConfig(
        provider=body.provider,
        model=config.get_model(),
    )


@router.get("/health", response_model=List[ProviderHealth])
async def check_provider_health():
    """Health check all configured providers."""
    results = []

    checks = [
        (ProviderType.ANTHROPIC, settings.ANTHROPIC_API_KEY),
        (ProviderType.OPENAI, settings.OPENAI_API_KEY),
        (ProviderType.MISTRAL, settings.MISTRAL_API_KEY),
    ]

    for provider_type, api_key in checks:
        if not api_key:
            results.append(ProviderHealth(
                provider=provider_type.value,
                status="not_configured",
            ))
            continue
        try:
            config = LLMConfig(provider=provider_type, api_key=api_key)
            provider = LLMProviderFactory.create(config)
            health = await provider.health_check()
            results.append(ProviderHealth(**health))
        except Exception as e:
            results.append(ProviderHealth(
                provider=provider_type.value,
                status="error",
                error=str(e),
            ))

    # Ollama — always attempt
    try:
        config = LLMConfig(
            provider=ProviderType.OLLAMA,
            base_url=settings.OLLAMA_BASE_URL,
        )
        provider = LLMProviderFactory.create(config)
        health = await provider.health_check()
        results.append(ProviderHealth(**health))
    except Exception as e:
        results.append(ProviderHealth(
            provider="ollama",
            status="error",
            error=str(e),
        ))

    return results


@router.get("/ocr", response_model=OCRConfig)
async def get_ocr_config():
    """Get current OCR configuration."""
    tesseract_installed = shutil.which(settings.TESSERACT_PATH) is not None
    return OCRConfig(
        provider=settings.OCR_PROVIDER,
        tesseract_installed=tesseract_installed,
    )


@router.put("/ocr", response_model=OCRConfig)
async def update_ocr_config(body: UpdateOCRConfig):
    """Switch OCR provider at runtime."""
    if body.provider not in ("tesseract", "mistral"):
        raise HTTPException(status_code=400, detail=f"Unknown OCR provider: {body.provider}")
    if body.provider == "tesseract" and not shutil.which(settings.TESSERACT_PATH):
        raise HTTPException(status_code=400, detail="Tesseract is not installed. Run: brew install tesseract")
    if body.provider == "mistral" and not settings.MISTRAL_API_KEY:
        raise HTTPException(status_code=400, detail="MISTRAL_API_KEY not configured in .env")
    settings.OCR_PROVIDER = body.provider
    tesseract_installed = shutil.which(settings.TESSERACT_PATH) is not None
    return OCRConfig(
        provider=settings.OCR_PROVIDER,
        tesseract_installed=tesseract_installed,
    )
