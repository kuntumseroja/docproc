import pytest
from app.services.confidence_scorer import ConfidenceScorer, ConfidenceLevel


def test_high_confidence():
    scorer = ConfidenceScorer()
    report = scorer.score_document(
        fields={"name": "John", "total": "100"},
        extraction_confidences={"name": "high", "total": "high"},
        ocr_confidence=0.95,
    )
    assert report.document_level == ConfidenceLevel.HIGH
    assert report.document_score > 0.8


def test_low_confidence():
    scorer = ConfidenceScorer()
    report = scorer.score_document(
        fields={"name": "J???n", "total": ""},
        extraction_confidences={"name": "low", "total": "low"},
        ocr_confidence=0.3,
        validation_results={"name": False, "total": False},
        judge_adjustments={"name": -0.3, "total": -0.3},
    )
    assert report.document_level == ConfidenceLevel.LOW
    assert report.document_score < 0.5


def test_validation_failure_reduces_confidence():
    scorer = ConfidenceScorer()
    report_pass = scorer.score_document(
        fields={"amount": "100"},
        extraction_confidences={"amount": "high"},
        validation_results={"amount": True},
    )
    report_fail = scorer.score_document(
        fields={"amount": "100"},
        extraction_confidences={"amount": "high"},
        validation_results={"amount": False},
    )
    assert report_pass.document_score > report_fail.document_score


def test_missing_expected_fields_penalty():
    scorer = ConfidenceScorer()
    report = scorer.score_document(
        fields={"name": "John"},
        extraction_confidences={"name": "high"},
        expected_fields=["name", "date", "total", "vendor"],
    )
    # 3 of 4 expected fields missing → penalty
    assert report.document_score < 0.8


def test_field_confidence_factors():
    scorer = ConfidenceScorer()
    report = scorer.score_document(
        fields={"invoice_number": "INV-001"},
        extraction_confidences={"invoice_number": "medium"},
    )
    assert len(report.field_scores) == 1
    assert len(report.field_scores[0].factors) == 5
