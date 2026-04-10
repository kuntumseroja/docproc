import pytest
from app.services.chat_service import ChatService, ChatMessage, ChatResponse


def test_chat_message_creation():
    msg = ChatMessage(role="user", content="Hello")
    assert msg.role == "user"
    assert msg.content == "Hello"


def test_chat_response_creation():
    resp = ChatResponse(message="Hi there", sources=[], suggested_actions=["upload_document"])
    assert resp.message == "Hi there"
    assert len(resp.suggested_actions) == 1


def test_extract_actions():
    service = ChatService(llm_provider=None)
    actions = service._extract_actions("You should upload a document and create a workflow")
    assert "upload_document" in actions
    assert "create_workflow" in actions


def test_clear_history():
    service = ChatService(llm_provider=None)
    service.conversation_history.append(ChatMessage(role="user", content="test"))
    assert len(service.conversation_history) == 1
    service.clear_history()
    assert len(service.conversation_history) == 0
