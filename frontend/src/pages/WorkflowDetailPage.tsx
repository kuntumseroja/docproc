import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Tile,
  Tag,
  Button,
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
} from '@carbon/react';
import { ArrowLeft } from '@carbon/icons-react';
import api from '../services/api';
import { Workflow } from '../types';

const WorkflowDetailPage: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWorkflow();
  }, [workflowId]);

  const loadWorkflow = async () => {
    try {
      const res = await api.get(`/workflows/${workflowId}`);
      setWorkflow(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load workflow');
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (s: string): any => {
    switch (s) {
      case 'active': return 'green';
      case 'draft': return 'blue';
      case 'paused': return 'gray';
      case 'archived': return 'red';
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

  if (error || !workflow) {
    return (
      <div style={{ padding: 32 }}>
        <Button kind="ghost" renderIcon={ArrowLeft} onClick={() => navigate('/workflows')}>
          Back to Workflows
        </Button>
        <Tile style={{ padding: 32, marginTop: 16, textAlign: 'center' as const }}>
          <p style={{ color: '#da1e28' }}>{error || 'Workflow not found'}</p>
        </Tile>
      </div>
    );
  }

  const fields = workflow.extraction_schema?.fields || [];
  const rules = workflow.validation_rules?.rules || [];
  const actions = workflow.action_config?.actions || [];

  return (
    <div style={{ padding: 32 }}>
      <Breadcrumb style={{ marginBottom: 16 }}>
        <BreadcrumbItem onClick={() => navigate('/workflows')} style={{ cursor: 'pointer' }}>
          Workflows
        </BreadcrumbItem>
        <BreadcrumbItem isCurrentPage>{workflow.name}</BreadcrumbItem>
      </Breadcrumb>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 300, marginBottom: 8 }}>{workflow.name}</h1>
          {workflow.description && (
            <p style={{ color: '#525252', marginBottom: 8 }}>{workflow.description}</p>
          )}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Tag type={statusColor(workflow.status)} size="sm">{workflow.status}</Tag>
            {workflow.document_type && (
              <Tag type="cool-gray" size="sm">{workflow.document_type}</Tag>
            )}
            <span style={{ color: '#525252', fontSize: 13 }}>
              {workflow.document_count} document{workflow.document_count !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Extraction Fields */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontWeight: 400, marginBottom: 12 }}>
          Extraction Fields ({fields.length})
        </h3>
        {fields.length === 0 ? (
          <Tile style={{ padding: 24, color: '#525252' }}>No extraction fields configured</Tile>
        ) : (
          <DataTable
            rows={fields.map((f, i) => ({
              id: String(i),
              name: f.name,
              label: f.label,
              type: f.field_type,
              required: f.required ? 'Yes' : 'No',
              description: f.description || '—',
            }))}
            headers={[
              { key: 'name', header: 'Field Name' },
              { key: 'label', header: 'Label' },
              { key: 'type', header: 'Type' },
              { key: 'required', header: 'Required' },
              { key: 'description', header: 'Description' },
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
                            {cell.info.header === 'type' ? (
                              <Tag type="blue" size="sm">{cell.value}</Tag>
                            ) : cell.info.header === 'required' ? (
                              <Tag type={cell.value === 'Yes' ? 'green' : 'cool-gray'} size="sm">{cell.value}</Tag>
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
        )}
      </div>

      {/* Validation Rules */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontWeight: 400, marginBottom: 12 }}>
          Validation Rules ({rules.length})
        </h3>
        {rules.length === 0 ? (
          <Tile style={{ padding: 24, color: '#525252' }}>No validation rules configured</Tile>
        ) : (
          <DataTable
            rows={rules.map((r, i) => ({
              id: String(i),
              name: r.name,
              description: r.description,
              type: r.rule_type,
              config: JSON.stringify(r.config),
            }))}
            headers={[
              { key: 'name', header: 'Rule Name' },
              { key: 'description', header: 'Description' },
              { key: 'type', header: 'Type' },
              { key: 'config', header: 'Configuration' },
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
                            {cell.info.header === 'type' ? (
                              <Tag type="purple" size="sm">{cell.value}</Tag>
                            ) : cell.info.header === 'config' ? (
                              <code style={{ fontSize: 12, color: '#525252' }}>{cell.value}</code>
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
        )}
      </div>

      {/* Actions */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontWeight: 400, marginBottom: 12 }}>
          Actions ({actions.length})
        </h3>
        {actions.length === 0 ? (
          <Tile style={{ padding: 24, color: '#525252' }}>No actions configured</Tile>
        ) : (
          <DataTable
            rows={actions.map((a, i) => ({
              id: String(i),
              name: a.name,
              type: a.action_type,
              trigger: a.trigger.replace(/_/g, ' '),
              config: JSON.stringify(a.config),
            }))}
            headers={[
              { key: 'name', header: 'Action Name' },
              { key: 'type', header: 'Type' },
              { key: 'trigger', header: 'Trigger' },
              { key: 'config', header: 'Configuration' },
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
                            {cell.info.header === 'type' ? (
                              <Tag type="teal" size="sm">{cell.value}</Tag>
                            ) : cell.info.header === 'trigger' ? (
                              <Tag type="warm-gray" size="sm">{cell.value}</Tag>
                            ) : cell.info.header === 'config' ? (
                              <code style={{ fontSize: 12, color: '#525252' }}>{cell.value}</code>
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
        )}
      </div>
    </div>
  );
};

export default WorkflowDetailPage;
