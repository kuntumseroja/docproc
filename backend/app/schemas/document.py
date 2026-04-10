from __future__ import annotations

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


class DocumentUploadResponse(BaseModel):
    document_id: str
    file_name: str
    upload_timestamp: datetime
    status: str = "uploaded"


class DocumentStatusResponse(BaseModel):
    document_id: str
    file_name: Optional[str] = None
    status: str
    progress_percent: int = 0
    created_at: datetime
    updated_at: datetime
    error_message: Optional[str] = None


class ActionLogEntry(BaseModel):
    action_type: str
    status: str
    action_config: Optional[dict] = None
    result: Optional[dict] = None
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None


class DocumentResultsResponse(BaseModel):
    document_id: str
    file_name: str
    status: str
    fields: dict
    tables: dict
    processing_time_ms: float
    ocr_engine: str
    completed_at: datetime
    error_message: Optional[str] = None
    action_logs: List[ActionLogEntry] = []


class BatchProcessRequest(BaseModel):
    document_ids: List[str]
    workflow_id: str


class BatchProcessResponse(BaseModel):
    batch_id: str
    document_count: int
    created_at: datetime
