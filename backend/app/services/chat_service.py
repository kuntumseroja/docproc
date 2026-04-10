from __future__ import annotations

import json
import re
import logging
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ChatMessage:
    role: str  # user, assistant, system
    content: str
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class ChatResponse:
    message: str
    sources: List[Dict[str, Any]] = field(default_factory=list)
    suggested_actions: List[str] = field(default_factory=list)
    model_used: Optional[str] = None
    provider: Optional[str] = None
    latency_ms: Optional[float] = None


CHAT_SYSTEM_PROMPT = """You are a document processing assistant for DocProc. You help users:
1. Query information from their processed documents and extracted data
2. Calculate totals, averages, and other aggregations from extracted field values
3. Understand extraction results and confidence scores
4. Navigate and filter their document repository

You have access to the user's actual document data provided below. Use this data to answer questions accurately.
When answering questions about values, totals, or counts, compute the answer from the actual extracted data.
Reference specific documents and field values in your answers.
Keep responses concise and actionable."""


class ChatService:
    """Chat service for document and database queries."""

    def __init__(self, llm_provider=None):
        self.llm = llm_provider
        self.conversation_history: List[ChatMessage] = []

    def _get_provider(self):
        if self.llm:
            return self.llm
        from app.services.llm_provider import LLMProviderFactory
        return LLMProviderFactory.from_settings()

    async def chat(
        self,
        user_message: str,
        data_context: Optional[str] = None,
    ) -> ChatResponse:
        provider = self._get_provider()

        self.conversation_history.append(ChatMessage(role="user", content=user_message))

        messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]

        if data_context:
            messages.append({
                "role": "system",
                "content": f"User's document data:\n\n{data_context[:4000]}",
            })

        for msg in self.conversation_history[-10:]:
            messages.append({"role": msg.role, "content": msg.content})

        response = await provider.chat(messages, temperature=0.3)

        assistant_msg = ChatMessage(role="assistant", content=response.content)
        self.conversation_history.append(assistant_msg)

        return ChatResponse(
            message=response.content,
            sources=self._extract_sources(response.content),
            suggested_actions=self._extract_actions(response.content),
            model_used=response.model,
            provider=response.provider.value if response.provider else None,
            latency_ms=response.latency_ms,
        )

    def _extract_sources(self, content: str) -> List[Dict[str, Any]]:
        sources = []
        doc_refs = re.findall(r'document[:\s]+([A-Za-z0-9-]+)', content, re.IGNORECASE)
        for ref in doc_refs[:5]:
            sources.append({"type": "document", "id": ref})
        return sources

    def _extract_actions(self, content: str) -> List[str]:
        actions = []
        if any(word in content.lower() for word in ["upload", "process", "extract"]):
            actions.append("upload_document")
        if any(word in content.lower() for word in ["workflow", "create", "configure"]):
            actions.append("create_workflow")
        if any(word in content.lower() for word in ["review", "correct", "fix"]):
            actions.append("review_results")
        return actions

    def clear_history(self):
        self.conversation_history.clear()
