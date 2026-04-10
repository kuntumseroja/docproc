from __future__ import annotations

import logging
from pathlib import Path

from app.services.ocr import OCRPipeline, MistralOCREngine, TesseractOCREngine
from app.services.document_processor import DocumentProcessor

logger = logging.getLogger(__name__)

# Predefined workflow configs
WORKFLOW_CONFIGS = {
    "invoice": {
        "fields": [
            {"name": "invoice_number", "description": "Invoice ID"},
            {"name": "invoice_date", "description": "Issue date"},
            {"name": "total_amount", "description": "Total amount due"},
            {"name": "vendor_name", "description": "Issuing vendor"},
        ],
        "tables": [
            {
                "name": "line_items",
                "description": "Invoice line items",
                "columns": ["description", "quantity", "unit_price", "total"],
            }
        ],
    },
    "contract": {
        "fields": [
            {"name": "parties", "description": "Contract parties"},
            {"name": "effective_date", "description": "Contract start date"},
            {"name": "expiration_date", "description": "Contract end date"},
            {"name": "payment_terms", "description": "Payment terms"},
        ],
        "tables": [],
    },
    "resume": {
        "fields": [
            {"name": "full_name", "description": "Candidate name"},
            {"name": "email", "description": "Email address"},
            {"name": "phone", "description": "Phone number"},
            {"name": "summary", "description": "Professional summary"},
        ],
        "tables": [
            {
                "name": "experience",
                "description": "Work experience",
                "columns": ["company", "position", "start_date", "end_date"],
            },
            {
                "name": "skills",
                "description": "Technical and soft skills",
                "columns": ["skill_name", "proficiency_level"],
            },
        ],
    },
    "generic": {
        "fields": [
            {"name": "title", "description": "Document title"},
            {"name": "date", "description": "Document date"},
            {"name": "author", "description": "Document author"},
        ],
        "tables": [],
    },
}


def get_workflow_config(workflow_id: str) -> dict:
    return WORKFLOW_CONFIGS.get(workflow_id, WORKFLOW_CONFIGS["generic"])


def process_document_task(document_id: str, workflow_id: str = "generic"):
    """Process a document (called from Celery or background task)."""
    logger.info(f"Processing document: {document_id} with workflow: {workflow_id}")

    try:
        mistral_engine = MistralOCREngine()
        tesseract_engine = TesseractOCREngine()
        ocr_pipeline = OCRPipeline(mistral_engine, tesseract_engine)
        document_processor = DocumentProcessor(ocr_pipeline)

        # TODO: download from storage, process, extract, save results
        logger.info(f"Document processing completed: {document_id}")
        return {"status": "completed", "document_id": document_id}

    except Exception as e:
        logger.error(f"Document processing failed: {document_id} - {e}")
        raise
