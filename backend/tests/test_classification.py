import pytest
from app.services.classification_service import ClassificationService


def test_classify_invoice():
    service = ClassificationService()
    result = service.classify_by_keywords("Invoice Number: INV-001\nBill To: ABC Corp\nTotal Amount: $500\nDue Date: 2026-03-01\nPayment terms")
    assert result.document_type == "invoice"
    assert result.confidence > 0.5


def test_classify_contract():
    service = ClassificationService()
    result = service.classify_by_keywords("This Agreement is entered into by the parties. Whereas the terms and conditions set forth herein govern the obligations.")
    assert result.document_type == "contract"


def test_classify_resume():
    service = ClassificationService()
    result = service.classify_by_keywords("Education: MIT 2020. Experience: Software Engineer at Google. Skills: Python, Java")
    assert result.document_type == "resume"


def test_classify_unknown():
    service = ClassificationService()
    result = service.classify_by_keywords("Random text with no recognizable patterns xyz abc 123")
    assert result.document_type == "other"
    assert result.confidence <= 0.3


def test_parse_response():
    service = ClassificationService()
    result = service._parse_response('{"document_type": "invoice", "confidence": 0.9, "reasoning": "Contains invoice fields"}')
    assert result.document_type == "invoice"
    assert result.confidence == 0.9
