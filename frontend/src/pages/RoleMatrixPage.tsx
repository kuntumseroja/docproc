import React, { useState, useEffect, useCallback } from 'react';
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
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  Button,
  TextInput,
  NumberInput,
  Select,
  SelectItem,
  Modal,
  InlineNotification,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from '@carbon/react';
import {
  Add,
  Edit,
  TrashCan,
  Save,
  Close,
  SkillLevelAdvanced,
  Certificate,
  UserProfile,
  Money,
} from '@carbon/icons-react';
import api from '../services/api';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ProgrammingLanguages {
  required: string[];
  preferred: string[];
}

interface CertsConfig {
  required: string[];
  preferred: string[];
}

interface SalaryBand {
  min: number;
  max: number;
  currency: string;
}

interface Role {
  id: string;
  title: string;
  department: string;
  min_experience_years: number;
  education_minimum: string;
  preferred_majors: string[];
  required_skills: string[];
  preferred_skills: string[];
  programming_languages: ProgrammingLanguages;
  certifications: CertsConfig;
  salary_band: SalaryBand;
}

const EMPTY_ROLE: Role = {
  id: '',
  title: '',
  department: '',
  min_experience_years: 0,
  education_minimum: 'S1/Bachelor',
  preferred_majors: [],
  required_skills: [],
  preferred_skills: [],
  programming_languages: { required: [], preferred: [] },
  certifications: { required: [], preferred: [] },
  salary_band: { min: 0, max: 0, currency: 'IDR' },
};

/* ------------------------------------------------------------------ */
/* Tag Input Component                                                 */
/* ------------------------------------------------------------------ */

const TagInput: React.FC<{
  id: string;
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  tagType?: string;
  placeholder?: string;
}> = ({ id, label, values, onChange, tagType = 'blue', placeholder = 'Type & press Enter' }) => {
  const [input, setInput] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      if (!values.includes(input.trim())) {
        onChange([...values, input.trim()]);
      }
      setInput('');
    }
  };

  const handleRemove = (val: string) => {
    onChange(values.filter(v => v !== val));
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#525252', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 8px',
        border: '1px solid #e0e0e0', borderRadius: 4, background: '#fff',
        minHeight: 36, alignItems: 'center'
      }}>
        {values.map(v => (
          <Tag key={v} type={tagType as any} size="sm" filter onClose={() => handleRemove(v)}>
            {v}
          </Tag>
        ))}
        <input
          id={id}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? placeholder : ''}
          style={{
            border: 'none', outline: 'none', flex: 1, minWidth: 120,
            fontSize: 13, fontFamily: 'inherit', background: 'transparent',
          }}
        />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Main Page                                                           */
/* ------------------------------------------------------------------ */

