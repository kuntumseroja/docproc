import pytest
from app.services.judge_service import JudgeService, QualityRating, JudgeReport


def test_parse_valid_response():
    service = JudgeService(llm_provider=None)
    response = '{"overall_rating": "good", "overall_score": 0.8, "field_judgments": [{"field_name": "name", "rating": "excellent", "confidence_adjustment": 0.05, "issues": [], "suggestions": []}], "summary": "Good extraction", "recommendations": []}'
    report = service._parse_response(response)
    assert report.overall_rating == QualityRating.GOOD
    assert report.overall_score == 0.8
    assert len(report.field_judgments) == 1


def test_parse_json_block():
    service = JudgeService(llm_provider=None)
    response = '```json\n{"overall_rating": "excellent", "overall_score": 0.95, "field_judgments": [], "summary": "Perfect", "recommendations": []}\n```'
    report = service._parse_response(response)
    assert report.overall_rating == QualityRating.EXCELLENT
    assert report.overall_score == 0.95


def test_parse_invalid_json():
    service = JudgeService(llm_provider=None)
    report = service._parse_response("This is not JSON")
    assert report.overall_rating == QualityRating.ACCEPTABLE
    assert report.overall_score == 0.5


def test_quality_ratings():
    assert QualityRating.EXCELLENT.value == "excellent"
    assert QualityRating.POOR.value == "poor"
