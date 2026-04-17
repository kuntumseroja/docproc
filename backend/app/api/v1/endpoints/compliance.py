from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.document import Document
from app.models.user import User
from app.schemas.compliance import (
    ComplianceChatRequest,
    ComplianceChatResponse,
    ComplianceCheckRequest,
    ComplianceCheckResponse,
    ComplianceCheckResult,
    RegulationDetail,
    RegulationSummary,
    SectionResult,
)
from app.services.compliance_service import ComplianceService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/compliance", tags=["compliance"])

_compliance_sessions: dict = {}


@router.get("/regulations", response_model=List[RegulationSummary])
async def list_regulations(
    current_user: User = Depends(get_current_user),
):
    """List all available regulations."""
    service = ComplianceService()
    regulations = service.list_regulations()
    return [RegulationSummary(**r) for r in regulations]


@router.get("/regulations/{reg_id}", response_model=RegulationDetail)
async def get_regulation(
    reg_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get full regulation detail."""
    service = ComplianceService()
    regulation = service.get_regulation(reg_id)
    if regulation is None:
        raise HTTPException(status_code=404, detail=f"Regulation '{reg_id}' not found")
    return RegulationDetail(**regulation)


@router.post("/check", response_model=ComplianceCheckResponse)
async def check_compliance(
    request: ComplianceCheckRequest,
    current_user: User = Depends(get_current_user),
):
    """Run compliance check: document text against selected regulations."""
    if not request.regulation_ids:
        raise HTTPException(status_code=400, detail="At least one regulation_id is required")
    if not request.document_text.strip():
        raise HTTPException(status_code=400, detail="document_text must not be empty")

    service = ComplianceService()
    try:
        result = await service.check_compliance(
            document_text=request.document_text,
            regulation_ids=request.regulation_ids,
        )
    except Exception as e:
        logger.exception("Compliance check failed")
        raise HTTPException(status_code=500, detail=f"Compliance check failed: {str(e)}")

    return ComplianceCheckResponse(
        results=[
            ComplianceCheckResult(
                regulation_id=r["regulation_id"],
                regulation_name=r["regulation_name"],
                section_results=[SectionResult(**s) for s in r["section_results"]],
                overall_score=r["overall_score"],
                summary=r["summary"],
            )
            for r in result["results"]
        ],
        model_used=result.get("model_used"),
        provider=result.get("provider"),
        latency_ms=result.get("latency_ms"),
    )


@router.post("/chat", response_model=ComplianceChatResponse)
async def chat_compliance(
    request: ComplianceChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compliance-aware chat with regulation context."""
    user_id = str(current_user.id)

    if user_id not in _compliance_sessions:
        _compliance_sessions[user_id] = ComplianceService()

    service = _compliance_sessions[user_id]

    # Prefer inline document_text (client-side parsed); fall back to DB lookup
    document_text = None
    if request.document_text:
        fname = request.document_filename or "uploaded document"
        document_text = f"Document: {fname}\n\n{request.document_text}"
    elif request.document_id:
        result = await db.execute(
            select(Document)
            .options(selectinload(Document.extractions))
            .where(Document.id == request.document_id, Document.uploaded_by == current_user.id)
        )
        doc = result.scalar_one_or_none()
        if doc:
            fields = {
                ext.field_name: (ext.corrected_value or ext.field_value)
                for ext in doc.extractions
            }
            document_text = (
                f"Document: {doc.original_filename}\n"
                f"Extracted fields: {fields}"
            )

    try:
        response = await service.chat_compliance(
            message=request.message,
            regulation_ids=request.regulation_ids,
            document_text=document_text,
        )
    except Exception as e:
        logger.exception("Compliance chat failed")
        raise HTTPException(status_code=500, detail=f"Compliance chat failed: {str(e)}")

    return ComplianceChatResponse(
        message=response["message"],
        sources=response["sources"],
        regulation_refs=response["regulation_refs"],
        model_used=response.get("model_used"),
        provider=response.get("provider"),
        latency_ms=response.get("latency_ms"),
    )
