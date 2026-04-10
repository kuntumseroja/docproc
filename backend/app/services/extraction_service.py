from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional, List
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class ExtractionField:
    name: str
    value: Any
    confidence: ConfidenceLevel
    raw_text: str
    note: Optional[str] = None


@dataclass
class ExtractionResult:
    fields: Dict[str, ExtractionField]
    tables: Dict[str, list]
    raw_response: str
    success: bool
    error_message: Optional[str] = None


EXTRACTION_SYSTEM_PROMPT = """You are a document extraction agent. Your task is to extract structured information from OCR-extracted text.

You will be given:
1. OCR text from a document
2. A workflow configuration defining what fields/tables to extract

Your output MUST be valid JSON with this structure:
{
    "fields": {
        "field_name": {
            "value": "extracted_value",
            "confidence": "high|medium|low",
            "raw_text": "original text from document",
            "note": "any clarification"
        }
    },
    "tables": {
        "table_name": [
            {"col1": "val1", "col2": "val2"}
        ]
    }
}

Be precise. If you cannot confidently extract a field, set confidence to "low" and explain in "note".
Extract exactly what is asked for in the workflow config. Do not invent data."""


class ExtractionAgent:
    """LLM-based extraction agent."""

    def __init__(self, llm_provider):
        self.llm = llm_provider

    async def execute(self, ocr_text: str, workflow_config: Dict[str, Any]) -> ExtractionResult:
        try:
            user_prompt = self._build_prompt(ocr_text, workflow_config)

            response = await self.llm.chat(
                messages=[
                    {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=4096,
            )

            return self._parse_response(response.content)
        except Exception as e:
            logger.error(f"Extraction failed: {e}")
            return ExtractionResult(
                fields={}, tables={}, raw_response="",
                success=False, error_message=str(e),
            )

    def _build_prompt(self, ocr_text: str, workflow_config: Dict[str, Any]) -> str:
        fields_desc = "\n".join([
            f"- {f['name']}: {f.get('description', 'N/A')}"
            for f in workflow_config.get("fields", [])
        ])
        tables_desc = "\n".join([
            f"- {t['name']}: {t.get('description', 'N/A')} (columns: {', '.join(t.get('columns', []))})"
            for t in workflow_config.get("tables", [])
        ])
        return f"""Extract the following information from the document text:

FIELDS TO EXTRACT:
{fields_desc}

TABLES TO EXTRACT:
{tables_desc}

DOCUMENT TEXT:
{ocr_text}

Return the extraction as valid JSON matching the required format."""

    def _parse_response(self, response_text: str) -> ExtractionResult:
        try:
            json_str = response_text
            if "```json" in response_text:
                json_str = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                json_str = response_text.split("```")[1].split("```")[0]

            data = json.loads(json_str)

            fields = {}
            for name, fd in data.get("fields", {}).items():
                fields[name] = ExtractionField(
                    name=name,
                    value=fd.get("value"),
                    confidence=ConfidenceLevel(fd.get("confidence", "low")),
                    raw_text=fd.get("raw_text", ""),
                    note=fd.get("note"),
                )

            return ExtractionResult(
                fields=fields,
                tables=data.get("tables", {}),
                raw_response=response_text,
                success=True,
            )
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON: {e}")
            return ExtractionResult(
                fields={}, tables={}, raw_response=response_text,
                success=False, error_message=f"JSON parsing error: {e}",
            )
