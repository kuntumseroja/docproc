from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List
from abc import ABC, abstractmethod
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class OCRStatus(str, Enum):
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"


@dataclass
class OCRResult:
    """Container for OCR output from a single page."""
    page_number: int
    text: str
    confidence: float
    status: OCRStatus
    engine: str
    raw_response: Optional[dict] = None
    error_message: Optional[str] = None
    processing_time_ms: float = 0.0
    metadata: dict = field(default_factory=dict)


class BaseOCREngine(ABC):
    """Abstract base class for OCR engines."""

    def __init__(self, name: str):
        self.name = name

    @abstractmethod
    def process_image(self, image_path: Path) -> OCRResult:
        pass

    @abstractmethod
    def is_available(self) -> bool:
        pass


class MistralOCREngine(BaseOCREngine):
    """Mistral-powered OCR engine."""

    def __init__(self, api_key: Optional[str] = None, model: str = "mistral-ocr"):
        super().__init__("mistral")
        self.api_key = api_key
        self.model = model
        self.client = None
        self._init_client()

    def _init_client(self):
        try:
            from mistralai import Mistral
            self.client = Mistral(api_key=self.api_key)
        except Exception as e:
            logger.error(f"Failed to initialize Mistral client: {e}")
            self.client = None

    def is_available(self) -> bool:
        return self.client is not None

    def process_image(self, image_path: Path) -> OCRResult:
        import time
        start = time.time()

        if not self.is_available():
            return OCRResult(
                page_number=0, text="", confidence=0.0,
                status=OCRStatus.FAILED, engine="mistral",
                error_message="Mistral client not initialized",
            )

        try:
            with open(image_path, "rb") as f:
                image_data = f.read()

            response = self.client.ocr.process(model=self.model, image=image_data)
            text = response.get("text", "") if hasattr(response, "get") else getattr(response, "text", "")
            confidence = response.get("confidence", 0.95) if hasattr(response, "get") else getattr(response, "confidence", 0.95)
            processing_time = (time.time() - start) * 1000

            return OCRResult(
                page_number=0, text=text, confidence=confidence,
                status=OCRStatus.SUCCESS, engine="mistral",
                raw_response=response if isinstance(response, dict) else None,
                processing_time_ms=processing_time,
            )
        except Exception as e:
            processing_time = (time.time() - start) * 1000
            logger.error(f"Mistral OCR failed: {e}")
            return OCRResult(
                page_number=0, text="", confidence=0.0,
                status=OCRStatus.FAILED, engine="mistral",
                error_message=str(e), processing_time_ms=processing_time,
            )


class TesseractOCREngine(BaseOCREngine):
    """Tesseract-powered OCR engine."""

    def __init__(self):
        super().__init__("tesseract")
        self.pytesseract = None
        self._init_tesseract()

    def _init_tesseract(self):
        try:
            import pytesseract
            self.pytesseract = pytesseract
        except Exception as e:
            logger.error(f"Failed to initialize Tesseract: {e}")

    def is_available(self) -> bool:
        return self.pytesseract is not None

    def process_image(self, image_path: Path) -> OCRResult:
        import time
        from PIL import Image

        start = time.time()

        if not self.is_available():
            return OCRResult(
                page_number=0, text="", confidence=0.0,
                status=OCRStatus.FAILED, engine="tesseract",
                error_message="Tesseract not available",
            )

        try:
            image = Image.open(image_path)
            text = self.pytesseract.image_to_string(image)
            processing_time = (time.time() - start) * 1000

            return OCRResult(
                page_number=0, text=text, confidence=0.85,
                status=OCRStatus.SUCCESS, engine="tesseract",
                processing_time_ms=processing_time,
            )
        except Exception as e:
            processing_time = (time.time() - start) * 1000
            logger.error(f"Tesseract OCR failed: {e}")
            return OCRResult(
                page_number=0, text="", confidence=0.0,
                status=OCRStatus.FAILED, engine="tesseract",
                error_message=str(e), processing_time_ms=processing_time,
            )


class OCRPipeline:
    """Orchestrates OCR processing with primary/fallback engine strategy."""

    def __init__(
        self,
        primary_engine: BaseOCREngine,
        fallback_engine: Optional[BaseOCREngine] = None,
        min_confidence: float = 0.8,
    ):
        self.primary_engine = primary_engine
        self.fallback_engine = fallback_engine
        self.min_confidence = min_confidence

    def process_document(self, document_path: Path, page_numbers: Optional[List[int]] = None) -> List[OCRResult]:
        results = []
        try:
            from pdf2image import convert_from_path
            images = convert_from_path(str(document_path))

            if page_numbers:
                images = [images[i] for i in page_numbers if i < len(images)]

            for page_num, image in enumerate(images):
                result = self.process_page(image, page_num + 1)
                results.append(result)
        except Exception as e:
            logger.error(f"Error processing document: {e}")
        return results

    def process_page(self, image_or_path, page_number: int = 1) -> OCRResult:
        if hasattr(image_or_path, "save"):
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                image_or_path.save(tmp.name)
                image_path = Path(tmp.name)
        else:
            image_path = Path(image_or_path)

        if self.primary_engine.is_available():
            result = self.primary_engine.process_image(image_path)
            result.page_number = page_number
            if result.status == OCRStatus.SUCCESS and result.confidence >= self.min_confidence:
                return result

        if self.fallback_engine and self.fallback_engine.is_available():
            logger.info(f"Falling back to {self.fallback_engine.name}")
            result = self.fallback_engine.process_image(image_path)
            result.page_number = page_number
            return result

        return OCRResult(
            page_number=page_number, text="", confidence=0.0,
            status=OCRStatus.FAILED, engine="none",
            error_message="Both OCR engines unavailable or failed",
        )

    def preprocess_image(self, image_path: Path) -> Path:
        from PIL import Image, ImageEnhance, ImageFilter

        image = Image.open(image_path)
        image = ImageEnhance.Contrast(image).enhance(1.5)
        image = ImageEnhance.Brightness(image).enhance(1.1)
        image = image.filter(ImageFilter.MedianFilter(size=3))

        output_path = image_path.parent / f"{image_path.stem}_preprocessed.png"
        image.save(output_path)
        return output_path
