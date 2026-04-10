from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class CalculationRule:
    name: str
    description: str
    formula: str  # e.g., "subtotal + tax" or "quantity * unit_price"
    output_field: str
    dependencies: List[str] = field(default_factory=list)


@dataclass
class GenerationResult:
    computed_fields: Dict[str, Any]
    errors: List[str]
    success: bool


class GenerationEngine:
    """Code-model calculations engine for computing derived fields."""

    SAFE_BUILTINS = {
        "abs": abs, "round": round, "min": min, "max": max,
        "sum": sum, "len": len, "float": float, "int": int, "str": str,
    }

    def compute(
        self,
        fields: Dict[str, Any],
        calculations: List[CalculationRule],
    ) -> GenerationResult:
        computed = {}
        errors = []
        working_fields = dict(fields)

        # Sort by dependencies (topological-ish: run rules with fewer deps first)
        sorted_calcs = sorted(calculations, key=lambda c: len(c.dependencies))

        for calc in sorted_calcs:
            try:
                result = self._evaluate_formula(calc.formula, working_fields)
                computed[calc.output_field] = result
                working_fields[calc.output_field] = result
                logger.info(f"Computed {calc.output_field} = {result}")
            except Exception as e:
                errors.append(f"Calculation '{calc.name}' failed: {e}")
                logger.error(f"Calculation '{calc.name}' failed: {e}")

        return GenerationResult(
            computed_fields=computed,
            errors=errors,
            success=len(errors) == 0,
        )

    def _evaluate_formula(self, formula: str, fields: Dict[str, Any]) -> Any:
        """Safely evaluate a formula using field values as variables."""
        safe_vars = {}
        for key, value in fields.items():
            try:
                safe_vars[key] = float(str(value).replace(",", "").replace("$", "").replace("£", "").replace("€", ""))
            except (ValueError, TypeError):
                safe_vars[key] = value

        safe_vars.update(self.SAFE_BUILTINS)
        safe_vars["__builtins__"] = {}

        result = eval(formula, safe_vars)
        return result

    def compute_line_items(
        self,
        line_items: List[Dict[str, Any]],
        calculations: List[CalculationRule],
    ) -> List[Dict[str, Any]]:
        """Apply calculations to each row in a line items table."""
        results = []
        for i, item in enumerate(line_items):
            gen_result = self.compute(item, calculations)
            updated = dict(item)
            updated.update(gen_result.computed_fields)
            results.append(updated)

        return results
