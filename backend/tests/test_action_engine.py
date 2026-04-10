import pytest
from app.services.action_engine import (
    ActionEngine, ActionConfig, ActionType, ActionTrigger,
)


def test_webhook_action():
    engine = ActionEngine()
    actions = [ActionConfig(name="notify", action_type=ActionType.WEBHOOK, config={"url": "https://example.com/hook"}, trigger=ActionTrigger.ON_COMPLETE)]
    report = engine.execute_actions(actions, {"name": "John"}, ActionTrigger.ON_COMPLETE)
    assert report.successful == 1
    assert report.results[0].success


def test_webhook_missing_url():
    engine = ActionEngine()
    actions = [ActionConfig(name="notify", action_type=ActionType.WEBHOOK, config={}, trigger=ActionTrigger.ON_COMPLETE)]
    report = engine.execute_actions(actions, {}, ActionTrigger.ON_COMPLETE)
    assert report.failed == 1


def test_trigger_filtering():
    engine = ActionEngine()
    actions = [
        ActionConfig(name="a1", action_type=ActionType.EMAIL, config={"to": "a@b.com"}, trigger=ActionTrigger.ON_COMPLETE),
        ActionConfig(name="a2", action_type=ActionType.WEBHOOK, config={"url": "http://x"}, trigger=ActionTrigger.ON_VALIDATION_PASS),
    ]
    report = engine.execute_actions(actions, {}, ActionTrigger.ON_COMPLETE)
    assert report.total_actions == 1  # only the email action matches


def test_transform_action():
    engine = ActionEngine()
    actions = [ActionConfig(name="clean", action_type=ActionType.TRANSFORM, config={"transforms": {"name": "uppercase"}}, trigger=ActionTrigger.ON_COMPLETE)]
    report = engine.execute_actions(actions, {"name": "john"}, ActionTrigger.ON_COMPLETE)
    assert report.successful == 1


def test_disabled_action_skipped():
    engine = ActionEngine()
    actions = [ActionConfig(name="skip", action_type=ActionType.EMAIL, config={"to": "x@y.com"}, trigger=ActionTrigger.ON_COMPLETE, enabled=False)]
    report = engine.execute_actions(actions, {}, ActionTrigger.ON_COMPLETE)
    assert report.total_actions == 0
