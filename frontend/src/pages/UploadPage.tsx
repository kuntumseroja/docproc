import React, { useState, useCallback, useEffect } from 'react';
import {
  Button,
  Tile,
  Select,
  SelectItem,
  ProgressBar,
  StructuredListWrapper,
  StructuredListHead,
  StructuredListRow,
  StructuredListCell,
  StructuredListBody,
  Tag,
  InlineNotification,
} from '@carbon/react';
import {
  TrashCan,
  SendFilled,
  DocumentMultiple_01,
  Checkmark,
  WarningAlt,
} from '@carbon/icons-react';
import { useNavigate } from 'react-router-dom';
import FileUploaderDropContainer from '../components/FileUploaderDropContainer';
import api from '../services/api';

interface UploadFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  documentId?: string;
  fieldsExtracted?: number;
  error?: string;
}

interface WorkflowOption {
  id: string;
  name: string;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const getStatusTag = (status: UploadFileItem['status']) => {
  switch (status) {
    case 'pending':
      return <Tag type="gray" size="sm">Pending</Tag>;
    case 'uploading':
      return <Tag type="blue" size="sm">Uploading</Tag>;
    case 'processing':
      return <Tag type="teal" size="sm">Processing</Tag>;
    case 'completed':
      return <Tag type="green" size="sm">Completed</Tag>;
    case 'error':
      return <Tag type="red" size="sm">Error</Tag>;
    default:
      return null;
  }
};

const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const [workflowId, setWorkflowId] = useState('');
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      const res = await api.get('/workflows/');
      const list = res.data?.workflows || res.data || [];
      const workflowList = list.map((w: any) => ({ id: w.id, name: w.name }));
      setWorkflows(workflowList);

