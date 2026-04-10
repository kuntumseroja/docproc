from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from agents.base import BaseAgent

if TYPE_CHECKING:
    from backend.app.services.llm_provider import BaseLLMProvider

logger = logging.getLogger(__name__)


class GenerationAgent(BaseAgent):
    """Code-model calculations agent.

    Computes derived fields using formulas defined in the workflow config.
    For example: total = subtotal + tax, or line_total = qty * unit_price.
    """

    def __init__(self, llm_provider: Optional[BaseLLMProvider] = None):
        super().__init__("generation", llm_provider)

    async def execute(self, state: dict) -> dict:
        from backend.app.services.generation_engine import (
            GenerationEngine, CalculationRule,
        )

        fields = state.get("generated_fields", {})
        workflow_config = state.get("workflow_config", {})
        tables = state.get("generated_tables", {})

        # Build calculation rules from workflow config
        calculations = []
        for calc_def in workflow_config.get("calculations", []):
            calculations.append(CalculationRule(
                name=calc_def.get("name", "unnamed"),
                description=calc_def.get("description", ""),
                formula=calc_def.get("formula", "0"),
                output_field=calc_def.get("output_field", ""),
                dependencies=calc_def.get("dependencies", []),
            ))

        if not calculations:
            logger.info("No calculations defined in workflow config")
            return {"generated_fields": fields, "generated_tables": tables}

        engine = GenerationEngine()

        # Compute field-level calculations
        result = engine.compute(fields, calculations)
        updated_fields = dict(fields)
        updated_fields.update(result.computed_fields)

        # Compute line-item calculations if tables have them
        updated_tables = dict(tables)
        line_item_calcs = [c for c in calculations if c.name.startswith("line_")]
        for table_name, rows in tables.items():
            if isinstance(rows, list) and line_item_calcs:
                updated_tables[table_name] = engine.compute_line_items(rows, line_item_calcs)

        if result.errors:
            logger.warning(f"Generation had {len(result.errors)} errors: {result.errors}")

        return {
            "generated_fields": updated_fields,
            "generated_tables": updated_tables,
            "generation_errors": result.errors,
        }
