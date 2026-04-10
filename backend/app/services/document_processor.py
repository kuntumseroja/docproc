from __future__ import annotations

from pathlib import Path
from typing import Optional, List
from dataclasses import dataclass
from .ocr import OCRPipeline, OCRResult
import logging

logger = logging.getLogger(__name__)


@dataclass
class ProcessedDocument:
    """Container for a processed document with all extracted pages."""
    document_id: str
    file_path: Path
    file_type: str
    total_pages: int
    ocr_results: List[OCRResult]
    status: str  # "success", "partial", "failed"
    error_message: Optional[str] = None


class DocumentProcessor:
    """Orchestrates document processing workflow."""

    def __init__(self, ocr_pipeline: OCRPipeline):
        self.ocr_pipeline = ocr_pipeline

    def process(self, document_path: Path, document_id: str) -> ProcessedDocument:
        try:
            file_type = document_path.suffix.lower()

            if file_type in [".png", ".jpg", ".jpeg", ".tiff"]:
                preprocessed = self.ocr_pipeline.preprocess_image(document_path)
                ocr_results = [self.ocr_pipeline.process_page(preprocessed)]
            else:
                ocr_results = self.ocr_pipeline.process_document(document_path)

            status = "success" if ocr_results and ocr_results[0].text else "partial"

            return ProcessedDocument(
                document_id=document_id,
                file_path=document_path,
                file_type=file_type,
                total_pages=len(ocr_results),
                ocr_results=ocr_results,
                status=status,
            )
        except Exception as e:
            logger.error(f"Document processing failed: {e}")
            return ProcessedDocument(
                document_id=document_id,
                file_path=document_path,
                file_type=document_path.suffix.lower(),
                total_pages=0,
                ocr_results=[],
                status="failed",
                error_message=str(e),
            )
