import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Tile,
  Tag,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Loading,
  Breadcrumb,
  BreadcrumbItem,
  InlineNotification,
} from '@carbon/react';
import api from '../services/api';

interface ExtractedField {
  value: string;
  confidence: string;
  raw_text: string;
}

interface ActionLogEntry {
  action_type: string;
  status: string;
  action_config?: Record<string, any>;
  result?: Record<string, any>;
  error_message?: string;
  created_at?: string;
}

interface SignatureArtifact {
  page_number: number;
  bbox?: number[] | null;
  confidence: number;
  thumbnail_base64?: string | null;
}

interface HandwrittenArtifact {
  page_number: number;
  label?: string | null;
  value?: string | null;
  bbox?: number[] | null;
  thumbnail_base64?: string | null;
}

interface ValidationResult {
  rule: string;
  description: string;
  passed: boolean;
  severity: string;
  detail: string;
}

interface GraniteMetadata {
  page_count: number;
  signature_count: number;
  handwritten_field_count: number;
  headings: string[];
  signatures: SignatureArtifact[];
  handwritten_fields: HandwrittenArtifact[];
  markdown: string;
}

interface DocumentMetadata {
  ocr_engine?: string;
  model_used?: string;
  review_status?: 'approved' | 'rejected' | string;
  rejected_reasons?: string[];
  validation_results?: ValidationResult[];
  granite?: GraniteMetadata;
}

interface DocumentResult {
  document_id: string;
  file_name: string;
  status: string;
  fields: Record<string, ExtractedField>;
  processing_time_ms: number;
  error_message?: string;
  action_logs?: ActionLogEntry[];
  ocr_engine?: string;
  metadata?: DocumentMetadata | null;
}

