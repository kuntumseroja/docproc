import React, { useEffect, useState, useCallback } from 'react';
import {
  Tile,
  Button,
  Tag,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  InlineNotification,
  ProgressBar,
  Loading,
  CodeSnippet,
} from '@carbon/react';
import {
  Document,
  Image,
  Table,
  Edit,
  CheckmarkOutline,
  Warning,
  Ai,
  Catalog,
} from '@carbon/icons-react';
import FileUploaderDropContainer from '../components/FileUploaderDropContainer';
import api from '../services/api';

// ── Types ──────────────────────────────────────────────────────

interface ElementCounts {
  tables: number;
  images: number;
  form_fields: number;
  signatures: number;
  headings: number;
}

interface TableEl {
  page_number: number;
  rows: string[][];
  bbox?: number[] | null;
  caption?: string | null;
  thumbnail_base64?: string | null;
}

interface ImageEl {
  page_number: number;
  bbox?: number[] | null;
  caption?: string | null;
  thumbnail_base64?: string | null;
}

interface FormFieldEl {
  page_number: number;
  label?: string | null;
  value?: string | null;
  is_handwritten: boolean;
  bbox?: number[] | null;
  thumbnail_base64?: string | null;
}

interface SignatureEl {
  page_number: number;
  bbox?: number[] | null;
  confidence: number;
  thumbnail_base64?: string | null;
}

interface OCRLabResult {
  status: string;
  markdown: string;
  plain_text: string;
  page_count: number;
  tables: TableEl[];
  images: ImageEl[];
  form_fields: FormFieldEl[];
  signatures: SignatureEl[];
  headings: string[];
  element_counts: ElementCounts;
  metadata: Record<string, unknown>;
  processing_time_ms: number;
  error_message?: string | null;
  file_name?: string;
  file_size?: number;
}

interface EngineStatus {
  available: boolean;
  model: string;
  engine: string;
  install_hint: string;
  docling_version?: string;
}

interface SampleSuggestion {
  id: string;
  title: string;
  description: string;
  good_for: string;
}

// ── Component ──────────────────────────────────────────────────