const RoleMatrixPage: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [notification, setNotification] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role>(EMPTY_ROLE);
  const [isNewRole, setIsNewRole] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/roles/');
      setRoles(res.data.roles || []);
    } catch {
      setNotification({ kind: 'error', text: 'Failed to load roles' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  const handleCreate = () => {
    setEditingRole({ ...EMPTY_ROLE });
    setIsNewRole(true);
    setModalOpen(true);
  };

  const handleEdit = async (roleId: string) => {
    try {
      const res = await api.get(`/roles/${roleId}`);
      setEditingRole(res.data);
      setIsNewRole(false);
      setModalOpen(true);
    } catch {
      setNotification({ kind: 'error', text: 'Failed to load role details' });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/roles/${deleteId}`);
      setNotification({ kind: 'success', text: `Role "${deleteId}" deleted` });
      setDeleteId(null);
      loadRoles();
    } catch {
      setNotification({ kind: 'error', text: 'Failed to delete role' });
    }
  };

  const handleSave = async () => {
    if (!editingRole.id || !editingRole.title) {
      setNotification({ kind: 'error', text: 'Role ID and Title are required' });
      return;
    }
    setSaving(true);
    try {
      if (isNewRole) {
        await api.post('/roles/', editingRole);
        setNotification({ kind: 'success', text: `Role "${editingRole.title}" created` });
      } else {
        const { id, ...updates } = editingRole;
        await api.put(`/roles/${id}`, updates);
        setNotification({ kind: 'success', text: `Role "${editingRole.title}" updated` });
      }
      setModalOpen(false);
      loadRoles();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Failed to save role';
      setNotification({ kind: 'error', text: detail });
    } finally {
      setSaving(false);
    }
  };

  const updateRole = (field: string, value: any) => {
    setEditingRole(prev => ({ ...prev, [field]: value }));
  };

  const updateNested = (parent: 'programming_languages' | 'certifications' | 'salary_band', field: string, value: any) => {
    setEditingRole(prev => ({
      ...prev,
      [parent]: { ...(prev[parent] as any), [field]: value },
    }));
  };

  const formatIDR = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

  // Filter roles by search
  const filteredRoles = roles.filter(r =>
    !search ||
    r.title.toLowerCase().includes(search.toLowerCase()) ||
    r.department.toLowerCase().includes(search.toLowerCase()) ||
    r.id.toLowerCase().includes(search.toLowerCase())
  );

  const tableHeaders = [
    { key: 'title', header: 'Role Title' },
    { key: 'department', header: 'Department' },
    { key: 'experience', header: 'Min Experience' },
    { key: 'education', header: 'Education' },
    { key: 'req_skills', header: 'Required Skills' },
    { key: 'certs', header: 'Certifications' },
    { key: 'salary', header: 'Salary Band' },
    { key: 'actions', header: '' },
  ];

  const tableRows = filteredRoles.map(r => ({
    id: r.id,
    title: r.title,
    department: r.department,
    experience: `${r.min_experience_years} years`,
    education: r.education_minimum,
    req_skills: r.required_skills.length,
    certs: (r.certifications?.required?.length || 0) + (r.certifications?.preferred?.length || 0),
    salary: r.salary_band?.min ? `${formatIDR(r.salary_band.min)} – ${formatIDR(r.salary_band.max)}` : '—',
    actions: '',
  }));

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <SkillLevelAdvanced size={28} style={{ color: '#0f62fe' }} />
        <h1 style={{ fontSize: 28, fontWeight: 300, margin: 0 }}>Role-Skill Matrix</h1>
      </div>
      <p style={{ color: '#525252', marginBottom: 24 }}>
        Define required skills, preferred skills, certifications, and experience for each role
      </p>

      {notification && (
        <InlineNotification
          kind={notification.kind}
          title={notification.text}
          onClose={() => setNotification(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Role Table */}
      <DataTable rows={tableRows} headers={tableHeaders}>
        {({ rows: tRows, headers: tHeaders, getTableProps, getHeaderProps, getRowProps, onInputChange }: any) => (
          <TableContainer>
            <TableToolbar>
              <TableToolbarContent>
                <TableToolbarSearch
                  onChange={(e: any) => setSearch(e.target?.value || '')}
                  placeholder="Search roles..."
                />
                <Button
                  kind="primary"
                  renderIcon={Add}
                  onClick={handleCreate}
                  size="md"
                >
                  New Role
                </Button>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()} size="lg">
              <TableHead>
                <TableRow>
                  {tHeaders.map((h: any) => (
                    <TableHeader key={h.key} {...getHeaderProps({ header: h })}>
                      {h.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {tRows.map((row: any) => (
                  <TableRow key={row.id} {...getRowProps({ row })}>
                    {row.cells.map((cell: any) => (
                      <TableCell key={cell.id}>
                        {cell.info.header === 'req_skills' ? (
                          <Tag type="blue" size="sm">{cell.value} skills</Tag>
                        ) : cell.info.header === 'certs' ? (
                          <Tag type="teal" size="sm">{cell.value} certs</Tag>
                        ) : cell.info.header === 'actions' ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <Button kind="ghost" size="sm" hasIconOnly iconDescription="Edit"
                              renderIcon={Edit} onClick={() => handleEdit(row.id)} />
                            <Button kind="danger--ghost" size="sm" hasIconOnly iconDescription="Delete"
                              renderIcon={TrashCan} onClick={() => setDeleteId(row.id)} />
                          </div>
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

      {loading && <p style={{ textAlign: 'center', padding: 40, color: '#a8a8a8' }}>Loading roles...</p>}

      {/* ===================== Edit / Create Modal ===================== */}
      <Modal
        open={modalOpen}
        onRequestClose={() => setModalOpen(false)}
        onRequestSubmit={handleSave}
        modalHeading={isNewRole ? 'Create New Role' : `Edit: ${editingRole.title}`}
        primaryButtonText={saving ? 'Saving...' : (isNewRole ? 'Create Role' : 'Save Changes')}
        secondaryButtonText="Cancel"
        primaryButtonDisabled={saving || !editingRole.id || !editingRole.title}
        size="lg"
        hasScrollingContent
      >
        <div style={{ paddingTop: 8 }}>
          <Tabs>
            <TabList aria-label="Role editor tabs">
              <Tab><UserProfile size={16} style={{ marginRight: 6 }} />General</Tab>
              <Tab><SkillLevelAdvanced size={16} style={{ marginRight: 6 }} />Skills</Tab>
              <Tab><Certificate size={16} style={{ marginRight: 6 }} />Certifications</Tab>
              <Tab><Money size={16} style={{ marginRight: 6 }} />Salary & Education</Tab>
            </TabList>
            <TabPanels>
              {/* --- Tab 1: General --- */}
              <TabPanel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '16px 0' }}>
                  <TextInput
                    id="role-id"
                    labelText="Role ID (slug)"
                    placeholder="e.g., software_engineer"
                    value={editingRole.id}
                    onChange={(e: any) => updateRole('id', e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                    disabled={!isNewRole}
                    helperText={isNewRole ? 'Lowercase, underscores only' : 'Cannot change after creation'}
                  />
                  <TextInput
                    id="role-title"
                    labelText="Role Title"
                    placeholder="e.g., Software Engineer"
                    value={editingRole.title}
                    onChange={(e: any) => updateRole('title', e.target.value)}
                  />
                  <TextInput
                    id="role-dept"
                    labelText="Department"
                    placeholder="e.g., Technology"
                    value={editingRole.department}
                    onChange={(e: any) => updateRole('department', e.target.value)}
                  />
                  <NumberInput
                    id="role-exp"
                    label="Minimum Experience (years)"
                    min={0}
                    max={30}
                    value={editingRole.min_experience_years}
                    onChange={(_: any, state: any) => updateRole('min_experience_years', state.value)}
                  />
                </div>
              </TabPanel>

              {/* --- Tab 2: Skills --- */}
              <TabPanel>
                <div style={{ padding: '16px 0' }}>
                  <TagInput
                    id="req-skills"
                    label="Required Skills"
                    values={editingRole.required_skills}
                    onChange={v => updateRole('required_skills', v)}
                    tagType="red"
                    placeholder="Type a required skill & press Enter"
                  />
                  <TagInput
                    id="pref-skills"
                    label="Preferred Skills"
                    values={editingRole.preferred_skills}
                    onChange={v => updateRole('preferred_skills', v)}
                    tagType="blue"
                    placeholder="Type a preferred skill & press Enter"
                  />

                  <div style={{
                    borderTop: '1px solid #e0e0e0', paddingTop: 16, marginTop: 8
                  }}>
                    <h6 style={{ fontWeight: 500, marginBottom: 12, fontSize: 13 }}>Programming Languages</h6>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <TagInput
                        id="prog-req"
                        label="Required Languages"
                        values={editingRole.programming_languages.required}
                        onChange={v => updateNested('programming_languages', 'required', v)}
                        tagType="magenta"
                      />
                      <TagInput
                        id="prog-pref"
                        label="Preferred Languages"
                        values={editingRole.programming_languages.preferred}
                        onChange={v => updateNested('programming_languages', 'preferred', v)}
                        tagType="purple"
                      />
                    </div>
                  </div>
                </div>
              </TabPanel>

              {/* --- Tab 3: Certifications --- */}
              <TabPanel>
                <div style={{ padding: '16px 0' }}>
                  <TagInput
                    id="cert-req"
                    label="Required Certifications"
                    values={editingRole.certifications.required}
                    onChange={v => updateNested('certifications', 'required', v)}
                    tagType="red"
                    placeholder="Type a required certification & press Enter"
                  />
                  <TagInput
                    id="cert-pref"
                    label="Preferred Certifications"
                    values={editingRole.certifications.preferred}
                    onChange={v => updateNested('certifications', 'preferred', v)}
                    tagType="teal"
                    placeholder="Type a preferred certification & press Enter"
                  />
                </div>
              </TabPanel>

              {/* --- Tab 4: Salary & Education --- */}
              <TabPanel>
                <div style={{ padding: '16px 0' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <Select
                      id="edu-min"
                      labelText="Minimum Education"
                      value={editingRole.education_minimum}
                      onChange={(e: any) => updateRole('education_minimum', e.target.value)}
                    >
                      <SelectItem value="D3/Diploma" text="D3 / Diploma" />
                      <SelectItem value="D4/Diploma" text="D4 / Applied Bachelor" />
                      <SelectItem value="S1/Bachelor" text="S1 / Bachelor" />
                      <SelectItem value="S2/Master" text="S2 / Master" />
                      <SelectItem value="S3/Doctorate" text="S3 / Doctorate" />
                    </Select>
                    <div /> {/* spacer */}
                  </div>

                  <TagInput
                    id="pref-majors"
                    label="Preferred Majors"
                    values={editingRole.preferred_majors}
                    onChange={v => updateRole('preferred_majors', v)}
                    tagType="cyan"
                    placeholder="Type a preferred major & press Enter"
                  />

                  <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: 16, marginTop: 8 }}>
                    <h6 style={{ fontWeight: 500, marginBottom: 12, fontSize: 13 }}>Salary Band (IDR / month)</h6>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                      <NumberInput
                        id="salary-min"
                        label="Minimum"
                        min={0}
                        step={1000000}
                        value={editingRole.salary_band.min}
                        onChange={(_: any, state: any) => updateNested('salary_band', 'min', state.value)}
                      />
                      <NumberInput
                        id="salary-max"
                        label="Maximum"
                        min={0}
                        step={1000000}
                        value={editingRole.salary_band.max}
                        onChange={(_: any, state: any) => updateNested('salary_band', 'max', state.value)}
                      />
                      <TextInput
                        id="salary-currency"
                        labelText="Currency"
                        value={editingRole.salary_band.currency}
                        onChange={(e: any) => updateNested('salary_band', 'currency', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      </Modal>

      {/* ===================== Delete Confirm Modal ===================== */}
      <Modal
        open={!!deleteId}
        onRequestClose={() => setDeleteId(null)}
        onRequestSubmit={handleDelete}
        modalHeading="Delete Role"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        danger
        size="sm"
      >
        <p>
          Are you sure you want to delete the role <strong>{deleteId}</strong>?
          This action cannot be undone. Any skill-fit assessments referencing this role will no longer work.
        </p>
      </Modal>
    </div>
  );
};

export default RoleMatrixPage;
