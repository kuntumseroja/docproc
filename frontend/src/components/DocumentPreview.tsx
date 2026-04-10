import React from 'react';
import { Modal } from '@carbon/react';

interface DocumentFile {
  id: string;
  name: string;
  size: number;
  status: string;
}

interface DocumentPreviewProps {
  file: DocumentFile;
  open: boolean;
  onClose: () => void;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'success':
      return '#24A148';
    case 'error':
      return '#DA1E28';
    case 'uploading':
      return '#4589FF';
    default:
      return '#525252';
  }
};

const getFileExtension = (name: string): string => {
  const ext = name.split('.').pop()?.toUpperCase();
  return ext || 'Unknown';
};

const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  file,
  open,
  onClose,
}) => {
  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      modalHeading="Document Details"
      passiveModal
      size="sm"
    >
      <div style={{ padding: '16px 0' }}>
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              width: '100%',
              height: 120,
              backgroundColor: '#F4F4F4',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontSize: '2rem',
                fontWeight: 400,
                color: '#4589FF',
              }}
            >
              {getFileExtension(file.name)}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p
            style={{
              fontSize: '0.75rem',
              fontWeight: 400,
              color: '#525252',
              marginBottom: 4,
            }}
          >
            File name
          </p>
          <p
            style={{
              fontSize: '0.875rem',
              fontWeight: 400,
              color: '#161616',
            }}
          >
            {file.name}
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p
            style={{
              fontSize: '0.75rem',
              fontWeight: 400,
              color: '#525252',
              marginBottom: 4,
            }}
          >
            File size
          </p>
          <p
            style={{
              fontSize: '0.875rem',
              fontWeight: 400,
              color: '#161616',
            }}
          >
            {formatFileSize(file.size)}
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p
            style={{
              fontSize: '0.75rem',
              fontWeight: 400,
              color: '#525252',
              marginBottom: 4,
            }}
          >
            File type
          </p>
          <p
            style={{
              fontSize: '0.875rem',
              fontWeight: 400,
              color: '#161616',
            }}
          >
            {getFileExtension(file.name)}
          </p>
        </div>

        <div>
          <p
            style={{
              fontSize: '0.75rem',
              fontWeight: 400,
              color: '#525252',
              marginBottom: 4,
            }}
          >
            Status
          </p>
          <p
            style={{
              fontSize: '0.875rem',
              fontWeight: 400,
              color: getStatusColor(file.status),
              textTransform: 'capitalize',
            }}
          >
            {file.status}
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default DocumentPreview;
