# Sprint 4: Polish & Integration (Week 8)

Sprint 4 focuses on completing the user-facing features, integrating all backend services, and establishing comprehensive testing. This sprint brings the POC to a polished, production-ready state with intelligent chat, rich dashboard, and data management capabilities.

---

## Task 21: LON-137 — Chat Interface

**Objective:** Build a sophisticated chat interface with dual modes for document and database conversations, styled with Carbon Design System components.

**Frontend: ChatPage.tsx**

```typescript
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Button,
  TextInput,
  Loading,
  Tooltip,
} from '@carbon/react';
import { Send, Attachment } from '@carbon/icons-react';
import { DocumentChat } from './DocumentChat';
import { DatabaseChat } from './DatabaseChat';
import styles from './ChatPage.module.scss';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  documentId?: string;
  codeBlocks?: Array<{ language: string; code: string }>;
  tables?: Array<{ headers: string[]; rows: string[][] }>;
}

interface ConversationMemory {
  id: string;
  messages: ChatMessage[];
  mode: 'document' | 'database';
  contextId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ChatPage: React.FC = () => {
  const [mode, setMode] = useState<'document' | 'database'>('document');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      if (mode === 'document' && documentId) {
        const response = await fetch(`/api/chat/document/${documentId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            message: text,
            previousMessages: messages,
          }),
        });

        const data = await response.json();
        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: data.response,
          timestamp: new Date(),
          documentId,
          codeBlocks: data.codeBlocks,
          tables: data.tables,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        if (!conversationId) {
          setConversationId(data.conversationId);
        }
      } else if (mode === 'database') {
        const response = await fetch('/api/chat/database', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            message: text,
            previousMessages: messages,
          }),
        });

        const data = await response.json();
        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: data.response,
          timestamp: new Date(),
          codeBlocks: data.codeBlocks,
          tables: data.tables,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        if (!conversationId) {
          setConversationId(data.conversationId);
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [mode, documentId, conversationId, messages]);

  return (
    <div className={styles.chatPage}>
      <div className={styles.modeSelector}>
        <Button
          kind={mode === 'document' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => {
            setMode('document');
            setMessages([]);
            setConversationId(null);
          }}
        >
          Chat with Document
        </Button>
        <Button
          kind={mode === 'database' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => {
            setMode('database');
            setMessages([]);
            setConversationId(null);
          }}
        >
          Chat with Database
        </Button>
      </div>

      {mode === 'document' ? (
        <DocumentChat
          onDocumentSelect={setDocumentId}
          onSendMessage={handleSendMessage}
          messages={messages}
          isLoading={isLoading}
        />
      ) : (
        <DatabaseChat
          onSendMessage={handleSendMessage}
          messages={messages}
          isLoading={isLoading}
        />
      )}

      <div className={styles.messagesContainer}>
        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} />
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputContainer}>
        <TextInput
          id="chat-input"
          labelText="Message"
          placeholder="Ask a question..."
          value={inputValue}
          onChange={(e) => setInputValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              handleSendMessage(inputValue);
            }
          }}
          disabled={isLoading}
        />
        <Tooltip label="Send message">
          <Button
            kind="primary"
            size="md"
            iconDescription="Send"
            renderIcon={Send}
            onClick={() => handleSendMessage(inputValue)}
            disabled={isLoading || !inputValue.trim()}
          />
        </Tooltip>
      </div>
    </div>
  );
};

