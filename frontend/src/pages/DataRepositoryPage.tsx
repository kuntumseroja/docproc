import React, { useState, useEffect } from 'react';
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
  TableToolbarSearch,
  Button,
  Select,
  SelectItem,
  Tag,
  Tile,
} from '@carbon/react';
import { Download, Filter } from '@carbon/icons-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const DataRepositoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDocuments();
  }, [statusFilter]);

  const loadDocuments = async () => {
    try {
      let url = '/documents/list';
      const params: string[] = [];
      if (statusFilter) params.push(`status=${statusFilter}`);
      if (params.length) url += `?${params.join('&')}`;

      const res = await api.get(url);
      setDocuments(res.data || []);
    } catch (err) {
      // handle
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: string) => {
    try {
      const ids = documents.map((d: any) => d.document_id);
      const res = await api.post('/export/download', {
        document_ids: ids,
        format,
      }, { responseType: 'blob' });

      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `docproc-export.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // handle
    }
  };

  const statusColor = (s: string): any => {
    switch (s) {
      case 'completed': return 'green';
      case 'processing': return 'blue';
      case 'failed': return 'red';
      case 'uploaded': return 'gray';
      default: return 'gray';
    }
  };

  const headers = [
    { key: 'file_name', header: 'File Name' },
    { key: 'status', header: 'Status' },
    { key: 'progress_percent', header: 'Progress' },
    { key: 'created_at', header: 'Uploaded' },
    { key: 'updated_at', header: 'Last Updated' },
  ];

  const filteredDocs = documents.filter((d: any) => {
    if (!searchTerm) return true;
    const name = d.file_name || d.document_id || '';
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const rows = filteredDocs.map((d: any) => ({
    id: d.document_id,
    file_name: d.file_name || d.document_id?.slice(0, 12) + '...',
    status: d.status,
    progress_percent: `${d.progress_percent || 0}%`,
    created_at: new Date(d.created_at).toLocaleDateString(),
    updated_at: new Date(d.updated_at).toLocaleDateString(),
  }));

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 300, marginBottom: 4 }}>Data Repository</h1>
          <p style={{ color: '#525252' }}>Browse and export processed document data</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button kind="tertiary" size="sm" renderIcon={Download} onClick={() => handleExport('csv')}>
            CSV
          </Button>
          <Button kind="tertiary" size="sm" renderIcon={Download} onClick={() => handleExport('json')}>
            JSON
          </Button>
          <Button kind="tertiary" size="sm" renderIcon={Download} onClick={() => handleExport('xlsx')}>
            Excel
          </Button>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Select
          id="status-filter"
          labelText="Filter by status"
          size="sm"
          value={statusFilter}
          onChange={(e: any) => setStatusFilter(e.target.value)}
          style={{ maxWidth: 200 }}
        >
          <SelectItem value="" text="All statuses" />
          <SelectItem value="uploaded" text="Uploaded" />
          <SelectItem value="processing" text="Processing" />
          <SelectItem value="completed" text="Completed" />
          <SelectItem value="failed" text="Failed" />
        </Select>
      </div>

      {filteredDocs.length === 0 && !loading ? (
        <Tile style={{ padding: 48, textAlign: 'center' as const }}>
          <h3 style={{ fontWeight: 400, marginBottom: 8 }}>No documents found</h3>
          <p style={{ color: '#525252' }}>Upload some documents to see them here.</p>
        </Tile>
      ) : (
        <DataTable rows={rows} headers={headers}>
          {({ rows: tableRows, headers: tableHeaders, getTableProps, getHeaderProps, getRowProps, onInputChange }: any) => (
            <TableContainer>
              <TableToolbar>
                <TableToolbarContent>
                  <TableToolbarSearch onChange={(e: any) => setSearchTerm(e.target?.value || '')} />
                </TableToolbarContent>
              </TableToolbar>
              <Table {...getTableProps()}>
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
                          {cell.info.header === 'file_name' ? (
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

      <p style={{ marginTop: 16, fontSize: 13, color: '#525252' }}>
        Showing {filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
};

export default DataRepositoryPage;
