from __future__ import annotations

import logging
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.document import Document, DocumentStatus
from app.models.user import User
from app.schemas.chat import ChatMessageRequest, ChatMessageResponse
from app.services.chat_service import ChatService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])

_chat_sessions: dict = {}


async def _build_data_context(
    db: AsyncSession,
    current_user: User,
    document_id: str | None = None,
    workflow_id: str | None = None,
) -> str:
    """Query the database and build a data summary for the LLM."""
    parts: list[str] = []

    # If a specific document is referenced, include its full extraction
    if document_id:
        result = await db.execute(
            select(Document)
            .options(selectinload(Document.extractions))
            .where(Document.id == document_id, Document.uploaded_by == current_user.id)
        )
        doc = result.scalar_one_or_none()
        if doc:
            fields = {
                ext.field_name: (ext.corrected_value or ext.field_value)
                for ext in doc.extractions
            }
            parts.append(
                f"Document: {doc.original_filename} (status: {doc.status.value})\n"
                f"Extracted fields: {fields}"
            )

    # Always include a summary of ALL the user's documents + extracted data
    result = await db.execute(
        select(Document)
        .options(selectinload(Document.extractions))
        .where(Document.uploaded_by == current_user.id)
        .order_by(Document.created_at.desc())
        .limit(50)
    )
    docs = result.scalars().all()

    if docs:
        summary_lines = []
        for doc in docs:
            fields = {}
            for ext in doc.extractions:
                fields[ext.field_name] = ext.corrected_value or ext.field_value
            field_str = ", ".join(f"{k}: {v}" for k, v in fields.items()) if fields else "no extracted fields"
            summary_lines.append(
                f"- {doc.original_filename} | status: {doc.status.value} | {field_str}"
            )

        parts.append(
            f"User has {len(docs)} documents in total:\n" + "\n".join(summary_lines)
        )

        # Provide aggregate stats
        completed = [d for d in docs if d.status == DocumentStatus.COMPLETED]
        parts.append(f"Completed documents: {len(completed)} of {len(docs)}")

    if not parts:
        parts.append("User has no documents yet.")

    return "\n\n".join(parts)


@router.post("/message", response_model=ChatMessageResponse)
async def send_message(
    request: ChatMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a chat message and get AI response."""
    user_id = str(current_user.id)

    if user_id not in _chat_sessions:
        _chat_sessions[user_id] = ChatService()

    service = _chat_sessions[user_id]

    # Build real data context from the database
    data_context = await _build_data_context(
        db, current_user,
        document_id=request.document_id,
        workflow_id=request.workflow_id,
    )

    response = await service.chat(request.message, data_context=data_context)

    return ChatMessageResponse(
        message=response.message,
        sources=response.sources,
        suggested_actions=response.suggested_actions,
        model_used=response.model_used,
        provider=response.provider,
        latency_ms=response.latency_ms,
    )


@router.post("/clear")
async def clear_history(
    current_user: User = Depends(get_current_user),
):
    """Clear chat history for current user."""
    user_id = str(current_user.id)
    if user_id in _chat_sessions:
        _chat_sessions[user_id].clear_history()
    return {"status": "cleared"}