interface ChatBubbleProps {
  message: ChatMessage;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  return (
    <div
      className={`${styles.bubble} ${styles[message.role]}`}
      style={{
        backgroundColor:
          message.role === 'user' ? '#ffffff' : '#EDF5FF',
        marginLeft: message.role === 'user' ? 'auto' : '0',
        marginRight: message.role === 'assistant' ? 'auto' : '0',
      }}
    >
      <div className={styles.content}>{message.content}</div>
      {message.codeBlocks && (
        <div className={styles.codeBlocks}>
          {message.codeBlocks.map((block, idx) => (
            <pre key={idx} className={styles.code}>
              <code className={`language-${block.language}`}>
                {block.code}
              </code>
            </pre>
          ))}
        </div>
      )}
      {message.tables && (
        <div className={styles.tables}>
          {message.tables.map((table, idx) => (
            <table key={idx} className={styles.table}>
              <thead>
                <tr>
                  {table.headers.map((header, hidx) => (
                    <th key={hidx}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, ridx) => (
                  <tr key={ridx}>
                    {row.map((cell, cidx) => (
                      <td key={cidx}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      )}
      <div className={styles.timestamp}>
        {message.timestamp.toLocaleTimeString()}
      </div>
    </div>
  );
};

const TypingIndicator: React.FC = () => (
  <div className={styles.typingIndicator}>
    <Loading withOverlay={false} small />
    <span>AI is thinking...</span>
  </div>
);

export default ChatPage;
```

**Styling: ChatPage.module.scss**

```scss
.chatPage {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f4f4f4;
  padding: 1rem;
}

.modeSelector {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;

  button {
    flex: 1;
  }
}

.messagesContainer {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 1rem;
  background: #ffffff;
  border-radius: 4px;
}

.bubble {
  max-width: 70%;
  padding: 1rem;
  border-radius: 8px;
  word-wrap: break-word;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  &.user {
    border: 1px solid #e0e0e0;
  }

  &.assistant {
    border: 1px solid #0f62fe;
  }
}

.content {
  margin-bottom: 0.5rem;
  line-height: 1.5;
}

.codeBlocks {
  margin: 0.5rem 0;

  .code {
    background: #282c34;
    color: #abb2bf;
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.875rem;
  }
}

.tables {
  margin: 0.5rem 0;

  .table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;

    th, td {
      border: 1px solid #d0d0d0;
      padding: 0.5rem;
      text-align: left;
    }

    th {
      background: #d0e2ff;
      font-weight: 600;
    }

    tbody tr:nth-child(odd) {
      background: #f4f4f4;
    }
  }
}

.timestamp {
  font-size: 0.75rem;
  color: #666;
  margin-top: 0.5rem;
}

.typingIndicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #666;
}

.inputContainer {
  display: flex;
  gap: 0.5rem;

  input {
    flex: 1;
  }
}
```

**Backend: Chat API Endpoints**

```python
# backend/app/api/chat.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import uuid
import json
import redis.asyncio as redis

from app.services.ocr_service import OCRService
from app.services.extraction_service import ExtractionService
from app.services.llm_service import LLMService
from app.db import AsyncSession, get_db

router = APIRouter(prefix="/api/chat", tags=["chat"])

class MessageRequest(BaseModel):
    conversationId: Optional[str]
    message: str
    previousMessages: List[dict]

class ChatResponse(BaseModel):
    conversationId: str
    response: str
    codeBlocks: Optional[List[dict]]
    tables: Optional[List[dict]]

redis_client: Optional[redis.Redis] = None

async def init_redis():
    global redis_client
    redis_client = await redis.from_url("redis://localhost:6379")

async def get_conversation_memory(conversation_id: str) -> List[dict]:
    """Retrieve conversation memory from Redis"""
    if not redis_client:
        return []

    key = f"conversation:{conversation_id}"
    data = await redis_client.get(key)
    if data:
        return json.loads(data)
    return []

async def save_conversation_memory(conversation_id: str, messages: List[dict]):
    """Save conversation to Redis with 24h expiry"""
    if not redis_client:
        return

    key = f"conversation:{conversation_id}"
    await redis_client.setex(key, 86400, json.dumps(messages))

@router.post("/document/{document_id}", response_model=ChatResponse)
async def chat_with_document(
    document_id: str,
    request: MessageRequest,
    db: AsyncSession = Depends(get_db)
):
    """Chat with a specific document"""
    try:
        conversation_id = request.conversationId or str(uuid.uuid4())

        # Retrieve document and OCR data
        document = await db.execute(
            f"SELECT * FROM documents WHERE id = '{document_id}'"
        )
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        # Get OCR and extraction data
        ocr_service = OCRService()
        extraction_service = ExtractionService()

        ocr_text = await ocr_service.get_ocr_text(document_id)
        extractions = await extraction_service.get_extractions(document_id)

        # Retrieve conversation memory
        conversation_memory = await get_conversation_memory(conversation_id)

        # Prepare context for LLM
        context = {
            "ocr_text": ocr_text,
            "extractions": extractions,
            "conversation_history": conversation_memory
        }

        # Call LLM with document context
        llm_service = LLMService()
        response = await llm_service.chat_with_context(
            user_message=request.message,
            context=context,
            mode="document"
        )

        # Parse response for code blocks and tables
        code_blocks = extract_code_blocks(response.get("content", ""))
        tables = extract_tables(response.get("content", ""))

        # Update conversation memory
        new_messages = conversation_memory + [
            {
                "role": "user",
                "content": request.message,
                "timestamp": datetime.now().isoformat()
            },
            {
                "role": "assistant",
                "content": response.get("content", ""),
                "timestamp": datetime.now().isoformat()
            }
        ]
        await save_conversation_memory(conversation_id, new_messages)

        return ChatResponse(
            conversationId=conversation_id,
            response=response.get("content", ""),
            codeBlocks=code_blocks,
            tables=tables
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/database", response_model=ChatResponse)
async def chat_with_database(request: MessageRequest):
    """Chat with database - generates SQL queries"""
    try:
        conversation_id = request.conversationId or str(uuid.uuid4())

        # Retrieve conversation memory
        conversation_memory = await get_conversation_memory(conversation_id)

        # Call LLM to generate SQL
        llm_service = LLMService()
        response = await llm_service.chat_with_context(
            user_message=request.message,
            context={"conversation_history": conversation_memory},
            mode="database"
        )

        # Extract SQL and execute if valid
        sql_query = extract_sql_query(response.get("sql", ""))
        if sql_query:
            # Execute SQL (with proper escaping)
            results = await execute_sql(sql_query)
            table_data = format_results_as_table(results)
        else:
            table_data = None

        # Parse response
        code_blocks = extract_code_blocks(response.get("content", ""))
        tables = [table_data] if table_data else []

        # Update conversation memory
        new_messages = conversation_memory + [
            {
                "role": "user",
                "content": request.message,
                "timestamp": datetime.now().isoformat()
            },
            {
                "role": "assistant",
                "content": response.get("content", ""),
                "sql": sql_query,
                "timestamp": datetime.now().isoformat()
            }
        ]
        await save_conversation_memory(conversation_id, new_messages)

        return ChatResponse(
            conversationId=conversation_id,
            response=response.get("content", ""),
            codeBlocks=code_blocks,
            tables=tables
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def extract_code_blocks(text: str) -> List[dict]:
    """Extract code blocks from markdown"""
    import re
    pattern = r'```(\w+)\n(.*?)\n```'
    matches = re.findall(pattern, text, re.DOTALL)
    return [{"language": lang, "code": code} for lang, code in matches]

def extract_tables(text: str) -> List[dict]:
    """Extract markdown tables from text"""
    import re
    pattern = r'\|(.+)\|\n\|[-|\s]+\|\n((?:\|.+\|\n?)+)'
    matches = re.findall(pattern, text)
    tables = []
    for headers_str, rows_str in matches:
        headers = [h.strip() for h in headers_str.split('|') if h.strip()]
        rows = [
            [cell.strip() for cell in row.split('|') if cell.strip()]
            for row in rows_str.strip().split('\n')
            if row.strip()
        ]
        tables.append({"headers": headers, "rows": rows})
    return tables

def extract_sql_query(text: str) -> Optional[str]:
    """Extract SQL query from response"""
    import re
    pattern = r'```sql\n(.*?)\n```'
    match = re.search(pattern, text, re.DOTALL)
    return match.group(1) if match else None

async def execute_sql(query: str) -> List[dict]:
    """Execute SQL query safely"""
    # Implementation with proper parameterization
    pass

def format_results_as_table(results: List[dict]) -> dict:
    """Format SQL results as table"""
    if not results:
        return {"headers": [], "rows": []}

    headers = list(results[0].keys())
    rows = [[str(row.get(h, "")) for h in headers] for row in results]
    return {"headers": headers, "rows": rows}
```

**Acceptance Criteria:**
- Document-level chat retrieves OCR and extractions
- Database chat generates and executes SQL queries
- Conversation history persists via Redis
- Markdown code and table rendering works
- Carbon Design System styling applied (user: white, AI: #EDF5FF)
- Typing indicator displays during processing
- Timestamps on all messages

---

## Task 22: LON-138 — Data Repository View

**Objective:** Build a rich data table for viewing extraction results with dynamic columns, filtering, and export capabilities.

**Frontend: RepositoryPage.tsx**

```typescript
import React, { useState, useCallback, useEffect } from 'react';
import {
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Toolbar,
  ToolbarContent,
  ToolbarSearch,
  ToolbarMenu,
  ToolbarMenuItem,
  Button,
  Pagination,
  Tag,
  Modal,
} from '@carbon/react';
import { Download, ChevronRight } from '@carbon/icons-react';
import styles from './RepositoryPage.module.scss';

interface RepositoryItem {
  id: string;
  documentId: string;
  documentName: string;
  workflow: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'exported';
  extractedAt: Date;
  confidence: number;
  data: Record<string, any>;
}

interface RepositoryFilters {
  workflow?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  searchQuery?: string;
}

const RepositoryPage: React.FC = () => {
  const [items, setItems] = useState<RepositoryItem[]>([]);
  const [filters, setFilters] = useState<RepositoryFilters>({});
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'documentName',
    'workflow',
    'status',
    'confidence',
    'extractedAt',
  ]);
  const [selectedItem, setSelectedItem] = useState<RepositoryItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [workflows, setWorkflows] = useState<string[]>([]);

  useEffect(() => {
    fetchRepositoryData();
    fetchWorkflows();
  }, [filters, pageSize, currentPage]);

  const fetchRepositoryData = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (currentPage * pageSize).toString(),
        ...(filters.workflow && { workflow: filters.workflow }),
        ...(filters.status && { status: filters.status }),
        ...(filters.searchQuery && { search: filters.searchQuery }),
        ...(filters.startDate && { startDate: filters.startDate.toISOString() }),
        ...(filters.endDate && { endDate: filters.endDate.toISOString() }),
      });

      const response = await fetch(
        `/api/repository?${params.toString()}`
      );
      const data = await response.json();

      setItems(data.items);
      setTotalItems(data.total);
    } catch (error) {
      console.error('Error fetching repository data:', error);
    }
  }, [filters, pageSize, currentPage]);

  const fetchWorkflows = useCallback(async () => {
    try {
      const response = await fetch('/api/workflows');
      const data = await response.json();
      setWorkflows(data.map((w: any) => w.name));
    } catch (error) {
      console.error('Error fetching workflows:', error);
    }
  }, []);

  const handleSearch = useCallback((query: string) => {
    setFilters((prev) => ({ ...prev, searchQuery: query }));
    setCurrentPage(0);
  }, []);

  const handleFilterChange = useCallback(
    (filterKey: string, value: any) => {
      setFilters((prev) => ({ ...prev, [filterKey]: value }));
      setCurrentPage(0);
    },
    []
  );

  const handleColumnToggle = useCallback((column: string) => {
    setVisibleColumns((prev) =>
      prev.includes(column)
        ? prev.filter((c) => c !== column)
        : [...prev, column]
    );
  }, []);

  const handleExport = useCallback(async (format: 'csv' | 'excel') => {
    try {
      const response = await fetch(`/api/export/${format}?${buildFilterQuery()}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `repository.${format === 'excel' ? 'xlsx' : 'csv'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting data:', error);
    }
  }, [filters]);

  const buildFilterQuery = (): string => {
    const params = new URLSearchParams();
    if (filters.workflow) params.append('workflow', filters.workflow);
    if (filters.status) params.append('status', filters.status);
    if (filters.searchQuery) params.append('search', filters.searchQuery);
    return params.toString();
  };

  const headers: Array<{ key: string; header: string }> = [
    { key: 'documentName', header: 'Document' },
    { key: 'workflow', header: 'Workflow' },
    { key: 'status', header: 'Status' },
    { key: 'confidence', header: 'Confidence' },
    { key: 'extractedAt', header: 'Extracted' },
  ];

  const filteredHeaders = headers.filter((h) =>
    visibleColumns.includes(h.key)
  );

  return (
    <div className={styles.repositoryPage}>
      <div className={styles.header}>
        <h1>Data Repository</h1>
        <p>Extracted data from all workflows</p>
      </div>

      <Toolbar>
        <ToolbarContent>
          <ToolbarSearch
            placeholder="Search documents..."
            onChange={(e) => handleSearch(e.target.value)}
          />
          <ToolbarMenu>
            <ToolbarMenuItem
              label="Workflow"
              onClick={() => {
                /* filter modal */
              }}
            />
            <ToolbarMenuItem
              label="Status"
              onClick={() => {
                /* filter modal */
              }}
            />
            <ToolbarMenuItem
              label="Columns"
              onClick={() => {
                /* column toggle modal */
              }}
            />
          </ToolbarMenu>
          <Button
            kind="secondary"
            size="sm"
            renderIcon={Download}
            onClick={() => handleExport('csv')}
          >
            Export CSV
          </Button>
          <Button
            kind="secondary"
            size="sm"
            renderIcon={Download}
            onClick={() => handleExport('excel')}
          >
            Export Excel
          </Button>
        </ToolbarContent>
      </Toolbar>

      <TableContainer title="Repository Data">
        <Table size="lg">
          <TableHead>
            <TableRow>
              {filteredHeaders.map((header) => (
                <TableHeader key={header.key}>{header.header}</TableHeader>
              ))}
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item, idx) => (
              <TableRow
                key={item.id}
                className={idx % 2 === 0 ? styles.evenRow : styles.oddRow}
                onClick={() => {
                  setSelectedItem(item);
                  setIsDetailModalOpen(true);
                }}
              >
                {visibleColumns.includes('documentName') && (
                  <TableCell>{item.documentName}</TableCell>
                )}
                {visibleColumns.includes('workflow') && (
                  <TableCell>{item.workflow}</TableCell>
                )}
                {visibleColumns.includes('status') && (
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                )}
                {visibleColumns.includes('confidence') && (
                  <TableCell>{(item.confidence * 100).toFixed(1)}%</TableCell>
                )}
                {visibleColumns.includes('extractedAt') && (
                  <TableCell>
                    {new Date(item.extractedAt).toLocaleDateString()}
                  </TableCell>
                )}
                <TableCell>
                  <Button
                    kind="ghost"
                    size="sm"
                    renderIcon={ChevronRight}
                    iconDescription="View details"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Pagination
        backwardText="Previous page"
        forwardText="Next page"
        itemsPerPageText="Items per page:"
        pageNumberText="Page Number"
        pageSize={pageSize}
        pageSizes={[10, 20, 50]}
        totalItems={totalItems}
        onChange={({ pageSize: newSize, page }: any) => {
          setPageSize(newSize);
          setCurrentPage(page - 1);
        }}
      />

      {selectedItem && (
        <DetailModal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          item={selectedItem}
        />
      )}
    </div>
  );
};

interface StatusBadgeProps {
  status: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const statusConfig: Record<string, { label: string; type: any }> = {
    pending_review: { label: 'Pending Review', type: 'blue' },
    approved: { label: 'Approved', type: 'green' },
    rejected: { label: 'Rejected', type: 'red' },
    exported: { label: 'Exported', type: 'gray' },
  };

  const config = statusConfig[status] || statusConfig.pending_review;
  return <Tag type={config.type}>{config.label}</Tag>;
};

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: RepositoryItem;
}

const DetailModal: React.FC<DetailModalProps> = ({ isOpen, onClose, item }) => {
  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      modalHeading={`Details: ${item.documentName}`}
      primaryButtonText="Close"
      onRequestSubmit={onClose}
    >
      <div className={styles.detailContent}>
        <div className={styles.detailRow}>
          <span className={styles.label}>Document:</span>
          <span>{item.documentName}</span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.label}>Workflow:</span>
          <span>{item.workflow}</span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.label}>Status:</span>
          <StatusBadge status={item.status} />
        </div>
        <div className={styles.detailRow}>
          <span className={styles.label}>Confidence:</span>
          <span>{(item.confidence * 100).toFixed(1)}%</span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.label}>Extracted:</span>
          <span>{new Date(item.extractedAt).toLocaleString()}</span>
        </div>
        <div className={styles.dataSection}>
          <h4>Extracted Data</h4>
          <pre>{JSON.stringify(item.data, null, 2)}</pre>
        </div>
      </div>
    </Modal>
  );
};

