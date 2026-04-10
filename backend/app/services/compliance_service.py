from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

REGULATIONS_DIR = Path(__file__).resolve().parent.parent / "data" / "regulations"

COMPLIANCE_CHECK_SYSTEM_PROMPT = """You are a regulatory compliance analyst for DocProc. Your task is to analyze a document against specific regulation sections and produce a structured compliance report.

For each regulation section provided, you must assess the document and return a JSON response with the following structure:

{
  "sections": [
    {
      "section_id": "<section id>",
      "section_title": "<section title>",
      "status": "<compliant|non_compliant|partial|not_applicable>",
      "findings": "<detailed findings with regulation reference>",
      "recommendations": "<specific actionable recommendations>",
      "risk_level": "<low|medium|high|critical>"
    }
  ],
  "overall_score": <number 0-100 representing overall compliance percentage>,
  "summary": "<2-3 sentence executive summary of compliance status>"
}

CRITICAL — Findings format:
Each "findings" value MUST begin with a regulation reference in this format:
  "Ref: <Regulation Name> <Section/Pasal number> — <finding details>"

Examples:
  "Ref: POJK 51/2017 Pasal 2 ayat (1) — The document does not include a RAKB sustainable finance action plan..."
  "Ref: POJK 6/2022 Pasal 3 huruf (b) — Multi-factor authentication is mentioned but quarterly access reviews are missing..."
  "Ref: NIST CSF 2.0 Section PR.AC-1 — Access control policies are partially documented..."
  "Ref: ISO 27001:2022 Annex A.8.2 — Information classification scheme is not defined..."
  "Ref: PBI 23/2021 Pasal 45 ayat (2) — Consumer dispute resolution timeline exceeds regulatory limit..."

For Indonesian regulations (POJK, PBI), use "Pasal" for section references.
For international standards (NIST, ISO, GDPR, SASB, ISSB), use "Section" or the standard's native reference format.
Always include the specific clause, sub-clause, or requirement number when available.

Guidelines:
- "compliant" means the document fully addresses the regulation section requirements.
- "non_compliant" means the document clearly violates or fails to address the section.
- "partial" means some requirements are met but gaps remain.
- "not_applicable" means the regulation section does not apply to this document type.
- Risk level should reflect the severity of non-compliance: low (minor gaps), medium (notable gaps), high (significant violations), critical (severe violations with legal exposure).
- Be specific in findings — quote or reference actual content from the document where possible.
- Provide actionable recommendations, not generic advice.
- Return ONLY the JSON object, no additional text."""

COMPLIANCE_CHAT_SYSTEM_PROMPT = """You are a regulatory compliance assistant for DocProc. You help users understand regulations, assess compliance, and provide guidance on meeting regulatory requirements.

You have access to the following regulation context. Use it to provide accurate, specific answers.
When referencing regulations, cite the specific section ID and title.
Keep responses concise, professional, and actionable.
If the user provides document context, relate your answers to that specific document."""


@dataclass
class ComplianceChatMessage:
    role: str
    content: str


