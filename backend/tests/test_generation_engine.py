import pytest
from app.services.generation_engine import GenerationEngine, CalculationRule


def test_simple_addition():
    engine = GenerationEngine()
    rules = [CalculationRule(name="calc_total", description="Sum", formula="subtotal + tax", output_field="total", dependencies=["subtotal", "tax"])]
    result = engine.compute({"subtotal": "100", "tax": "10"}, rules)
    assert result.success
    assert result.computed_fields["total"] == 110.0


def test_multiplication():
    engine = GenerationEngine()
    rules = [CalculationRule(name="line_total", description="Qty * Price", formula="quantity * unit_price", output_field="line_total")]
    result = engine.compute({"quantity": "5", "unit_price": "20"}, rules)
    assert result.success
    assert result.computed_fields["line_total"] == 100.0


def test_chained_calculations():
    engine = GenerationEngine()
    rules = [
        CalculationRule(name="calc_tax", description="Tax", formula="subtotal * 0.1", output_field="tax", dependencies=[]),
        CalculationRule(name="calc_total", description="Total", formula="subtotal + tax", output_field="total", dependencies=["tax"]),
    ]
    result = engine.compute({"subtotal": "200"}, rules)
    assert result.success
    assert result.computed_fields["tax"] == 20.0
    assert result.computed_fields["total"] == 220.0


def test_line_items():
    engine = GenerationEngine()
    rules = [CalculationRule(name="line_total", description="", formula="qty * price", output_field="total")]
    items = [{"qty": "2", "price": "10"}, {"qty": "3", "price": "5"}]
    results = engine.compute_line_items(items, rules)
    assert results[0]["total"] == 20.0
    assert results[1]["total"] == 15.0


def test_round_function():
    engine = GenerationEngine()
    rules = [CalculationRule(name="rounded", description="", formula="round(value, 2)", output_field="result")]
    result = engine.compute({"value": "3.14159"}, rules)
    assert result.computed_fields["result"] == 3.14
