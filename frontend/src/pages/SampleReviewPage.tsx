import React, { useState, useEffect } from 'react';
import {
  Tile,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Tag,
  Button,
  TextInput,
  Select,
  SelectItem,
  InlineNotification,
} from '@carbon/react';
import { Checkmark, Close, Edit, Save } from '@carbon/icons-react';
import api from '../services/api';

interface ExtractedField {
  name: string;
  value: string;
  confidence: 'high' | 'medium' | 'low';
  raw_text: string;
  corrected_value?: string;
}

interface SampleResult {
  document_id: string;
  file_name: string;
  status: string;
  fields: Record<string, ExtractedField>;
  processing_time_ms: number;
}

const SampleReviewPage: React.FC = () => {
  const [documents, setDocuments] = useState<Array<{ id: string; file_name: string; status: string }>>([]);
  const [selectedDoc, setSelectedDoc] = useState<string>('');
  const [result, setResult] = useState<SampleResult | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const res = await api.get('/documents/list');
      setDocuments((res.data || []).map((d: any) => ({
        id: d.document_id,
        file_name: d.file_name || d.document_id,
        status: d.status,
      })));
    } catch (err) {
      // handle error
    }
  };

  const loadResults = async (docId: string) => {
    try {
      const res = await api.get(`/documents/results/${docId}`);
      setResult(res.data);
      setCorrections({});
      setSaved(false);
    } catch (err) {
      // handle error
    }
  };

  const handleSelectDoc = (docId: string) => {
    setSelectedDoc(docId);
    if (docId) loadResults(docId);
  };

  const handleStartEdit = (fieldName: string, currentValue: string) => {
    setEditingField(fieldName);
    setEditValue(corrections[fieldName] || currentValue);
  };

  const handleSaveEdit = (fieldName: string) => {
    setCorrections({ ...corrections, [fieldName]: editValue });
    setEditingField(null);
  };

  const handleSubmitCorrections = async () => {
    if (!result) return;
    try {
      await api.post(`/documents/corrections/${result.document_id}`, { corrections });
      setSaved(true);
    } catch (err) {
      // handle silently for now
    }
  };

  const confidenceColor = (c: string) => {
    switch (c) {
      case 'high': return 'green';
      case 'medium': return 'blue';
      case 'low': return 'red';
      default: return 'gray';
    }
  };

  const fieldEntries = result ? Object.entries(result.fields) : [];

  const headers = [
    { key: 'field', header: 'Field' },
    { key: 'value', header: 'Extracted Value' },
    { key: 'corrected', header: 'Corrected Value' },
    { key: 'confidence', header: 'Confidence' },
    { key: 'actions', header: '' },
  ];

  const rows = fieldEntries.map(([key, field]) => ({
    id: key,
    field: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    value: field.value,
    corrected: corrections[key] || '',
    confidence: field.confidence,
    actions: '',
  }));

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 28, fontWeight: 300, marginBottom: 8 }}>Sample Review</h1>
      <p style={{ color: '#525252', marginBottom: 24 }}>Review extraction results and provide corrections</p>

      <Select
        id="doc-select"
        labelText="Select Document"
        value={selectedDoc}
        onChange={(e: any) => handleSelectDoc(e.target.value)}
        style={{ maxWidth: 400, marginBottom: 24 }}
      >
        <SelectItem value="" text="Choose a document..." />
        {documents.map(doc => (
          <SelectItem key={doc.id} value={doc.id} text={`${doc.file_name} (${doc.status})`} />
        ))}
      </Select>

      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Left: Document Preview */}
          <Tile style={{ padding: 24, minHeight: 500 }}>
            <h4 style={{ marginBottom: 16 }}>Document Preview</h4>
            <div style={{
              background: '#f4f4f4', borderRadius: 4, padding: 24,
              minHeight: 400, fontFamily: 'monospace', fontSize: 13,
              whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#161616',
              border: '1px solid #e0e0e0'
            }}>
              {fieldEntries.map(([key, field]) => (
                <div key={key} style={{ marginBottom: 8 }}>
                  <span style={{ color: '#0043ce', cursor: 'pointer' }}
                    onClick={() => handleStartEdit(key, field.value)}
                  >
                    {field.raw_text}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: '#525252' }}>
              Processing time: {result.processing_time_ms.toFixed(0)}ms
            </div>
          </Tile>

          {/* Right: Extracted Data */}
          <div>
            {saved && (
              <InlineNotification
                kind="success"
                title="Corrections saved"
                subtitle="Your corrections will be used to improve future extractions."
                style={{ marginBottom: 16 }}
              />
            )}
            <DataTable rows={rows} headers={headers}>
              {({ rows: tableRows, headers: tableHeaders, getTableProps, getHeaderProps, getRowProps }: any) => (
                <TableContainer title="Extracted Fields">
                  <Table {...getTableProps()} size="lg">
                    <TableHead>
                      <TableRow>
                        {tableHeaders.map((header: any) => (
                          <TableHeader key={header.key} {...getHeaderProps({ header })}>
                            {header.header}
                          </TableHeader>
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
                              ) : cell.info.header === 'actions' ? (
                                editingField === row.id ? (
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <Button kind="ghost" size="sm" hasIconOnly iconDescription="Save" renderIcon={Checkmark}
                                      onClick={() => handleSaveEdit(row.id)} />
                                    <Button kind="ghost" size="sm" hasIconOnly iconDescription="Cancel" renderIcon={Close}
                                      onClick={() => setEditingField(null)} />
                                  </div>
                                ) : (
                                  <Button kind="ghost" size="sm" hasIconOnly iconDescription="Edit" renderIcon={Edit}
                                    onClick={() => handleStartEdit(row.id, row.cells[1]?.value || '')} />
                                )
                              ) : cell.info.header === 'corrected' && editingField === row.id ? (
                                <TextInput
                                  id={`edit-${row.id}`}
                                  size="sm"
                                  labelText=""
                                  hideLabel
                                  value={editValue}
                                  onChange={(e: any) => setEditValue(e.target.value)}
                                  autoFocus
                                />
                              ) : cell.info.header === 'corrected' && corrections[row.id] ? (
                                <span style={{ color: '#0043ce', fontWeight: 500 }}>{cell.value}</span>
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

            {Object.keys(corrections).length > 0 && !saved && (
              <Button
                kind="primary"
                renderIcon={Save}
                onClick={handleSubmitCorrections}
                style={{ marginTop: 16 }}
              >
                Submit {Object.keys(corrections).length} Correction{Object.keys(corrections).length > 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SampleReviewPage;
