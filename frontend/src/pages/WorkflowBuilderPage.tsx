import React, { useState, useEffect } from 'react';
import {
  ProgressIndicator,
  ProgressStep,
  Button,
  TextInput,
  TextArea,
  Select,
  SelectItem,
  Tile,
  InlineNotification,
  Loading,
} from '@carbon/react';
import { ArrowRight, ArrowLeft, Save, Ai } from '@carbon/icons-react';
import FieldTuningTable from '../components/FieldTuningTable';
import api from '../services/api';
import { FieldDefinition, ValidationRule, ActionDefinition } from '../types';

const DOCUMENT_TYPES = ['invoice', 'contract', 'purchase_order', 'resume', 'receipt', 'report', 'generic'];

const PROVIDER_LABELS: Record<string, string> = {
  ollama: 'Ollama (On-Prem)',
  anthropic: 'Anthropic API',
  openai: 'OpenAI API',
  mistral: 'Mistral API',
  deepseek: 'DeepSeek API',
};

interface ModelInfo {
  provider: string;
  model: string;
  latencyMs: number;
}

const ModelBadge: React.FC<{ info: ModelInfo }> = ({ info }) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 12px', borderRadius: 16, fontSize: 12, fontWeight: 400,
    background: '#e0e0e0', color: '#393939',
  }}>
    <Ai size={14} />
    <span style={{ fontWeight: 500 }}>{PROVIDER_LABELS[info.provider] || info.provider}</span>
    <span style={{ color: '#6f6f6f' }}>/</span>
    <span>{info.model}</span>
    <span style={{ color: '#6f6f6f', marginLeft: 4 }}>{(info.latencyMs / 1000).toFixed(1)}s</span>
  </div>
);

