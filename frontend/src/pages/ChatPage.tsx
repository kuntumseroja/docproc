import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  TextInput,
  Button,
  Tile,
  Tag,
  Select,
  SelectItem,
} from '@carbon/react';
import { Send, TrashCan, Document, Ai } from '@carbon/icons-react';
import api from '../services/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ type: string; id: string }>;
  suggested_actions?: string[];
  model_used?: string;
  provider?: string;
  latency_ms?: number;
  timestamp: Date;
}

interface ProviderModels {
  provider: string;
  models: Array<{ id: string; name: string }>;
}

const PROVIDER_LABELS: Record<string, string> = {
  ollama: 'Ollama',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  mistral: 'Mistral',
};

/* ------------------------------------------------------------------ */
/* Markdown → JSX renderer (lightweight, no external dependency)       */
/* ------------------------------------------------------------------ */

const renderMarkdown = (text: string): React.ReactNode => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let tableHeaders: string[] = [];
  let keyCounter = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${keyCounter++}`} style={{
          margin: '4px 0 8px', paddingLeft: 20, listStyle: 'none',
        }}>
          {listItems}
        </ul>
      );
      listItems = [];
    }
  };

  const flushTable = () => {
    if (tableRows.length > 0) {
      elements.push(
        <div key={`tw-${keyCounter++}`} style={{ overflowX: 'auto', margin: '8px 0 12px' }}>
          <table style={{
            width: '100%', borderCollapse: 'collapse', fontSize: 13,
          }}>
            {tableHeaders.length > 0 && (
              <thead>
                <tr>
                  {tableHeaders.map((h, i) => (
                    <th key={i} style={{
                      textAlign: 'left', padding: '6px 10px', fontWeight: 500,
                      borderBottom: '2px solid #d0d0d0', background: '#e8e8e8',
                      fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.3px',
                    }}>{renderInline(h.trim())}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {tableRows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : '#f9f9f9' }}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{
                      padding: '5px 10px', borderBottom: '1px solid #e0e0e0',
                    }}>{renderInline(cell.trim())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
      tableHeaders = [];
      inTable = false;
    }
  };

  const renderInline = (line: string): React.ReactNode => {
    // Process inline formatting: bold, italic, code, links
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let inlineKey = 0;

    while (remaining.length > 0) {
      // Bold: **text**
      const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
      if (boldMatch) {
        if (boldMatch[1]) parts.push(<span key={`t-${inlineKey++}`}>{boldMatch[1]}</span>);
        parts.push(<strong key={`b-${inlineKey++}`} style={{ fontWeight: 500 }}>{boldMatch[2]}</strong>);
        remaining = boldMatch[3];
        continue;
      }

      // Inline code: `text`
      const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)/s);
      if (codeMatch) {
        if (codeMatch[1]) parts.push(<span key={`t-${inlineKey++}`}>{codeMatch[1]}</span>);
        parts.push(
          <code key={`c-${inlineKey++}`} style={{
            background: '#e0e0e0', padding: '1px 5px', borderRadius: 3,
            fontSize: '0.9em', fontFamily: "'IBM Plex Mono', monospace",
          }}>{codeMatch[2]}</code>
        );
        remaining = codeMatch[3];
        continue;
      }

      // No more matches — push the rest
      parts.push(<span key={`t-${inlineKey++}`}>{remaining}</span>);
      break;
    }

    return parts.length === 1 ? parts[0] : <>{parts}</>;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line
    if (trimmed === '') {
      flushList();
      flushTable();
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
      flushList();
      flushTable();
      elements.push(<hr key={`hr-${keyCounter++}`} style={{ border: 'none', borderTop: '1px solid #d0d0d0', margin: '12px 0' }} />);
      continue;
    }

    // Table row: | cell | cell |
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.slice(1, -1).split('|').map(c => c.trim());

      // Skip separator row: |---|---|
      if (cells.every(c => /^[-:]+$/.test(c))) continue;

      if (!inTable) {
        inTable = true;
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headings
    const h1Match = trimmed.match(/^#\s+(.+)/);
    if (h1Match) {
      flushList();
      elements.push(
        <h3 key={`h-${keyCounter++}`} style={{
          fontSize: 17, fontWeight: 500, margin: '16px 0 6px', color: '#0f62fe',
          borderBottom: '2px solid #0f62fe', paddingBottom: 4, display: 'inline-block',
        }}>{renderInline(h1Match[1])}</h3>
      );
      continue;
    }
    const h2Match = trimmed.match(/^##\s+(.+)/);
    if (h2Match) {
      flushList();
      elements.push(
        <h4 key={`h-${keyCounter++}`} style={{
          fontSize: 15, fontWeight: 500, margin: '14px 0 6px', color: '#0f62fe',
        }}>{renderInline(h2Match[1])}</h4>
      );
      continue;
    }
    const h3Match = trimmed.match(/^###\s+(.+)/);
    if (h3Match) {
      flushList();
      elements.push(
        <h5 key={`h-${keyCounter++}`} style={{
          fontSize: 14, fontWeight: 500, margin: '10px 0 4px', color: '#161616',
        }}>{renderInline(h3Match[1])}</h5>
      );
      continue;
    }

    // List items: - text or * text or numbered 1. text
    const listMatch = trimmed.match(/^[-*•]\s+(.+)/) || trimmed.match(/^\d+\.\s+(.+)/);
    if (listMatch) {
      const isNumbered = /^\d+\./.test(trimmed);
      const num = isNumbered ? trimmed.match(/^(\d+)\./)?.[1] : null;
      listItems.push(
        <li key={`li-${keyCounter++}`} style={{
          marginBottom: 4, fontSize: 13, lineHeight: 1.6, display: 'flex', gap: 8,
        }}>
          <span style={{
            color: '#0f62fe', fontWeight: 500, minWidth: 16, flexShrink: 0,
          }}>
            {isNumbered ? `${num}.` : '•'}
          </span>
          <span>{renderInline(listMatch[1])}</span>
        </li>
      );
      continue;
    } else {
      flushList();
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${keyCounter++}`} style={{
        margin: '4px 0', fontSize: 13, lineHeight: 1.6,
      }}>{renderInline(trimmed)}</p>
    );
  }

  flushList();
  flushTable();

  return <div>{elements}</div>;
};

