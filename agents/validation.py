from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from agents.base import BaseAgent

if TYPE_CHECKING:
    from backend.app.services.llm_provider import BaseLLMProvider

logger = logging.getLogger(__name__)


class ValidationAgent(BaseAgent):
    """Business rule validation agent.

    Validates extracted fields against workflow-defined rules.
    Uses the ValidationEngine for rule-based checks and optionally
    the LLM for custom/complex rule evaluation.
    """

    def __init__(self, llm_provider: Optional[BaseLLMProvider] = None):
        super().__init__("validation", llm_provider)

    async def execute(self, state: dict) -> dict:
        from backend.app.services.validation_engine import (
            ValidationEngine, ValidationRule, RuleType,
        )

        fields = state.get("generated_fields", {})
        workflow_config = state.get("workflow_config", {})

        # Build rules from workflow config
        rules = []
        for rule_def in workflow_config.get("validation_rules", {}).get("rules", []):
            try:
                rules.append(ValidationRule(
                    name=rule_def.get("name", "unnamed"),
                    description=rule_def.get("description", ""),
                    rule_type=RuleType(rule_def.get("rule_type", "custom")),
                    config=rule_def.get("config", {}),
                    severity=rule_def.get("severity", "error"),
                ))
            except (ValueError, KeyError) as e:
                logger.warning(f"Skipping invalid rule: {e}")

        # Add auto-required rules for fields marked as required
        for field_def in workflow_config.get("extraction_schema", {}).get("fields", []):
            if field_def.get("required", False):
                rules.append(ValidationRule(
                    name=f"required_{field_def['name']}",
                    description=f"{field_def.get('label', field_def['name'])} is required",
                    rule_type=RuleType.REQUIRED,
                    config={"field": field_def["name"]},
                ))

        engine = ValidationEngine()
        report = engine.validate(fields, rules)

        return {
            "validation_passed": report.passed,
            "validation_errors": [r.message for r in report.results if not r.passed],
            "validation_report": {
                "passed": report.passed,
                "error_count": report.error_count,
                "warning_count": report.warning_count,
                "total_rules": report.total_rules,
                "results": [
                    {
                        "rule": r.rule_name,
                        "passed": r.passed,
                        "message": r.message,
                        "severity": r.severity,
                        "field": r.field_name,
                    }
                    for r in report.results
                ],
            },
        }
