from __future__ import annotations

from typing import Optional, List
from pydantic import BaseModel


class ExportRequest(BaseModel):
    document_ids: List[str]
    format: str = "csv"  # csv, json, xlsx
    fields: Optional[List[str]] = None


class WebhookExportRequest(BaseModel):
    document_ids: List[str]
    webhook_url: str
    fields: Optional[List[str]] = None
