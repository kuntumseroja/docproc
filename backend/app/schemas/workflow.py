from __future__ import annotations
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel


class FieldDefinition(BaseModel):
    name: str
    label: str
    field_type: str = "text"  # text, number, date, currency, boolean, list
    required: bool = True
    description: Optional[str] = None
    default_value: Optional[str] = None
    validation_pattern: Optional[str] = None


class ValidationRuleDefinition(BaseModel):
    name: str
    description: str
    rule_type: str = "range"  # range, regex, cross_field, custom
    config: Dict[str, Any] = {}


class ActionDefinition(BaseModel):
    name: str
    action_type: str  # webhook, email, database, api_call
    config: Dict[str, Any] = {}
    trigger: str = "on_complete"  # on_complete, on_validation_pass, on_validation_fail


class WorkflowCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    document_type: Optional[str] = None
    extraction_schema: Optional[Dict[str, Any]] = None
    validation_rules: Optional[Dict[str, Any]] = None
    action_config: Optional[Dict[str, Any]] = None


class WorkflowUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    document_type: Optional[str] = None
    status: Optional[str] = None
    extraction_schema: Optional[Dict[str, Any]] = None
    validation_rules: Optional[Dict[str, Any]] = None
    action_config: Optional[Dict[str, Any]] = None


class WorkflowResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    status: str
    document_type: Optional[str] = None
    extraction_schema: Optional[Dict[str, Any]] = None
    validation_rules: Optional[Dict[str, Any]] = None
    action_config: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
    document_count: int = 0

    class Config:
        from_attributes = True


class WorkflowListResponse(BaseModel):
    workflows: List[WorkflowResponse]
    total: int


class NLSchemaRequest(BaseModel):
    description: str
    document_type: Optional[str] = None
    sample_text: Optional[str] = None


class NLSchemaResponse(BaseModel):
    fields: List[FieldDefinition]
    validation_rules: List[ValidationRuleDefinition]
    confidence: float
    raw_response: Optional[str] = None
    model_used: Optional[str] = None
    provider: Optional[str] = None
    latency_ms: Optional[float] = None
