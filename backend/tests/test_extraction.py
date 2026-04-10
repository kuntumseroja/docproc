import pytest
from app.services.extraction_service import (
    ExtractionAgent, ExtractionResult, ExtractionField, ConfidenceLevel,
)


def test_confidence_levels():
    assert ConfidenceLevel.HIGH.value == "high"
    assert ConfidenceLevel.MEDIUM.value == "medium"
    assert ConfidenceLevel.LOW.value == "low"


def test_extraction_result_creation():
    field = ExtractionField(
        name="name", value="John", confidence=ConfidenceLevel.HIGH,
        raw_text="John Doe",
    )
    result = ExtractionResult(
        fields={"name": field}, tables={},
        raw_response="test", success=True,
    )
    assert result.success
    assert result.fields["name"].value == "John"


def test_extraction_agent_parse():
    agent = ExtractionAgent(llm_provider=None)
    response = '{"fields": {"name": {"value": "John", "confidence": "high", "raw_text": "John"}}, "tables": {}}'
    result = agent._parse_response(response)
    assert result.success
    assert "name" in result.fields
    assert result.fields["name"].value == "John"


def test_extraction_agent_parse_json_block():
    agent = ExtractionAgent(llm_provider=None)
    response = '```json\n{"fields": {"date": {"value": "2026-01-01", "confidence": "medium", "raw_text": "Jan 1"}}, "tables": {}}\n```'
    result = agent._parse_response(response)
    assert result.success
    assert result.fields["date"].confidence == ConfidenceLevel.MEDIUM
