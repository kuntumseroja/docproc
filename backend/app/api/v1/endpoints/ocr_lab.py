"""OCR Lab — experimental multimodal OCR endpoints.

Sandbox for evaluating IBM granite-docling-258M alongside the production
Tesseract / Mistral OCR engines. Endpoints are read-only relative to the
main pipeline — they do NOT save documents to the database or alter the
workflow state.
"""
from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.api.deps import get_current_user
from app.models.user import User
from app.services.granite_docling_engine import (
    GraniteDoclingEngine,
    get_engine,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ocr-lab", tags=["ocr-lab"])


# --- Status / install hint --------------------------------------------------

@router.get("/status")
async def ocr_lab_status(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Report whether the granite-docling engine is installed and ready."""
    return GraniteDoclingEngine.status()


# --- Process a single file --------------------------------------------------

ALLOWED_OCR_LAB_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/tiff",
    "image/webp",
}


@router.post("/process")
async def ocr_lab_process(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Upload a document and run granite-docling against it.

    Returns the structured multimodal result — text, tables, signatures,
    images, form fields. Nothing is persisted to the main DB; this is a
    pure preview endpoint.
    """
    if not GraniteDoclingEngine.is_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "engine_not_installed",
                "message": (
                    "Granite-Docling is not installed in this environment. "
                    "Run: pip install -r backend/requirements-granite.txt"
                ),
                "status": GraniteDoclingEngine.status(),
            },
        )

    if file.content_type not in ALLOWED_OCR_LAB_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type for OCR Lab: {file.content_type}",
        )

    # Persist to a temp file (docling reads from disk)
    suffix = Path(file.filename or "input").suffix or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = Path(tmp.name)

    try:
        engine = get_engine()
        result = engine.process(tmp_path)
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass

    if result.status == "failed":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "ocr_failed",
                "message": result.error_message or "OCR processing failed",
                "processing_time_ms": result.processing_time_ms,
            },
        )

    payload = result.to_dict()
    payload["file_name"] = file.filename
    payload["file_size"] = (
        getattr(file, "size", None)
        or (file.file.tell() if file.file else 0)
    )
    return payload


# --- Sample suggestions -----------------------------------------------------

_SAMPLES: List[Dict[str, str]] = [
    {
        "id": "uu-pdp-policy",
        "title": "Privacy Policy (text-heavy PDF)",
        "description": "Plain-text-heavy PDF. Baseline for paragraph + heading extraction.",
        "good_for": "text, headings",
    },
    {
        "id": "form-handwritten",
        "title": "Form with handwritten fields",
        "description": "Application form with mixed printed labels and handwritten values + signature line.",
        "good_for": "form_fields, handwriting, signatures",
    },
    {
        "id": "bank-statement",
        "title": "Bank statement (table-heavy)",
        "description": "Multi-page statement with transaction tables.",
        "good_for": "tables",
    },
    {
        "id": "claim-with-photos",
        "title": "Insurance claim with embedded photos",
        "description": "Claim form referencing supporting photos embedded inline.",
        "good_for": "images, form_fields",
    },
    {
        "id": "scanned-contract",
        "title": "Scanned signed contract",
        "description": "Scanned PDF of a contract with multiple signature blocks.",
        "good_for": "signatures, layout",
    },
]


@router.get("/samples")
async def ocr_lab_samples(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return suggested document types for evaluating the lab."""
    return {"samples": _SAMPLES}