const DocumentDetailPage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const [result, setResult] = useState<DocumentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDocument();
  }, [documentId]);

  const loadDocument = async () => {
    try {
      const res = await api.get(`/documents/results/${documentId}`);
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  const confidenceColor = (c: string): any => {
    if (c === 'high') return 'green';
    if (c === 'medium') return 'blue';
    if (c === 'low') return 'red';
    const num = parseInt(c);
    if (!isNaN(num)) {
      if (num >= 90) return 'green';
      if (num >= 70) return 'blue';
      return 'red';
    }
    return 'gray';
  };

  const statusColor = (s: string): any => {
    switch (s) {
      case 'completed': return 'green';
      case 'processing': return 'blue';
      case 'failed': return 'red';
      default: return 'gray';
    }
  };

  const actionStatusColor = (s: string): any => {
    switch (s) {
      case 'completed': return 'green';
      case 'sent': return 'green';
      case 'pending': return 'blue';
      case 'failed': return 'red';
      default: return 'gray';
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', paddingTop: 100 }}>
        <Loading withOverlay={false} />
      </div>
    );
  }

  if (error || !result) {
    return (
      <div style={{ padding: 32 }}>
        <Breadcrumb style={{ marginBottom: 16 }}>
          <BreadcrumbItem onClick={() => navigate('/repository')} style={{ cursor: 'pointer' }}>
            Repository
          </BreadcrumbItem>
          <BreadcrumbItem isCurrentPage>Document</BreadcrumbItem>
        </Breadcrumb>
        <Tile style={{ padding: 32, textAlign: 'center' as const }}>
          <p style={{ color: '#da1e28' }}>{error || 'Document not found'}</p>
        </Tile>
      </div>
    );
  }

  const fieldEntries = Object.entries(result.fields);
  const actionLogs = result.action_logs || [];

  const headers = [
    { key: 'field', header: 'Field' },
    { key: 'value', header: 'Extracted Value' },
    { key: 'confidence', header: 'Confidence' },
  ];

  const formatConfidence = (c: string | number) => {
    const num = typeof c === 'number' ? c : parseFloat(c);
    if (isNaN(num)) return c;
    return num <= 1 ? `${Math.round(num * 100)}%` : `${Math.round(num)}%`;
  };

  const rows = fieldEntries.map(([key, field]) => ({
    id: key,
    field: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    value: field.value,
    confidence: formatConfidence(field.confidence),
  }));

  return (
    <div style={{ padding: 32 }}>
      <Breadcrumb style={{ marginBottom: 16 }}>
        <BreadcrumbItem onClick={() => navigate('/repository')} style={{ cursor: 'pointer' }}>
          Repository
        </BreadcrumbItem>
        <BreadcrumbItem isCurrentPage>{result.file_name}</BreadcrumbItem>
      </Breadcrumb>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 300, marginBottom: 8 }}>{result.file_name}</h1>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Tag type={statusColor(result.status)} size="sm">{result.status}</Tag>
            <span style={{ color: '#525252', fontSize: 13 }}>
              {fieldEntries.length} extracted field{fieldEntries.length !== 1 ? 's' : ''}
            </span>
            {result.processing_time_ms > 0 && (
              <span style={{ color: '#525252', fontSize: 13 }}>
                Processing: {result.processing_time_ms.toFixed(0)}ms
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error banner for failed documents */}
      {result.status === 'failed' && result.error_message && (
        <InlineNotification
          kind="error"
          title="Processing Failed"
          subtitle={result.error_message}
          lowContrast
          hideCloseButton
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Form Review Panel — only shown when granite-docling produced metadata
          (e.g. for Security Guard Attendance and similar form workflows) */}
      {result.metadata?.granite && (
        <div style={{ marginBottom: 24 }}>
          {/* Approve/Reject status banner */}
          {result.metadata.review_status === 'rejected' ? (
            <InlineNotification
              kind="error"
              title="Form REJECTED"
              subtitle={
                (result.metadata.rejected_reasons || []).join(' · ') ||
                'One or more rejection-severity rules failed.'
              }
              lowContrast
              hideCloseButton
              style={{ marginBottom: 16, maxWidth: '100%' }}
            />
          ) : result.metadata.review_status === 'approved' ? (
            <InlineNotification
              kind="success"
              title="Form APPROVED"
              subtitle={
                `Signature detected · ${result.metadata.granite.handwritten_field_count} handwritten fields · ` +
                `extracted with ${result.metadata.ocr_engine || 'granite-docling'}`
              }
              lowContrast
              hideCloseButton
              style={{ marginBottom: 16, maxWidth: '100%' }}
            />
          ) : null}

          {/* Element-count cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Pages', value: result.metadata.granite.page_count, color: '#0F62FE' },
              { label: 'Signatures', value: result.metadata.granite.signature_count, color: '#8a3ffc' },
              { label: 'Handwritten fields', value: result.metadata.granite.handwritten_field_count, color: '#ff832b' },
              { label: 'Headings', value: result.metadata.granite.headings.length, color: '#525252' },
            ].map((c) => (
              <Tile key={c.label} style={{ padding: 16 }}>
                <div style={{ fontSize: 12, color: '#525252', marginBottom: 6 }}>{c.label}</div>
                <div style={{ fontSize: 28, fontWeight: 300, color: c.color }}>{c.value}</div>
              </Tile>
            ))}
          </div>

          {/* Validation rule results */}
          {result.metadata.validation_results && result.metadata.validation_results.length > 0 && (
            <Tile style={{ padding: 16, marginBottom: 16 }}>
              <h4 style={{ fontWeight: 400, marginBottom: 12 }}>Validation</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {result.metadata.validation_results.map((v, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', borderBottom: '1px solid #f4f4f4' }}>
                    <Tag
                      type={v.passed ? 'green' : v.severity === 'rejection' ? 'red' : 'warm-gray'}
                      size="sm"
                    >
                      {v.passed ? 'PASS' : v.severity === 'rejection' ? 'REJECT' : 'FAIL'}
                    </Tag>
                    <div style={{ flex: 1, fontSize: 13 }}>
                      <div style={{ fontWeight: 500 }}>{v.rule}</div>
                      <div style={{ color: '#525252' }}>{v.description}</div>
                      <div style={{ color: '#6f6f6f', fontFamily: 'monospace', fontSize: 11, marginTop: 2 }}>
                        {v.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Tile>
          )}

          {/* Side-by-side: Signatures + Handwritten fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Signatures */}
            <Tile style={{ padding: 16 }}>
              <h4 style={{ fontWeight: 400, marginBottom: 12 }}>
                Signatures ({result.metadata.granite.signature_count})
              </h4>
              {result.metadata.granite.signatures.length === 0 ? (
                <p style={{ color: '#6f6f6f', fontSize: 13 }}>No signatures detected on this form.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                  {result.metadata.granite.signatures.map((s, i) => (
                    <div key={i} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 4, padding: 8 }}>
                      {s.thumbnail_base64 ? (
                        <img
                          src={`data:image/png;base64,${s.thumbnail_base64}`}
                          alt={`Signature ${i + 1}`}
                          style={{ width: '100%', borderRadius: 2, marginBottom: 6 }}
                        />
                      ) : (
                        <div style={{ height: 70, background: '#f4f4f4', borderRadius: 2, marginBottom: 6 }} />
                      )}
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <Tag size="sm" type="purple">#{i + 1}</Tag>
                        <Tag size="sm" type="cool-gray">P {s.page_number}</Tag>
                        <Tag size="sm" type={s.confidence > 0.8 ? 'green' : 'warm-gray'}>
                          {(s.confidence * 100).toFixed(0)}%
                        </Tag>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Tile>

            {/* Handwritten fields */}
            <Tile style={{ padding: 16 }}>
              <h4 style={{ fontWeight: 400, marginBottom: 12 }}>
                Handwritten fields ({result.metadata.granite.handwritten_field_count})
              </h4>
              {result.metadata.granite.handwritten_fields.length === 0 ? (
                <p style={{ color: '#6f6f6f', fontSize: 13 }}>No handwritten content detected.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                  {result.metadata.granite.handwritten_fields.map((h, i) => (
                    <div key={i} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 4, padding: 8 }}>
                      {h.thumbnail_base64 ? (
                        <img
                          src={`data:image/png;base64,${h.thumbnail_base64}`}
                          alt={`Handwritten ${i + 1}`}
                          style={{ width: '100%', borderRadius: 2, marginBottom: 6, border: '1px solid #f4f4f4' }}
                        />
                      ) : (
                        <div style={{ height: 50, background: '#f4f4f4', borderRadius: 2, marginBottom: 6 }} />
                      )}
                      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                        <Tag size="sm" type="magenta">Handwritten</Tag>
                        <Tag size="sm" type="cool-gray">P {h.page_number}</Tag>
                      </div>
                      {h.label && (
                        <div style={{ fontSize: 11, color: '#525252' }}>
                          <strong>{h.label}</strong>
                        </div>
                      )}
                      <div style={{ fontSize: 13, color: '#161616', wordBreak: 'break-word', marginTop: 2 }}>
                        {h.value || <span style={{ color: '#a8a8a8' }}>—</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Tile>
          </div>

          {/* Form text (markdown) */}
          {result.metadata.granite.markdown && (
            <Tile style={{ padding: 16, marginTop: 16 }}>
              <h4 style={{ fontWeight: 400, marginBottom: 12 }}>Extracted form text</h4>
              <pre style={{
                whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12,
                background: '#f4f4f4', padding: 12, borderRadius: 4, margin: 0,
                maxHeight: 400, overflow: 'auto',
              }}>
                {result.metadata.granite.markdown}
              </pre>
            </Tile>
          )}
        </div>
      )}

      {/* Split view */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Left: OCR text preview or error details */}
        <Tile style={{ padding: 24, minHeight: 400 }}>
          <h4 style={{ marginBottom: 16, fontWeight: 400 }}>Document Preview</h4>
          <div style={{
            background: '#f4f4f4', borderRadius: 4, padding: 24,
            minHeight: 350, fontFamily: 'monospace', fontSize: 13,
            whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#161616',
            border: '1px solid #e0e0e0',
          }}>
            {fieldEntries.length > 0 ? (
              fieldEntries.map(([key, field]) => (
                <div key={key} style={{ marginBottom: 8 }}>
                  <span style={{ color: '#6f6f6f' }}>{key}: </span>
                  <span style={{ color: '#0043ce' }}>{field.raw_text || field.value}</span>
                </div>
              ))
            ) : result.status === 'failed' ? (
              <div style={{ color: '#da1e28' }}>
                <div style={{ fontWeight: 500, marginBottom: 12 }}>Error Details</div>
                <div>{result.error_message || 'Document processing failed. No data was extracted.'}</div>
              </div>
            ) : (
              <div style={{ color: '#6f6f6f' }}>No extracted text available.</div>
            )}
          </div>
        </Tile>

        {/* Right: Extracted fields table or action log */}
        <div>
          {fieldEntries.length > 0 ? (
            <DataTable rows={rows} headers={headers}>
              {({ rows: tableRows, headers: tableHeaders, getTableProps, getHeaderProps, getRowProps }: any) => (
                <TableContainer title="Extracted Fields">
                  <Table {...getTableProps()} size="lg">
                    <TableHead>
                      <TableRow>
                        {tableHeaders.map((h: any) => (
                          <TableHeader key={h.key} {...getHeaderProps({ header: h })}>{h.header}</TableHeader>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tableRows.map((row: any) => (
                        <TableRow key={row.id} {...getRowProps({ row })}>
                          {row.cells.map((cell: any) => (
                            <TableCell key={cell.id}>
                              {cell.info.header === 'confidence' ? (
                                <Tag type={confidenceColor(cell.value)} size="sm">{cell.value}</Tag>
                              ) : (
                                cell.value
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DataTable>
          ) : result.status === 'failed' ? (
            <Tile style={{ padding: 24 }}>
              <h4 style={{ marginBottom: 16, fontWeight: 400 }}>No Extracted Fields</h4>
              <p style={{ color: '#525252', fontSize: 14 }}>
                This document failed processing and no fields were extracted.
              </p>
            </Tile>
          ) : (
            <Tile style={{ padding: 24 }}>
              <h4 style={{ marginBottom: 16, fontWeight: 400 }}>No Extracted Fields</h4>
              <p style={{ color: '#525252', fontSize: 14 }}>No fields have been extracted yet.</p>
            </Tile>
          )}

          {/* Action Log */}
          {actionLogs.length > 0 && (
            <Tile style={{ padding: 24, marginTop: 24 }}>
              <h4 style={{ marginBottom: 16, fontWeight: 400 }}>Action Log</h4>
              {actionLogs.map((log, idx) => (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 0',
                  borderBottom: idx < actionLogs.length - 1 ? '1px solid #e0e0e0' : 'none',
                }}>
                  <Tag type={actionStatusColor(log.status)} size="sm">{log.status}</Tag>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>
                    {log.action_type === 'email' ? 'Email notification' :
                     log.action_type === 'webhook' ? 'Webhook' : log.action_type}
                  </span>
                  {log.action_config?.to && (
                    <span style={{ color: '#525252', fontSize: 13 }}>
                      to {log.action_config.to}
                    </span>
                  )}
                  {log.result?.reference && (
                    <span style={{ color: '#0043ce', fontSize: 13 }}>
                      Ref: {log.result.reference}
                    </span>
                  )}
                </div>
              ))}
            </Tile>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentDetailPage;
