import pytest
from app.schemas.workflow import (
    WorkflowCreateRequest, WorkflowResponse, FieldDefinition,
    NLSchemaRequest, NLSchemaResponse, ValidationRuleDefinition,
)
from app.services.nl_schema_parser import NLSchemaParser


def test_field_definition():
    field = FieldDefinition(name="invoice_number", label="Invoice Number", field_type="text")
    assert field.name == "invoice_number"
    assert field.required is True


def test_workflow_create_request():
    req = WorkflowCreateRequest(name="Invoice Processing")
    assert req.name == "Invoice Processing"
    assert req.extraction_schema is None


def test_nl_schema_parser_parse_response():
    parser = NLSchemaParser(llm_provider=None)
    response = '{"fields": [{"name": "total", "label": "Total Amount", "field_type": "currency", "required": true, "description": "Invoice total"}], "validation_rules": []}'
    result = parser._parse_response(response)
    assert len(result["fields"]) == 1
    assert result["fields"][0]["name"] == "total"
    assert result["confidence"] == 0.85


def test_nl_schema_parser_parse_json_block():
    parser = NLSchemaParser(llm_provider=None)
    response = '```json\n{"fields": [{"name": "date", "label": "Date", "field_type": "date"}], "validation_rules": [{"name": "date_valid", "description": "Check date"}]}\n```'
    result = parser._parse_response(response)
    assert len(result["fields"]) == 1
    assert result["fields"][0]["field_type"] == "date"
    assert len(result["validation_rules"]) == 1


def test_nl_schema_parser_invalid_json():
    parser = NLSchemaParser(llm_provider=None)
    result = parser._parse_response("This is not valid JSON at all")
    assert result["confidence"] == 0.0
    assert "error" in result


def test_validation_rule_definition():
    rule = ValidationRuleDefinition(
        name="amount_range", description="Total must be positive", rule_type="range",
        config={"min": 0}
    )
    assert rule.rule_type == "range"
    assert rule.config["min"] == 0
