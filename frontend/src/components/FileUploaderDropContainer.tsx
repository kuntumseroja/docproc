import React, { useRef, useState, useCallback } from 'react';
import { Tile, Button } from '@carbon/react';
import { Upload } from '@carbon/icons-react';

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const ACCEPTED_EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'txt', 'doc', 'docx', 'csv'];

// Include both MIME types and extensions for maximum macOS / browser compatibility
const ACCEPTED_EXTENSIONS =
  'application/pdf,image/png,image/jpeg,image/tiff,text/plain,text/*,' +
  'application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  '.pdf,.png,.jpg,.jpeg,.tiff,.txt,.doc,.docx,.csv';

interface FileUploaderDropContainerProps {
  onFilesSelected: (files: File[]) => void;
}

const FileUploaderDropContainer: React.FC<FileUploaderDropContainerProps> = ({
  onFilesSelected,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filterFiles = (fileList: FileList): File[] => {
    return Array.from(fileList).filter((file) => {
      const ext = file.name.toLowerCase().split('.').pop() || '';
      // Accept by MIME type, MIME prefix, or extension
      return (
        ACCEPTED_TYPES.includes(file.type) ||
        file.type.startsWith('text/') ||
        ACCEPTED_EXTS.includes(ext)
      );
    });
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        const valid = filterFiles(e.dataTransfer.files);
        if (valid.length > 0) {
          onFilesSelected(valid);
        }
      }
    },
    [onFilesSelected]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const valid = filterFiles(e.target.files);
        if (valid.length > 0) {
          onFilesSelected(valid);
        }
      }
      // Reset input so the same file can be selected again
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [onFilesSelected]
  );

  const handleButtonClick = () => {
    inputRef.current?.click();
  };

  return (
    <Tile
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        border: isDragOver ? '2px dashed #4589FF' : '2px dashed #C6C6C6',
        backgroundColor: isDragOver ? '#EDF5FF' : '#F4F4F4',
        borderRadius: 4,
        cursor: 'pointer',
        transition: 'border-color 0.15s, background-color 0.15s',
        minHeight: 200,
      }}
    >
      <Upload size={48} style={{ color: '#4589FF', marginBottom: 16 }} />
      <p
        style={{
          fontSize: '1rem',
          fontWeight: 400,
          color: '#161616',
          marginBottom: 4,
        }}
      >
        Drag and drop files here
      </p>
      <p
        style={{
          fontSize: '0.875rem',
          fontWeight: 300,
          color: '#525252',
          marginBottom: 16,
        }}
      >
        Supported formats: PDF, TXT, DOC, DOCX, PNG, JPG, JPEG, TIFF
      </p>
      <Button
        kind="tertiary"
        size="md"
        renderIcon={Upload}
        onClick={handleButtonClick}
      >
        Browse files
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </Tile>
  );
};

export default FileUploaderDropContainer;
