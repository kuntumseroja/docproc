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
  ProgressBar,
} from '@carbon/react';
import { Checkmark, Close, Edit, Save, ChartRadar, SkillLevelAdvanced } from '@carbon/icons-react';
import api from '../services/api';

interface ExtractedField {
  name: string;
  value: string;
  confidence: number | string;
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

interface RoleOption {
  id: string;
  title: string;
  department: string;
  min_experience: number;
}

interface SkillFactor {
  score: number;
  weight: number;
  matched?: string[];
  missing?: string[];
  candidate?: number;
  required?: number;
  level?: string;
  major?: string;
  major_match?: boolean;
  matched_required?: string[];
  missing_required?: string[];
  matched_preferred?: string[];
  candidate_certs?: string[];
}

interface SkillFitResult {
  overall_score: number;
  fit_level: string;
  fit_color: string;
  recommendation: string;
  candidate_name: string;
  target_role: string;
  salary_band: { min: number; max: number; currency: string };
  factors: Record<string, SkillFactor>;
  available_roles: Record<string, string>;
}

const SampleReviewPage: React.FC = () => {
  const [documents, setDocuments] = useState<Array<{ id: string; file_name: string; status: string }>>([]);
  const [selectedDoc, setSelectedDoc] = useState<string>('');
  const [result, setResult] = useState<SampleResult | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  // Skill-fit assessment state
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('software_engineer');
  const [fitResult, setFitResult] = useState<SkillFitResult | null>(null);
  const [fitLoading, setFitLoading] = useState(false);
  const [showAssessment, setShowAssessment] = useState(false);

  useEffect(() => {
    loadDocuments();
    loadRoles();
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

  const loadRoles = async () => {
    try {
      const res = await api.get('/documents/roles');
      setRoles(res.data.roles || []);
    } catch {
      // fallback roles
      setRoles([
        { id: 'software_engineer', title: 'Software Engineer', department: 'Technology', min_experience: 2 },
        { id: 'data_scientist', title: 'Data Scientist', department: 'Technology', min_experience: 2 },
        { id: 'risk_analyst_banking', title: 'Risk Analyst (Banking)', department: 'Risk', min_experience: 2 },
      ]);
    }
  };

  const loadResults = async (docId: string) => {
    try {
      const res = await api.get(`/documents/results/${docId}`);
      setResult(res.data);
      setCorrections({});
      setSaved(false);
      setFitResult(null);
      setShowAssessment(false);

      // Auto-detect if this is a CV document
      const fileName = res.data.file_name?.toLowerCase() || '';
      const fieldNames = Object.keys(res.data.fields || {});
      const isCV = fileName.includes('cv') || fileName.includes('resume') ||
        fieldNames.includes('candidate_name') || fieldNames.includes('technical_skills');
      if (isCV && fieldNames.length > 0) {
        setShowAssessment(true);
        loadSkillFit(docId, selectedRole);
      }
    } catch (err) {
      // handle error
    }
  };

  const loadSkillFit = async (docId: string, role: string) => {
    setFitLoading(true);
    try {
      const res = await api.get(`/documents/skill-fit/${docId}?role=${role}`);
      setFitResult(res.data);
    } catch {
      setFitResult(null);
    } finally {
      setFitLoading(false);
    }
  };

  const handleSelectDoc = (docId: string) => {
    setSelectedDoc(docId);
    if (docId) loadResults(docId);
  };

  const handleRoleChange = (roleId: string) => {
    setSelectedRole(roleId);
    if (selectedDoc) loadSkillFit(selectedDoc, roleId);
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
      // handle silently
    }
  };

  const confidenceColor = (c: string | number) => {
    if (typeof c === 'number' || !isNaN(Number(c))) {
      const num = typeof c === 'number' ? c : Number(c);
      if (num >= 0.85) return 'green';
      if (num >= 0.6) return 'blue';
      if (num > 0) return 'red';
      return 'gray';
    }
    switch (c) {
      case 'high': return 'green';
      case 'medium': return 'blue';
      case 'low': return 'red';
      default: return 'gray';
    }
  };

  const formatConfidence = (c: string | number): string => {
    if (typeof c === 'number' || !isNaN(Number(c))) {
      const num = typeof c === 'number' ? c : Number(c);
      return `${Math.round(num * 100)}%`;
    }
    return String(c);
  };

  const fitTagType = (color: string) => {
    switch (color) {
      case 'green': return 'green';
      case 'blue': return 'blue';
      case 'yellow': return 'warm-gray';
      case 'red': return 'red';
      default: return 'gray';
    }
  };

  const scoreBarColor = (score: number) => {
    if (score >= 85) return '#24a148';
    if (score >= 70) return '#4589ff';
    if (score >= 50) return '#f1c21b';
    return '#da1e28';
  };

  const formatIDR = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
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

  // ---------- Render ----------
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
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
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
                                  <Tag type={confidenceColor(cell.value)} size="sm">{formatConfidence(cell.value)}</Tag>
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

              {/* Toggle Assessment Button for CV documents */}
              {!showAssessment && fieldEntries.some(([k]) => k === 'candidate_name' || k === 'technical_skills') && (
                <Button
                  kind="tertiary"
                  renderIcon={ChartRadar}
                  onClick={() => { setShowAssessment(true); loadSkillFit(selectedDoc, selectedRole); }}
                  style={{ marginTop: 16 }}
                >
                  Run Skill-Fit Assessment
                </Button>
              )}
            </div>
          </div>

          {/* ========== Skill-Fit Assessment Panel ========== */}
          {showAssessment && (
            <Tile style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <SkillLevelAdvanced size={24} style={{ color: '#0f62fe' }} />
                <h3 style={{ fontSize: 20, fontWeight: 400, margin: 0 }}>Skill-Fit Assessment</h3>
              </div>

              {/* Role Selector */}
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 24 }}>
                <Select
                  id="role-select"
                  labelText="Target Role"
                  value={selectedRole}
                  onChange={(e: any) => handleRoleChange(e.target.value)}
                  style={{ maxWidth: 320 }}
                >
                  {roles.map(r => (
                    <SelectItem key={r.id} value={r.id} text={`${r.title} (${r.department})`} />
                  ))}
                </Select>
                <Button
                  kind="ghost"
                  size="sm"
                  onClick={() => loadSkillFit(selectedDoc, selectedRole)}
                  disabled={fitLoading}
                >
                  {fitLoading ? 'Analyzing...' : 'Re-analyze'}
                </Button>
              </div>

              {fitResult && (
                <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>
                  {/* Left: Overall Score */}
                  <div>
                    {/* Score Circle */}
                    <div style={{
                      textAlign: 'center', padding: 24, background: '#f4f4f4',
                      borderRadius: 8, marginBottom: 16
                    }}>
                      <div style={{
                        width: 140, height: 140, borderRadius: '50%', margin: '0 auto 12px',
                        border: `6px solid ${scoreBarColor(fitResult.overall_score)}`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        background: 'white'
                      }}>
                        <span style={{ fontSize: 36, fontWeight: 600, color: scoreBarColor(fitResult.overall_score) }}>
                          {fitResult.overall_score}
                        </span>
                        <span style={{ fontSize: 12, color: '#525252' }}>/ 100</span>
                      </div>
                      <Tag type={fitTagType(fitResult.fit_color)} size="md" style={{ marginBottom: 8 }}>
                        {fitResult.fit_level}
                      </Tag>
                      <p style={{ fontSize: 13, color: '#525252', margin: '8px 0 0' }}>
                        {fitResult.recommendation}
                      </p>
                    </div>

                    {/* Candidate Info */}
                    <div style={{ padding: 16, background: '#f4f4f4', borderRadius: 8, fontSize: 13 }}>
                      <div style={{ marginBottom: 8 }}>
                        <span style={{ color: '#525252' }}>Candidate:</span>
                        <strong style={{ display: 'block' }}>{fitResult.candidate_name}</strong>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <span style={{ color: '#525252' }}>Target Role:</span>
                        <strong style={{ display: 'block' }}>{fitResult.target_role}</strong>
                      </div>
                      {fitResult.salary_band?.min && (
                        <div>
                          <span style={{ color: '#525252' }}>Salary Band:</span>
                          <strong style={{ display: 'block' }}>
                            {formatIDR(fitResult.salary_band.min)} – {formatIDR(fitResult.salary_band.max)}
                          </strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Factor Breakdown */}
                  <div>
                    {/* Factor Score Bars */}
                    <div style={{ marginBottom: 24 }}>
                      <h5 style={{ fontWeight: 500, marginBottom: 12, fontSize: 14 }}>Assessment Breakdown</h5>
                      {Object.entries(fitResult.factors).map(([key, factor]) => (
                        <div key={key} style={{ marginBottom: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                            <span style={{ fontWeight: 400 }}>
                              {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                              <span style={{ color: '#a8a8a8', marginLeft: 6 }}>({factor.weight}%)</span>
                            </span>
                            <span style={{ fontWeight: 500, color: scoreBarColor(factor.score) }}>
                              {factor.score}%
                            </span>
                          </div>
                          <ProgressBar
                            value={factor.score}
                            max={100}
                            size="small"
                            hideLabel
                            label=""
                          />
                        </div>
                      ))}
                    </div>

                    {/* Skills Detail */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      {/* Required Skills */}
                      {fitResult.factors.required_skills && (
                        <div style={{ padding: 16, background: '#f4f4f4', borderRadius: 8 }}>
                          <h6 style={{ fontWeight: 500, marginBottom: 8, fontSize: 13 }}>Required Skills</h6>
                          <div style={{ marginBottom: 8 }}>
                            <span style={{ fontSize: 11, color: '#24a148', textTransform: 'uppercase', fontWeight: 500 }}>Matched</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                              {(fitResult.factors.required_skills.matched || []).map(s => (
                                <Tag key={s} type="green" size="sm">{s}</Tag>
                              ))}
                              {(fitResult.factors.required_skills.matched || []).length === 0 && (
                                <span style={{ fontSize: 12, color: '#a8a8a8' }}>None</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <span style={{ fontSize: 11, color: '#da1e28', textTransform: 'uppercase', fontWeight: 500 }}>Missing</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                              {(fitResult.factors.required_skills.missing || []).map(s => (
                                <Tag key={s} type="red" size="sm">{s}</Tag>
                              ))}
                              {(fitResult.factors.required_skills.missing || []).length === 0 && (
                                <span style={{ fontSize: 12, color: '#24a148' }}>All matched!</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Preferred Skills */}
                      {fitResult.factors.preferred_skills && (
                        <div style={{ padding: 16, background: '#f4f4f4', borderRadius: 8 }}>
                          <h6 style={{ fontWeight: 500, marginBottom: 8, fontSize: 13 }}>Preferred Skills</h6>
                          <div style={{ marginBottom: 8 }}>
                            <span style={{ fontSize: 11, color: '#4589ff', textTransform: 'uppercase', fontWeight: 500 }}>Matched</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                              {(fitResult.factors.preferred_skills.matched || []).map(s => (
                                <Tag key={s} type="blue" size="sm">{s}</Tag>
                              ))}
                              {(fitResult.factors.preferred_skills.matched || []).length === 0 && (
                                <span style={{ fontSize: 12, color: '#a8a8a8' }}>None</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <span style={{ fontSize: 11, color: '#a8a8a8', textTransform: 'uppercase', fontWeight: 500 }}>Not Found</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                              {(fitResult.factors.preferred_skills.missing || []).map(s => (
                                <Tag key={s} type="warm-gray" size="sm">{s}</Tag>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Certifications */}
                      {fitResult.factors.certifications && (
                        <div style={{ padding: 16, background: '#f4f4f4', borderRadius: 8 }}>
                          <h6 style={{ fontWeight: 500, marginBottom: 8, fontSize: 13 }}>Certifications</h6>
                          <div style={{ marginBottom: 8 }}>
                            <span style={{ fontSize: 11, color: '#525252', fontWeight: 500 }}>Candidate Has</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                              {(fitResult.factors.certifications.candidate_certs || []).map(s => (
                                <Tag key={s} type="teal" size="sm">{s}</Tag>
                              ))}
                              {(fitResult.factors.certifications.candidate_certs || []).length === 0 && (
                                <span style={{ fontSize: 12, color: '#a8a8a8' }}>None</span>
                              )}
                            </div>
                          </div>
                          {(fitResult.factors.certifications.missing_required || []).length > 0 && (
                            <div>
                              <span style={{ fontSize: 11, color: '#da1e28', textTransform: 'uppercase', fontWeight: 500 }}>Required Missing</span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                {fitResult.factors.certifications.missing_required!.map(s => (
                                  <Tag key={s} type="red" size="sm">{s}</Tag>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Experience & Education */}
                      {fitResult.factors.experience && fitResult.factors.education && (
                        <div style={{ padding: 16, background: '#f4f4f4', borderRadius: 8 }}>
                          <h6 style={{ fontWeight: 500, marginBottom: 8, fontSize: 13 }}>Experience & Education</h6>
                          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                            <div>
                              <span style={{ color: '#525252' }}>Experience: </span>
                              <strong>{fitResult.factors.experience.candidate} years</strong>
                              <span style={{ color: '#a8a8a8' }}> / {fitResult.factors.experience.required} required</span>
                              {(fitResult.factors.experience.candidate || 0) >= (fitResult.factors.experience.required || 0)
                                ? <Tag type="green" size="sm" style={{ marginLeft: 8 }}>Met</Tag>
                                : <Tag type="red" size="sm" style={{ marginLeft: 8 }}>Below</Tag>
                              }
                            </div>
                            <div>
                              <span style={{ color: '#525252' }}>Education: </span>
                              <strong>{fitResult.factors.education.level}</strong>
                            </div>
                            <div>
                              <span style={{ color: '#525252' }}>Major: </span>
                              <strong>{fitResult.factors.education.major}</strong>
                              {fitResult.factors.education.major_match
                                ? <Tag type="green" size="sm" style={{ marginLeft: 8 }}>Relevant</Tag>
                                : <Tag type="warm-gray" size="sm" style={{ marginLeft: 8 }}>Non-standard</Tag>
                              }
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {fitLoading && !fitResult && (
                <div style={{ textAlign: 'center', padding: 40, color: '#525252' }}>
                  Analyzing candidate against role requirements...
                </div>
              )}
            </Tile>
          )}
        </>
      )}
    </div>
  );
};

export default SampleReviewPage;
