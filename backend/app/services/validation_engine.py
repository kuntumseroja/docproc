from __future__ import annotations

import re
import logging
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime

logger = logging.getLogger(__name__)


class RuleType(str, Enum):
    RANGE = "range"
    REGEX = "regex"
    CROSS_FIELD = "cross_field"
    REQUIRED = "required"
    CUSTOM = "custom"
    DATE_FORMAT = "date_format"
    LIST_VALUES = "list_values"


@dataclass
class ValidationRule:
    name: str
    description: str
    rule_type: RuleType
    config: Dict[str, Any] = field(default_factory=dict)
    severity: str = "error"  # error, warning, info


@dataclass
class ValidationResult:
    rule_name: str
    passed: bool
    message: str
    severity: str = "error"
    field_name: Optional[str] = None
    expected: Optional[str] = None
    actual: Optional[str] = None


@dataclass
class ValidationReport:
    results: List[ValidationResult]
    passed: bool
    error_count: int
    warning_count: int
    total_rules: int

    @property
    def summary(self) -> str:
        return f"{self.error_count} errors, {self.warning_count} warnings out of {self.total_rules} rules"


class ValidationEngine:
    """Business rule validation engine for extracted document data."""

    def __init__(self):
        self._rule_handlers = {
            RuleType.RANGE: self._validate_range,
            RuleType.REGEX: self._validate_regex,
            RuleType.CROSS_FIELD: self._validate_cross_field,
            RuleType.REQUIRED: self._validate_required,
            RuleType.DATE_FORMAT: self._validate_date_format,
            RuleType.LIST_VALUES: self._validate_list_values,
            RuleType.CUSTOM: self._validate_custom,
        }

    def validate(
        self,
        fields: Dict[str, Any],
        rules: List[ValidationRule],
    ) -> ValidationReport:
        results = []
        for rule in rules:
            handler = self._rule_handlers.get(rule.rule_type, self._validate_custom)
            result = handler(fields, rule)
            results.append(result)

        errors = sum(1 for r in results if not r.passed and r.severity == "error")
        warnings = sum(1 for r in results if not r.passed and r.severity == "warning")
        passed = errors == 0

        logger.info(f"Validation: {errors} errors, {warnings} warnings, passed={passed}")
        return ValidationReport(
            results=results,
            passed=passed,
            error_count=errors,
            warning_count=warnings,
            total_rules=len(rules),
        )

    def _validate_range(self, fields: Dict[str, Any], rule: ValidationRule) -> ValidationResult:
        field_name = rule.config.get("field", "")
        value = fields.get(field_name)
        min_val = rule.config.get("min")
        max_val = rule.config.get("max")

        if value is None:
            return ValidationResult(
                rule_name=rule.name, passed=False, message=f"Field '{field_name}' not found",
                severity=rule.severity, field_name=field_name,
            )

        try:
            num_val = float(str(value).replace(",", "").replace("$", "").replace("£", "").replace("€", ""))
        except (ValueError, TypeError):
            return ValidationResult(
                rule_name=rule.name, passed=False,
                message=f"Field '{field_name}' value '{value}' is not numeric",
                severity=rule.severity, field_name=field_name, actual=str(value),
            )

        if min_val is not None and num_val < float(min_val):
            return ValidationResult(
                rule_name=rule.name, passed=False,
                message=f"Field '{field_name}' value {num_val} is below minimum {min_val}",
                severity=rule.severity, field_name=field_name,
                expected=f">= {min_val}", actual=str(num_val),
            )
        if max_val is not None and num_val > float(max_val):
            return ValidationResult(
                rule_name=rule.name, passed=False,
                message=f"Field '{field_name}' value {num_val} exceeds maximum {max_val}",
                severity=rule.severity, field_name=field_name,
                expected=f"<= {max_val}", actual=str(num_val),
            )

        return ValidationResult(
            rule_name=rule.name, passed=True,
            message=f"Field '{field_name}' value {num_val} is within range",
            severity=rule.severity, field_name=field_name,
        )

    def _validate_regex(self, fields: Dict[str, Any], rule: ValidationRule) -> ValidationResult:
        field_name = rule.config.get("field", "")
        pattern = rule.config.get("pattern", "")
        value = fields.get(field_name, "")

        if not value:
            return ValidationResult(
                rule_name=rule.name, passed=False,
                message=f"Field '{field_name}' is empty",
                severity=rule.severity, field_name=field_name,
            )

        if re.match(pattern, str(value)):
            return ValidationResult(
                rule_name=rule.name, passed=True,
                message=f"Field '{field_name}' matches pattern",
                severity=rule.severity, field_name=field_name,
            )

        return ValidationResult(
            rule_name=rule.name, passed=False,
            message=f"Field '{field_name}' does not match pattern '{pattern}'",
            severity=rule.severity, field_name=field_name,
            expected=pattern, actual=str(value),
        )

    def _validate_cross_field(self, fields: Dict[str, Any], rule: ValidationRule) -> ValidationResult:
        field_a = rule.config.get("field_a", "")
        field_b = rule.config.get("field_b", "")
        operator = rule.config.get("operator", "eq")
        value_a = fields.get(field_a)
        value_b = fields.get(field_b)

        if value_a is None or value_b is None:
            return ValidationResult(
                rule_name=rule.name, passed=False,
                message=f"Cross-field check: one or both fields missing ({field_a}, {field_b})",
                severity=rule.severity,
            )

        try:
            num_a = float(str(value_a).replace(",", "").replace("$", ""))
            num_b = float(str(value_b).replace(",", "").replace("$", ""))
        except (ValueError, TypeError):
            num_a, num_b = str(value_a), str(value_b)

        ops = {
            "eq": lambda a, b: a == b,
            "ne": lambda a, b: a != b,
            "gt": lambda a, b: a > b,
            "gte": lambda a, b: a >= b,
            "lt": lambda a, b: a < b,
            "lte": lambda a, b: a <= b,
        }
        op_fn = ops.get(operator, ops["eq"])
        passed = op_fn(num_a, num_b)

        return ValidationResult(
            rule_name=rule.name, passed=passed,
            message=f"Cross-field {field_a} {operator} {field_b}: {'passed' if passed else 'failed'}",
            severity=rule.severity,
            expected=f"{field_a} {operator} {field_b}", actual=f"{value_a} vs {value_b}",
        )

    def _validate_required(self, fields: Dict[str, Any], rule: ValidationRule) -> ValidationResult:
        field_name = rule.config.get("field", "")
        value = fields.get(field_name)
        passed = value is not None and str(value).strip() != ""

        return ValidationResult(
            rule_name=rule.name, passed=passed,
            message=f"Field '{field_name}' {'is present' if passed else 'is missing or empty'}",
            severity=rule.severity, field_name=field_name,
        )

    def _validate_date_format(self, fields: Dict[str, Any], rule: ValidationRule) -> ValidationResult:
        field_name = rule.config.get("field", "")
        fmt = rule.config.get("format", "%Y-%m-%d")
        value = fields.get(field_name, "")

        if not value:
            return ValidationResult(
                rule_name=rule.name, passed=False,
                message=f"Field '{field_name}' is empty",
                severity=rule.severity, field_name=field_name,
            )

        try:
            datetime.strptime(str(value), fmt)
            return ValidationResult(
                rule_name=rule.name, passed=True,
                message=f"Field '{field_name}' matches date format '{fmt}'",
                severity=rule.severity, field_name=field_name,
            )
        except ValueError:
            return ValidationResult(
                rule_name=rule.name, passed=False,
                message=f"Field '{field_name}' does not match date format '{fmt}'",
                severity=rule.severity, field_name=field_name,
                expected=fmt, actual=str(value),
            )

    def _validate_list_values(self, fields: Dict[str, Any], rule: ValidationRule) -> ValidationResult:
        field_name = rule.config.get("field", "")
        allowed = rule.config.get("values", [])
        value = fields.get(field_name, "")

        passed = str(value).lower() in [str(v).lower() for v in allowed]
        return ValidationResult(
            rule_name=rule.name, passed=passed,
            message=f"Field '{field_name}' value '{value}' {'is' if passed else 'is not'} in allowed list",
            severity=rule.severity, field_name=field_name,
            expected=str(allowed), actual=str(value),
        )

    def _validate_custom(self, fields: Dict[str, Any], rule: ValidationRule) -> ValidationResult:
        return ValidationResult(
            rule_name=rule.name, passed=True,
            message=f"Custom rule '{rule.name}' — requires LLM evaluation",
            severity="info",
        )
