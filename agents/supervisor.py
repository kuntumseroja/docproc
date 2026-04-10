from __future__ import annotations

import logging
from typing import Optional, TYPE_CHECKING

from langgraph.graph import StateGraph, END
from agents.base import SupervisorState

if TYPE_CHECKING:
    from backend.app.services.llm_provider import BaseLLMProvider
    from backend.app.services.extraction_service import ExtractionAgent

logger = logging.getLogger(__name__)


class ValidationNode:
    """Validates OCR text and workflow configuration."""

    def execute(self, state: SupervisorState) -> dict:
        errors = []
        if not state.get("ocr_text") or len(state.get("ocr_text", "")) < 10:
            errors.append("OCR text is too short or empty")
        config = state.get("workflow_config", {})
        if "fields" not in config:
            errors.append("Workflow missing 'fields' configuration")
        if "tables" not in config:
            errors.append("Workflow missing 'tables' configuration")

        passed = len(errors) == 0
        logger.info(f"Validation: {'passed' if passed else 'failed'} ({len(errors)} errors)")

        return {
            "validation_errors": errors,
            "validation_passed": passed,
            "messages": state.get("messages", []) + [
                f"Validation {'passed' if passed else 'failed'}"
            ],
        }


class GenerationNode:
    """Generates extraction using the extraction agent."""

    def __init__(self, extraction_agent: ExtractionAgent):
        self.extraction_agent = extraction_agent

    def execute(self, state: SupervisorState) -> dict:
        if not state.get("validation_passed"):
            return {
                "error_message": "Validation failed, skipping generation",
                "messages": state.get("messages", []) + ["Skipped generation due to validation failure"],
            }

        # Note: extraction_agent.execute is async but LangGraph nodes are sync.
        # In production, use asyncio.run or an async LangGraph variant.
        import asyncio
        try:
            result = asyncio.run(
                self.extraction_agent.execute(state["ocr_text"], state["workflow_config"])
            )
            generated_fields = {name: field.value for name, field in result.fields.items()}
            logger.info(f"Generation complete: {len(generated_fields)} fields")

            return {
                "generated_fields": generated_fields,
                "generated_tables": result.tables,
                "messages": state.get("messages", []) + [
                    f"Generated {len(generated_fields)} fields"
                ],
            }
        except Exception as e:
            logger.error(f"Generation failed: {e}")
            return {
                "error_message": str(e),
                "messages": state.get("messages", []) + [f"Generation failed: {e}"],
            }


class ActionNode:
    """Performs post-processing actions on extracted data."""

    def execute(self, state: SupervisorState) -> dict:
        fields = state.get("generated_fields", {})
        if not fields:
            return {
                "action_results": {},
                "messages": state.get("messages", []) + ["No fields to act on"],
            }

        action_results = {}
        for name, value in fields.items():
            action_results[name] = {
                "original": value,
                "processed": str(value).strip().title() if isinstance(value, str) else value,
            }

        logger.info(f"Action complete: processed {len(action_results)} fields")
        return {
            "action_results": action_results,
            "messages": state.get("messages", []) + [f"Processed {len(action_results)} fields"],
        }


class FinalizeNode:
    """Finalizes extraction and prepares output."""

    def execute(self, state: SupervisorState) -> dict:
        final = {
            "document_id": state.get("document_id"),
            "fields": state.get("generated_fields", {}),
            "tables": state.get("generated_tables", {}),
            "action_results": state.get("action_results", {}),
            "validation_errors": state.get("validation_errors", []),
            "status": "success" if state.get("validation_passed") else "partial",
        }
        logger.info(f"Finalization complete for document: {state.get('document_id')}")
        return {
            "final_extraction": final,
            "messages": state.get("messages", []) + ["Extraction finalized"],
        }


class SupervisorAgent:
    """LangGraph supervisor orchestrating the extraction workflow."""

    def __init__(self, extraction_agent: Optional[ExtractionAgent] = None):
        self.validation_node = ValidationNode()
        self.generation_node = GenerationNode(extraction_agent) if extraction_agent else None
        self.action_node = ActionNode()
        self.finalize_node = FinalizeNode()
        self.graph = self._build_graph()

    def _build_graph(self):
        graph = StateGraph(SupervisorState)

        graph.add_node("validate", self.validation_node.execute)
        if self.generation_node:
            graph.add_node("generate", self.generation_node.execute)
        graph.add_node("act", self.action_node.execute)
        graph.add_node("finalize", self.finalize_node.execute)

        graph.set_entry_point("validate")

        def route_after_validation(state: SupervisorState) -> str:
            if state.get("validation_passed") and self.generation_node:
                return "generate"
            return "finalize"

        graph.add_conditional_edges("validate", route_after_validation)
        if self.generation_node:
            graph.add_edge("generate", "act")
        graph.add_edge("act", "finalize")
        graph.add_edge("finalize", END)

        return graph.compile()

    def run(self, document_id: str, ocr_text: str, workflow_config: dict) -> dict:
        """Run the supervisor workflow."""
        initial_state: SupervisorState = {
            "document_id": document_id,
            "ocr_text": ocr_text,
            "workflow_config": workflow_config,
            "validation_errors": [],
            "validation_passed": False,
            "generated_fields": {},
            "generated_tables": {},
            "action_results": {},
            "final_extraction": {},
            "error_message": None,
            "messages": [],
        }

        result = self.graph.invoke(initial_state)
        return result
