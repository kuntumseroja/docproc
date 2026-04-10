from __future__ import annotations

import csv
import io
import json
import logging
from typing import Any, Dict, List, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class ExportResult:
    data: bytes
    filename: str
    content_type: str
    record_count: int


class ExportService:
    """Export service for CSV, JSON, and webhook delivery."""

    def export_csv(
        self,
        records: List[Dict[str, Any]],
        filename: str = "export.csv",
        fields: Optional[List[str]] = None,
    ) -> ExportResult:
        if not records:
            return ExportResult(
                data=b"", filename=filename,
                content_type="text/csv", record_count=0,
            )

        if fields is None:
            fields = list(records[0].keys())

        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for record in records:
            writer.writerow(record)

        data = output.getvalue().encode("utf-8")
        return ExportResult(
            data=data, filename=filename,
            content_type="text/csv", record_count=len(records),
        )

    def export_json(
        self,
        records: List[Dict[str, Any]],
        filename: str = "export.json",
    ) -> ExportResult:
        data = json.dumps(records, indent=2, default=str).encode("utf-8")
        return ExportResult(
            data=data, filename=filename,
            content_type="application/json", record_count=len(records),
        )

    def export_excel(
        self,
        records: List[Dict[str, Any]],
        filename: str = "export.xlsx",
        fields: Optional[List[str]] = None,
    ) -> ExportResult:
        if not records:
            return ExportResult(
                data=b"", filename=filename,
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                record_count=0,
            )

        if fields is None:
            fields = list(records[0].keys())

        # Simple XLSX using csv as fallback (openpyxl optional)
        try:
            import openpyxl
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Export"

            ws.append(fields)
            for record in records:
                ws.append([record.get(f, "") for f in fields])

            output = io.BytesIO()
            wb.save(output)
            data = output.getvalue()
        except ImportError:
            logger.warning("openpyxl not installed, falling back to CSV")
            csv_result = self.export_csv(records, filename.replace(".xlsx", ".csv"), fields)
            return csv_result

        return ExportResult(
            data=data, filename=filename,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            record_count=len(records),
        )

    def prepare_webhook_payload(
        self,
        records: List[Dict[str, Any]],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return {
            "source": "docproc",
            "record_count": len(records),
            "records": records,
            "metadata": metadata or {},
        }
