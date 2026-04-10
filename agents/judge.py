from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from agents.base import BaseAgent

if TYPE_CHECKING:
    from backend.app.services.llm_provider import BaseLLMProvider

logger = logging.getLogger(__name__)


class JudgeAgent(BaseAgent):
    """LLM-as-Judge quality reflection agent.

    Evaluates extraction quality by using an LLM to compare
    extracted data against the original document text.
    Returns quality ratings and confidence adjustments.
    """

    def __init__(self, llm_provider: Optional[BaseLLMProvider] = None):
        super().__init__("judge", llm_provider)

    async def execute(self, state: dict) -> dict:
        from backend.app.services.judge_service import JudgeService

        ocr_text = state.get("ocr_text", "")
        fields = state.get("generated_fields", {})
        workflow_config = state.get("workflow_config", {})

        if not ocr_text or not fields:
            logger.info("Judge: no data to evaluate")
            return {
                "judge_report": {
                    "overall_rating": "acceptable",
                    "overall_score": 0.5,
                    "field_judgments": [],
                    "summary": "Insufficient data for quality assessment",
                },
            }

        service = JudgeService(llm_provider=self.llm)
        report = await service.evaluate(ocr_text, fields, workflow_config)

        return {
            "judge_report": {
                "overall_rating": report.overall_rating.value,
                "overall_score": report.overall_score,
                "field_judgments": [
                    {
                        "field": fj.field_name,
                        "rating": fj.rating.value,
                        "confidence_adjustment": fj.confidence_adjustment,
                        "issues": fj.issues,
                        "suggestions": fj.suggestions,
                    }
                    for fj in report.field_judgments
                ],
                "summary": report.summary,
                "recommendations": report.recommendations,
            },
        }
