from __future__ import annotations

import json
import re
import logging
from typing import Any, Dict, List, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class ClassificationResult:
    document_type: str
    confidence: float
    suggested_workflow: Optional[str] = None
    reasoning: str = ""


CLASSIFICATION_SYSTEM_PROMPT = """You are a document classifier. Given OCR text from a document, classify it into one of these types:
- invoice: Bills, invoices, payment requests
- contract: Legal agreements, contracts, terms
- resume: CVs, resumes, job applications
- receipt: Purchase receipts, transaction records
- report: Business reports, analytics, summaries
- letter: Correspondence, memos, notifications
- form: Application forms, registration forms
- other: Documents that don't fit above categories

Return JSON:
{
    "document_type": "type_name",
    "confidence": 0.0-1.0,
    "reasoning": "Brief explanation"
}"""


KEYWORD_PATTERNS = {
    "invoice": ["invoice", "bill to", "due date", "payment", "total amount", "subtotal", "tax", "invoice number", "remit"],
    "contract": ["agreement", "hereby", "parties", "whereas", "terms and conditions", "obligations", "governing law", "signed"],
    "resume": ["experience", "education", "skills", "objective", "references", "employment", "curriculum vitae"],
    "receipt": ["receipt", "transaction", "paid", "change", "cashier", "store", "purchase"],
    "report": ["report", "summary", "analysis", "findings", "conclusion", "recommendations", "metrics"],
    "letter": ["dear", "sincerely", "regards", "attention", "subject:", "re:"],
    "form": ["please fill", "applicant", "date of birth", "signature", "checkbox", "please print"],
}


class ClassificationService:
    """Document classification service for auto-routing."""

    def __init__(self, llm_provider=None):
        self.llm = llm_provider

    def classify_by_keywords(self, text: str) -> ClassificationResult:
        text_lower = text.lower()
        scores: Dict[str, float] = {}

        for doc_type, keywords in KEYWORD_PATTERNS.items():
            matches = sum(1 for kw in keywords if kw in text_lower)
            scores[doc_type] = matches / len(keywords)

        if not scores or max(scores.values()) == 0:
            return ClassificationResult(
                document_type="other", confidence=0.3,
                reasoning="No keyword matches found",
            )

        best_type = max(scores, key=scores.get)
        confidence = min(0.95, scores[best_type] * 1.5)

        return ClassificationResult(
            document_type=best_type,
            confidence=round(confidence, 2),
            reasoning=f"Matched {int(scores[best_type] * len(KEYWORD_PATTERNS[best_type]))} keywords for {best_type}",
        )

    async def classify_with_llm(self, text: str) -> ClassificationResult:
        if self.llm is None:
            from app.services.llm_provider import LLMProviderFactory
            self.llm = LLMProviderFactory.from_settings()

        messages = [
            {"role": "system", "content": CLASSIFICATION_SYSTEM_PROMPT},
            {"role": "user", "content": f"Classify this document:\n\n{text[:3000]}"},
        ]

        response = await self.llm.chat(messages, temperature=0.1)
        return self._parse_response(response.content)

    async def classify(self, text: str, use_llm: bool = False) -> ClassificationResult:
        keyword_result = self.classify_by_keywords(text)

        if keyword_result.confidence >= 0.6 or not use_llm:
            return keyword_result

        try:
            llm_result = await self.classify_with_llm(text)
            if llm_result.confidence > keyword_result.confidence:
                return llm_result
            return keyword_result
        except Exception as e:
            logger.warning(f"LLM classification failed, using keywords: {e}")
            return keyword_result

    def _parse_response(self, content: str) -> ClassificationResult:
        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', content, re.DOTALL)
        if json_match:
            content = json_match.group(1)

        try:
            data = json.loads(content.strip())
            return ClassificationResult(
                document_type=data.get("document_type", "other"),
                confidence=float(data.get("confidence", 0.5)),
                reasoning=data.get("reasoning", ""),
            )
        except (json.JSONDecodeError, ValueError):
            return ClassificationResult(
                document_type="other", confidence=0.3,
                reasoning="Failed to parse LLM classification response",
            )
