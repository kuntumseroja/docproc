import pytest
from app.services.ocr import OCRPipeline, TesseractOCREngine, OCRResult, OCRStatus


def test_ocr_result_creation():
    result = OCRResult(
        page_number=1, text="Sample text", confidence=0.95,
        status=OCRStatus.SUCCESS, engine="test",
    )
    assert result.page_number == 1
    assert result.text == "Sample text"
    assert result.confidence == 0.95


def test_ocr_pipeline_creation():
    primary = TesseractOCREngine()
    fallback = TesseractOCREngine()
    pipeline = OCRPipeline(primary, fallback, min_confidence=0.7)
    assert pipeline.primary_engine is not None
    assert pipeline.fallback_engine is not None


def test_tesseract_engine_available():
    engine = TesseractOCREngine()
    assert isinstance(engine.is_available(), bool)
