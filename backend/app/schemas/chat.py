from __future__ import annotations

from typing import Optional, List, Dict, Any
from pydantic import BaseModel


class ChatMessageRequest(BaseModel):
    message: str
    document_id: Optional[str] = None
    workflow_id: Optional[str] = None


class ChatMessageResponse(BaseModel):
    message: str
    sources: List[Dict[str, Any]] = []
    suggested_actions: List[str] = []
    model_used: Optional[str] = None
    provider: Optional[str] = None
    latency_ms: Optional[float] = None


class ChatHistoryResponse(BaseModel):
    messages: List[Dict[str, str]]
