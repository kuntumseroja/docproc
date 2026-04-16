import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  TextInput,
  Button,
  Tile,
  Tag,
  Select,
  SelectItem,
} from '@carbon/react';
import { Send, TrashCan, Document, Ai, UserMultiple } from '@carbon/icons-react';
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
    <p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>
      {displayed}
      <span style={{ opacity: 0.5, animation: 'blink 0.8s step-end infinite' }}>▌</span>
    </p>
  );
};

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

  // Load available models and current selection on mount
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
    const model = modelParts.join('/'); // handles models with / in name
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

  // Build flat list of provider/model options
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
                    maxWidth: '70%',
                    padding: '12px 16px',
                    borderRadius: 8,
                    background: msg.role === 'user' ? '#4589ff' : '#f4f4f4',
                    color: msg.role === 'user' ? '#fff' : '#161616',
                  }}
                >
                  {showTyping ? (
                    <TypingMessage fullText={msg.content} onDone={handleTypingDone} />
                  ) : (
                    <p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>{msg.content}</p>
                  )}
                  {!showTyping && msg.suggested_actions && msg.suggested_actions.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {msg.suggested_actions.map((action, j) => (
                        <Tag key={j} type="blue" size="sm">{action.replace(/_/g, ' ')}</Tag>
                      ))}
                    </div>
                  )}
                  {!showTyping && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <span style={{ fontSize: 11, opacity: 0.6 }}>
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
