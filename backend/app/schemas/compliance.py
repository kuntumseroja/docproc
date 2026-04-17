from __future__ import annotations

from typing import Optional, List, Dict, Any
from pydantic import BaseModel


class RegulationSummary(BaseModel):
    model_config = {"extra": "ignore"}

    id: str
    name: str
    title: str
    issuer: str
    country: str
    category: str
    sections_count: int
    effective_date: str
    tags: List[str] = []
    title_id: Optional[str] = None


class RegulationSection(BaseModel):
    model_config = {"extra": "ignore"}

    id: str
    title: str
    description: str
    requirements: List[str] = []
    risk_level: Optional[str] = None
    keywords: List[str] = []


class RegulationDetail(BaseModel):
    model_config = {"extra": "ignore"}

    id: str
    name: str
    title: str
    issuer: str
    country: str
    category: str
    effective_date: str
    sections: List[RegulationSection]


class ComplianceCheckRequest(BaseModel):
    document_text: str
    regulation_ids: List[str]


class SectionResult(BaseModel):
    section_id: str
    section_title: str
    status: str  # compliant, non_compliant, partial, not_applicable
    findings: str
    recommendations: str
    risk_level: str  # low, medium, high, critical


class ComplianceCheckResult(BaseModel):
    regulation_id: str
    regulation_name: str
    section_results: List[SectionResult]
    overall_score: float  # 0-100
    summary: str


class ComplianceCheckResponse(BaseModel):
    results: List[ComplianceCheckResult]
    model_used: Optional[str] = None
    provider: Optional[str] = None
    latency_ms: Optional[float] = None


class ComplianceChatRequest(BaseModel):
    message: str
    regulation_ids: List[str] = []
    document_id: Optional[str] = None
    # Inline document text (client-side extracted, no DB save required)
    document_text: Optional[str] = None
    document_filename: Optional[str] = None


class ComplianceChatResponse(BaseModel):
    message: str
    sources: List[Dict[str, Any]] = []
    regulation_refs: List[str] = []
    model_used: Optional[str] = None
    provider: Optional[str] = None
    latency_ms: Optional[float] = None
