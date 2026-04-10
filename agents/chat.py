from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from agents.base import BaseAgent

if TYPE_CHECKING:
    from backend.app.services.llm_provider import BaseLLMProvider

logger = logging.getLogger(__name__)


class ChatAgent(BaseAgent):
    """Natural language query agent for documents and database.

    Handles conversational queries about processed documents,
    extraction results, and workflow status.
    """

    def __init__(self, llm_provider: Optional[BaseLLMProvider] = None):
        super().__init__("chat", llm_provider)

    async def execute(self, state: dict) -> dict:
        from backend.app.services.chat_service import ChatService

        user_message = state.get("message", "")
        context = state.get("context", {})

        if not user_message:
            return {
                "response": "Please provide a message.",
                "sources": [],
                "suggested_actions": [],
            }

        service = ChatService(llm_provider=self.llm)
        response = await service.chat(user_message, context=context)

        return {
            "response": response.message,
            "sources": response.sources,
            "suggested_actions": response.suggested_actions,
        }