/* ------------------------------------------------------------------ */
/* Typing animation with formatted output                              */
/* ------------------------------------------------------------------ */

const TYPING_SPEED = 12;

const TypingMessage: React.FC<{ fullText: string; onDone: () => void }> = ({ fullText, onDone }) => {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    indexRef.current = 0;
    setDisplayed('');
    const interval = setInterval(() => {
      indexRef.current += 2;
      if (indexRef.current >= fullText.length) {
        setDisplayed(fullText);
        clearInterval(interval);
        onDone();
      } else {
        setDisplayed(fullText.slice(0, indexRef.current));
      }
    }, TYPING_SPEED);
    return () => clearInterval(interval);
  }, [fullText, onDone]);

  return (
    <div>
      {renderMarkdown(displayed)}
      <span style={{ opacity: 0.5, animation: 'blink 0.8s step-end infinite' }}>▌</span>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Chat Page                                                           */
/* ------------------------------------------------------------------ */

const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [documentId, setDocumentId] = useState('');
  const [availableModels, setAvailableModels] = useState<ProviderModels[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const [availRes, currentRes] = await Promise.all([
          api.get('/models/available'),
          api.get('/models/current'),
        ]);
        setAvailableModels(availRes.data || []);
        setSelectedModel(`${currentRes.data.provider}/${currentRes.data.model}`);
      } catch (err) {
        // ignore
      }
    };
    loadModels();
  }, []);

  const handleModelChange = async (value: string) => {
    if (!value) return;
    setSelectedModel(value);
    const [provider, ...modelParts] = value.split('/');
    const model = modelParts.join('/');
    try {
      await api.put('/models/current', { provider, model });
    } catch (err) {
      // ignore
    }
  };

  const handleTypingDone = useCallback(() => {
    setIsTyping(false);
  }, []);

  const handleSend = async () => {
    if (!input.trim() || sending) return;

    const userMsg: Message = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await api.post('/chat/message', {
        message: input,
        document_id: documentId || undefined,
      });
      const assistantMsg: Message = {
        role: 'assistant',
        content: res.data.message,
        sources: res.data.sources,
        suggested_actions: res.data.suggested_actions,
        model_used: res.data.model_used,
        provider: res.data.provider,
        latency_ms: res.data.latency_ms,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setIsTyping(true);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    try {
      await api.post('/chat/clear');
    } catch (err) {}
    setMessages([]);
    setIsTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const modelOptions = availableModels.flatMap(pm =>
    pm.models.map(m => ({
      value: `${pm.provider}/${m.id}`,
      label: `${PROVIDER_LABELS[pm.provider] || pm.provider} / ${m.name}`,
    }))
  );

  return (
    <div style={{ padding: 32, height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 300, marginBottom: 4 }}>Chat</h1>
          <p style={{ color: '#525252' }}>Ask questions about your documents</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <Select
            id="model-select"
            labelText="Model"
            size="sm"
            value={selectedModel}
            onChange={(e: any) => handleModelChange(e.target.value)}
            style={{ width: 280 }}
          >
            <SelectItem value="" text="Select model..." />
            {modelOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value} text={opt.label} />
            ))}
          </Select>
          <TextInput
            id="doc-context"
            labelText="Document ID (optional)"
            placeholder="Paste document ID..."
            size="sm"
            value={documentId}
            onChange={(e: any) => setDocumentId(e.target.value)}
            style={{ width: 220 }}
          />
          <Button kind="ghost" size="sm" renderIcon={TrashCan} onClick={handleClear} iconDescription="Clear chat">
            Clear
          </Button>
        </div>
      </div>

      <Tile style={{ flex: 1, overflow: 'auto', padding: 24, marginBottom: 16, minHeight: 0 }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#525252' }}>
            <Document size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
            <h3 style={{ fontWeight: 400, marginBottom: 8 }}>Start a conversation</h3>
            <p style={{ marginBottom: 24 }}>Ask about your documents, extraction results, or workflows.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 700, margin: '0 auto' }}>
              {[
                { icon: '📄', text: 'Summarize all my documents' },
                { icon: '📊', text: 'What is the total invoice amount?' },
                { icon: '👤', text: 'Summarize Rina Pratiwi\'s CV' },
                { icon: '🎯', text: 'Does Budi Santoso fit the Risk Analyst role?' },
                { icon: '🔍', text: 'Compare all CV candidates and rank them' },
                { icon: '⚡', text: 'What skills is Ahmad Fauzan missing for Software Engineer?' },
              ].map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => { setInput(q.text); }}
                  style={{
                    padding: '8px 16px', borderRadius: 20, border: '1px solid #e0e0e0',
                    background: '#fff', cursor: 'pointer', fontSize: 13, color: '#161616',
                    display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'all 0.15s',
                  }}
                  onMouseOver={(e) => { (e.target as HTMLElement).style.background = '#EDF5FF'; (e.target as HTMLElement).style.borderColor = '#4589ff'; }}
                  onMouseOut={(e) => { (e.target as HTMLElement).style.background = '#fff'; (e.target as HTMLElement).style.borderColor = '#e0e0e0'; }}
                >
                  <span>{q.icon}</span> {q.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1;
            const showTyping = isLastAssistant && isTyping;

            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    maxWidth: msg.role === 'user' ? '70%' : '85%',
                    padding: msg.role === 'user' ? '12px 16px' : '16px 20px',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: msg.role === 'user' ? '#4589ff' : '#f4f4f4',
                    color: msg.role === 'user' ? '#fff' : '#161616',
                    boxShadow: msg.role === 'assistant' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                  }}
                >
                  {msg.role === 'user' ? (
                    <p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5, fontSize: 14 }}>
                      {msg.content}
                    </p>
                  ) : showTyping ? (
                    <TypingMessage fullText={msg.content} onDone={handleTypingDone} />
                  ) : (
                    renderMarkdown(msg.content)
                  )}
                  {!showTyping && msg.suggested_actions && msg.suggested_actions.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {msg.suggested_actions.map((action, j) => (
                        <Tag key={j} type="blue" size="sm">{action.replace(/_/g, ' ')}</Tag>
                      ))}
                    </div>
                  )}
                  {!showTyping && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginTop: 8,
                      paddingTop: 6, borderTop: msg.role === 'assistant' ? '1px solid #e0e0e0' : 'none',
                    }}>
                      <span style={{ fontSize: 11, opacity: 0.5 }}>
                        {msg.timestamp.toLocaleTimeString()}
                      </span>
                      {msg.model_used && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '1px 8px', borderRadius: 10, fontSize: 10,
                          background: '#e0e0e0', color: '#525252',
                        }}>
                          <Ai size={10} />
                          {PROVIDER_LABELS[msg.provider || ''] || msg.provider}
                          <span style={{ opacity: 0.5 }}>/</span>
                          {msg.model_used}
                          {msg.latency_ms != null && (
                            <span style={{ opacity: 0.6, marginLeft: 2 }}>
                              {(msg.latency_ms / 1000).toFixed(1)}s
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </Tile>

      <div style={{ display: 'flex', gap: 8 }}>
        <TextInput
          id="chat-input"
          labelText=""
          hideLabel
          placeholder="Type your message..."
          value={input}
          onChange={(e: any) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending || isTyping}
          style={{ flex: 1 }}
        />
        <Button
          kind="primary"
          renderIcon={sending ? undefined : Send}
          onClick={handleSend}
          disabled={!input.trim() || sending || isTyping}
        >
          {sending ? 'Sending...' : 'Send'}
        </Button>
      </div>
    </div>
  );
};

export default ChatPage;
