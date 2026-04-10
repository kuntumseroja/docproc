from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime

logger = logging.getLogger(__name__)


class ActionType(str, Enum):
    WEBHOOK = "webhook"
    EMAIL = "email"
    DATABASE = "database"
    API_CALL = "api_call"
    TRANSFORM = "transform"
    EXPORT = "export"


class ActionTrigger(str, Enum):
    ON_COMPLETE = "on_complete"
    ON_VALIDATION_PASS = "on_validation_pass"
    ON_VALIDATION_FAIL = "on_validation_fail"


@dataclass
class ActionConfig:
    name: str
    action_type: ActionType
    config: Dict[str, Any] = field(default_factory=dict)
    trigger: ActionTrigger = ActionTrigger.ON_COMPLETE
    enabled: bool = True


@dataclass
class ActionResult:
    action_name: str
    action_type: str
    success: bool
    message: str
    result_data: Optional[Dict[str, Any]] = None
    executed_at: Optional[str] = None
    error: Optional[str] = None


@dataclass
class ActionReport:
    results: List[ActionResult]
    total_actions: int
    successful: int
    failed: int


class ActionEngine:
    """Post-processing action engine for MCP-style integrations."""

    def __init__(self):
        self._handlers = {
            ActionType.WEBHOOK: self._execute_webhook,
            ActionType.EMAIL: self._execute_email,
            ActionType.DATABASE: self._execute_database,
            ActionType.API_CALL: self._execute_api_call,
            ActionType.TRANSFORM: self._execute_transform,
            ActionType.EXPORT: self._execute_export,
        }

    def execute_actions(
        self,
        actions: List[ActionConfig],
        fields: Dict[str, Any],
        trigger: ActionTrigger,
        document_id: Optional[str] = None,
    ) -> ActionReport:
        applicable = [a for a in actions if a.enabled and a.trigger == trigger]
        results = []

        for action in applicable:
            handler = self._handlers.get(action.action_type, self._execute_default)
            result = handler(action, fields, document_id)
            results.append(result)

        successful = sum(1 for r in results if r.success)
        failed = len(results) - successful

        logger.info(f"Actions executed: {successful} success, {failed} failed out of {len(results)}")
        return ActionReport(
            results=results,
            total_actions=len(results),
            successful=successful,
            failed=failed,
        )

    def _execute_webhook(self, action: ActionConfig, fields: Dict[str, Any], doc_id: Optional[str]) -> ActionResult:
        url = action.config.get("url", "")
        if not url:
            return ActionResult(
                action_name=action.name, action_type=action.action_type.value,
                success=False, message="No webhook URL configured",
                error="Missing URL", executed_at=datetime.utcnow().isoformat(),
            )

        # In production, would use httpx/aiohttp to POST
        logger.info(f"Webhook: would POST to {url} with {len(fields)} fields")
        return ActionResult(
            action_name=action.name, action_type=action.action_type.value,
            success=True, message=f"Webhook queued for {url}",
            result_data={"url": url, "fields_count": len(fields), "document_id": doc_id},
            executed_at=datetime.utcnow().isoformat(),
        )

    def _execute_email(self, action: ActionConfig, fields: Dict[str, Any], doc_id: Optional[str]) -> ActionResult:
        to = action.config.get("to", "")
        subject = action.config.get("subject", "DocProc Notification")

        logger.info(f"Email: would send to {to} with subject '{subject}'")
        return ActionResult(
            action_name=action.name, action_type=action.action_type.value,
            success=True, message=f"Email queued for {to}",
            result_data={"to": to, "subject": subject, "document_id": doc_id},
            executed_at=datetime.utcnow().isoformat(),
        )

    def _execute_database(self, action: ActionConfig, fields: Dict[str, Any], doc_id: Optional[str]) -> ActionResult:
        table = action.config.get("table", "")

        logger.info(f"Database: would insert into {table}")
        return ActionResult(
            action_name=action.name, action_type=action.action_type.value,
            success=True, message=f"Data queued for insertion into '{table}'",
            result_data={"table": table, "fields": list(fields.keys()), "document_id": doc_id},
            executed_at=datetime.utcnow().isoformat(),
        )

    def _execute_api_call(self, action: ActionConfig, fields: Dict[str, Any], doc_id: Optional[str]) -> ActionResult:
        endpoint = action.config.get("endpoint", "")
        method = action.config.get("method", "POST")

        logger.info(f"API Call: {method} {endpoint}")
        return ActionResult(
            action_name=action.name, action_type=action.action_type.value,
            success=True, message=f"API call queued: {method} {endpoint}",
            result_data={"endpoint": endpoint, "method": method, "document_id": doc_id},
            executed_at=datetime.utcnow().isoformat(),
        )

    def _execute_transform(self, action: ActionConfig, fields: Dict[str, Any], doc_id: Optional[str]) -> ActionResult:
        transforms = action.config.get("transforms", {})
        transformed = dict(fields)
        for field_name, transform_type in transforms.items():
            if field_name in transformed:
                val = str(transformed[field_name])
                if transform_type == "uppercase":
                    transformed[field_name] = val.upper()
                elif transform_type == "lowercase":
                    transformed[field_name] = val.lower()
                elif transform_type == "title":
                    transformed[field_name] = val.title()
                elif transform_type == "strip":
                    transformed[field_name] = val.strip()

        return ActionResult(
            action_name=action.name, action_type=action.action_type.value,
            success=True, message=f"Transformed {len(transforms)} fields",
            result_data={"transformed_fields": list(transforms.keys())},
            executed_at=datetime.utcnow().isoformat(),
        )

    def _execute_export(self, action: ActionConfig, fields: Dict[str, Any], doc_id: Optional[str]) -> ActionResult:
        fmt = action.config.get("format", "json")

        return ActionResult(
            action_name=action.name, action_type=action.action_type.value,
            success=True, message=f"Export queued in {fmt} format",
            result_data={"format": fmt, "fields_count": len(fields), "document_id": doc_id},
            executed_at=datetime.utcnow().isoformat(),
        )

    def _execute_default(self, action: ActionConfig, fields: Dict[str, Any], doc_id: Optional[str]) -> ActionResult:
        return ActionResult(
            action_name=action.name, action_type=action.action_type.value,
            success=False, message=f"Unknown action type: {action.action_type}",
            error="Unsupported action type", executed_at=datetime.utcnow().isoformat(),
        )