const OCRLabPage: React.FC = () => {
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [samples, setSamples] = useState<SampleSuggestion[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<OCRLabResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [statusRes, samplesRes] = await Promise.all([
          api.get('/ocr-lab/status'),
          api.get('/ocr-lab/samples'),
        ]);
        setEngineStatus(statusRes.data);
        setSamples(samplesRes.data?.samples || []);
      } catch (e) {
        setError('Failed to load OCR Lab status');
      }
    })();
  }, []);

  const handleFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setFile(files[0]);
    setResult(null);
    setError(null);
  }, []);

  const runOCR = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setProgress(15);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    // Fake progress while waiting on the model (real time depends on file size)
    const tick = setInterval(() => {
      setProgress((p) => (p < 90 ? p + 5 : p));
    }, 800);

    try {
      const res = await api.post('/ocr-lab/process', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000,
      });
      setProgress(100);
      setResult(res.data);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (detail?.code === 'engine_not_installed') {
        setError(
          `Granite-Docling is not installed. Run on the backend host: \n\n${detail.message}`
        );
      } else if (typeof detail === 'string') {
        setError(detail);
      } else if (detail?.message) {
        setError(detail.message);
      } else {
        setError(e?.message || 'OCR processing failed');
      }
    } finally {
      clearInterval(tick);
      setProcessing(false);
    }
  }, [file]);

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setProgress(0);
  };

  // ── Render helpers ──────────────────────────────────────────

  const renderInstallBanner = () => {
    if (!engineStatus) return null;
    if (engineStatus.available) return null;
    return (
      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title="Granite-Docling not installed"
        subtitle={
          'This is an experimental engine. Install on the backend host: ' +
          '`pip install -r backend/requirements-granite.txt`. You can still ' +
          'browse this page; uploads will be disabled until the engine is available.'
        }
        style={{ maxWidth: '100%', marginBottom: 24 }}
      />
    );
  };

  const renderUpload = () => (
    <Tile style={{ padding: 24, marginBottom: 24 }}>
      <h3 style={{ fontWeight: 400, marginBottom: 8 }}>Upload a document</h3>
      <p style={{ color: '#525252', marginBottom: 16, fontSize: 14 }}>
        Supported: PDF, PNG, JPG, TIFF, WebP. Nothing is saved to the database
        — this is a preview-only sandbox.
      </p>
      <FileUploaderDropContainer onFilesSelected={handleFiles} />
      {file && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Document size={18} />
            <span style={{ fontWeight: 400 }}>{file.name}</span>
            <span style={{ color: '#6f6f6f', fontSize: 12 }}>
              {(file.size / 1024).toFixed(1)} KB
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button kind="ghost" size="sm" onClick={reset}>Reset</Button>
            <Button
              kind="primary"
              size="sm"
              onClick={runOCR}
              disabled={processing || !engineStatus?.available}
              renderIcon={Ai}
            >
              {processing ? 'Processing…' : 'Run granite-docling'}
            </Button>
          </div>
        </div>
      )}
      {processing && (
        <div style={{ marginTop: 16 }}>
          <ProgressBar
            label={`Running multimodal OCR — ${progress}%`}
            value={progress}
            max={100}
          />
        </div>
      )}
      {error && (
        <InlineNotification
          kind="error"
          lowContrast
          title="Processing failed"
          subtitle={error || ''}
          style={{ marginTop: 16, maxWidth: '100%' }}
        />
      )}
    </Tile>
  );

  const renderOverview = () => {
    if (!result) return null;
    const counts = result.element_counts;
    const cards = [
      { label: 'Pages', value: result.page_count, icon: Document, color: '#0F62FE' },
      { label: 'Tables', value: counts.tables, icon: Table, color: '#8a3ffc' },
      { label: 'Images', value: counts.images, icon: Image, color: '#24a148' },
      { label: 'Form fields', value: counts.form_fields, icon: Edit, color: '#ff832b' },
      { label: 'Signatures', value: counts.signatures, icon: CheckmarkOutline, color: '#fa4d56' },
      { label: 'Headings', value: counts.headings, icon: Catalog, color: '#525252' },
    ];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        {cards.map((c) => (
          <Tile key={c.label} style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <c.icon size={16} style={{ color: c.color }} />
              <span style={{ fontSize: 12, color: '#525252' }}>{c.label}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 300 }}>{c.value}</div>
          </Tile>
        ))}
      </div>
    );
  };

  const renderTables = () => {
    if (!result || result.tables.length === 0) {
      return <p style={{ color: '#6f6f6f', padding: 16 }}>No tables detected.</p>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {result.tables.map((t, i) => (
          <Tile key={i} style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong>Table #{i + 1}</strong>
              <Tag size="sm">Page {t.page_number}</Tag>
            </div>
            {t.caption && <p style={{ color: '#6f6f6f', fontStyle: 'italic', marginBottom: 8 }}>{t.caption}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: t.thumbnail_base64 ? 'minmax(0, 1fr) 280px' : '1fr', gap: 16, alignItems: 'start' }}>
              <div style={{ overflow: 'auto', minWidth: 0 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                  <tbody>
                    {t.rows.map((row, ri) => (
                      <tr key={ri} style={{ background: ri === 0 ? '#f4f4f4' : 'transparent' }}>
                        {row.map((cell, ci) => (
                          <td key={ci} style={{ border: '1px solid #e0e0e0', padding: '6px 10px' }}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {t.thumbnail_base64 && (
                <div>
                  <div style={{ fontSize: 11, color: '#6f6f6f', marginBottom: 4 }}>Source crop</div>
                  <img
                    src={`data:image/png;base64,${t.thumbnail_base64}`}
                    alt={`Table ${i + 1} crop`}
                    style={{ width: '100%', borderRadius: 4, border: '1px solid #e0e0e0' }}
                  />
                </div>
              )}
            </div>
          </Tile>
        ))}
      </div>
    );
  };

  const renderImages = () => {
    if (!result || result.images.length === 0) {
      return <p style={{ color: '#6f6f6f', padding: 16 }}>No embedded images detected.</p>;
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {result.images.map((im, i) => (
          <Tile key={i} style={{ padding: 12 }}>
            {im.thumbnail_base64 ? (
              <img
                src={`data:image/png;base64,${im.thumbnail_base64}`}
                alt={im.caption || `Image ${i + 1}`}
                style={{ width: '100%', borderRadius: 4, marginBottom: 8 }}
              />
            ) : (
              <div style={{ height: 120, background: '#f4f4f4', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <Image size={32} style={{ color: '#a8a8a8' }} />
              </div>
            )}
            <div style={{ fontSize: 11, color: '#525252' }}>
              <div>Page {im.page_number}</div>
              {im.caption && <div style={{ marginTop: 2 }}>{im.caption}</div>}
            </div>
          </Tile>
        ))}
      </div>
    );
  };

  const renderFormFields = () => {
    if (!result || result.form_fields.length === 0) {
      return <p style={{ color: '#6f6f6f', padding: 16 }}>No form fields detected.</p>;
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {result.form_fields.map((f, i) => (
          <Tile key={i} style={{ padding: 12 }}>
            {f.thumbnail_base64 ? (
              <img
                src={`data:image/png;base64,${f.thumbnail_base64}`}
                alt={`Form field ${i + 1}`}
                style={{ width: '100%', borderRadius: 4, marginBottom: 8, border: '1px solid #e0e0e0' }}
              />
            ) : (
              <div style={{ height: 80, background: '#f4f4f4', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <Edit size={20} style={{ color: '#a8a8a8' }} />
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
              <Tag type={f.is_handwritten ? 'magenta' : 'blue'} size="sm">
                {f.is_handwritten ? 'Handwritten' : 'Printed'}
              </Tag>
              <Tag type="cool-gray" size="sm">Page {f.page_number}</Tag>
            </div>
            {f.label && (
              <div style={{ fontSize: 11, color: '#525252', marginBottom: 2 }}>
                <strong>Label:</strong> {f.label}
              </div>
            )}
            <div style={{ fontSize: 13, color: '#161616', wordBreak: 'break-word' }}>
              {f.value || <span style={{ color: '#a8a8a8' }}>—</span>}
            </div>
          </Tile>
        ))}
      </div>
    );
  };

  const renderSignatures = () => {
    if (!result || result.signatures.length === 0) {
      return <p style={{ color: '#6f6f6f', padding: 16 }}>No signatures detected.</p>;
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {result.signatures.map((s, i) => (
          <Tile key={i} style={{ padding: 12 }}>
            {s.thumbnail_base64 ? (
              <img
                src={`data:image/png;base64,${s.thumbnail_base64}`}
                alt={`Signature ${i + 1}`}
                style={{ width: '100%', borderRadius: 4, marginBottom: 8, border: '1px solid #e0e0e0', background: '#fff' }}
              />
            ) : (
              <div style={{ height: 100, background: '#f4f4f4', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <CheckmarkOutline size={28} style={{ color: '#a8a8a8' }} />
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
              <Tag type="purple" size="sm">Signature #{i + 1}</Tag>
              <Tag type="cool-gray" size="sm">Page {s.page_number}</Tag>
              <Tag type={s.confidence > 0.8 ? 'green' : 'warm-gray'} size="sm">
                {(s.confidence * 100).toFixed(0)}% conf
              </Tag>
            </div>
            {s.bbox && (
              <div style={{ fontSize: 10, color: '#6f6f6f', fontFamily: 'monospace' }}>
                bbox: [{s.bbox.map((n) => n.toFixed(0)).join(', ')}]
              </div>
            )}
          </Tile>
        ))}
      </div>
    );
  };

  const renderResult = () => {
    if (!result) return null;
    return (
      <Tile style={{ padding: 0, marginBottom: 24 }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontWeight: 400, marginBottom: 4 }}>Extraction result</h3>
            <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#525252' }}>
              <span>{result.file_name}</span>
              <span>•</span>
              <span>{(result.processing_time_ms / 1000).toFixed(2)}s</span>
              <span>•</span>
              <span>granite-docling-258M</span>
            </div>
          </div>
          <Tag type={result.status === 'success' ? 'green' : 'red'} size="sm">
            {result.status}
          </Tag>
        </div>
        <div style={{ padding: 24 }}>
          {renderOverview()}

          <Tabs>
            <TabList aria-label="Result sections">
              <Tab>Markdown</Tab>
              <Tab>Tables ({result.element_counts.tables})</Tab>
              <Tab>Images ({result.element_counts.images})</Tab>
              <Tab>Form fields ({result.element_counts.form_fields})</Tab>
              <Tab>Signatures ({result.element_counts.signatures})</Tab>
              <Tab>Headings ({result.element_counts.headings})</Tab>
            </TabList>
            <TabPanels>
              <TabPanel>
                <CodeSnippet type="multi" wrapText feedback="Copied!" maxCollapsedNumberOfRows={20}>
                  {result.markdown || result.plain_text || '(no text)'}
                </CodeSnippet>
              </TabPanel>
              <TabPanel>{renderTables()}</TabPanel>
              <TabPanel>{renderImages()}</TabPanel>
              <TabPanel>{renderFormFields()}</TabPanel>
              <TabPanel>{renderSignatures()}</TabPanel>
              <TabPanel>
                {result.headings.length === 0 ? (
                  <p style={{ color: '#6f6f6f', padding: 16 }}>No headings detected.</p>
                ) : (
                  <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
                    {result.headings.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                )}
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      </Tile>
    );
  };

  const renderSamples = () => {
    if (samples.length === 0) return null;
    return (
      <Tile style={{ padding: 24 }}>
        <h3 style={{ fontWeight: 400, marginBottom: 4 }}>What to test</h3>
        <p style={{ color: '#525252', marginBottom: 16, fontSize: 14 }}>
          Try documents that exercise different multimodal capabilities:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {samples.map((s) => (
            <Tile key={s.id} style={{ padding: 16, background: '#f4f4f4' }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>{s.title}</div>
              <p style={{ fontSize: 12, color: '#525252', marginBottom: 8, fontWeight: 300, lineHeight: 1.5 }}>
                {s.description}
              </p>
              <Tag size="sm" type="cool-gray">{s.good_for}</Tag>
            </Tile>
          ))}
        </div>
      </Tile>
    );
  };

  // ── Render ──────────────────────────────────────────────────

  if (!engineStatus) {
    return (
      <div style={{ padding: 32, textAlign: 'center' as const }}>
        <Loading withOverlay={false} />
      </div>
    );
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 300 }}>OCR Lab</h1>
        <Tag type="warm-gray" size="sm">Beta</Tag>
        <Tag type={engineStatus.available ? 'green' : 'red'} size="sm">
          {engineStatus.available ? 'granite-docling ready' : 'engine not installed'}
        </Tag>
      </div>
      <p style={{ color: '#525252', marginBottom: 24, fontWeight: 300 }}>
        Test multimodal document understanding powered by IBM granite-docling-258M.
        Tables, signatures, handwritten form fields, and embedded images are
        extracted as structured elements alongside the body text. Tesseract
        and Mistral OCR remain the default engines for production documents.
      </p>

      {renderInstallBanner()}
      {renderUpload()}
      {renderResult()}
      {!result && renderSamples()}
    </div>
  );
};

export default OCRLabPage;
