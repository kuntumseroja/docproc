from __future__ import annotations
from typing import TYPE_CHECKING
from agents.base import BaseAgent

if TYPE_CHECKING:
    from backend.app.services.llm_provider import BaseLLMProvider


class ExtractionAgent(BaseAgent):
    """LLM-based field extraction from documents."""

    def __init__(self, llm_provider: BaseLLMProvider | None = None):
        super().__init__("extraction", llm_provider)

    async def execute(self, state: dict) -> dict:
        raise NotImplementedError
