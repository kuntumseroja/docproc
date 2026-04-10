import React, { useEffect, useState } from 'react';
import {
  RadioButtonGroup,
  RadioButton,
  Select,
  SelectItem,
  Button,
  InlineNotification,
  TextInput,
  Tile,
  Tag,
  Loading,
} from '@carbon/react';
import api from '../services/api';

interface ModelInfo {
  id: string;
  name: string;
}

interface ProviderModels {
  provider: string;
  models: ModelInfo[];
}

interface ProviderHealth {
  provider: string;
  status: string;
  error?: string;
  models?: string[];
}

interface CurrentConfig {
  provider: string;
  model: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  ollama: 'Ollama (On-Premise)',
  mistral: 'Mistral AI',
};

interface OCRConfig {
  provider: string;
  tesseract_installed: boolean;
}

const SettingsPage: React.FC = () => {
  const [availableModels, setAvailableModels] = useState<ProviderModels[]>([]);
  const [currentConfig, setCurrentConfig] = useState<CurrentConfig | null>(null);
  const [healthStatus, setHealthStatus] = useState<ProviderHealth[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('anthropic');
  const [selectedModel, setSelectedModel] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [notification, setNotification] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [ocrConfig, setOcrConfig] = useState<OCRConfig | null>(null);
  const [savingOcr, setSavingOcr] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [modelsRes, currentRes, ocrRes] = await Promise.all([
        api.get('/models/available'),
        api.get('/models/current'),
        api.get('/models/ocr'),
      ]);
      setAvailableModels(modelsRes.data);
      setCurrentConfig(currentRes.data);
      setSelectedProvider(currentRes.data.provider);
      setSelectedModel(currentRes.data.model);
      setOcrConfig(ocrRes.data);
    } catch {
      setNotification({ kind: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put('/models/current', {
        provider: selectedProvider,
        model: selectedModel || null,
      });
      setCurrentConfig(res.data);
      setNotification({ kind: 'success', text: `Switched to ${PROVIDER_LABELS[selectedProvider]} — ${res.data.model}` });
    } catch {
      setNotification({ kind: 'error', text: 'Failed to update model configuration' });
    } finally {
      setSaving(false);
    }
  };

  const handleHealthCheck = async () => {
    setCheckingHealth(true);
    try {
      const res = await api.get('/models/health');
      setHealthStatus(res.data);
    } catch {
      setNotification({ kind: 'error', text: 'Health check failed' });
    } finally {
      setCheckingHealth(false);
    }
  };

  const getModelsForProvider = (provider: string): ModelInfo[] => {
    return availableModels.find((p) => p.provider === provider)?.models || [];
  };

  const getHealthTag = (provider: string) => {
    const health = healthStatus.find((h) => h.provider === provider);
    if (!health) return null;
    const kind = health.status === 'ok' ? 'green' : health.status === 'not_configured' ? 'gray' : 'red';
    return <Tag type={kind}>{health.status}</Tag>;
  };

  if (loading) return <Loading withOverlay={false} />;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 24 }}>Model Settings</h1>

      {notification && (
        <InlineNotification
          kind={notification.kind}
          title={notification.text}
          onClose={() => setNotification(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      <Tile style={{ marginBottom: 24, padding: 24 }}>
        <h4 style={{ marginBottom: 16 }}>LLM Provider</h4>
        <RadioButtonGroup
          legendText="Select provider"
          name="provider"
          valueSelected={selectedProvider}
          onChange={(value) => {
            const v = value as string;
            setSelectedProvider(v);
            const models = getModelsForProvider(v);
            setSelectedModel(models.length > 0 ? models[0].id : '');
          }}
          orientation="vertical"
        >
          {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
            <RadioButton
              key={key}
              id={`provider-${key}`}
              value={key}
              labelText={
                <span>
                  {label} {getHealthTag(key)}
                </span>
              }
            />
          ))}
        </RadioButtonGroup>
      </Tile>

      <Tile style={{ marginBottom: 24, padding: 24 }}>
        <h4 style={{ marginBottom: 16 }}>Model</h4>
        <Select
          id="model-select"
          labelText="Select model"
          value={selectedModel}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedModel(e.target.value)}
        >
          {getModelsForProvider(selectedProvider).map((m) => (
            <SelectItem key={m.id} value={m.id} text={m.name} />
          ))}
        </Select>
      </Tile>

      {selectedProvider === 'ollama' && (
        <Tile style={{ marginBottom: 24, padding: 24 }}>
          <h4 style={{ marginBottom: 16 }}>Ollama Configuration</h4>
          <TextInput
            id="ollama-url"
            labelText="Ollama Base URL"
            value={ollamaUrl}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOllamaUrl(e.target.value)}
          />
        </Tile>
      )}

      {currentConfig && (
        <Tile style={{ marginBottom: 24, padding: 24 }}>
          <h4 style={{ marginBottom: 8 }}>Current Configuration</h4>
          <p>
            <strong>Provider:</strong> {PROVIDER_LABELS[currentConfig.provider] || currentConfig.provider}
          </p>
          <p>
            <strong>Model:</strong> {currentConfig.model}
          </p>
        </Tile>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
        <Button kind="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
        <Button kind="secondary" onClick={handleHealthCheck} disabled={checkingHealth}>
          {checkingHealth ? 'Checking...' : 'Check Health'}
        </Button>
      </div>

      <h1 style={{ marginBottom: 24 }}>OCR Settings</h1>

      <Tile style={{ marginBottom: 24, padding: 24 }}>
        <h4 style={{ marginBottom: 16 }}>OCR Provider</h4>
        <p style={{ color: '#525252', fontSize: 13, marginBottom: 16 }}>
          OCR converts document images and PDFs into text before LLM extraction.
        </p>
        <RadioButtonGroup
          legendText="Select OCR provider"
          name="ocr-provider"
          valueSelected={ocrConfig?.provider || 'tesseract'}
          onChange={async (value) => {
            const provider = value as string;
            setSavingOcr(true);
            try {
              const res = await api.put('/models/ocr', { provider });
              setOcrConfig(res.data);
              setNotification({ kind: 'success', text: `OCR switched to ${provider === 'tesseract' ? 'Tesseract' : 'Mistral OCR'}` });
            } catch (err: any) {
              setNotification({ kind: 'error', text: err.response?.data?.detail || 'Failed to update OCR provider' });
            } finally {
              setSavingOcr(false);
            }
          }}
          orientation="vertical"
        >
          <RadioButton
            id="ocr-tesseract"
            value="tesseract"
            labelText={
              <span>
                Tesseract (Local){' '}
                {ocrConfig && (
                  <Tag type={ocrConfig.tesseract_installed ? 'green' : 'red'} size="sm">
                    {ocrConfig.tesseract_installed ? 'installed' : 'not installed'}
                  </Tag>
                )}
              </span>
            }
          />
          <RadioButton
            id="ocr-mistral"
            value="mistral"
            labelText={
              <span>Mistral OCR (Cloud API)</span>
            }
          />
        </RadioButtonGroup>
        {savingOcr && <Loading small withOverlay={false} style={{ marginTop: 8 }} />}
      </Tile>

      {ocrConfig && (
        <Tile style={{ marginBottom: 24, padding: 24 }}>
          <h4 style={{ marginBottom: 8 }}>Current OCR Configuration</h4>
          <p>
            <strong>Provider:</strong> {ocrConfig.provider === 'tesseract' ? 'Tesseract (Local)' : 'Mistral OCR (Cloud)'}
          </p>
          <p>
            <strong>Tesseract installed:</strong> {ocrConfig.tesseract_installed ? 'Yes' : 'No'}
          </p>
          {ocrConfig.provider === 'tesseract' && !ocrConfig.tesseract_installed && (
            <InlineNotification
              kind="warning"
              title="Tesseract not found"
              subtitle="Install with: brew install tesseract"
              lowContrast
              hideCloseButton
              style={{ marginTop: 12 }}
            />
          )}
        </Tile>
      )}
    </div>
  );
};

export default SettingsPage;