class ComplianceService:
    """Service for regulation loading and LLM-powered compliance checking."""

    def __init__(self, llm_provider=None):
        self.llm = llm_provider
        self._index_cache: Optional[List[Dict[str, Any]]] = None
        self._regulation_cache: Dict[str, Dict[str, Any]] = {}
        self.conversation_history: List[ComplianceChatMessage] = []

    def _get_provider(self):
        if self.llm:
            return self.llm
        from app.services.llm_provider import LLMProviderFactory
        return LLMProviderFactory.from_settings()

    def _load_index(self) -> List[Dict[str, Any]]:
        if self._index_cache is not None:
            return self._index_cache
        index_path = REGULATIONS_DIR / "index.json"
        if not index_path.exists():
            logger.warning("Regulations index.json not found at %s", index_path)
            self._index_cache = []
            return self._index_cache
        with open(index_path, "r") as f:
            data = json.load(f)
        # Support both formats: plain list or object with "regulations" key
        if isinstance(data, dict):
            self._index_cache = data.get("regulations", [])
        else:
            self._index_cache = data
        return self._index_cache

    def _load_regulation(self, reg_id: str) -> Optional[Dict[str, Any]]:
        if reg_id in self._regulation_cache:
            return self._regulation_cache[reg_id]
        index = self._load_index()
        entry = next((r for r in index if r["id"] == reg_id), None)
        if entry is None:
            return None
        file_path = REGULATIONS_DIR / entry["file"]
        if not file_path.exists():
            logger.warning("Regulation file not found: %s", file_path)
            return None
        with open(file_path, "r") as f:
            data = json.load(f)
        self._regulation_cache[reg_id] = data
        return data

    def list_regulations(self) -> List[Dict[str, Any]]:
        """Return all available regulations from index.json."""
        return self._load_index()

    def get_regulation(self, reg_id: str) -> Optional[Dict[str, Any]]:
        """Return full regulation detail for the given ID."""
        return self._load_regulation(reg_id)

    async def check_compliance(
        self,
        document_text: str,
        regulation_ids: List[str],
    ) -> Dict[str, Any]:
        """Use LLM to check document against selected regulations.

        Returns a dict with 'results' list, plus model/provider/latency metadata.
        """
        provider = self._get_provider()
        results = []
        total_latency = 0.0
        model_used = None
        provider_name = None

        for reg_id in regulation_ids:
            regulation = self._load_regulation(reg_id)
            if regulation is None:
                continue

            # Build sections context with clause numbering for reference
            reg_name = regulation.get("name", regulation.get("title", reg_id))
            sections_text = ""
            for section in regulation.get("sections", []):
                sec_num = section.get("section_number", section["id"])
                sections_text += (
                    f"\n## Pasal/Section {sec_num}: {section['title']} "
                    f"[ID: {section['id']}]\n"
                    f"{section.get('description', '')}\n"
                )
                # Include specific requirements with sub-clause numbering
                for idx, req in enumerate(section.get("requirements", []), 1):
                    sections_text += (
                        f"  ({chr(96 + idx)}) {req}\n"  # (a), (b), (c), ...
                    )

            user_prompt = (
                f"Analyze the following document against the regulation "
                f"\"{reg_name}\" — \"{regulation['title']}\".\n\n"
                f"IMPORTANT: In your findings, always reference the specific "
                f"Pasal/Section number and sub-clause from {reg_name}. "
                f"For example: \"Ref: {reg_name} Pasal 2 ayat (a) — ...\"\n\n"
                f"REGULATION SECTIONS:\n{sections_text}\n\n"
                f"DOCUMENT TEXT:\n{document_text[:6000]}\n\n"
                f"Return the compliance assessment as JSON."
            )

            messages = [
                {"role": "system", "content": COMPLIANCE_CHECK_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ]

            response = await provider.chat(messages, temperature=0.1)
            total_latency += response.latency_ms
            model_used = response.model
            provider_name = response.provider.value if response.provider else None

            # Parse the LLM JSON response
            parsed = self._parse_compliance_json(response.content)

            results.append({
                "regulation_id": reg_id,
                "regulation_name": regulation.get("name", reg_id),
                "section_results": parsed.get("sections", []),
                "overall_score": parsed.get("overall_score", 0),
                "summary": parsed.get("summary", "Unable to parse compliance results."),
            })

        return {
            "results": results,
            "model_used": model_used,
            "provider": provider_name,
            "latency_ms": round(total_latency, 2),
        }

    def _parse_compliance_json(self, content: str) -> Dict[str, Any]:
        """Extract and parse JSON from LLM response content."""
        # Try direct parse first
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass

        # Try extracting from markdown code block
        match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", content, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass

        # Try finding JSON object in the text
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass

        logger.warning("Failed to parse compliance JSON from LLM response")
        return {"sections": [], "overall_score": 0, "summary": content[:500]}

    async def chat_compliance(
        self,
        message: str,
        regulation_ids: List[str],
        document_text: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Regulation-aware chat that includes regulation context in the LLM prompt."""
        provider = self._get_provider()

        self.conversation_history.append(
            ComplianceChatMessage(role="user", content=message)
        )

        messages = [{"role": "system", "content": COMPLIANCE_CHAT_SYSTEM_PROMPT}]

        # Build regulation context
        reg_context_parts = []
        regulation_refs = []
        for reg_id in regulation_ids:
            regulation = self._load_regulation(reg_id)
            if regulation is None:
                continue
            regulation_refs.append(reg_id)
            sections_text = ""
            for section in regulation.get("sections", []):
                sections_text += (
                    f"  - {section['id']}: {section['title']}\n"
                    f"    {section['description']}\n"
                )
            reg_context_parts.append(
                f"Regulation: {regulation['title']} ({regulation['name']})\n"
                f"Issuer: {regulation.get('issuer', 'N/A')}\n"
                f"Sections:\n{sections_text}"
            )

        if reg_context_parts:
            messages.append({
                "role": "system",
                "content": (
                    "Regulation context:\n\n"
                    + "\n---\n".join(reg_context_parts)
                )[:4000],
            })

        if document_text:
            messages.append({
                "role": "system",
                "content": f"Document context:\n\n{document_text[:4000]}",
            })

        # Include recent conversation history
        for msg in self.conversation_history[-10:]:
            messages.append({"role": msg.role, "content": msg.content})

        response = await provider.chat(messages, temperature=0.3)

        assistant_msg = ComplianceChatMessage(
            role="assistant", content=response.content
        )
        self.conversation_history.append(assistant_msg)

        # Extract regulation references from response
        found_refs = []
        for reg_id in regulation_ids:
            reg = self._load_regulation(reg_id)
            if reg:
                for section in reg.get("sections", []):
                    if section["id"].lower() in response.content.lower():
                        found_refs.append(section["id"])

        return {
            "message": response.content,
            "sources": [{"type": "regulation", "id": ref} for ref in found_refs],
            "regulation_refs": regulation_refs,
            "model_used": response.model,
            "provider": response.provider.value if response.provider else None,
            "latency_ms": round(response.latency_ms, 2),
        }

    def clear_history(self):
        self.conversation_history.clear()