const WorkflowBuilderPage: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [nlDescription, setNlDescription] = useState('');
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [validationRules, setValidationRules] = useState<ValidationRule[]>([]);
  const [actions, setActions] = useState<ActionDefinition[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [availableModels, setAvailableModels] = useState<Array<{ provider: string; models: Array<{ id: string; name: string }> }>>([]);
  const [selectedModel, setSelectedModel] = useState('');

  useEffect(() => {
    const loadModels = async () => {
      try {
        const [availRes, currentRes] = await Promise.all([
          api.get('/models/available'),
          api.get('/models/current'),
        ]);
        setAvailableModels(availRes.data || []);
        setSelectedModel(`${currentRes.data.provider}/${currentRes.data.model}`);
      } catch (err) {}
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
    } catch (err) {}
  };

  const modelOptions = availableModels.flatMap(pm =>
    pm.models.map(m => ({
      value: `${pm.provider}/${m.id}`,
      label: `${PROVIDER_LABELS[pm.provider] || pm.provider} / ${m.name}`,
    }))
  );

  const handleParseSchema = async () => {
    setParsing(true);
    setParseError('');
    try {
      const res = await api.post('/workflows/parse-schema', {
        description: nlDescription,
        document_type: documentType || undefined,
      });
      setFields(res.data.fields || []);
      setValidationRules(res.data.validation_rules || []);
      if (res.data.model_used) {
        setModelInfo({
          provider: res.data.provider || 'unknown',
          model: res.data.model_used,
          latencyMs: res.data.latency_ms || 0,
        });
      }
      setCurrentStep(2);
    } catch (err: any) {
      setParseError(err.response?.data?.detail || 'Failed to parse schema');
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/workflows/', {
        name,
        description,
        document_type: documentType || undefined,
        extraction_schema: { fields },
        validation_rules: { rules: validationRules },
        action_config: { actions },
      });
      setSaved(true);
    } catch (err) {
      // handle error
    } finally {
      setSaving(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: return name.trim().length > 0;
      case 1: return nlDescription.trim().length > 0;
      default: return true;
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div style={{ maxWidth: 600 }}>
            <TextInput
              id="workflow-name"
              labelText="Workflow Name"
              placeholder="e.g., Invoice Processing"
              value={name}
              onChange={(e: any) => setName(e.target.value)}
              style={{ marginBottom: 24 }}
            />
            <TextArea
              id="workflow-desc"
              labelText="Description"
              placeholder="Describe what this workflow does..."
              value={description}
              onChange={(e: any) => setDescription(e.target.value)}
              rows={3}
              style={{ marginBottom: 24 }}
            />
            <Select
              id="doc-type"
              labelText="Document Type"
              value={documentType}
              onChange={(e: any) => setDocumentType(e.target.value)}
            >
              <SelectItem value="" text="Select document type..." />
              {DOCUMENT_TYPES.map(t => (
                <SelectItem key={t} value={t} text={t.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} />
              ))}
            </Select>
          </div>
        );
      case 1:
        return (
          <div style={{ maxWidth: 700 }}>
            <TextArea
              id="nl-description"
              labelText="Describe the fields you want to extract"
              placeholder="e.g., I need to extract the invoice number, date, vendor name, line items with description and amount, subtotal, tax, and total amount..."
              value={nlDescription}
              onChange={(e: any) => setNlDescription(e.target.value)}
              rows={6}
              style={{ marginBottom: 16 }}
            />
            {parseError && (
              <InlineNotification
                kind="error"
                title="Parse Error"
                subtitle={parseError}
                style={{ marginBottom: 16 }}
              />
            )}
            <Button
              kind="primary"
              onClick={handleParseSchema}
              disabled={!nlDescription.trim() || parsing}
              renderIcon={parsing ? undefined : ArrowRight}
            >
              {parsing ? 'Analyzing...' : 'Generate Schema'}
            </Button>
            {parsing && <Loading small withOverlay={false} style={{ marginLeft: 16 }} />}
          </div>
        );
      case 2:
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <p style={{ color: '#525252', margin: 0 }}>
                Review and edit the extracted fields. You can add, remove, or modify fields.
              </p>
              {modelInfo && <ModelBadge info={modelInfo} />}
            </div>
            <FieldTuningTable fields={fields} onChange={setFields} />
          </div>
        );
      case 3: {
        const updateRule = (idx: number, updates: Partial<ValidationRule>) => {
          setValidationRules(validationRules.map((r, i) => i === idx ? { ...r, ...updates } : r));
        };
        return (
          <div style={{ maxWidth: 700 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <p style={{ color: '#525252', margin: 0 }}>
                Define validation rules for extracted data. You can edit AI-generated rules or add your own.
              </p>
              {modelInfo && <ModelBadge info={modelInfo} />}
            </div>
            {validationRules.map((rule, i) => (
              <Tile key={i} style={{ marginBottom: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, marginRight: 16 }}>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                      <TextInput
                        id={`rule-name-${i}`}
                        labelText="Rule Name"
                        size="sm"
                        value={rule.name}
                        onChange={(e: any) => updateRule(i, { name: e.target.value })}
                        style={{ flex: 1 }}
                      />
                      <Select
                        id={`rule-type-${i}`}
                        labelText="Type"
                        size="sm"
                        value={rule.rule_type}
                        onChange={(e: any) => updateRule(i, { rule_type: e.target.value })}
                        style={{ width: 150 }}
                      >
                        <SelectItem value="custom" text="Custom" />
                        <SelectItem value="range" text="Range" />
                        <SelectItem value="regex" text="Regex" />
                        <SelectItem value="cross_field" text="Cross-field" />
                      </Select>
                    </div>
                    <TextInput
                      id={`rule-desc-${i}`}
                      labelText="Description"
                      size="sm"
                      placeholder="e.g., Total must equal subtotal + shipping"
                      value={rule.description}
                      onChange={(e: any) => updateRule(i, { description: e.target.value })}
                    />
                  </div>
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() => setValidationRules(validationRules.filter((_, idx) => idx !== i))}
                    style={{ marginTop: 20 }}
                  >
                    Remove
                  </Button>
                </div>
              </Tile>
            ))}
            <Button
              kind="tertiary"
              size="sm"
              onClick={() => setValidationRules([
                ...validationRules,
                { name: '', description: '', rule_type: 'custom', config: {} }
              ])}
              style={{ marginTop: 8 }}
            >
              + Add Rule
            </Button>
          </div>
        );
      }
      case 4: {
        const updateAction = (idx: number, updates: Partial<ActionDefinition>) => {
          setActions(actions.map((a, i) => i === idx ? { ...a, ...updates } : a));
        };
        const updateActionConfig = (idx: number, key: string, value: string) => {
          const action = actions[idx];
          setActions(actions.map((a, i) => i === idx ? { ...a, config: { ...a.config, [key]: value } } : a));
        };
        return (
          <div style={{ maxWidth: 700 }}>
            <p style={{ marginBottom: 16, color: '#525252' }}>
              Configure actions to run after document processing completes.
            </p>
            {actions.map((action, i) => (
              <Tile key={i} style={{ marginBottom: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, marginRight: 16 }}>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                      <TextInput
                        id={`action-name-${i}`}
                        labelText="Action Name"
                        size="sm"
                        placeholder="e.g., Notify Procurement"
                        value={action.name}
                        onChange={(e: any) => updateAction(i, { name: e.target.value })}
                        style={{ flex: 1 }}
                      />
                      <Select
                        id={`action-type-${i}`}
                        labelText="Type"
                        size="sm"
                        value={action.action_type}
                        onChange={(e: any) => updateAction(i, { action_type: e.target.value })}
                        style={{ width: 150 }}
                      >
                        <SelectItem value="webhook" text="Webhook" />
                        <SelectItem value="email" text="Email" />
                        <SelectItem value="api_call" text="API Call" />
                      </Select>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                      <Select
                        id={`action-trigger-${i}`}
                        labelText="Trigger"
                        size="sm"
                        value={action.trigger}
                        onChange={(e: any) => updateAction(i, { trigger: e.target.value })}
                        style={{ width: 200 }}
                      >
                        <SelectItem value="on_complete" text="On Complete" />
                        <SelectItem value="on_validated" text="On Validated" />
                        <SelectItem value="on_error" text="On Error" />
                      </Select>
                      {action.action_type === 'webhook' && (
                        <TextInput
                          id={`action-url-${i}`}
                          labelText="Webhook URL"
                          size="sm"
                          placeholder="https://api.example.com/webhook"
                          value={action.config?.url || ''}
                          onChange={(e: any) => updateActionConfig(i, 'url', e.target.value)}
                          style={{ flex: 1 }}
                        />
                      )}
                      {action.action_type === 'email' && (
                        <TextInput
                          id={`action-to-${i}`}
                          labelText="Recipient Email"
                          size="sm"
                          placeholder="team@example.com"
                          value={action.config?.to || ''}
                          onChange={(e: any) => updateActionConfig(i, 'to', e.target.value)}
                          style={{ flex: 1 }}
                        />
                      )}
                      {action.action_type === 'api_call' && (
                        <TextInput
                          id={`action-endpoint-${i}`}
                          labelText="API Endpoint"
                          size="sm"
                          placeholder="POST /api/v1/procurement"
                          value={action.config?.endpoint || ''}
                          onChange={(e: any) => updateActionConfig(i, 'endpoint', e.target.value)}
                          style={{ flex: 1 }}
                        />
                      )}
                    </div>
                  </div>
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() => setActions(actions.filter((_, idx) => idx !== i))}
                    style={{ marginTop: 20 }}
                  >
                    Remove
                  </Button>
                </div>
              </Tile>
            ))}
            <Button
              kind="tertiary"
              size="sm"
              onClick={() => setActions([
                ...actions,
                { name: '', action_type: 'webhook', config: {}, trigger: 'on_complete' }
              ])}
              style={{ marginTop: 8 }}
            >
              + Add Action
            </Button>
          </div>
        );
      }
      case 5:
        return (
          <div style={{ maxWidth: 700 }}>
            {saved ? (
              <InlineNotification
                kind="success"
                title="Workflow saved!"
                subtitle={`"${name}" has been created successfully.`}
              />
            ) : (
              <>
                <Tile style={{ padding: 24, marginBottom: 16 }}>
                  <h4 style={{ marginBottom: 16 }}>Workflow Summary</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 16px', fontSize: 14 }}>
                    <span style={{ color: '#525252' }}>Name:</span><span>{name}</span>
                    <span style={{ color: '#525252' }}>Description:</span><span>{description || '—'}</span>
                    <span style={{ color: '#525252' }}>Document Type:</span><span>{documentType || '—'}</span>
                    <span style={{ color: '#525252' }}>Fields:</span><span>{fields.length} configured</span>
                    <span style={{ color: '#525252' }}>Validation Rules:</span><span>{validationRules.length} defined</span>
                    <span style={{ color: '#525252' }}>Actions:</span><span>{actions.length} configured</span>
                    {modelInfo && (
                      <>
                        <span style={{ color: '#525252' }}>AI Model:</span>
                        <span><ModelBadge info={modelInfo} /></span>
                      </>
                    )}
                  </div>
                </Tile>
                <Button
                  kind="primary"
                  onClick={handleSave}
                  disabled={saving}
                  renderIcon={Save}
                >
                  {saving ? 'Saving...' : 'Create Workflow'}
                </Button>
              </>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const STEPS = [
    'Basic Info', 'Describe Fields', 'Configure Fields',
    'Validation Rules', 'Actions', 'Review & Save'
  ];

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 300, marginBottom: 8 }}>Workflow Builder</h1>
          <p style={{ color: '#525252' }}>Create a new document processing workflow</p>
        </div>
        <Select
          id="wf-model-select"
          labelText="AI Model"
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
      </div>

      <ProgressIndicator currentIndex={currentStep} style={{ marginBottom: 40 }}>
        {STEPS.map((label, i) => (
          <ProgressStep key={i} label={label} />
        ))}
      </ProgressIndicator>

      <div style={{ minHeight: 300, marginBottom: 32 }}>
        {renderStep()}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        {currentStep > 0 && (
          <Button kind="secondary" renderIcon={ArrowLeft} onClick={() => setCurrentStep(currentStep - 1)}>
            Back
          </Button>
        )}
        {currentStep < 5 && currentStep !== 1 && (
          <Button
            kind="primary"
            renderIcon={ArrowRight}
            disabled={!canProceed()}
            onClick={() => setCurrentStep(currentStep + 1)}
          >
            Next
          </Button>
        )}
      </div>
    </div>
  );
};

export default WorkflowBuilderPage;
