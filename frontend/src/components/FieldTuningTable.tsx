import React, { useState } from 'react';
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
  TextInput,
  Select,
  SelectItem,
  Checkbox,
  Modal,
} from '@carbon/react';
import { Add, TrashCan, Edit } from '@carbon/icons-react';
import { FieldDefinition } from '../types';

const FIELD_TYPES = ['text', 'number', 'date', 'currency', 'boolean', 'list'];

interface FieldTuningTableProps {
  fields: FieldDefinition[];
  onChange: (fields: FieldDefinition[]) => void;
}

const FieldTuningTable: React.FC<FieldTuningTableProps> = ({ fields, onChange }) => {
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editField, setEditField] = useState<FieldDefinition | null>(null);

  const headers = [
    { key: 'name', header: 'Field Name' },
    { key: 'label', header: 'Label' },
    { key: 'field_type', header: 'Type' },
    { key: 'required', header: 'Required' },
    { key: 'description', header: 'Description' },
    { key: 'actions', header: '' },
  ];

  const rows = fields.map((f, i) => ({
    id: String(i),
    name: f.name,
    label: f.label,
    field_type: f.field_type,
    required: f.required ? 'Yes' : 'No',
    description: f.description || '—',
    actions: '',
  }));

  const handleDelete = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    const newField: FieldDefinition = {
      name: `field_${fields.length + 1}`,
      label: `Field ${fields.length + 1}`,
      field_type: 'text',
      required: true,
    };
    setEditField(newField);
    setEditIndex(fields.length);
  };

  const handleEdit = (index: number) => {
    setEditField({ ...fields[index] });
    setEditIndex(index);
  };

  const handleSaveEdit = () => {
    if (editField === null || editIndex === null) return;
    const updated = [...fields];
    if (editIndex >= fields.length) {
      updated.push(editField);
    } else {
      updated[editIndex] = editField;
    }
    onChange(updated);
    setEditIndex(null);
    setEditField(null);
  };

  return (
    <>
      <DataTable rows={rows} headers={headers}>
        {({ rows: tableRows, headers: tableHeaders, getTableProps, getHeaderProps, getRowProps }: any) => (
          <TableContainer>
            <TableToolbar>
              <TableToolbarContent>
                <Button kind="primary" size="sm" renderIcon={Add} onClick={handleAdd}>
                  Add Field
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
                {tableRows.map((row: any, rowIndex: number) => (
                  <TableRow key={row.id} {...getRowProps({ row })}>
                    {row.cells.map((cell: any) => (
                      <TableCell key={cell.id}>
                        {cell.info.header === 'actions' ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <Button
                              kind="ghost"
                              size="sm"
                              hasIconOnly
                              iconDescription="Edit"
                              renderIcon={Edit}
                              onClick={() => handleEdit(rowIndex)}
                            />
                            <Button
                              kind="ghost"
                              size="sm"
                              hasIconOnly
                              iconDescription="Delete"
                              renderIcon={TrashCan}
                              onClick={() => handleDelete(rowIndex)}
                            />
                          </div>
                        ) : cell.info.header === 'field_type' ? (
                          <span style={{
                            padding: '2px 8px', borderRadius: 4, fontSize: 12,
                            background: cell.value === 'currency' ? '#d0e2ff' :
                                       cell.value === 'date' ? '#defbe6' :
                                       cell.value === 'number' ? '#e8daff' : '#e0e0e0',
                            color: '#161616'
                          }}>
                            {cell.value}
                          </span>
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

      {editField && (
        <Modal
          open={editIndex !== null}
          onRequestClose={() => { setEditIndex(null); setEditField(null); }}
          onRequestSubmit={handleSaveEdit}
          modalHeading={editIndex !== null && editIndex >= fields.length ? 'Add Field' : 'Edit Field'}
          primaryButtonText="Save"
          secondaryButtonText="Cancel"
          size="sm"
        >
          <div style={{ display: 'grid', gap: 16, padding: '16px 0' }}>
            <TextInput
              id="edit-name"
              labelText="Field Name"
              value={editField.name}
              onChange={(e: any) => setEditField({ ...editField, name: e.target.value })}
            />
            <TextInput
              id="edit-label"
              labelText="Label"
              value={editField.label}
              onChange={(e: any) => setEditField({ ...editField, label: e.target.value })}
            />
            <Select
              id="edit-type"
              labelText="Type"
              value={editField.field_type}
              onChange={(e: any) => setEditField({ ...editField, field_type: e.target.value })}
            >
              {FIELD_TYPES.map(t => (
                <SelectItem key={t} value={t} text={t.charAt(0).toUpperCase() + t.slice(1)} />
              ))}
            </Select>
            <Checkbox
              id="edit-required"
              labelText="Required"
              checked={editField.required}
              onChange={(_: any, { checked }: { checked: boolean }) => setEditField({ ...editField, required: checked })}
            />
            <TextInput
              id="edit-desc"
              labelText="Description"
              value={editField.description || ''}
              onChange={(e: any) => setEditField({ ...editField, description: e.target.value })}
            />
          </div>
        </Modal>
      )}
    </>
  );
};

export default FieldTuningTable;