      // Pre-select workflow from ?workflow=<id> query param
      const params = new URLSearchParams(window.location.search);
      const preselect = params.get('workflow');
      if (preselect && workflowList.some((w: any) => w.id === preselect)) {
        setWorkflowId(preselect);
      }
    } catch {
      // fallback
    }
  };

  const handleFilesSelected = useCallback((newFiles: File[]) => {
    const uploadFiles: UploadFileItem[] = newFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      file,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'pending' as const,
    }));
    setFiles((prev) => [...prev, ...uploadFiles]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const updateFile = (id: string, updates: Partial<UploadFileItem>) => {
    setFiles((prev) => prev.map((f) => f.id === id ? { ...f, ...updates } : f));
  };

  const processFile = async (item: UploadFileItem) => {
    try {
      // Step 1: Upload
      updateFile(item.id, { status: 'uploading', progress: 30 });
      const formData = new FormData();
      formData.append('file', item.file);
      if (workflowId) {
        formData.append('workflow_id', workflowId);
      }
      const uploadRes = await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const documentId = uploadRes.data.document_id;
      updateFile(item.id, { status: 'processing', progress: 60, documentId });

      // Step 2: Process
      const processRes = await api.post(`/documents/process/${documentId}`);
      const result = processRes.data;

      if (result.status === 'completed') {
        updateFile(item.id, {
          status: 'completed',
          progress: 100,
          fieldsExtracted: result.fields_extracted,
        });
      } else {
        updateFile(item.id, {
          status: 'error',
          progress: 100,
          error: result.error || 'Processing failed',
        });
      }
    } catch (err: any) {
      updateFile(item.id, {
        status: 'error',
        progress: 100,
        error: err.response?.data?.detail || err.message || 'Upload failed',
      });
    }
  };

  const handleStartBatch = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setNotification(null);

    const pending = files.filter((f) => f.status === 'pending');
    for (const file of pending) {
      await processFile(file);
    }

    const updatedFiles = files;
    const completedCount = updatedFiles.filter((f) => f.status === 'completed').length;
    const errorCount = updatedFiles.filter((f) => f.status === 'error').length;

    if (errorCount > 0) {
      setNotification({ kind: 'error', text: `${errorCount} file(s) failed. ${completedCount} completed.` });
    } else if (completedCount > 0) {
      setNotification({ kind: 'success', text: `${completedCount} document(s) processed successfully!` });
    }
    setIsProcessing(false);
  };

  // Stats
  const totalFiles = files.length;
  const completedCount = files.filter((f) => f.status === 'completed').length;
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 400, color: '#161616', marginBottom: 8 }}>
          Upload Documents
        </h1>
        <p style={{ fontSize: '0.875rem', fontWeight: 300, color: '#525252' }}>
          Drag and drop your documents or browse to select files for processing.
        </p>
      </div>

      {notification && (
        <InlineNotification
          kind={notification.kind}
          title={notification.text}
          onClose={() => setNotification(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Drop Zone */}
      <div style={{ marginBottom: 24 }}>
        <FileUploaderDropContainer onFilesSelected={handleFilesSelected} />
      </div>

      {/* Workflow Selection and Actions */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1, maxWidth: 300 }}>
          <Select
            id="workflow-select"
            labelText="Workflow"
            value={workflowId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setWorkflowId(e.target.value)}
          >
            <SelectItem value="" text="Select a workflow..." />
            {workflows.map((w) => (
              <SelectItem key={w.id} value={w.id} text={w.name} />
            ))}
          </Select>
        </div>
        <Button
          kind="primary"
          renderIcon={SendFilled}
          disabled={files.length === 0 || isProcessing}
          onClick={handleStartBatch}
        >
          {isProcessing ? 'Processing...' : 'Upload & Process'}
        </Button>
      </div>

      {/* Stats */}
      {files.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <Tile style={{ flex: 1, padding: 16, textAlign: 'center' }}>
            <DocumentMultiple_01 size={24} style={{ color: '#4589FF', marginBottom: 8 }} />
            <p style={{ fontSize: '1.5rem', fontWeight: 400, color: '#161616' }}>{totalFiles}</p>
            <p style={{ fontSize: '0.75rem', fontWeight: 300, color: '#525252' }}>Total Files</p>
          </Tile>
          <Tile style={{ flex: 1, padding: 16, textAlign: 'center' }}>
            <Checkmark size={24} style={{ color: '#24A148', marginBottom: 8 }} />
            <p style={{ fontSize: '1.5rem', fontWeight: 400, color: '#161616' }}>{completedCount}</p>
            <p style={{ fontSize: '0.75rem', fontWeight: 300, color: '#525252' }}>Completed</p>
          </Tile>
          <Tile style={{ flex: 1, padding: 16, textAlign: 'center' }}>
            <WarningAlt size={24} style={{ color: '#525252', marginBottom: 8 }} />
            <p style={{ fontSize: '1.5rem', fontWeight: 400, color: '#161616' }}>{formatFileSize(totalSize)}</p>
            <p style={{ fontSize: '0.75rem', fontWeight: 300, color: '#525252' }}>Total Size</p>
          </Tile>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <Tile style={{ padding: 0 }}>
          <StructuredListWrapper>
            <StructuredListHead>
              <StructuredListRow head>
                <StructuredListCell head>File Name</StructuredListCell>
                <StructuredListCell head>Size</StructuredListCell>
                <StructuredListCell head>Progress</StructuredListCell>
                <StructuredListCell head>Status</StructuredListCell>
                <StructuredListCell head>Actions</StructuredListCell>
              </StructuredListRow>
            </StructuredListHead>
            <StructuredListBody>
              {files.map((file) => (
                <StructuredListRow key={file.id}>
                  <StructuredListCell>
                    <span style={{ fontSize: '0.875rem', fontWeight: 400, color: '#161616' }}>
                      {file.name}
                    </span>
                    {file.fieldsExtracted !== undefined && (
                      <span style={{ fontSize: '0.75rem', color: '#24A148', marginLeft: 8 }}>
                        {file.fieldsExtracted} fields extracted
                      </span>
                    )}
                    {file.error && (
                      <span style={{ fontSize: '0.75rem', color: '#da1e28', marginLeft: 8 }}>
                        {file.error}
                      </span>
                    )}
                  </StructuredListCell>
                  <StructuredListCell>
                    <span style={{ fontSize: '0.875rem', fontWeight: 300, color: '#525252' }}>
                      {formatFileSize(file.size)}
                    </span>
                  </StructuredListCell>
                  <StructuredListCell>
                    <div style={{ minWidth: 120 }}>
                      <ProgressBar
                        label=""
                        value={file.progress}
                        size="small"
                        status={
                          file.status === 'error' ? 'error' :
                          file.status === 'completed' ? 'finished' : 'active'
                        }
                      />
                    </div>
                  </StructuredListCell>
                  <StructuredListCell>
                    {getStatusTag(file.status)}
                  </StructuredListCell>
                  <StructuredListCell>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {file.documentId && file.status === 'completed' && (
                        <Button
                          kind="ghost"
                          size="sm"
                          onClick={() => navigate(`/documents/${file.documentId}`)}
                        >
                          View
                        </Button>
                      )}
                      {file.status === 'pending' && (
                        <Button
                          kind="ghost"
                          size="sm"
                          hasIconOnly
                          renderIcon={TrashCan}
                          iconDescription="Remove"
                          onClick={() => removeFile(file.id)}
                        />
                      )}
                    </div>
                  </StructuredListCell>
                </StructuredListRow>
              ))}
            </StructuredListBody>
          </StructuredListWrapper>
        </Tile>
      )}

      {files.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: '0.875rem', fontWeight: 300, color: '#525252' }}>
            No files selected. Drag and drop files above or click &quot;Browse files&quot; to get started.
          </p>
        </div>
      )}
    </div>
  );
};

export default UploadPage;
