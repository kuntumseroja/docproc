import pytest
from app.services.validation_engine import (
    ValidationEngine, ValidationRule, RuleType, ValidationReport,
)


def test_required_field_present():
    engine = ValidationEngine()
    rules = [ValidationRule(name="req_name", description="Name required", rule_type=RuleType.REQUIRED, config={"field": "name"})]
    report = engine.validate({"name": "John"}, rules)
    assert report.passed
    assert report.error_count == 0


def test_required_field_missing():
    engine = ValidationEngine()
    rules = [ValidationRule(name="req_name", description="Name required", rule_type=RuleType.REQUIRED, config={"field": "name"})]
    report = engine.validate({}, rules)
    assert not report.passed
    assert report.error_count == 1


def test_range_valid():
    engine = ValidationEngine()
    rules = [ValidationRule(name="amount_range", description="Check amount", rule_type=RuleType.RANGE, config={"field": "total", "min": 0, "max": 10000})]
    report = engine.validate({"total": "500.00"}, rules)
    assert report.passed


def test_range_exceeded():
    engine = ValidationEngine()
    rules = [ValidationRule(name="amount_range", description="Check amount", rule_type=RuleType.RANGE, config={"field": "total", "min": 0, "max": 100})]
    report = engine.validate({"total": "500"}, rules)
    assert not report.passed


def test_regex_match():
    engine = ValidationEngine()
    rules = [ValidationRule(name="email_check", description="Valid email", rule_type=RuleType.REGEX, config={"field": "email", "pattern": r"^[\w.+-]+@[\w-]+\.[\w.]+$"})]
    report = engine.validate({"email": "test@example.com"}, rules)
    assert report.passed


def test_regex_no_match():
    engine = ValidationEngine()
    rules = [ValidationRule(name="email_check", description="Valid email", rule_type=RuleType.REGEX, config={"field": "email", "pattern": r"^[\w.+-]+@[\w-]+\.[\w.]+$"})]
    report = engine.validate({"email": "not-an-email"}, rules)
    assert not report.passed


def test_cross_field():
    engine = ValidationEngine()
    rules = [ValidationRule(name="total_check", description="Total > subtotal", rule_type=RuleType.CROSS_FIELD, config={"field_a": "total", "field_b": "subtotal", "operator": "gte"})]
    report = engine.validate({"total": "100", "subtotal": "80"}, rules)
    assert report.passed


def test_date_format_valid():
    engine = ValidationEngine()
    rules = [ValidationRule(name="date_check", description="Date format", rule_type=RuleType.DATE_FORMAT, config={"field": "date", "format": "%Y-%m-%d"})]
    report = engine.validate({"date": "2026-01-15"}, rules)
    assert report.passed


def test_multiple_rules():
    engine = ValidationEngine()
    rules = [
        ValidationRule(name="req", description="Required", rule_type=RuleType.REQUIRED, config={"field": "name"}),
        ValidationRule(name="range", description="Range", rule_type=RuleType.RANGE, config={"field": "amount", "min": 0}),
    ]
    report = engine.validate({"name": "Test", "amount": "50"}, rules)
    assert report.passed
    assert report.total_rules == 2
