from typing import List, Optional

from pydantic import BaseModel


class ModelInfo(BaseModel):
    id: str
    name: str


class ProviderModels(BaseModel):
    provider: str
    models: List[ModelInfo]


class CurrentModelConfig(BaseModel):
    provider: str
    model: str


class UpdateModelConfig(BaseModel):
    provider: str
    model: Optional[str] = None


class OCRConfig(BaseModel):
    provider: str
    tesseract_installed: bool = False


class UpdateOCRConfig(BaseModel):
    provider: str  # tesseract | mistral


class ProviderHealth(BaseModel):
    provider: str
    status: str
    error: Optional[str] = None
    models: Optional[List[str]] = None
    model: Optional[str] = None
