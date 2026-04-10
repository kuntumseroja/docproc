from __future__ import annotations
import json
import re
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

from app.services.llm_provider import BaseLLMProvider, LLMProviderFactory


NL_SCHEMA_SYSTEM_PROMPT = """You are an expert document processing analyst. Given a natural language description of a document type and what data needs to be extracted, generate a structured extraction schema.

Return a JSON object with this exact structure:
{
    "fields": [
        {
            "name": "field_name_snake_case",
            "label": "Human Readable Label",
            "field_type": "text|number|date|currency|boolean|list",
            "required": true|false,
            "description": "What this field captures",
            "validation_pattern": "optional regex pattern"
        }
    ],
    "validation_rules": [
        {
            "name": "rule_name",
            "description": "What this rule checks",
            "rule_type": "range|regex|cross_field|custom",
            "config": {}
        }
    ]
}

Field types:
- text: Free text string
- number: Numeric value (integer or decimal)
- date: Date value (ISO format)
- currency: Monetary amount with currency code
- boolean: True/false
- list: Array of values

Be thorough but practical. Include fields the user explicitly mentions and any commonly associated fields for that document type. Generate sensible validation rules."""


class NLSchemaParser:
    def __init__(self, llm_provider: Optional[BaseLLMProvider] = None):
        self.llm_provider = llm_provider

    def _get_provider(self) -> BaseLLMProvider:
        if self.llm_provider:
            return self.llm_provider
        return LLMProviderFactory.from_settings()

    async def parse(
        self,
        description: str,
        document_type: Optional[str] = None,
        sample_text: Optional[str] = None,
    ) -> Dict[str, Any]:
        provider = self._get_provider()

        user_prompt = f"""Document type: {document_type or 'general'}

Description of what to extract:
{description}

IMPORTANT: Generate a SEPARATE field entry for EVERY item mentioned above. If compound items like "line items with description, quantity, and unit price" are mentioned, create individual fields for each sub-item (e.g. line_item_description, line_item_quantity, line_item_unit_price). Do NOT nest fields inside other fields. Every field must be a flat top-level entry in the "fields" array. Generate at least one field for every noun/concept mentioned."""
        if sample_text:
            user_prompt += f"\n\nSample document text:\n{sample_text[:2000]}"

        messages = [
            {"role": "system", "content": NL_SCHEMA_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

        response = await provider.chat(messages, temperature=0.1)
        result = self._parse_response(response.content)
        result["model_used"] = response.model
        result["provider"] = response.provider.value
        result["latency_ms"] = response.latency_ms
        return result

    def _parse_response(self, content: str) -> Dict[str, Any]:
        # Try to extract JSON from markdown code block
        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', content, re.DOTALL)
        if json_match:
            content = json_match.group(1)

        try:
            data = json.loads(content.strip())
        except json.JSONDecodeError:
            return {
                "fields": [],
                "validation_rules": [],
                "confidence": 0.0,
                "raw_response": content,
                "error": "Failed to parse LLM response as JSON",
            }

        raw_fields = data.get("fields", [])
        rules = data.get("validation_rules", [])

        # Flatten nested list fields (e.g. line_items with sub-fields) into
        # individual top-level fields so the UI shows every extractable field.
        fields = []
        for field in raw_fields:
            nested = field.pop("fields", None)
            if nested and isinstance(nested, list):
                # Add parent as a group marker but also expand children
                parent_name = field.get("name", "item")
                for child in nested:
                    child["name"] = f"{parent_name}_{child.get('name', 'unknown')}"
                    child.setdefault("label", child["name"].replace("_", " ").title())
                    child.setdefault("field_type", "text")
                    child.setdefault("required", True)
                    child.setdefault("description", "")
                    fields.append(child)
            else:
                fields.append(field)

        # Ensure required keys exist on each field
        for field in fields:
            field.setdefault("name", "unknown")
            field.setdefault("label", field["name"].replace("_", " ").title())
            field.setdefault("field_type", "text")
            field.setdefault("required", True)
            field.setdefault("description", "")

        for rule in rules:
            rule.setdefault("name", "unknown")
            rule.setdefault("description", "")
            rule.setdefault("rule_type", "custom")
            rule.setdefault("config", {})

        return {
            "fields": fields,
            "validation_rules": rules,
            "confidence": 0.85 if fields else 0.0,
            "raw_response": None,
        }
