from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from agents.base import BaseAgent

if TYPE_CHECKING:
    from backend.app.services.llm_provider import BaseLLMProvider

logger = logging.getLogger(__name__)


class ActionAgent(BaseAgent):
    """MCP post-processing actions agent.

    Executes configured actions (webhooks, emails, transforms, exports)
    after document processing is complete.
    """

    def __init__(self, llm_provider: Optional[BaseLLMProvider] = None):
        super().__init__("actions", llm_provider)

    async def execute(self, state: dict) -> dict:
        from backend.app.services.action_engine import (
            ActionEngine, ActionConfig, ActionType, ActionTrigger,
        )

        fields = state.get("generated_fields", {})
        workflow_config = state.get("workflow_config", {})
        validation_passed = state.get("validation_passed", True)
        document_id = state.get("document_id")

        # Build action configs from workflow config
        actions = []
        for action_def in workflow_config.get("action_config", {}).get("actions", []):
            try:
                actions.append(ActionConfig(
                    name=action_def.get("name", "unnamed"),
                    action_type=ActionType(action_def.get("action_type", "webhook")),
                    config=action_def.get("config", {}),
                    trigger=ActionTrigger(action_def.get("trigger", "on_complete")),
                    enabled=action_def.get("enabled", True),
                ))
            except (ValueError, KeyError) as e:
                logger.warning(f"Skipping invalid action config: {e}")

        if not actions:
            logger.info("No actions configured")
            return {"action_results": {}}

        engine = ActionEngine()

        # Execute on_complete actions
        report = engine.execute_actions(actions, fields, ActionTrigger.ON_COMPLETE, document_id)

        # Execute conditional actions
        if validation_passed:
            pass_report = engine.execute_actions(actions, fields, ActionTrigger.ON_VALIDATION_PASS, document_id)
            report.results.extend(pass_report.results)
            report.successful += pass_report.successful
            report.failed += pass_report.failed
        else:
            fail_report = engine.execute_actions(actions, fields, ActionTrigger.ON_VALIDATION_FAIL, document_id)
            report.results.extend(fail_report.results)
            report.successful += fail_report.successful
            report.failed += fail_report.failed

        return {
            "action_results": {
                "total": len(report.results),
                "successful": report.successful,
                "failed": report.failed,
                "details": [
                    {
                        "name": r.action_name,
                        "type": r.action_type,
                        "success": r.success,
                        "message": r.message,
                    }
                    for r in report.results
                ],
            },
        }
