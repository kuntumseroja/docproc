from __future__ import annotations

import json
import re
import logging
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class QualityRating(str, Enum):
    EXCELLENT = "excellent"
    GOOD = "good"
    ACCEPTABLE = "acceptable"
    POOR = "poor"
    UNACCEPTABLE = "unacceptable"


@dataclass
class FieldJudgment:
    field_name: str
    rating: QualityRating
    confidence_adjustment: float  # -0.3 to +0.1
    issues: List[str]
    suggestions: List[str]


@dataclass
class JudgeReport:
    overall_rating: QualityRating
    overall_score: float  # 0.0 to 1.0
    field_judgments: List[FieldJudgment]
    summary: str
    recommendations: List[str]


JUDGE_SYSTEM_PROMPT = """You are a quality judge for document extraction results. You evaluate the quality of extracted data by comparing it against the original document text.

For each extracted field, assess:
1. Accuracy — does the value match what's in the document?
2. Completeness — was all relevant information captured?
3. Format — is the value in the expected format?
4. Confidence — does the confidence level seem appropriate?

Return a JSON object with this structure:
{
    "overall_rating": "excellent|good|acceptable|poor|unacceptable",
    "overall_score": 0.0-1.0,
    "field_judgments": [
        {
            "field_name": "field_name",
            "rating": "excellent|good|acceptable|poor|unacceptable",
            "confidence_adjustment": -0.3 to 0.1,
            "issues": ["list of issues found"],
            "suggestions": ["improvement suggestions"]
        }
    ],
    "summary": "Overall assessment in 1-2 sentences",
    "recommendations": ["list of recommendations"]
}"""


class JudgeService:
    """LLM-as-Judge service for quality reflection on extraction results."""

    def __init__(self, llm_provider=None):
        self.llm = llm_provider

    def _get_provider(self):
        if self.llm:
            return self.llm
        from app.services.llm_provider import LLMProviderFactory
        return LLMProviderFactory.from_settings()

    async def evaluate(
        self,
        ocr_text: str,
        extracted_fields: Dict[str, Any],
        workflow_config: Optional[Dict[str, Any]] = None,
    ) -> JudgeReport:
        provider = self._get_provider()

        user_prompt = self._build_prompt(ocr_text, extracted_fields, workflow_config)
        messages = [
            {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

        response = await provider.chat(messages, temperature=0.1)
        return self._parse_response(response.content)

    def _build_prompt(
        self,
        ocr_text: str,
        extracted_fields: Dict[str, Any],
        workflow_config: Optional[Dict[str, Any]],
    ) -> str:
        fields_str = json.dumps(extracted_fields, indent=2, default=str)
        prompt = f"""Evaluate the quality of these extraction results:

ORIGINAL DOCUMENT TEXT:
{ocr_text[:3000]}

EXTRACTED FIELDS:
{fields_str}"""
        if workflow_config:
            prompt += f"\n\nEXPECTED SCHEMA:\n{json.dumps(workflow_config, indent=2)}"
        return prompt

    def _parse_response(self, content: str) -> JudgeReport:
        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', content, re.DOTALL)
        if json_match:
            content = json_match.group(1)

        try:
            data = json.loads(content.strip())
        except json.JSONDecodeError:
            logger.error("Failed to parse judge response")
            return JudgeReport(
                overall_rating=QualityRating.ACCEPTABLE,
                overall_score=0.5,
                field_judgments=[],
                summary="Unable to parse quality assessment",
                recommendations=["Re-run quality check"],
            )

        field_judgments = []
        for fj in data.get("field_judgments", []):
            try:
                field_judgments.append(FieldJudgment(
                    field_name=fj.get("field_name", "unknown"),
                    rating=QualityRating(fj.get("rating", "acceptable")),
                    confidence_adjustment=float(fj.get("confidence_adjustment", 0.0)),
                    issues=fj.get("issues", []),
                    suggestions=fj.get("suggestions", []),
                ))
            except (ValueError, KeyError):
                continue

        try:
            overall_rating = QualityRating(data.get("overall_rating", "acceptable"))
        except ValueError:
            overall_rating = QualityRating.ACCEPTABLE

        return JudgeReport(
            overall_rating=overall_rating,
            overall_score=float(data.get("overall_score", 0.5)),
            field_judgments=field_judgments,
            summary=data.get("summary", ""),
            recommendations=data.get("recommendations", []),
        )
