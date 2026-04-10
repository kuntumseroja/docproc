from __future__ import annotations

import json
import tempfile
import time
import uuid
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.document import Document, DocumentStatus
from app.models.extraction import Extraction
from app.models.user import User
from app.models.workflow import Workflow
from app.schemas.document import (
    ActionLogEntry,
    BatchProcessRequest,
    BatchProcessResponse,
    DocumentResultsResponse,
    DocumentStatusResponse,
    DocumentUploadResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED_CONTENT_TYPES = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/tiff",
]


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    workflow_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a document file."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    doc_id = uuid.uuid4()
    file_content = await file.read()
    remote_path = f"uploads/{doc_id}/{file.filename}"

    # Store file via MinIO (best-effort; fallback to DB path reference)
    try:
        from app.services.storage import get_storage
        storage = get_storage()
        storage.upload_bytes(file_content, remote_path, content_type=file.content_type)
    except Exception as e:
        logger.warning(f"Storage upload failed, storing path reference only: {e}")

    document = Document(
        id=doc_id,
        filename=f"{doc_id}_{file.filename}",
        original_filename=file.filename,
        content_type=file.content_type,
        file_size=len(file_content),
        storage_path=remote_path,
        status=DocumentStatus.UPLOADED,
        workflow_id=uuid.UUID(workflow_id) if workflow_id else None,
        uploaded_by=current_user.id,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    return DocumentUploadResponse(
        document_id=str(document.id),
        file_name=file.filename,
        upload_timestamp=document.created_at,
    )


@router.post("/process/{document_id}")
async def process_document(
    document_id: str,
    workflow_id: str = "generic",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Process a document: OCR → LLM extraction → save results."""
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    document.status = DocumentStatus.PROCESSING
    await db.commit()

    start_time = time.time()

    try:
        # --- Step 1: Download file from storage ---
        ocr_text = ""
        ocr_engine_used = "tesseract"
        try:
            from app.services.storage import get_storage
            storage = get_storage()
            with tempfile.NamedTemporaryFile(suffix=Path(document.original_filename).suffix, delete=False) as tmp:
                storage.download(document.storage_path, Path(tmp.name))
                tmp_path = Path(tmp.name)

            # --- Step 2: OCR ---
            from app.config import settings as app_settings
            if app_settings.OCR_PROVIDER == "mistral" and app_settings.MISTRAL_API_KEY:
                from app.services.ocr import MistralOCREngine, TesseractOCREngine, OCRPipeline
                primary = MistralOCREngine(api_key=app_settings.MISTRAL_API_KEY)
                fallback = TesseractOCREngine()
                ocr_engine_used = "mistral"
            else:
                from app.services.ocr import TesseractOCREngine, OCRPipeline
                primary = TesseractOCREngine()
                fallback = None
                ocr_engine_used = "tesseract"

            pipeline = OCRPipeline(primary, fallback)
            ocr_results = pipeline.process_document(tmp_path)
            ocr_text = "\n\n".join(r.text for r in ocr_results if r.text)
            logger.info(f"OCR completed for {document_id}: {len(ocr_results)} pages, {len(ocr_text)} chars of text")
        except Exception as e:
            logger.warning(f"OCR/storage failed, will use LLM with filename only: {e}")

        # --- Step 3: Get workflow extraction schema ---
        field_defs = []
        if document.workflow_id:
            wf_result = await db.execute(select(Workflow).where(Workflow.id == document.workflow_id))
            wf = wf_result.scalar_one_or_none()
            if wf and wf.extraction_schema:
                field_defs = wf.extraction_schema.get("fields", [])

        if not field_defs:
            # Fallback: guess from filename
            fname = document.original_filename.lower()
            if "inv" in fname:
                field_defs = [
                    {"name": "vendor_name", "label": "Vendor Name", "field_type": "text"},
                    {"name": "invoice_number", "label": "Invoice Number", "field_type": "text"},
                    {"name": "invoice_date", "label": "Invoice Date", "field_type": "date"},
                    {"name": "due_date", "label": "Due Date", "field_type": "date"},
                    {"name": "subtotal", "label": "Subtotal", "field_type": "currency"},
                    {"name": "tax_amount", "label": "Tax Amount", "field_type": "currency"},
                    {"name": "total_amount", "label": "Total Amount", "field_type": "currency"},
                    {"name": "payment_terms", "label": "Payment Terms", "field_type": "text"},
                    {"name": "po_number", "label": "PO Number", "field_type": "text"},
                ]
            elif "receipt" in fname:
                field_defs = [
                    {"name": "merchant_name", "label": "Merchant", "field_type": "text"},
                    {"name": "receipt_date", "label": "Date", "field_type": "date"},
                    {"name": "total_amount", "label": "Total", "field_type": "currency"},
                    {"name": "tax_amount", "label": "Tax", "field_type": "currency"},
                    {"name": "payment_method", "label": "Payment Method", "field_type": "text"},
                    {"name": "category", "label": "Category", "field_type": "text"},
                ]
            else:
                field_defs = [
                    {"name": "title", "label": "Title", "field_type": "text"},
                    {"name": "date", "label": "Date", "field_type": "date"},
                    {"name": "author", "label": "Author", "field_type": "text"},
                    {"name": "summary", "label": "Summary", "field_type": "text"},
                ]

        # --- Step 4: LLM extraction ---
        field_names = [f["name"] for f in field_defs]
        field_desc = "\n".join(f"- {f['name']}: {f.get('label', f['name'])} ({f.get('field_type', 'text')})" for f in field_defs)

        prompt_text = f"""Extract the following fields from this document. Return a JSON object with field names as keys and objects with "value" (string) and "confidence" (float 0-1) as values.

Fields to extract:
{field_desc}

Document text:
---
{ocr_text if ocr_text else f"[No OCR text available. Document filename: {document.original_filename}]"}
---

Return ONLY valid JSON. Example format:
{{"vendor_name": {{"value": "ACME Corp", "confidence": 0.95}}, "total_amount": {{"value": "$1,234.56", "confidence": 0.92}}}}"""

        from app.services.llm_provider import LLMProviderFactory
        llm = LLMProviderFactory.from_settings()
        llm_response = await llm.chat(
            messages=[
                {"role": "system", "content": "You are a document extraction assistant. Extract structured fields from document text. Always return valid JSON only, no markdown."},
                {"role": "user", "content": prompt_text},
            ],
            temperature=0.0,
        )

        # Parse LLM response
        response_text = llm_response.content.strip()
        # Strip markdown code fences if present
        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[-1]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()

        extracted_fields = json.loads(response_text)
        logger.info(f"LLM extracted {len(extracted_fields)} fields for {document_id}: {list(extracted_fields.keys())}")

        # --- Step 5: Save extraction results ---
        processing_time = (time.time() - start_time) * 1000
        for field_name, field_data in extracted_fields.items():
            if field_name not in field_names:
                continue
            value = field_data.get("value", "") if isinstance(field_data, dict) else str(field_data)
            confidence = field_data.get("confidence", 0.85) if isinstance(field_data, dict) else 0.85

            extraction = Extraction(
                id=uuid.uuid4(),
                document_id=document.id,
                field_name=field_name,
                field_value=value,
                field_type=next((f.get("field_type", "text") for f in field_defs if f["name"] == field_name), "text"),
                confidence=confidence,
                model_used=llm_response.model,
            )
            db.add(extraction)

        document.status = DocumentStatus.COMPLETED
        document.metadata_json = {
            "ocr_engine": ocr_engine_used,
            "processing_time_ms": processing_time,
            "model_used": llm_response.model,
            "fields_extracted": len(extracted_fields),
        }
        await db.commit()

        logger.info(f"Document processed: {document_id}, {len(extracted_fields)} fields in {processing_time:.0f}ms")
        return {"status": "completed", "document_id": document_id, "fields_extracted": len(extracted_fields), "processing_time_ms": round(processing_time)}

    except Exception as e:
        logger.error(f"Document processing failed: {document_id} - {e}")
        document.status = DocumentStatus.FAILED
        document.metadata_json = {"error": str(e)}
        await db.commit()
        return {"status": "failed", "document_id": document_id, "error": str(e)}


@router.post("/process-batch", response_model=BatchProcessResponse)
async def process_batch(
    request: BatchProcessRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Process multiple documents in batch."""
    batch_id = str(uuid.uuid4())

    for doc_id in request.document_ids:
        result = await db.execute(select(Document).where(Document.id == doc_id))
        document = result.scalar_one_or_none()
        if document:
            document.status = DocumentStatus.PROCESSING
    await db.commit()

    logger.info(f"Batch processing queued: {batch_id}, {len(request.document_ids)} documents")

    return BatchProcessResponse(
        batch_id=batch_id,
        document_count=len(request.document_ids),
        created_at=datetime.utcnow(),
    )


@router.get("/status/{document_id}", response_model=DocumentStatusResponse)
async def get_document_status(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get processing status of a document."""
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    progress = {
        DocumentStatus.UPLOADED: 0,
        DocumentStatus.PROCESSING: 50,
        DocumentStatus.EXTRACTED: 75,
        DocumentStatus.VALIDATED: 90,
        DocumentStatus.COMPLETED: 100,
        DocumentStatus.FAILED: 0,
    }

    return DocumentStatusResponse(
        document_id=str(document.id),
        status=document.status.value,
        progress_percent=progress.get(document.status, 0),
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


@router.get("/results/{document_id}", response_model=DocumentResultsResponse)
async def get_document_results(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get extraction results for a completed document."""
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Build results from extractions
    fields = {}
    for ext in document.extractions:
        fields[ext.field_name] = {
            "value": ext.field_value,
            "confidence": ext.confidence,
            "raw_text": ext.corrected_value or ext.field_value,
        }

    # Extract error message from metadata_json
    error_message = None
    metadata = document.metadata_json or {}
    if isinstance(metadata, dict):
        error_message = metadata.get("error")

    # Build action log entries
    action_log_entries = []
    for log in document.action_logs:
        action_log_entries.append(ActionLogEntry(
            action_type=log.action_type,
            status=log.status,
            action_config=log.action_config,
            result=log.result,
            error_message=log.error_message,
            created_at=log.created_at,
        ))

    return DocumentResultsResponse(
        document_id=str(document.id),
        file_name=document.original_filename,
        status=document.status.value,
        fields=fields,
        tables={},
        processing_time_ms=0.0,
        ocr_engine="mistral",
        completed_at=document.updated_at,
        error_message=error_message,
        action_logs=action_log_entries,
    )


@router.get("/list", response_model=List[DocumentStatusResponse])
async def list_documents(
    workflow_id: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List documents, optionally filtered."""
    query = select(Document).where(Document.uploaded_by == current_user.id)

    if workflow_id:
        query = query.where(Document.workflow_id == workflow_id)
    if status:
        query = query.where(Document.status == DocumentStatus(status))

    result = await db.execute(query.order_by(Document.created_at.desc()))
    documents = result.scalars().all()

    progress_map = {
        DocumentStatus.UPLOADED: 0,
        DocumentStatus.PROCESSING: 50,
        DocumentStatus.EXTRACTED: 75,
        DocumentStatus.VALIDATED: 90,
        DocumentStatus.COMPLETED: 100,
        DocumentStatus.FAILED: 0,
    }

    return [
        DocumentStatusResponse(
            document_id=str(doc.id),
            file_name=doc.original_filename,
            status=doc.status.value,
            progress_percent=progress_map.get(doc.status, 0),
            created_at=doc.created_at,
            updated_at=doc.updated_at,
        )
        for doc in documents
    ]
