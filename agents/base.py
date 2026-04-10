from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, List, Optional, TypedDict, TYPE_CHECKING

if TYPE_CHECKING:
    from backend.app.services.llm_provider import BaseLLMProvider


class SupervisorState(TypedDict):
    """State shared across all agents in the LangGraph workflow."""
    document_id: str
    ocr_text: str
    workflow_config: dict
    validation_errors: List[str]
    validation_passed: bool
    generated_fields: dict
    generated_tables: dict
    action_results: dict
    final_extraction: dict
    error_message: Optional[str]
    messages: List[str]


@dataclass
class AgentState:
    document_id: Optional[str] = None
    workflow_id: Optional[str] = None
    extracted_fields: dict = field(default_factory=dict)
    validation_results: list = field(default_factory=list)
    errors: list = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


class BaseAgent(ABC):
    """Abstract base class for all DocProc agents."""

    def __init__(self, name: str, llm_provider: Optional[BaseLLMProvider] = None):
        self.name = name
        self.llm = llm_provider

    @abstractmethod
    async def execute(self, state: dict) -> dict:
        """Execute the agent's task and return updated state."""
        ...