export default RepositoryPage;
```

**Styling: RepositoryPage.module.scss**

```scss
.repositoryPage {
  padding: 2rem;
  background: #f4f4f4;
}

.header {
  margin-bottom: 2rem;

  h1 {
    margin: 0 0 0.5rem;
    color: #161616;
  }

  p {
    margin: 0;
    color: #666;
  }
}

.evenRow {
  background: #ffffff;
}

.oddRow {
  background: #f4f4f4;
}

.detailContent {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.detailRow {
  display: flex;
  gap: 1rem;
  align-items: center;

  .label {
    font-weight: 600;
    min-width: 120px;
    color: #161616;
  }
}

.dataSection {
  margin-top: 1rem;

  h4 {
    margin: 0 0 0.5rem;
  }

  pre {
    background: #282c34;
    color: #abb2bf;
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.875rem;
  }
}
```

**Backend: Repository API**

```python
# backend/app/api/repository.py
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from datetime import datetime

from app.db import AsyncSession, get_db
from app.models import RepositoryItem

router = APIRouter(prefix="/api/repository", tags=["repository"])

@router.get("")
async def get_repository(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    workflow: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    startDate: Optional[datetime] = None,
    endDate: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db)
):
    """Get paginated repository items with filtering"""
    try:
        query = "SELECT * FROM repository_items WHERE 1=1"
        params = []

        if workflow:
            query += " AND workflow = ?"
            params.append(workflow)

        if status:
            query += " AND status = ?"
            params.append(status)

        if search:
            query += " AND document_name LIKE ?"
            params.append(f"%{search}%")

        if startDate:
            query += " AND extracted_at >= ?"
            params.append(startDate)

        if endDate:
            query += " AND extracted_at <= ?"
            params.append(endDate)

        # Get total count
        count_result = await db.execute(
            f"SELECT COUNT(*) as count FROM ({query}) as t",
            params
        )
        total = count_result[0]['count'] if count_result else 0

        # Get paginated results
        query += f" LIMIT {limit} OFFSET {offset}"
        result = await db.execute(query, params)

        items = [
            {
                "id": row['id'],
                "documentId": row['document_id'],
                "documentName": row['document_name'],
                "workflow": row['workflow'],
                "status": row['status'],
                "extractedAt": row['extracted_at'],
                "confidence": row['confidence'],
                "data": json.loads(row['extracted_data'])
            }
            for row in result
        ]

        return {"items": items, "total": total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Acceptance Criteria:**
- DataTable renders with dynamic columns per workflow
- Search functionality filters by document name
- Filter by workflow, status, and date range
- Pagination works with configurable page size
- Row click opens drill-down modal with full data
- Export buttons download CSV and Excel
- Alternating row colors (#D0E2FF header styling)
- Column toggle functionality

---

## Task 23: LON-139 — Dashboard

**Objective:** Create a polished landing page with KPIs, workflow cards, and activity feed.

**Frontend: DashboardPage.tsx**

```typescript
import React, { useState, useEffect } from 'react';
import {
  ClickableTile,
  StructuredList,
  StructuredListBody,
  StructuredListCell,
  StructuredListHead,
  StructuredListRow,
  Loading,
  Tag,
} from '@carbon/react';
import { DocumentAdd, CheckmarkFilled, DocumentView } from '@carbon/icons-react';
import styles from './DashboardPage.module.scss';

interface DashboardStats {
  documentsProcessed: number;
  extractionAccuracy: number;
  stpRate: number;
  pendingReview: number;
}

interface ActivityEvent {
  id: string;
  type: 'processed' | 'approved' | 'rejected' | 'exported';
  documentName: string;
  workflow: string;
  timestamp: Date;
}

interface WorkflowCard {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  documentCount: number;
  accuracy: number;
}

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [statsRes, activityRes, workflowRes] = await Promise.all([
          fetch('/api/dashboard/stats'),
          fetch('/api/dashboard/activity'),
          fetch('/api/workflows'),
        ]);

        const statsData = await statsRes.json();
        const activityData = await activityRes.json();
        const workflowData = await workflowRes.json();

        setStats(statsData);
        setActivities(activityData.slice(0, 10));
        setWorkflows(workflowData);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <Loading />
      </div>
    );
  }

  return (
    <div className={styles.dashboardPage}>
      {/* Gradient Header */}
      <div className={styles.gradientHeader}>
        <div className={styles.headerContent}>
          <h1>Welcome back!</h1>
          <p>Here's what's happening with your document processing</p>
        </div>
      </div>

      {/* Metrics Section */}
      <div className={styles.metricsSection}>
        <MetricTile
          title="Documents Processed"
          value={stats?.documentsProcessed || 0}
          icon={<DocumentAdd size={32} />}
        />
        <MetricTile
          title="Extraction Accuracy"
          value={`${stats?.extractionAccuracy || 0}%`}
          icon={<CheckmarkFilled size={32} />}
        />
        <MetricTile
          title="STP Rate"
          value={`${stats?.stpRate || 0}%`}
          icon={<DocumentView size={32} />}
        />
        <MetricTile
          title="Pending Review"
          value={stats?.pendingReview || 0}
          icon={<DocumentAdd size={32} />}
        />
      </div>

      <div className={styles.contentGrid}>
        {/* Workflows Section */}
        <div className={styles.workflowsSection}>
          <h2>Active Workflows</h2>
          <div className={styles.workflowCards}>
            {workflows.map((workflow) => (
              <ClickableTile
                key={workflow.id}
                className={styles.workflowCard}
                href={`/workflows/${workflow.id}`}
              >
                <div className={styles.cardContent}>
                  <div>
                    <h3>{workflow.name}</h3>
                    <p>{workflow.documentCount} documents</p>
                  </div>
                  <div className={styles.accuracy}>
                    {(workflow.accuracy * 100).toFixed(1)}%
                  </div>
                </div>
              </ClickableTile>
            ))}
          </div>
        </div>

        {/* Activity Feed Section */}
        <div className={styles.activitySection}>
          <h2>Recent Activity</h2>
          <StructuredList selection={false}>
            <StructuredListHead>
              <StructuredListRow head>
                <StructuredListCell head>Document</StructuredListCell>
                <StructuredListCell head>Workflow</StructuredListCell>
                <StructuredListCell head>Status</StructuredListCell>
                <StructuredListCell head>Time</StructuredListCell>
              </StructuredListRow>
            </StructuredListHead>
            <StructuredListBody>
              {activities.map((activity) => (
                <StructuredListRow key={activity.id}>
                  <StructuredListCell>{activity.documentName}</StructuredListCell>
                  <StructuredListCell>{activity.workflow}</StructuredListCell>
                  <StructuredListCell>
                    <ActivityBadge type={activity.type} />
                  </StructuredListCell>
                  <StructuredListCell>
                    {formatRelativeTime(activity.timestamp)}
                  </StructuredListCell>
                </StructuredListRow>
              ))}
            </StructuredListBody>
          </StructuredList>
        </div>
      </div>
    </div>
  );
};

interface MetricTileProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
}

const MetricTile: React.FC<MetricTileProps> = ({ title, value, icon }) => (
  <div className={styles.metricTile}>
    <div className={styles.metricIcon}>{icon}</div>
    <div className={styles.metricContent}>
      <p className={styles.metricTitle}>{title}</p>
      <p className={styles.metricValue}>{value}</p>
    </div>
  </div>
);

interface ActivityBadgeProps {
  type: 'processed' | 'approved' | 'rejected' | 'exported';
}

const ActivityBadge: React.FC<ActivityBadgeProps> = ({ type }) => {
  const config: Record<string, { label: string; kind: any }> = {
    processed: { label: 'Processed', kind: 'blue' },
    approved: { label: 'Approved', kind: 'green' },
    rejected: { label: 'Rejected', kind: 'red' },
    exported: { label: 'Exported', kind: 'gray' },
  };

  const { label, kind } = config[type];
  return <Tag type={kind}>{label}</Tag>;
};

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString();
}

export default DashboardPage;
```

**Styling: DashboardPage.module.scss**

```scss
.dashboardPage {
  background: #f4f4f4;
  min-height: 100vh;
}

.gradientHeader {
  background: linear-gradient(135deg, #0f62fe 0%, #4589ff 100%);
  color: white;
  padding: 3rem 2rem;
  margin-bottom: 2rem;

  .headerContent {
    max-width: 1200px;
    margin: 0 auto;

    h1 {
      margin: 0 0 0.5rem;
      font-size: 2rem;
      font-weight: 300;
    }

    p {
      margin: 0;
      opacity: 0.9;
    }
  }
}

.metricsSection {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  padding: 0 2rem;
  margin-bottom: 3rem;
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
}

.metricTile {
  background: white;
  border-radius: 4px;
  padding: 1.5rem;
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  .metricIcon {
    color: #4589ff;
    flex-shrink: 0;
  }

  .metricContent {
    flex: 1;
  }

  .metricTitle {
    margin: 0;
    font-size: 0.875rem;
    color: #666;
    font-weight: 500;
  }

  .metricValue {
    margin: 0.5rem 0 0;
    font-size: 3rem;
    font-weight: 300;
    color: #4589ff;
    line-height: 1;
  }
}

.contentGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  padding: 0 2rem;
  max-width: 1400px;
  margin: 0 auto;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
}

.workflowsSection {
  h2 {
    margin: 0 0 1.5rem;
    color: #161616;
  }
}

.workflowCards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.workflowCard {
  background: white;
  border-radius: 4px;
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid #e0e0e0;

  &:hover {
    border-color: #4589ff;
    box-shadow: 0 4px 8px rgba(69, 137, 255, 0.2);
  }

  .cardContent {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;

    h3 {
      margin: 0 0 0.5rem;
      font-size: 1rem;
      color: #161616;
    }

    p {
      margin: 0;
      font-size: 0.875rem;
      color: #666;
    }
  }

  .accuracy {
    background: #d0e2ff;
    color: #0043ce;
    padding: 0.5rem 1rem;
    border-radius: 20px;
    font-weight: 600;
    font-size: 0.875rem;
  }
}

.activitySection {
  background: white;
  border-radius: 4px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  h2 {
    margin: 0 0 1.5rem;
    color: #161616;
  }
}

.loadingContainer {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: #f4f4f4;
}
```

**Backend: Dashboard API**

```python
# backend/app/api/dashboard.py
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timedelta
from app.db import AsyncSession, get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/stats")
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)):
    """Get KPI statistics"""
    try:
        # Get documents processed (last 30 days)
        processed = await db.execute(
            """
            SELECT COUNT(*) as count FROM documents
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            """
        )
        documents_processed = processed[0]['count'] if processed else 0

        # Get extraction accuracy
        accuracy = await db.execute(
            """
            SELECT AVG(confidence) as avg_confidence FROM extractions
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            """
        )
        extraction_accuracy = int((accuracy[0]['avg_confidence'] or 0) * 100)

        # Get STP rate (straight-through processing)
        stp = await db.execute(
            """
            SELECT COUNT(*) as count FROM documents
            WHERE status = 'approved' AND validation_status = 'passed'
            AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            """
        )
        stp_count = stp[0]['count'] if stp else 0
        stp_rate = int((stp_count / documents_processed * 100)) if documents_processed > 0 else 0

        # Get pending review
        pending = await db.execute(
            """
            SELECT COUNT(*) as count FROM documents
            WHERE status = 'pending_review'
            """
        )
        pending_review = pending[0]['count'] if pending else 0

        return {
            "documentsProcessed": documents_processed,
            "extractionAccuracy": extraction_accuracy,
            "stpRate": stp_rate,
            "pendingReview": pending_review
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/activity")
async def get_recent_activity(db: AsyncSession = Depends(get_db)):
    """Get recent activity events"""
    try:
        result = await db.execute(
            """
            SELECT
              d.id, d.filename as documentName, w.name as workflow,
              d.status as type, d.updated_at as timestamp
            FROM documents d
            JOIN workflows w ON d.workflow_id = w.id
            ORDER BY d.updated_at DESC
            LIMIT 10
            """
        )

        return [
            {
                "id": row['id'],
                "documentName": row['documentName'],
                "workflow": row['workflow'],
                "type": row['type'],
                "timestamp": row['timestamp']
            }
            for row in result
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Acceptance Criteria:**
- Gradient header with welcome message displays
- 4 metric tiles with large numbers (#4589FF color, 3rem font, weight 300)
- Workflow cards grid with hover shadows
- Recent activity StructuredList with status badges (10 events)
- Responsive grid layout (2 columns on desktop, 1 on mobile)
- All data fetched from API endpoints
- Proper timestamp formatting (relative times)

---

## Task 24: LON-140 — Document Classification

**Objective:** Implement intelligent document type detection with LLM-powered classification and confidence scoring.

```python
# backend/app/services/classifier.py
from typing import List, Tuple, Optional
import logging
from app.services.ocr_service import OCRService
from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)

class ClassificationResult:
    def __init__(
        self,
        document_type: str,
        confidence: float,
        reasoning: str,
        alternatives: List[Tuple[str, float]]
    ):
        self.document_type = document_type
        self.confidence = confidence
        self.reasoning = reasoning
        self.alternatives = alternatives

class DocumentClassifier:
    """
    Classify documents based on first page text using LLM.
    Auto-assign if confidence > 0.85, otherwise suggest alternatives.
    """

    def __init__(self):
        self.ocr_service = OCRService()
        self.llm_service = LLMService()

    async def classify_document(
        self,
        document_id: str,
        available_types: List[str]
    ) -> ClassificationResult:
        """
        Classify a document by analyzing its first page.

        Args:
            document_id: Document to classify
            available_types: List of available document_types from workflows

        Returns:
            ClassificationResult with type, confidence, and alternatives
        """
        try:
            # Extract first page text via OCR
            first_page_text = await self._extract_first_page(document_id)

            if not first_page_text:
                raise ValueError("Could not extract text from document")

            # Call LLM classifier
            classification = await self._classify_with_llm(
                first_page_text,
                available_types
            )

            logger.info(
                f"Classified {document_id} as {classification.document_type} "
                f"(confidence: {classification.confidence:.2%})"
            )

            return classification
        except Exception as e:
            logger.error(f"Classification failed for {document_id}: {str(e)}")
            raise

    async def _extract_first_page(self, document_id: str) -> str:
        """Extract text from first page only"""
        try:
            ocr_data = await self.ocr_service.get_ocr_data(document_id)
            if ocr_data and ocr_data.pages:
                return ocr_data.pages[0].text
            return ""
        except Exception as e:
            logger.error(f"OCR extraction failed: {str(e)}")
            return ""

    async def _classify_with_llm(
        self,
        text: str,
        available_types: List[str]
    ) -> ClassificationResult:
        """
        Use LLM to classify document type with confidence scoring.
        """
        prompt = f"""Analyze the following document excerpt and classify it.

Available document types: {', '.join(available_types)}

Document text (first page):
---
{text[:2000]}  # Limit to 2000 chars
---

Provide a JSON response with:
1. "primary_type": The most likely document type from the available list
2. "confidence": Confidence score (0-1)
3. "reasoning": Brief explanation
4. "alternatives": List of [type, confidence] pairs for top 3 matches

Return ONLY valid JSON."""

        try:
            response = await self.llm_service.call_claude(
                prompt=prompt,
                system="You are a document classifier. Respond only with JSON."
            )

            # Parse LLM response
            import json
            data = json.loads(response)

            return ClassificationResult(
                document_type=data['primary_type'],
                confidence=float(data['confidence']),
                reasoning=data['reasoning'],
                alternatives=data.get('alternatives', [])
            )
        except Exception as e:
            logger.error(f"LLM classification error: {str(e)}")
            # Fallback to first available type with low confidence
            return ClassificationResult(
                document_type=available_types[0] if available_types else "unknown",
                confidence=0.0,
                reasoning="Classification failed, using default",
                alternatives=[]
            )

# API Endpoint
# backend/app/api/documents.py (add to existing)

from fastapi import APIRouter, HTTPException, Depends
from app.services.classifier import DocumentClassifier
from app.db import AsyncSession, get_db

router = APIRouter(prefix="/api/documents", tags=["documents"])

@router.get("/{document_id}/classify")
async def classify_document(
    document_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Classify a document and return top 3 matches with confidence scores.
    Auto-assigns if confidence > 0.85.
    """
    try:
        # Get available document types from workflows
        workflows = await db.execute(
            "SELECT DISTINCT document_type FROM workflow_schemas"
        )
        available_types = [w['document_type'] for w in workflows]

        if not available_types:
            raise HTTPException(
                status_code=400,
                detail="No document types configured"
            )

        # Classify
        classifier = DocumentClassifier()
        result = await classifier.classify_document(
            document_id,
            available_types
        )

        # Auto-assign if confident
        should_auto_assign = result.confidence > 0.85
        if should_auto_assign:
            await db.execute(
                f"""
                UPDATE documents
                SET document_type = '{result.document_type}',
                    classification_confidence = {result.confidence}
                WHERE id = '{document_id}'
                """
            )

        return {
            "documentId": document_id,
            "primaryType": result.document_type,
            "confidence": result.confidence,
            "reasoning": result.reasoning,
            "autoAssigned": should_auto_assign,
            "alternatives": [
                {"type": alt[0], "confidence": alt[1]}
                for alt in result.alternatives[:3]
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Acceptance Criteria:**
- Auto-detect document type from first page text
- Confidence score calculated (0-1 range)
- Auto-assign if confidence > 0.85
- Return top 3 alternatives for manual routing
- API returns document type, confidence, and reasoning
- Handles documents with no text gracefully

---

## Task 25: LON-141 — E2E Testing

**Objective:** Comprehensive testing across all pipelines with pytest.

```bash
# Install dependencies
pip install pytest pytest-asyncio httpx factory-boy faker
```

```python
# backend/tests/conftest.py
import pytest
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.db import Base
from app.main import app
from httpx import AsyncClient
import factory
from factory.fuzzy import FuzzyText, FuzzyInteger

DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture
async def db():
    """Create in-memory test database"""
    engine = create_async_engine(DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = sessionmaker(
        engine, class_=AsyncSession, expire_on_delete=False
    )

    async with SessionLocal() as session:
        yield session

    await engine.dispose()

@pytest.fixture
async def client():
    """Create test client"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

class UserFactory(factory.Factory):
    class Meta:
        model = dict

    id = factory.Faker('uuid4')
    email = factory.Faker('email')
    name = factory.Faker('name')

class WorkflowFactory(factory.Factory):
    class Meta:
        model = dict

    id = factory.Faker('uuid4')
    name = FuzzyText(length=10)
    document_type = factory.Faker('word')
    status = 'active'

class DocumentFactory(factory.Factory):
    class Meta:
        model = dict

    id = factory.Faker('uuid4')
    filename = FuzzyText(suffix='.pdf')
    workflow_id = factory.Faker('uuid4')
    status = 'uploaded'
    file_path = factory.Faker('file_path')

@pytest.fixture
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture
async def sample_pdf(tmp_path):
    """Create a sample PDF for testing"""
    from reportlab.pdfgen import canvas
    pdf_path = tmp_path / "test.pdf"
    c = canvas.Canvas(str(pdf_path))
    c.drawString(100, 750, "Test Invoice")
    c.drawString(100, 700, "Invoice #12345")
    c.drawString(100, 650, "Amount: $1,000.00")
    c.save()
    return pdf_path
```

```python
# backend/tests/test_invoice_pipeline.py
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_invoice_pipeline_full(client: AsyncClient, sample_pdf, db):
    """
    Test complete invoice processing pipeline:
    register → create workflow → parse → upload → OCR → extract → validate → export
    """

    # 1. Register user/create account (skip for POC)

    # 2. Create invoice workflow
    workflow_response = await client.post("/api/workflows", json={
        "name": "Test Invoice Workflow",
        "document_type": "invoice",
        "schema": {
            "fields": [
                {"name": "invoice_number", "type": "string", "required": True},
                {"name": "amount", "type": "number", "required": True},
                {"name": "date", "type": "date", "required": True}
            ]
        }
    })
    assert workflow_response.status_code == 201
    workflow_id = workflow_response.json()["id"]

    # 3. Upload document
    with open(sample_pdf, "rb") as f:
        upload_response = await client.post(
            "/api/documents/upload",
            files={"file": f},
            data={"workflow_id": workflow_id}
        )
    assert upload_response.status_code == 201
    document_id = upload_response.json()["id"]

    # 4. Verify OCR processing
    ocr_response = await client.get(f"/api/documents/{document_id}/ocr")
    assert ocr_response.status_code == 200
    ocr_data = ocr_response.json()
    assert "text" in ocr_data
    assert "Test Invoice" in ocr_data["text"]

    # 5. Trigger extraction
    extract_response = await client.post(
        f"/api/documents/{document_id}/extract",
        json={"workflow_id": workflow_id}
    )
    assert extract_response.status_code == 200
    extractions = extract_response.json()
    assert "invoice_number" in extractions

    # 6. Validate extraction results
    validate_response = await client.post(
        f"/api/documents/{document_id}/validate",
        json={"extractions": extractions}
    )
    assert validate_response.status_code == 200
    validation = validate_response.json()
    assert validation["status"] in ["passed", "needs_review"]

    # 7. Approve document
    approve_response = await client.patch(
        f"/api/documents/{document_id}",
        json={"status": "approved"}
    )
    assert approve_response.status_code == 200

    # 8. Export data
    export_response = await client.get(
        f"/api/export/csv?document_id={document_id}"
    )
    assert export_response.status_code == 200
    assert "text/csv" in export_response.headers["content-type"]

@pytest.mark.asyncio
async def test_invoice_extraction_accuracy(client: AsyncClient, sample_pdf, db):
    """Test invoice field extraction accuracy"""
    # Create workflow and upload
    workflow_response = await client.post("/api/workflows", json={
        "name": "Accuracy Test",
        "document_type": "invoice"
    })
    workflow_id = workflow_response.json()["id"]

    with open(sample_pdf, "rb") as f:
        upload_response = await client.post(
            "/api/documents/upload",
            files={"file": f},
            data={"workflow_id": workflow_id}
        )
    document_id = upload_response.json()["id"]

    # Extract and validate
    extract_response = await client.post(
        f"/api/documents/{document_id}/extract"
    )
    extractions = extract_response.json()

    # Verify key fields
    assert "invoice_number" in extractions
    assert extractions["invoice_number"] == "12345"
    assert "amount" in extractions
    assert float(extractions["amount"]) == 1000.00
```

```python
# backend/tests/test_contract_pipeline.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_contract_pipeline_full(client: AsyncClient, sample_pdf, db):
    """
    Test complete contract processing pipeline
    """
    # Create contract workflow
    workflow_response = await client.post("/api/workflows", json={
        "name": "Contract Workflow",
        "document_type": "contract",
        "schema": {
            "fields": [
                {"name": "parties", "type": "string[]"},
                {"name": "effective_date", "type": "date"},
                {"name": "termination_date", "type": "date"},
                {"name": "payment_terms", "type": "string"}
            ]
        }
    })
    assert workflow_response.status_code == 201
    workflow_id = workflow_response.json()["id"]

    # Upload and process
    with open(sample_pdf, "rb") as f:
        upload_response = await client.post(
            "/api/documents/upload",
            files={"file": f},
            data={"workflow_id": workflow_id}
        )
    document_id = upload_response.json()["id"]

    # Extract contract terms
    extract_response = await client.post(
        f"/api/documents/{document_id}/extract"
    )
    assert extract_response.status_code == 200
    extractions = extract_response.json()

    # Validate contract fields
    assert "parties" in extractions
    assert "effective_date" in extractions

@pytest.mark.asyncio
async def test_contract_validation(client: AsyncClient, sample_pdf, db):
    """Test contract validation rules"""
    workflow_response = await client.post("/api/workflows", json={
        "name": "Contract Val",
        "document_type": "contract"
    })
    workflow_id = workflow_response.json()["id"]

    with open(sample_pdf, "rb") as f:
        upload_response = await client.post(
            "/api/documents/upload",
            files={"file": f},
            data={"workflow_id": workflow_id}
        )
    document_id = upload_response.json()["id"]

    # Run validation
    validate_response = await client.post(
        f"/api/documents/{document_id}/validate"
    )
    assert validate_response.status_code == 200
    validation = validate_response.json()
    assert "status" in validation
```

```python
# backend/tests/test_workflow_lifecycle.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_workflow_creation_and_activation(client: AsyncClient):
    """Test workflow creation and activation"""
    # Create
    response = await client.post("/api/workflows", json={
        "name": "Test Workflow",
        "document_type": "invoice"
    })
    assert response.status_code == 201
    workflow = response.json()
    assert workflow["status"] == "active"

    # Retrieve
    get_response = await client.get(f"/api/workflows/{workflow['id']}")
    assert get_response.status_code == 200
    assert get_response.json()["name"] == "Test Workflow"

@pytest.mark.asyncio
async def test_workflow_deactivation(client: AsyncClient):
    """Test workflow deactivation"""
    # Create
    response = await client.post("/api/workflows", json={
        "name": "Deactivate Test",
        "document_type": "invoice"
    })
    workflow_id = response.json()["id"]

    # Deactivate
    patch_response = await client.patch(
        f"/api/workflows/{workflow_id}",
        json={"status": "inactive"}
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["status"] == "inactive"

@pytest.mark.asyncio
async def test_workflow_list(client: AsyncClient):
    """Test listing workflows"""
    # Create multiple
    for i in range(3):
        await client.post("/api/workflows", json={
            "name": f"Workflow {i}",
            "document_type": "invoice"
        })

    # List
    response = await client.get("/api/workflows")
    assert response.status_code == 200
    workflows = response.json()
    assert len(workflows) >= 3
```

```python
# backend/tests/test_chat.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_document_chat(client: AsyncClient, sample_pdf, db):
    """Test chat with document"""
    # Setup: create and upload document
    workflow_response = await client.post("/api/workflows", json={
        "name": "Chat Test",
        "document_type": "invoice"
    })
    workflow_id = workflow_response.json()["id"]

    with open(sample_pdf, "rb") as f:
        upload_response = await client.post(
            "/api/documents/upload",
            files={"file": f},
            data={"workflow_id": workflow_id}
        )
    document_id = upload_response.json()["id"]

    # Chat
    chat_response = await client.post(
        f"/api/chat/document/{document_id}",
        json={
            "message": "What is the invoice number?",
            "previousMessages": []
        }
    )
    assert chat_response.status_code == 200
    data = chat_response.json()
    assert "response" in data
    assert "conversationId" in data

@pytest.mark.asyncio
async def test_database_chat(client: AsyncClient):
    """Test chat with database"""
    response = await client.post(
        "/api/chat/database",
        json={
            "message": "Show me recent invoices",
            "previousMessages": []
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "response" in data
    assert "conversationId" in data

@pytest.mark.asyncio
async def test_conversation_memory(client: AsyncClient, sample_pdf):
    """Test conversation memory persistence"""
    # Setup
    workflow_response = await client.post("/api/workflows", json={
        "name": "Memory Test",
        "document_type": "invoice"
    })
    workflow_id = workflow_response.json()["id"]

    with open(sample_pdf, "rb") as f:
        upload_response = await client.post(
            "/api/documents/upload",
            files={"file": f},
            data={"workflow_id": workflow_id}
        )
    document_id = upload_response.json()["id"]

    # First message
    msg1_response = await client.post(
        f"/api/chat/document/{document_id}",
        json={"message": "What is in this invoice?", "previousMessages": []}
    )
    conversation_id = msg1_response.json()["conversationId"]

    # Second message (should remember context)
    msg2_response = await client.post(
        f"/api/chat/document/{document_id}",
        json={
            "message": "What was the amount?",
            "previousMessages": [
                {"role": "user", "content": "What is in this invoice?"},
                {"role": "assistant", "content": msg1_response.json()["response"]}
            ]
        }
    )
    assert msg2_response.status_code == 200
    assert msg2_response.json()["conversationId"] == conversation_id
```

**GitHub Actions CI Configuration**

```yaml
# .github/workflows/test.yml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install pytest pytest-asyncio httpx factory-boy

      - name: Run tests
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost/test_db
          REDIS_URL: redis://localhost:6379
        run: pytest tests/ -v --cov=app

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

**Acceptance Criteria:**
- Invoice pipeline test passes (register → extract → validate → export)
- Contract pipeline test passes
- Workflow lifecycle test passes
- Chat conversation test passes
- CI integration works (GitHub Actions green)
- All 4 test suites pass locally
- Code coverage > 80%

---

## Task 26: LON-142 — Data Export

**Objective:** Multi-format export with CSV, Excel, and webhook callbacks.

```python
# backend/app/services/export_service.py
from typing import List, Optional, Dict, Any
from datetime import datetime
import csv
import json
import aiohttp
import logging
from io import BytesIO

try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
except ImportError:
    Workbook = None

logger = logging.getLogger(__name__)

class ExportService:
    """Export repository data in multiple formats"""

    async def export_csv(
        self,
        items: List[Dict[str, Any]],
        columns: Optional[List[str]] = None
    ) -> bytes:
        """
        Export items as CSV.

        Args:
            items: List of dictionaries to export
            columns: Columns to include (all if None)

        Returns:
            CSV file as bytes
        """
        if not items:
            return b""

        if columns is None:
            columns = list(items[0].keys())

        output = BytesIO()
        writer = csv.DictWriter(output, fieldnames=columns)

        writer.writeheader()
        for item in items:
            row = {col: item.get(col, "") for col in columns}
            writer.writerow(row)

        return output.getvalue()

    async def export_excel(
        self,
        items: List[Dict[str, Any]],
        columns: Optional[List[str]] = None,
        title: str = "Export"
    ) -> bytes:
        """
        Export items as formatted Excel file.

        Args:
            items: List of dictionaries
            columns: Columns to include
            title: Worksheet title

        Returns:
            Excel file as bytes
        """
        if Workbook is None:
            raise ImportError("openpyxl is required for Excel export")

        if not items:
            return b""

        if columns is None:
            columns = list(items[0].keys())

        wb = Workbook()
        ws = wb.active
        ws.title = title[:31]  # Excel sheet name limit

        # Header styling
        header_fill = PatternFill(start_color="D0E2FF", end_color="D0E2FF", fill_type="solid")
        header_font = Font(bold=True, color="000000")

        # Write headers
        for col_idx, column in enumerate(columns, 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.value = column
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        # Write data with alternating row colors
        data_fill_light = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
        data_fill_dark = PatternFill(start_color="F4F4F4", end_color="F4F4F4", fill_type="solid")

        for row_idx, item in enumerate(items, 2):
            fill = data_fill_dark if row_idx % 2 == 0 else data_fill_light

            for col_idx, column in enumerate(columns, 1):
                cell = ws.cell(row=row_idx, column=col_idx)
                value = item.get(column, "")

                # Format dates
                if isinstance(value, datetime):
                    cell.value = value.strftime("%Y-%m-%d %H:%M:%S")
                # Format numbers
                elif isinstance(value, (int, float)):
                    cell.value = value
                    cell.alignment = Alignment(horizontal="right")
                else:
                    cell.value = str(value) if value else ""

                cell.fill = fill

        # Auto-adjust column widths
        for col_idx, column in enumerate(columns, 1):
            max_length = len(str(column))
            for row in ws.iter_rows(min_col=col_idx, max_col=col_idx):
                for cell in row:
                    if cell.value:
                        max_length = max(max_length, len(str(cell.value)))
            ws.column_dimensions[ws.cell(1, col_idx).column_letter].width = min(max_length + 2, 50)

        output = BytesIO()
        wb.save(output)
        return output.getvalue()

    async def export_json(
        self,
        items: List[Dict[str, Any]]
    ) -> bytes:
        """Export as JSON"""
        # Convert datetime objects to ISO format
        def serialize(obj):
            if isinstance(obj, datetime):
                return obj.isoformat()
            raise TypeError(f"Type {type(obj)} not serializable")

        return json.dumps(items, default=serialize, indent=2).encode()

    async def trigger_webhook(
        self,
        webhook_url: str,
        export_data: Dict[str, Any],
        event_type: str = "export.completed"
    ) -> bool:
        """
        Send export data to webhook endpoint.

        Args:
            webhook_url: Target webhook URL
            export_data: Data to send
            event_type: Type of webhook event

        Returns:
            True if successful
        """
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "event": event_type,
                    "timestamp": datetime.now().isoformat(),
                    "data": export_data
                }

                async with session.post(
                    webhook_url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    if response.status >= 400:
                        logger.error(
                            f"Webhook failed: {response.status} - {await response.text()}"
                        )
                        return False

                    logger.info(f"Webhook triggered successfully: {webhook_url}")
                    return True
        except Exception as e:
            logger.error(f"Webhook trigger failed: {str(e)}")
            return False

# API Endpoints
# backend/app/api/export.py

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from app.db import AsyncSession, get_db
from app.services.export_service import ExportService
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/export", tags=["export"])

class WebhookExportRequest(BaseModel):
    webhook_url: str
    workflow_id: Optional[str] = None
    status_filter: Optional[str] = None

@router.get("/csv")
async def export_csv(
    workflow_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    document_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Export repository data as CSV"""
    try:
        # Build query
        query = "SELECT * FROM repository_items WHERE 1=1"
        params = []

        if workflow_id:
            query += " AND workflow_id = ?"
            params.append(workflow_id)

        if status:
            query += " AND status = ?"
            params.append(status)

        if document_id:
            query += " AND document_id = ?"
            params.append(document_id)

        result = await db.execute(query, params)
        items = [dict(row) for row in result]

        # Export
        service = ExportService()
        csv_data = await service.export_csv(items)

        return StreamingResponse(
            iter([csv_data]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=export.csv"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/excel")
async def export_excel(
    workflow_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    document_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Export repository data as Excel"""
    try:
        # Build query
        query = "SELECT * FROM repository_items WHERE 1=1"
        params = []

        if workflow_id:
            query += " AND workflow_id = ?"
            params.append(workflow_id)

        if status:
            query += " AND status = ?"
            params.append(status)

        if document_id:
            query += " AND document_id = ?"
            params.append(document_id)

        result = await db.execute(query, params)
        items = [dict(row) for row in result]

        # Export
        service = ExportService()
        excel_data = await service.export_excel(
            items,
            title="Repository Export"
        )

        return StreamingResponse(
            iter([excel_data]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=export.xlsx"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/webhook")
async def export_webhook(
    request: WebhookExportRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Export data and send to webhook.
    Returns job ID for async processing.
    """
    try:
        # Build query
        query = "SELECT * FROM repository_items WHERE 1=1"
        params = []

        if request.workflow_id:
            query += " AND workflow_id = ?"
            params.append(request.workflow_id)

        if request.status_filter:
            query += " AND status = ?"
            params.append(request.status_filter)

        result = await db.execute(query, params)
        items = [dict(row) for row in result]

        # Trigger webhook asynchronously
        import asyncio
        service = ExportService()

        export_data = {
            "count": len(items),
            "items": items,
            "exportedAt": datetime.now().isoformat()
        }

        # Fire and forget
        asyncio.create_task(
            service.trigger_webhook(
                request.webhook_url,
                export_data,
                "export.completed"
            )
        )

        return {
            "status": "queued",
            "itemCount": len(items),
            "webhook": request.webhook_url
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Frontend: Export Buttons in Repository**

Add to RepositoryPage.tsx (in Toolbar):

```typescript
// Already included in Task 22 code above
// Lines with handleExport and export buttons:

<Button
  kind="secondary"
  size="sm"
  renderIcon={Download}
  onClick={() => handleExport('csv')}
>
  Export CSV
</Button>
<Button
  kind="secondary"
  size="sm"
  renderIcon={Download}
  onClick={() => handleExport('excel')}
>
  Export Excel
</Button>
```

**Installation**

```bash
pip install openpyxl aiohttp
```

**Acceptance Criteria:**
- CSV export downloads with correct formatting
- Excel export includes formatting (headers, alternating rows, auto-width)
- JSON API returns proper structure
- Webhook callback sends data to configured endpoint
- Bulk export works with filters
- All export endpoints return correct mime types
- Error handling for missing openpyxl

---

## Sprint 4 Completion Checklist

- [ ] **Chat Interface (LON-137)**
  - [ ] ChatPage.tsx with dual modes implemented
  - [ ] Carbon-styled chat bubbles (user white, AI #EDF5FF)
  - [ ] Typing indicator displays during processing
  - [ ] Timestamps on all messages
  - [ ] Code block and table rendering works
  - [ ] POST /chat/document/{id} endpoint working
  - [ ] POST /chat/database endpoint generates SQL
  - [ ] Redis conversation memory persists
  - [ ] All acceptance criteria met

- [ ] **Data Repository (LON-138)**
  - [ ] RepositoryPage.tsx built with Carbon DataTable
  - [ ] TableToolbar with search, filter, column toggle
  - [ ] Dynamic columns per workflow type
  - [ ] Pagination with configurable page size
  - [ ] Row click opens drill-down modal
  - [ ] Export CSV and Excel buttons work
  - [ ] Filters by workflow, status, date range
  - [ ] Alternating row colors with #D0E2FF header
  - [ ] All acceptance criteria met

- [ ] **Dashboard (LON-139)**
  - [ ] DashboardPage.tsx as landing page
  - [ ] Gradient header with welcome message
  - [ ] 4 metric tiles with large stats (#4589FF, 3rem, weight 300)
  - [ ] Workflow cards grid with ClickableTile
  - [ ] Recent activity StructuredList (10 events)
  - [ ] Status badges on activities
  - [ ] GET /dashboard/stats endpoint
  - [ ] GET /dashboard/activity endpoint
  - [ ] Responsive layout (2 cols → 1 col)
  - [ ] All acceptance criteria met

- [ ] **Document Classification (LON-140)**
  - [ ] classifier.py extracts first page text
  - [ ] LLM classifies document with confidence
  - [ ] Auto-assign if confidence > 0.85
  - [ ] GET /documents/{id}/classify returns top 3
  - [ ] Handles documents with no text gracefully
  - [ ] Reasoning provided in response
  - [ ] All acceptance criteria met

- [ ] **E2E Testing (LON-141)**
  - [ ] pytest and pytest-asyncio installed
  - [ ] test_invoice_pipeline.py passes (all 7 steps)
  - [ ] test_contract_pipeline.py passes
  - [ ] test_workflow_lifecycle.py passes
  - [ ] test_chat.py passes (conversation memory works)
  - [ ] GitHub Actions CI configured and green
  - [ ] Code coverage > 80%
  - [ ] All acceptance criteria met

- [ ] **Data Export (LON-142)**
  - [ ] export_service.py with CSV, Excel, JSON
  - [ ] openpyxl installed for Excel formatting
  - [ ] GET /export/csv works with filters
  - [ ] GET /export/excel with formatting applied
  - [ ] POST /export/webhook queues async callback
  - [ ] Frontend export buttons in repository toolbar
  - [ ] Webhook sends event data correctly
  - [ ] All acceptance criteria met

- [ ] **Integration & Polish**
  - [ ] All APIs documented (OpenAPI/Swagger)
  - [ ] Error handling consistent across endpoints
  - [ ] CORS configured for frontend
  - [ ] Database migrations current
  - [ ] Redis connection established
  - [ ] LLM service integrated
  - [ ] No console errors or warnings
  - [ ] Responsive design tested (desktop, tablet, mobile)
  - [ ] Performance acceptable (< 2s load times)
  - [ ] Security headers present

**Deployment Readiness**
- [ ] Environment variables documented (.env.example)
- [ ] Database schema exported
- [ ] Redis persistence configured
- [ ] Log aggregation working
- [ ] Monitoring alerts set up
- [ ] Backup strategy in place
- [ ] Team training completed
- [ ] Documentation complete and reviewed

**Sign-Off**
- Sprint Review Date: ___________
- Team Lead: ___________
- Product Owner: ___________
- Engineering Lead: ___________
