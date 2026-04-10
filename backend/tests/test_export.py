import pytest
from app.services.export_service import ExportService


def test_export_csv():
    service = ExportService()
    records = [{"name": "John", "amount": "100"}, {"name": "Jane", "amount": "200"}]
    result = service.export_csv(records)
    assert result.content_type == "text/csv"
    assert result.record_count == 2
    assert b"name,amount" in result.data
    assert b"John" in result.data


def test_export_csv_empty():
    service = ExportService()
    result = service.export_csv([])
    assert result.record_count == 0


def test_export_json():
    service = ExportService()
    records = [{"name": "John", "amount": 100}]
    result = service.export_json(records)
    assert result.content_type == "application/json"
    assert b'"name": "John"' in result.data


def test_export_csv_with_fields():
    service = ExportService()
    records = [{"name": "John", "amount": "100", "extra": "skip"}]
    result = service.export_csv(records, fields=["name", "amount"])
    assert b"extra" not in result.data
    assert b"name,amount" in result.data


def test_webhook_payload():
    service = ExportService()
    records = [{"id": "1", "name": "Test"}]
    payload = service.prepare_webhook_payload(records, metadata={"source": "test"})
    assert payload["source"] == "docproc"
    assert payload["record_count"] == 1
    assert payload["metadata"]["source"] == "test"
