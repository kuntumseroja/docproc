from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.document import Document
from app.models.user import User
from app.schemas.export import ExportRequest, WebhookExportRequest
from app.services.export_service import ExportService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/export", tags=["export"])


async def _get_export_records(
    document_ids: List[str],
    db: AsyncSession,
    current_user: User,
) -> list:
    records = []
    for doc_id in document_ids:
        result = await db.execute(
            select(Document).where(Document.id == doc_id, Document.uploaded_by == current_user.id)
        )
        doc = result.scalar_one_or_none()
        if doc:
            fields = {}
            for ext in doc.extractions:
                fields[ext.field_name] = ext.corrected_value or ext.field_value

            records.append({
                "document_id": str(doc.id),
                "filename": doc.original_filename,
                "status": doc.status.value,
                **fields,
            })
    return records


@router.post("/download")
async def export_documents(
    request: ExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export document data as CSV, JSON, or Excel."""
    records = await _get_export_records(request.document_ids, db, current_user)

    if not records:
        raise HTTPException(status_code=404, detail="No documents found")

    service = ExportService()

    if request.format == "csv":
        result = service.export_csv(records, fields=request.fields)
    elif request.format == "json":
        result = service.export_json(records)
    elif request.format == "xlsx":
        result = service.export_excel(records, fields=request.fields)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {request.format}")

    return Response(
        content=result.data,
        media_type=result.content_type,
        headers={"Content-Disposition": f"attachment; filename={result.filename}"},
    )


@router.post("/webhook")
async def export_to_webhook(
    request: WebhookExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send document data to a webhook URL."""
    records = await _get_export_records(request.document_ids, db, current_user)

    if not records:
        raise HTTPException(status_code=404, detail="No documents found")

    service = ExportService()
    payload = service.prepare_webhook_payload(records, metadata={"user": str(current_user.id)})

    # In production: POST to request.webhook_url using httpx
    logger.info(f"Webhook export queued: {request.webhook_url}, {len(records)} records")

    return {
        "status": "queued",
        "webhook_url": request.webhook_url,
        "record_count": len(records),
    }
