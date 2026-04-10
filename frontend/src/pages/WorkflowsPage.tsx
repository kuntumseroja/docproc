import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  Button,
  Tag,
  OverflowMenu,
  OverflowMenuItem,
  Tile,
} from '@carbon/react';
import { Add } from '@carbon/icons-react';
import api from '../services/api';
import { Workflow } from '../types';

const WorkflowsPage: React.FC = () => {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      const res = await api.get('/workflows/');
      setWorkflows(res.data.workflows || []);
    } catch (err) {
      // handle
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await api.post(`/workflows/${id}/activate`);
      loadWorkflows();
    } catch (err) {}
  };

  const handlePause = async (id: string) => {
    try {
      await api.post(`/workflows/${id}/pause`);
      loadWorkflows();
    } catch (err) {}
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/workflows/${id}`);
      loadWorkflows();
    } catch (err) {}
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

  const headers = [
    { key: 'name', header: 'Name' },
    { key: 'document_type', header: 'Document Type' },
    { key: 'status', header: 'Status' },
    { key: 'fields_count', header: 'Fields' },
    { key: 'updated_at', header: 'Last Updated' },
    { key: 'actions', header: '' },
  ];

  const rows = workflows.map(w => ({
    id: w.id,
    name: w.name,
    document_type: w.document_type || '—',
    status: w.status,
    fields_count: w.extraction_schema?.fields?.length || 0,
    updated_at: new Date(w.updated_at).toLocaleDateString(),
    actions: '',
  }));

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 300, marginBottom: 4 }}>Workflows</h1>
          <p style={{ color: '#525252' }}>Manage your document processing workflows</p>
        </div>
      </div>

      {workflows.length === 0 && !loading ? (
        <Tile style={{ padding: 48, textAlign: 'center' as const }}>
          <h3 style={{ fontWeight: 400, marginBottom: 12 }}>No workflows yet</h3>
          <p style={{ color: '#525252', marginBottom: 24 }}>Create your first workflow to start processing documents.</p>
          <Button kind="primary" renderIcon={Add} onClick={() => navigate('/workflows/new')}>
            Create Workflow
          </Button>
        </Tile>
      ) : (
        <DataTable rows={rows} headers={headers}>
          {({ rows: tableRows, headers: tableHeaders, getTableProps, getHeaderProps, getRowProps }: any) => (
            <TableContainer>
              <TableToolbar>
                <TableToolbarContent>
                  <Button kind="primary" size="sm" renderIcon={Add} onClick={() => navigate('/workflows/new')}>
                    Create Workflow
                  </Button>
                </TableToolbarContent>
              </TableToolbar>
              <Table {...getTableProps()}>
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
                  {tableRows.map((row: any) => {
                    const workflow = workflows.find(w => w.id === row.id);
                    return (
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
                            ) : cell.info.header === 'actions' ? (
                              <OverflowMenu size="sm" flipped>
                                {workflow?.status === 'draft' && (
                                  <OverflowMenuItem itemText="Activate" onClick={() => handleActivate(row.id)} />
                                )}
                                {workflow?.status === 'active' && (
                                  <OverflowMenuItem itemText="Pause" onClick={() => handlePause(row.id)} />
                                )}
                                <OverflowMenuItem itemText="Delete" isDelete onClick={() => handleDelete(row.id)} />
                              </OverflowMenu>
                            ) : (
                              cell.value
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      )}
    </div>
  );
};

export default WorkflowsPage;
