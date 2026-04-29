import React, { useState, useEffect } from 'react';
import {
  Tile,
  ClickableTile,
  Button,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Tag,
  Loading,
  InlineLoading,
} from '@carbon/react';
import { Document, Flow, Checkmark, WarningAlt, Security, ArrowRight } from '@carbon/icons-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

interface DashboardStats {
  total_documents: number;
  processed_documents: number;
  active_workflows: number;
  success_rate: number;
}

const DashboardPage: React.FC = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    total_documents: 0,
    processed_documents: 0,
    active_workflows: 0,
    success_rate: 0,
  });
  const [recentDocs, setRecentDocs] = useState<any[]>([]);
  const [recentWorkflows, setRecentWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingPdp, setStartingPdp] = useState(false);
  const [startingSecurity, setStartingSecurity] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadDashboard();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const loadDashboard = async () => {
    try {
      // Load documents
      const docsRes = await api.get('/documents/list');
      const docs = docsRes.data || [];
      setRecentDocs(docs.slice(0, 5));

      // Load workflows
      const wfRes = await api.get('/workflows/');
      const workflows = wfRes.data?.workflows || [];
      setRecentWorkflows(workflows.slice(0, 5));

      // Compute stats
      const processed = docs.filter((d: any) => d.status === 'completed').length;
      const active = workflows.filter((w: any) => w.status === 'active').length;
      setStats({
        total_documents: docs.length,
        processed_documents: processed,
        active_workflows: active,
        success_rate: docs.length > 0 ? Math.round((processed / docs.length) * 100) : 0,
      });
    } catch (err) {
      // API not available, show zeros
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: 'Total Documents', value: stats.total_documents, icon: Document, color: '#4589ff' },
    { label: 'Processed', value: stats.processed_documents, icon: Checkmark, color: '#24a148' },
    { label: 'Active Workflows', value: stats.active_workflows, icon: Flow, color: '#8a3ffc' },
    { label: 'Success Rate', value: `${stats.success_rate}%`, icon: WarningAlt, color: '#ff832b' },
  ];

  const startPdpWorkflow = async () => {
    if (startingPdp) return;
    setStartingPdp(true);
    try {
      const res = await api.post('/workflows/from-template/uu-pdp-privacy-policy');
      const workflowId = res.data?.id;
      if (workflowId) {
        navigate(`/upload?workflow=${workflowId}`);
      } else {
        navigate('/upload');
      }
    } catch {
      navigate('/compliance?regulation=uu-pdp-2022');
    } finally {
      setStartingPdp(false);
    }
  };

  const startSecurityWorkflow = async () => {
    if (startingSecurity) return;
    setStartingSecurity(true);
    try {
      const res = await api.post('/workflows/from-template/security-guard-attendance');
      const workflowId = res.data?.id;
      if (workflowId) {
        navigate(`/upload?workflow=${workflowId}`);
      } else {
        navigate('/upload');
      }
    } catch {
      navigate('/upload');
    } finally {
      setStartingSecurity(false);
    }
  };

  const statusColor = (s: string): any => {
    switch (s) {
      case 'completed': case 'active': return 'green';
      case 'processing': case 'draft': return 'blue';
      case 'failed': case 'archived': return 'red';
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

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 28, fontWeight: 300, marginBottom: 8 }}>Dashboard</h1>
      <p style={{ color: '#525252', marginBottom: 32 }}>Overview of your document processing</p>

      {!isAuthenticated && (
        <Tile style={{ padding: 32, marginBottom: 32, background: 'linear-gradient(135deg, #EDF5FF 0%, #D0E2FF 100%)' }}>
          <h2 style={{ fontWeight: 400, fontSize: 22, marginBottom: 8, color: '#161616' }}>
            Welcome to DocProc
          </h2>
          <p style={{ color: '#525252', marginBottom: 20, fontWeight: 300 }}>
            AI-powered document processing platform. Sign in to upload documents, create workflows, and extract data.
          </p>
          <Button kind="primary" onClick={() => navigate('/login')}>
            Sign In to Get Started
          </Button>
        </Tile>
      )}

      {/* Stats Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {statCards.map((card, i) => (
          <Tile key={i} style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: 13, color: '#525252', marginBottom: 8 }}>{card.label}</p>
                <p style={{ fontSize: 36, fontWeight: 300, color: '#161616' }}>{card.value}</p>
              </div>
              <card.icon size={24} style={{ color: card.color, opacity: 0.7 }} />
            </div>
          </Tile>
        ))}
      </div>

      {/* Quick Start — Compliance Presets */}
      {isAuthenticated && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontWeight: 400, marginBottom: 12 }}>Quick Start</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            <ClickableTile
              onClick={startPdpWorkflow}
              disabled={startingPdp}
              style={{ padding: 20 }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8,
                  background: 'linear-gradient(135deg, #4589FF 0%, #0F62FE 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Security size={22} style={{ color: '#fff' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: '#161616' }}>
                      UU PDP Privacy Policy Review
                    </span>
                    {startingPdp ? (
                      <InlineLoading description="" status="active" style={{ width: 'auto' }} />
                    ) : (
                      <ArrowRight size={16} style={{ color: '#4589FF' }} />
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: '#525252', fontWeight: 300, lineHeight: 1.5, marginBottom: 8 }}>
                    Upload a privacy policy. Auto-extracts 41 fields and validates against UU No. 27/2022 (15 rules covering Pasal 5-13, 16, 20, 25-26, 30, 34, 35-39, 46, 53, 55-57).
                  </p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Tag type="blue" size="sm">Indonesia</Tag>
                    <Tag type="purple" size="sm">Data Privacy</Tag>
                    <Tag type="green" size="sm">Workflow</Tag>
                  </div>
                </div>
              </div>
            </ClickableTile>

            {/* Security Guard Attendance Form Review */}
            <ClickableTile
              onClick={startSecurityWorkflow}
              disabled={startingSecurity}
              style={{ padding: 20 }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8,
                  background: 'linear-gradient(135deg, #8a3ffc 0%, #6929C4 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Security size={22} style={{ color: '#fff' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: '#161616' }}>
                      Security Attendance Form Review
                    </span>
                    {startingSecurity ? (
                      <InlineLoading description="" status="active" style={{ width: 'auto' }} />
                    ) : (
                      <ArrowRight size={16} style={{ color: '#4589FF' }} />
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: '#525252', fontWeight: 300, lineHeight: 1.5, marginBottom: 8 }}>
                    Upload a filled security guard attendance form. Granite-Docling extracts text, isolates handwritten field crops, and flags missing or unsigned forms as REJECTED.
                  </p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Tag type="purple" size="sm">Multimodal OCR</Tag>
                    <Tag type="magenta" size="sm">Handwriting</Tag>
                    <Tag type="cyan" size="sm">Signature audit</Tag>
                  </div>
                </div>
              </div>
            </ClickableTile>
          </div>
        </div>
      )}

      {/* Recent Documents & Workflows */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <h3 style={{ fontWeight: 400, marginBottom: 12 }}>Recent Documents</h3>
          {recentDocs.length === 0 ? (
            <Tile style={{ padding: 24, textAlign: 'center' as const, color: '#525252' }}>
              No documents uploaded yet
            </Tile>
          ) : (
            <DataTable
              rows={recentDocs.map((d: any) => ({
                id: d.document_id,
                name: d.file_name || d.document_id?.slice(0, 8) || '—',
                status: d.status,
                date: new Date(d.created_at).toLocaleDateString(),
              }))}
              headers={[
                { key: 'name', header: 'Document' },
                { key: 'status', header: 'Status' },
                { key: 'date', header: 'Date' },
              ]}
            >
              {({ rows, headers, getTableProps, getHeaderProps, getRowProps }: any) => (
                <TableContainer>
                  <Table {...getTableProps()} size="sm">
                    <TableHead>
                      <TableRow>
                        {headers.map((h: any) => (
                          <TableHeader key={h.key} {...getHeaderProps({ header: h })}>{h.header}</TableHeader>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row: any) => (
                        <TableRow key={row.id} {...getRowProps({ row })}>
                          {row.cells.map((cell: any) => (
                            <TableCell key={cell.id}>
                              {cell.info.header === 'name' ? (
                                <span
                                  style={{ color: '#4589FF', cursor: 'pointer', fontWeight: 400 }}
                                  onClick={() => navigate(`/documents/${row.id}`)}
                                >
                                  {cell.value}
                                </span>
                              ) : cell.info.header === 'status' ? (
                                <Tag type={statusColor(cell.value)} size="sm">{cell.value}</Tag>
                              ) : cell.value}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DataTable>
          )}
        </div>

        <div>
          <h3 style={{ fontWeight: 400, marginBottom: 12 }}>Recent Workflows</h3>
          {recentWorkflows.length === 0 ? (
            <Tile style={{ padding: 24, textAlign: 'center' as const, color: '#525252' }}>
              No workflows created yet
            </Tile>
          ) : (
            <DataTable
              rows={recentWorkflows.map((w: any) => ({
                id: w.id,
                name: w.name,
                status: w.status,
                type: w.document_type || '—',
              }))}
              headers={[
                { key: 'name', header: 'Workflow' },
                { key: 'type', header: 'Type' },
                { key: 'status', header: 'Status' },
              ]}
            >
              {({ rows, headers, getTableProps, getHeaderProps, getRowProps }: any) => (
                <TableContainer>
                  <Table {...getTableProps()} size="sm">
                    <TableHead>
                      <TableRow>
                        {headers.map((h: any) => (
                          <TableHeader key={h.key} {...getHeaderProps({ header: h })}>{h.header}</TableHeader>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row: any) => (
                        <TableRow key={row.id} {...getRowProps({ row })}>
                          {row.cells.map((cell: any) => (
                            <TableCell key={cell.id}>
                              {cell.info.header === 'name' ? (
                                <span
                                  style={{ color: '#4589FF', cursor: 'pointer', fontWeight: 400 }}
                                  onClick={() => navigate(`/workflows/${row.id}`)}
                                >
                                  {cell.value}
                                </span>
                              ) : cell.info.header === 'status' ? (
                                <Tag type={statusColor(cell.value)} size="sm">{cell.value}</Tag>
                              ) : cell.value}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DataTable>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
