# Sprint 5: HR Core Workflows — Claude Code Instructions

## Overview
Sprint 5 implements five interconnected HR workflow templates for employee onboarding, regulatory compliance, contract management, and background verification. All features use the TemplateRegistry service, Carbon UI components, and Indonesian-specific validators.

---

## LON-147: HR Workflow Template Engine

### Backend Implementation

#### TemplateRegistry Service
File: `backend/app/services/template_registry.py`

Create the WorkflowTemplate dataclass and registry service:

```python
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from uuid import UUID
import json

@dataclass
class WorkflowTemplate:
    id: UUID
    name: str
    category: str  # "HR Core", "HR Operations", "Finance", etc.
    description: str
    schema_version: str  # e.g., "1.0"
    template_json: Dict[str, Any]  # Full template schema
    is_system: bool = True
    created_at: str = None
    updated_at: str = None

class TemplateRegistry:
    """Manages workflow template lifecycle"""

    def __init__(self, db_session):
        self.db = db_session

    def list_templates(self, category: Optional[str] = None) -> List[WorkflowTemplate]:
        """List all templates, optionally filtered by category"""
        pass

    def get_template(self, template_id: UUID) -> WorkflowTemplate:
        """Retrieve single template by ID"""
        pass

    def instantiate_template(self, template_id: UUID, config: Dict[str, Any]) -> Dict[str, Any]:
        """Create workflow instance from template with custom configuration"""
        pass

    def validate_template(self, template_json: Dict[str, Any]) -> tuple[bool, List[str]]:
        """Validate template JSON schema and return (is_valid, error_list)"""
        pass

    def preview_template(self, template_id: UUID, sample_data: Dict[str, Any]) -> Dict[str, Any]:
        """Preview template execution with sample data without saving"""
        pass
```

#### Template API Endpoints
File: `backend/app/api/v1/endpoints/templates.py`

```python
from fastapi import APIRouter, HTTPException, Query
from uuid import UUID

router = APIRouter(prefix="/templates", tags=["templates"])

@router.get("")
async def list_templates(category: str = Query(None)) -> List[dict]:
    """
    GET /templates
    GET /templates?category=HR%20Core

    Returns paginated list of templates with metadata
    """
    pass

@router.get("/{template_id}")
async def get_template(template_id: UUID) -> dict:
    """
    GET /templates/{id}

    Returns full template definition with validation rules and triggers
    """
    pass

@router.post("/{template_id}/instantiate")
async def instantiate_template(template_id: UUID, config: dict) -> dict:
    """
    POST /templates/{id}/instantiate

    Payload: {
        "name": "Onboarding - John Doe",
        "configuration": {
            "document_types": ["KTP", "NPWP"],
            "auto_escalate": true,
            "require_signatures": true
        }
    }

    Returns: Workflow instance object with task graph
    """
    pass

@router.post("/{template_id}/preview")
async def preview_template(template_id: UUID, sample_data: dict) -> dict:
    """
    POST /templates/{id}/preview

    Payload: Sample document data for preview

    Returns: Execution preview without persistence
    """
    pass
```

#### Database Model
File: `backend/app/models/workflow_template.py`

```python
from sqlalchemy import Column, String, UUID, Boolean, DateTime, JSON
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
import uuid

class WorkflowTemplate(Base):
    __tablename__ = "workflow_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False)  # "HR Core", "HR Operations"
    description = Column(String(1000))
    schema_version = Column(String(20), default="1.0")
    template_json = Column(JSONB, nullable=False)  # Full template definition
    is_system = Column(Boolean, default=True)  # System templates cannot be deleted
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_category', 'category'),
        Index('idx_is_system', 'is_system'),
    )
```

#### Template JSON Schema
File: `backend/templates/schema/workflow-template-schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "metadata": {
      "type": "object",
      "properties": {
        "id": { "type": "string", "format": "uuid" },
        "name": { "type": "string" },
        "category": { "type": "string", "enum": ["HR Core", "HR Operations", "Finance"] },
        "description": { "type": "string" },
        "version": { "type": "string" }
      },
      "required": ["id", "name", "category", "version"]
    },
    "document_types": {
      "type": "array",
      "items": { "type": "string" }
    },
    "extraction_schema": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "field_name": { "type": "string" },
          "type": { "type": "string", "enum": ["string", "date", "number", "boolean"] },
          "required": { "type": "boolean" },
          "validator": { "type": "string" }
        }
      }
    },
    "validation_rules": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "rule_id": { "type": "string" },
          "rule_type": { "type": "string" },
          "description": { "type": "string" },
          "conditions": { "type": "object" },
          "error_message": { "type": "string" }
        }
      }
    },
    "action_triggers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "trigger_id": { "type": "string" },
          "event": { "type": "string" },
          "action": { "type": "string" },
          "conditions": { "type": "object" }
        }
      }
    }
  },
  "required": ["metadata", "document_types", "extraction_schema", "validation_rules"]
}
```

### Frontend Implementation

#### TemplateGalleryPage.tsx
File: `frontend/src/pages/templates/TemplateGalleryPage.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import {
  Grid,
  Column,
  Tile,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Search,
  Button,
  Modal,
} from '@carbon/react';
import { useTemplates } from '@/hooks/useTemplates';

interface TemplateData {
  id: string;
  name: string;
  category: string;
  description: string;
}

export const TemplateGalleryPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateData | null>(null);
  const [customizeModal, setCustomizeModal] = useState(false);

  const { listTemplates } = useTemplates();

  useEffect(() => {
    const category = selectedCategory === 'all' ? undefined : selectedCategory;
    listTemplates(category).then(setTemplates);
  }, [selectedCategory]);

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="template-gallery">
      <h1>Workflow Templates</h1>

      <div className="template-controls">
        <Search
          size="lg"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <Tabs>
        <TabList>
          <Tab onClick={() => setSelectedCategory('all')}>All Templates</Tab>
          <Tab onClick={() => setSelectedCategory('HR Core')}>HR Core</Tab>
          <Tab onClick={() => setSelectedCategory('HR Operations')}>HR Operations</Tab>
        </TabList>

        <TabPanels>
          <TabPanel>
            <Grid fullWidth>
              {filteredTemplates.map(template => (
                <Column key={template.id} lg={4} md={6} sm={4}>
                  <Tile>
                    <h3>{template.name}</h3>
                    <p className="category-badge">{template.category}</p>
                    <p className="description">{template.description}</p>
                    <div className="tile-actions">
                      <Button
                        kind="primary"
                        onClick={() => {
                          setPreviewTemplate(template);
                          setCustomizeModal(true);
                        }}
                      >
                        Use Template
                      </Button>
                      <Button
                        kind="ghost"
                        onClick={() => setPreviewTemplate(template)}
                      >
                        Preview
                      </Button>
                    </div>
                  </Tile>
                </Column>
              ))}
            </Grid>
          </TabPanel>
          <TabPanel>{/* HR Core Tab */}</TabPanel>
          <TabPanel>{/* HR Operations Tab */}</TabPanel>
        </TabPanels>
      </Tabs>

      {customizeModal && previewTemplate && (
        <TemplateCustomizeModal
          template={previewTemplate}
          isOpen={customizeModal}
          onClose={() => setCustomizeModal(false)}
        />
      )}
    </div>
  );
};
```

#### TemplateCustomizeModal.tsx
File: `frontend/src/components/templates/TemplateCustomizeModal.tsx`

```typescript
import React, { useState } from 'react';
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  ProgressIndicator,
  ProgressStep,
  Checkbox,
  Toggle,
  FormGroup,
  Select,
  SelectItem,
} from '@carbon/react';

interface Step {
  id: number;
  label: string;
  complete: boolean;
}

export const TemplateCustomizeModal: React.FC<{ template: any; isOpen: boolean; onClose: () => void }> = ({
  template,
  isOpen,
  onClose,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [steps] = useState<Step[]>([
    { id: 1, label: 'Review Fields', complete: false },
    { id: 2, label: 'Review Rules', complete: false },
    { id: 3, label: 'Configure Triggers', complete: false },
    { id: 4, label: 'Test with Sample', complete: false },
  ]);

  const [config, setConfig] = useState({
    selectedFields: template.extraction_schema ? Object.keys(template.extraction_schema) : [],
    enabledRules: template.validation_rules ? template.validation_rules.map((r: any) => r.rule_id) : [],
    triggers: template.action_triggers || [],
    autoEscalate: true,
    requireSignatures: true,
  });

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleInstantiate = async () => {
    // Call instantiate endpoint with config
    console.log('Instantiating with config:', config);
    onClose();
  };

  return (
    <Modal open={isOpen} onRequestClose={onClose} modalHeading="Customize Template" size="lg">
      <ModalBody>
        <ProgressIndicator currentIndex={currentStep}>
          {steps.map((step) => (
            <ProgressStep key={step.id} label={step.label} />
          ))}
        </ProgressIndicator>

        <div className="step-content" style={{ marginTop: '2rem' }}>
          {currentStep === 0 && (
            <div>
              <h4>Step 1: Review Extraction Fields</h4>
              <FormGroup>
                {Object.entries(template.extraction_schema || {}).map(([key, field]: [string, any]) => (
                  <Checkbox
                    key={key}
                    id={key}
                    labelText={`${field.field_name} (${field.type})`}
                    checked={config.selectedFields.includes(key)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setConfig({ ...config, selectedFields: [...config.selectedFields, key] });
                      } else {
                        setConfig({
                          ...config,
                          selectedFields: config.selectedFields.filter(f => f !== key),
                        });
                      }
                    }}
                  />
                ))}
              </FormGroup>
            </div>
          )}

          {currentStep === 1 && (
            <div>
              <h4>Step 2: Review Validation Rules</h4>
              <FormGroup>
                {(template.validation_rules || []).map((rule: any) => (
                  <Checkbox
                    key={rule.rule_id}
                    id={rule.rule_id}
                    labelText={`${rule.rule_id}: ${rule.description}`}
                    checked={config.enabledRules.includes(rule.rule_id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setConfig({ ...config, enabledRules: [...config.enabledRules, rule.rule_id] });
                      } else {
                        setConfig({
                          ...config,
                          enabledRules: config.enabledRules.filter(r => r !== rule.rule_id),
                        });
                      }
                    }}
                  />
                ))}
              </FormGroup>
            </div>
          )}

          {currentStep === 2 && (
            <div>
              <h4>Step 3: Configure Triggers</h4>
              <Toggle
                id="auto-escalate"
                labelText="Enable Auto-Escalation"
                toggled={config.autoEscalate}
                onToggle={(checked) => setConfig({ ...config, autoEscalate: checked })}
              />
              <Toggle
                id="require-signatures"
                labelText="Require Digital Signatures"
                toggled={config.requireSignatures}
                onToggle={(checked) => setConfig({ ...config, requireSignatures: checked })}
              />
            </div>
          )}

          {currentStep === 3 && (
            <div>
              <h4>Step 4: Test with Sample Data</h4>
              <p>Template preview will execute with sample KYC data...</p>
              {/* Sample data input/preview area */}
            </div>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <Button kind="secondary" onClick={handlePrevious} disabled={currentStep === 0}>
          Previous
        </Button>
        {currentStep < steps.length - 1 ? (
          <Button kind="primary" onClick={handleNext}>
            Next
          </Button>
        ) : (
          <Button kind="primary" onClick={handleInstantiate}>
            Create Workflow Instance
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
};
```

### Acceptance Criteria for LON-147

- [ ] TemplateRegistry service with all 5 methods implemented and tested
- [ ] Template API endpoints return correct schemas and handle validation
- [ ] TemplateGalleryPage renders category tabs and search filtering works
- [ ] TemplateCustomizeModal implements 4-step wizard with field/rule/trigger configuration
- [ ] Database model created with JSONB template_json column and indexes
- [ ] Template JSON schema validates against test templates
- [ ] API endpoints secured with authentication middleware
- [ ] Error handling with descriptive messages for invalid templates

---

## LON-148: Employee Onboarding KYC Workflow Template

### Template Definition
File: `backend/templates/hr/hr-onboarding-kyc.json`

```json
{
  "metadata": {
    "id": "tmpl-hr-onboarding-kyc-001",
    "name": "Employee Onboarding KYC",
    "category": "HR Core",
    "description": "Comprehensive KYC workflow for Indonesian employee onboarding",
    "version": "1.0",
    "language": "id-ID"
  },
  "document_types": [
    "KTP",
    "NPWP",
    "SKCK",
    "Ijazah",
    "Kartu Keluarga",
    "Passport",
    "Reference Letter",
    "Medical Certificate"
  ],
  "extraction_schema": {
    "employee_name": {
      "field_name": "Nama Lengkap",
      "type": "string",
      "required": true,
      "validator": "string_length(3,100)"
    },
    "nik": {
      "field_name": "Nomor Induk Kependudukan",
      "type": "string",
      "required": true,
      "validator": "nik_format"
    },
    "place_date_of_birth": {
      "field_name": "Tempat Tanggal Lahir",
      "type": "string",
      "required": true,
      "validator": "date_format"
    },
    "address": {
      "field_name": "Alamat Lengkap",
      "type": "string",
      "required": true,
      "validator": "string_length(10,500)"
    },
    "religion": {
      "field_name": "Agama",
      "type": "string",
      "required": true,
      "validator": "enum(Islam,Kristen,Katolik,Hindu,Buddha,Konghucu)"
    },
    "marital_status": {
      "field_name": "Status Perkawinan",
      "type": "string",
      "required": true,
      "validator": "enum(Lajang,Kawin,Cerai Mati,Cerai Hidup)"
    },
    "occupation": {
      "field_name": "Pekerjaan",
      "type": "string",
      "required": true,
      "validator": "string_length(3,100)"
    },
    "nationality": {
      "field_name": "Kewarganegaraan",
      "type": "string",
      "required": true,
      "validator": "enum(WNI,WNA)"
    },
    "ktp_expiry": {
      "field_name": "Tanggal Berlaku KTP",
      "type": "date",
      "required": true,
      "validator": "date_future"
    },
    "npwp_number": {
      "field_name": "Nomor NPWP",
      "type": "string",
      "required": true,
      "validator": "npwp_format"
    },
    "tax_registration_date": {
      "field_name": "Tanggal Pendaftaran Pajak",
      "type": "date",
      "required": false,
      "validator": "date_past"
    },
    "skck_number": {
      "field_name": "Nomor SKCK",
      "type": "string",
      "required": true,
      "validator": "string_length(5,50)"
    },
    "skck_issue_date": {
      "field_name": "Tanggal Terbit SKCK",
      "type": "date",
      "required": true,
      "validator": "date_past"
    },
    "skck_expiry_date": {
      "field_name": "Tanggal Berlaku SKCK",
      "type": "date",
      "required": true,
      "validator": "date_future"
    },
    "education_level": {
      "field_name": "Tingkat Pendidikan",
      "type": "string",
      "required": true,
      "validator": "enum(SD,SMP,SMA,D1,D2,D3,S1,S2,S3)"
    },
    "institution_name": {
      "field_name": "Nama Institusi Pendidikan",
      "type": "string",
      "required": true,
      "validator": "string_length(3,200)"
    },
    "graduation_date": {
      "field_name": "Tanggal Kelulusan",
      "type": "date",
      "required": true,
      "validator": "date_past"
    },
    "gpa": {
      "field_name": "IPK/GPA",
      "type": "number",
      "required": false,
      "validator": "number_range(0,4.0)"
    },
    "blood_type": {
      "field_name": "Golongan Darah",
      "type": "string",
      "required": true,
      "validator": "enum(O,A,B,AB)"
    },
    "medical_fitness": {
      "field_name": "Status Kesehatan",
      "type": "string",
      "required": true,
      "validator": "enum(Sehat,Dengan Catatan)"
    }
  },
  "validation_rules": [
    {
      "rule_id": "nik_format",
      "rule_type": "format",
      "description": "NIK harus 16 digit numerik",
      "conditions": {
        "field": "nik",
        "pattern": "^[0-9]{16}$"
      },
      "error_message": "Format NIK tidak valid. NIK harus 16 digit."
    },
    {
      "rule_id": "npwp_format",
      "rule_type": "format",
      "description": "NPWP format: XX.XXX.XXX.X-XXX.XXX",
      "conditions": {
        "field": "npwp_number",
        "pattern": "^[0-9]{2}\\.[0-9]{3}\\.[0-9]{3}\\.[0-9]{1}-[0-9]{3}\\.[0-9]{3}$"
      },
      "error_message": "Format NPWP tidak valid"
    },
    {
      "rule_id": "skck_validity",
      "rule_type": "temporal",
      "description": "SKCK harus berlaku minimal 6 bulan",
      "conditions": {
        "field": "skck_expiry_date",
        "min_days_ahead": 180
      },
      "error_message": "SKCK harus berlaku minimal 6 bulan ke depan"
    },
    {
      "rule_id": "age_minimum",
      "rule_type": "age_check",
      "description": "Umur karyawan minimal 18 tahun",
      "conditions": {
        "field": "place_date_of_birth",
        "min_age": 18
      },
      "error_message": "Umur karyawan harus minimal 18 tahun"
    },
    {
      "rule_id": "education_minimum",
      "rule_type": "enumeration",
      "description": "Pendidikan minimal S1",
      "conditions": {
        "field": "education_level",
        "allowed": ["S1", "S2", "S3"]
      },
      "error_message": "Pendidikan minimal harus S1"
    },
    {
      "rule_id": "name_consistency",
      "rule_type": "cross_document",
      "description": "Nama harus konsisten di KTP, NPWP, dan Ijazah",
      "conditions": {
        "fields": ["employee_name"],
        "documents": ["KTP", "NPWP", "Ijazah"],
        "tolerance": 0.95
      },
      "error_message": "Nama tidak konsisten antar dokumen"
    },
    {
      "rule_id": "medical_clearance",
      "rule_type": "status_check",
      "description": "Status kesehatan harus Sehat atau Dengan Catatan",
      "conditions": {
        "field": "medical_fitness",
        "document": "Medical Certificate",
        "required": true
      },
      "error_message": "Surat keterangan kesehatan diperlukan"
    }
  ],
  "action_triggers": [
    {
      "trigger_id": "create_employee_record",
      "event": "validation_passed",
      "action": "create_employee_record",
      "conditions": {
        "all_documents_approved": true
      },
      "payload": {
        "service_endpoint": "/api/v1/employees",
        "method": "POST",
        "include_fields": ["employee_name", "nik", "npwp_number", "address"]
      }
    },
    {
      "trigger_id": "notify_hr_manager",
      "event": "workflow_complete",
      "action": "send_notification",
      "conditions": {},
      "payload": {
        "recipient_role": "HR_MANAGER",
        "template": "onboarding_complete",
        "include_summary": true
      }
    },
    {
      "trigger_id": "alert_validation_failure",
      "event": "validation_failed",
      "action": "escalate",
      "conditions": {
        "failed_rules": ["*"]
      },
      "payload": {
        "escalation_level": 1,
        "recipient_role": "HR_MANAGER",
        "message_template": "onboarding_blocked"
      }
    },
    {
      "trigger_id": "skck_expiry_reminder",
      "event": "scheduled",
      "action": "send_reminder",
      "conditions": {
        "schedule": "0 0 1 * *",
        "check_field": "skck_expiry_date",
        "days_before": 30
      },
      "payload": {
        "recipient": "employee",
        "template": "document_expiry_reminder"
      }
    },
    {
      "trigger_id": "document_checklist",
      "event": "workflow_start",
      "action": "create_task",
      "conditions": {},
      "payload": {
        "task_list": ["Submit KTP", "Submit NPWP", "Submit SKCK", "Medical exam", "Reference check"],
        "assign_to": "employee"
      }
    }
  ]
}
```

### Indonesian Validators
File: `backend/app/validators/id_validators.py`

```python
import re
from datetime import datetime, timedelta
from typing import Tuple, List

class NIKValidator:
    """Indonesian National ID (KTP) validator"""

    @staticmethod
    def validate(nik: str) -> Tuple[bool, str]:
        """Validate NIK format (16 digits) and check digit"""
        nik = nik.strip().replace('-', '')

        if not re.match(r'^[0-9]{16}$', nik):
            return False, "NIK harus 16 digit numerik"

        # Check NIK valid checksum (simplified)
        province_code = nik[:2]
        if int(province_code) < 11 or int(province_code) > 94:
            return False, "Kode provinsi NIK tidak valid"

        return True, ""

class NPWPValidator:
    """Indonesian Tax ID validator"""

    @staticmethod
    def validate(npwp: str) -> Tuple[bool, str]:
        """Validate NPWP format: XX.XXX.XXX.X-XXX.XXX"""
        pattern = r'^[0-9]{2}\.[0-9]{3}\.[0-9]{3}\.[0-9]{1}-[0-9]{3}\.[0-9]{3}$'

        if not re.match(pattern, npwp):
            return False, "Format NPWP harus XX.XXX.XXX.X-XXX.XXX"

        return True, ""

class DocumentExpiryValidator:
    """Validate document expiry dates"""

    @staticmethod
    def validate_skck(expiry_date: str, min_days: int = 180) -> Tuple[bool, str]:
        """Check SKCK is valid for at least min_days"""
        try:
            exp_date = datetime.strptime(expiry_date, "%Y-%m-%d").date()
            min_date = datetime.now().date() + timedelta(days=min_days)

            if exp_date < min_date:
                return False, f"SKCK harus berlaku minimal {min_days} hari"
            return True, ""
        except ValueError:
            return False, "Format tanggal tidak valid"

class CrossDocumentValidator:
    """Cross-document field consistency checking"""

    @staticmethod
    def validate_name_consistency(
        name_ktp: str,
        name_npwp: str,
        name_ijazah: str,
        tolerance: float = 0.95
    ) -> Tuple[bool, str]:
        """Check name consistency across documents using fuzzy matching"""
        from difflib import SequenceMatcher

        names = [name_ktp.upper(), name_npwp.upper(), name_ijazah.upper()]

        # Compare all pairs
        ratios = []
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                ratio = SequenceMatcher(None, names[i], names[j]).ratio()
                ratios.append(ratio)

        avg_ratio = sum(ratios) / len(ratios) if ratios else 0

        if avg_ratio < tolerance:
            return False, f"Nama tidak konsisten antar dokumen (kesamaan: {avg_ratio:.0%})"

        return True, ""
```

### Claude Extraction Prompt Template
File: `backend/prompts/templates/kyc_extraction_prompt.md`

```markdown
# Indonesian KYC Document Extraction Prompt

You are an expert in extracting information from Indonesian identity documents.
Your task is to extract specific fields from the provided document image/PDF.

## Document Type: {document_type}

## Extract the following fields:
{extraction_fields}

## Instructions:
1. Extract EXACTLY as written in the document
2. For dates, use format YYYY-MM-DD
3. For phone numbers, preserve country code (+62)
4. If a field is not visible or cannot be determined, return null
5. Do NOT infer or guess values
6. For name fields, preserve capitalization as shown
7. Return response as valid JSON

## Response Format:
\`\`\`json
{
  "extracted_data": {
    "field_name": "value",
    ...
  },
  "confidence_scores": {
    "field_name": 0.95,
    ...
  },
  "warnings": ["any issues or unclear fields"]
}
\`\`\`
```

### Acceptance Criteria for LON-148

- [ ] Template JSON valid against schema with all 20 fields defined
- [ ] All 8 document types listed in extraction schema
- [ ] All 7 validation rules implemented with proper error messages in Bahasa Indonesia
- [ ] All 5 action triggers configured with correct event types
- [ ] Indonesian validators (NIK, NPWP, SKCK) implemented with checksum validation
- [ ] Cross-document validator implements fuzzy string matching for name consistency
- [ ] Claude extraction prompt template supports all field types
- [ ] Template instantiates with sample KYC data without errors

---

## LON-149: Regulatory License Tracking Workflow Template

### Template Definition
File: `backend/templates/hr/hr-license-tracking.json`

```json
{
  "metadata": {
    "id": "tmpl-hr-license-tracking-001",
    "name": "Regulatory License Tracking",
    "category": "HR Core",
    "description": "Track professional certifications and regulatory licenses for compliance",
    "version": "1.0"
  },
  "document_types": [
    "BSMR Level 1",
    "BSMR Level 2",
    "BSMR Level 3",
    "BSMR Level 4",
    "BSMR Level 5",
    "WMI",
    "AAJI",
    "CFA",
    "FRM",
    "OJK Fit & Proper"
  ],
  "extraction_schema": {
    "employee_id": {
      "field_name": "Employee ID",
      "type": "string",
      "required": true
    },
    "certification_code": {
      "field_name": "Certification Code",
      "type": "string",
      "required": true
    },
    "certification_name": {
      "field_name": "Certification Name",
      "type": "string",
      "required": true
    },
    "issue_date": {
      "field_name": "Issue Date",
      "type": "date",
      "required": true
    },
    "expiry_date": {
      "field_name": "Expiry Date",
      "type": "date",
      "required": true
    },
    "issuing_body": {
      "field_name": "Issuing Authority",
      "type": "string",
      "required": true
    },
    "license_number": {
      "field_name": "License Number",
      "type": "string",
      "required": true
    },
    "current_role": {
      "field_name": "Current Role",
      "type": "string",
      "required": true
    },
    "role_requirements": {
      "field_name": "Role Requirements",
      "type": "string",
      "required": true
    },
    "is_active": {
      "field_name": "Is Active",
      "type": "boolean",
      "required": true
    },
    "renewal_date": {
      "field_name": "Renewal Date",
      "type": "date",
      "required": false
    },
    "last_renewal": {
      "field_name": "Last Renewal",
      "type": "date",
      "required": false
    },
    "compliance_status": {
      "field_name": "Compliance Status",
      "type": "string",
      "required": true
    }
  },
  "validation_rules": [
    {
      "rule_id": "cert_not_expired",
      "rule_type": "temporal",
      "description": "Certification must not be expired",
      "conditions": {
        "field": "expiry_date",
        "comparison": "future"
      },
      "error_message": "Certification has expired"
    },
    {
      "rule_id": "role_certification_matrix",
      "rule_type": "role_mapping",
      "description": "Employee role must match certification requirements",
      "conditions": {
        "role_field": "current_role",
        "cert_field": "certification_code",
        "matrix": "role_certification_matrix.json"
      },
      "error_message": "Role does not match certification requirements"
    },
    {
      "rule_id": "renewal_window",
      "rule_type": "temporal",
      "description": "Renewal must occur within 90 days before expiry",
      "conditions": {
        "expiry_field": "expiry_date",
        "window_days": 90
      },
      "error_message": "Certification renewal window approaching"
    },
    {
      "rule_id": "issuer_validity",
      "rule_type": "enumeration",
      "description": "Issuing body must be authorized",
      "conditions": {
        "field": "issuing_body",
        "allowed_issuers": ["IBAPI", "AAUI", "KSEI", "OJK", "BAPEPAM-LK", "BEI"]
      },
      "error_message": "Issuing body not recognized"
    },
    {
      "rule_id": "license_format",
      "rule_type": "format",
      "description": "License number format must be valid",
      "conditions": {
        "field": "license_number",
        "pattern": "^[A-Z0-9-]{5,30}$"
      },
      "error_message": "License number format invalid"
    },
    {
      "rule_id": "mandatory_certs_per_role",
      "rule_type": "cardinality",
      "description": "Role must have all mandatory certifications",
      "conditions": {
        "role_field": "current_role",
        "required_by_matrix": true
      },
      "error_message": "Employee missing mandatory certifications for role"
    }
  ],
  "action_triggers": [
    {
      "trigger_id": "escalate_90_days",
      "event": "scheduled",
      "action": "escalate",
      "conditions": {
        "schedule": "0 8 * * 1",
        "check_field": "expiry_date",
        "days_before": 90
      },
      "payload": {
        "escalation_level": 1,
        "recipient_role": "EMPLOYEE",
        "message": "Your certification expires in 90 days"
      }
    },
    {
      "trigger_id": "escalate_30_days",
      "event": "scheduled",
      "action": "escalate",
      "conditions": {
        "schedule": "0 8 * * 1",
        "check_field": "expiry_date",
        "days_before": 30
      },
      "payload": {
        "escalation_level": 2,
        "recipient_roles": ["EMPLOYEE", "HR_MANAGER", "COMPLIANCE"],
        "message": "Certification expires in 30 days - renewal urgent"
      }
    },
    {
      "trigger_id": "escalate_expired",
      "event": "scheduled",
      "action": "escalate",
      "conditions": {
        "schedule": "0 8 * * 1",
        "check_field": "expiry_date",
        "days_before": 0
      },
      "payload": {
        "escalation_level": 3,
        "recipient_roles": ["HR_MANAGER", "COMPLIANCE", "LEGAL"],
        "action": "restrict_work_activities",
        "message": "CRITICAL: Certification expired - employee cannot perform role duties"
      }
    },
    {
      "trigger_id": "update_compliance_dashboard",
      "event": "cert_status_changed",
      "action": "update_dashboard",
      "conditions": {},
      "payload": {
        "dashboard_widget": "compliance_summary",
        "refresh_metrics": ["expired_count", "expiring_soon_count", "compliant_count"]
      }
    },
    {
      "trigger_id": "archive_expired",
      "event": "workflow_complete",
      "action": "archive",
      "conditions": {
        "is_expired": true
      },
      "payload": {
        "target_status": "archived",
        "keep_reference": true
      }
    },
    {
      "trigger_id": "send_renewal_reminder",
      "event": "scheduled",
      "action": "send_notification",
      "conditions": {
        "schedule": "0 9 15 * *"
      },
      "payload": {
        "recipient_roles": ["EMPLOYEE", "MANAGER"],
        "template": "certification_renewal_reminder",
        "include_renewal_guide": true
      }
    }
  ]
}
```

### Role-Certification Matrix
File: `backend/templates/hr/role_certification_matrix.json`

```json
{
  "matrix": {
    "Relationship Manager": ["BSMR1", "WMI"],
    "Senior Relationship Manager": ["BSMR2", "WMI"],
    "Risk Manager": ["BSMR3"],
    "Branch Manager": ["BSMR2"],
    "Compliance Officer": ["BSMR2", "OJK_FIT_PROPER"],
    "Treasury Manager": ["BSMR3"],
    "Insurance Agent": ["AAJI"]
  },
  "role_requirements": {
    "BSMR1": {
      "description": "Basic Securities Market Exam Level 1",
      "required_for_roles": ["Relationship Manager"],
      "renewal_period_months": 36
    },
    "BSMR2": {
      "description": "Basic Securities Market Exam Level 2",
      "required_for_roles": ["Senior Relationship Manager", "Branch Manager", "Compliance Officer"],
      "renewal_period_months": 36
    },
    "BSMR3": {
      "description": "Basic Securities Market Exam Level 3",
      "required_for_roles": ["Risk Manager", "Treasury Manager"],
      "renewal_period_months": 36
    },
    "WMI": {
      "description": "Wealth Management Intermediate",
      "required_for_roles": ["Relationship Manager", "Senior Relationship Manager"],
      "renewal_period_months": 24
    },
    "AAJI": {
      "description": "Indonesian Insurance Agent License",
      "required_for_roles": ["Insurance Agent"],
      "renewal_period_months": 12
    },
    "OJK_FIT_PROPER": {
      "description": "OJK Fit & Proper Test",
      "required_for_roles": ["Compliance Officer"],
      "renewal_period_months": 60
    }
  }
}
```

### Celery Beat Scheduler Configuration
File: `backend/app/tasks/certification_monitoring.py`

```python
from celery import shared_task
from celery.schedules import crontab
from datetime import datetime, timedelta
from app.models import Certification, Notification

@shared_task
def check_expiring_certifications():
    """Daily check for expiring certifications and trigger escalations"""

    # 90-day warning
    ninety_days = datetime.now().date() + timedelta(days=90)
    certs_90 = Certification.query.filter(
        Certification.expiry_date == ninety_days,
        Certification.is_active == True
    ).all()

    for cert in certs_90:
        notify_expiry(cert.employee_id, cert, days_remaining=90, level=1)

    # 30-day critical
    thirty_days = datetime.now().date() + timedelta(days=30)
    certs_30 = Certification.query.filter(
        Certification.expiry_date == thirty_days,
        Certification.is_active == True
    ).all()

    for cert in certs_30:
        notify_expiry(cert.employee_id, cert, days_remaining=30, level=2)

    # Expired
    today = datetime.now().date()
    expired_certs = Certification.query.filter(
        Certification.expiry_date < today,
        Certification.is_active == True
    ).all()

    for cert in expired_certs:
        deactivate_certification(cert.id)
        notify_expiry(cert.employee_id, cert, days_remaining=0, level=3)

def notify_expiry(employee_id, certification, days_remaining, level):
    """Create notification based on escalation level"""
    messages = {
        1: f"Certification {certification.certification_name} expires in {days_remaining} days",
        2: f"URGENT: {certification.certification_name} expires in {days_remaining} days",
        3: f"CRITICAL: {certification.certification_name} has expired"
    }

    notification = Notification.create(
        employee_id=employee_id,
        title=f"License Expiry - Level {level}",
        message=messages[level],
        severity="warning" if level < 3 else "critical"
    )

def deactivate_certification(cert_id):
    """Mark certification as inactive"""
    cert = Certification.query.get(cert_id)
    cert.is_active = False
    cert.compliance_status = "EXPIRED"
    cert.save()

# Celery Beat Configuration
app.conf.beat_schedule = {
    'check-expiring-certs': {
        'task': 'app.tasks.certification_monitoring.check_expiring_certifications',
        'schedule': crontab(hour=8, minute=0, day_of_week='mon'),  # Every Monday 8am
    },
}
```

### Acceptance Criteria for LON-149

- [ ] Template JSON valid with 13 fields for license tracking
- [ ] All document types (BSMR 1-5, WMI, AAJI, CFA/FRM, OJK) defined
- [ ] 6 validation rules implemented including role-certification matrix
- [ ] 6 action triggers with 90/30/0 day escalation chain
- [ ] Role-certification matrix JSON defines all 6+ roles correctly
- [ ] Celery Beat task checks certifications weekly and creates notifications
- [ ] Compliance dashboard widget updates on cert status changes
- [ ] API endpoint returns compliant/non-compliant employee counts

---

## LON-150: Employment Contract Processing Workflow Template

### Template Definition
File: `backend/templates/hr/hr-employment-contracts.json`

```json
{
  "metadata": {
    "id": "tmpl-hr-employment-contracts-001",
    "name": "Employment Contract Processing",
    "category": "HR Core",
    "description": "Process employment contracts compliant with Indonesian labor law",
    "version": "1.0",
    "jurisdiction": "Indonesia"
  },
  "document_types": [
    "PKWT",
    "PKWTT",
    "Amendment",
    "NDA",
    "Non-Compete",
    "Probation Evaluation",
    "Offer Letter"
  ],
  "extraction_schema": {
    "employee_name": {
      "field_name": "Nama Karyawan",
      "type": "string",
      "required": true
    },
    "employee_id": {
      "field_name": "ID Karyawan",
      "type": "string",
      "required": true
    },
    "contract_type": {
      "field_name": "Jenis Kontrak",
      "type": "string",
      "required": true,
      "enum": ["PKWT", "PKWTT"]
    },
    "start_date": {
      "field_name": "Tanggal Mulai",
      "type": "date",
      "required": true
    },
    "end_date": {
      "field_name": "Tanggal Berakhir",
      "type": "date",
      "required": false
    },
    "position": {
      "field_name": "Jabatan",
      "type": "string",
      "required": true
    },
    "salary": {
      "field_name": "Gaji Pokok",
      "type": "number",
      "required": true
    },
    "probation_period_days": {
      "field_name": "Durasi Percobaan (hari)",
      "type": "number",
      "required": true
    },
    "working_hours_per_week": {
      "field_name": "Jam Kerja Per Minggu",
      "type": "number",
      "required": true
    },
    "annual_leave_days": {
      "field_name": "Hari Cuti Tahunan",
      "type": "number",
      "required": true
    },
    "contract_duration_months": {
      "field_name": "Durasi Kontrak (bulan)",
      "type": "number",
      "required": false
    },
    "signed_date": {
      "field_name": "Tanggal Penandatanganan",
      "type": "date",
      "required": true
    },
    "employee_signature": {
      "field_name": "Tanda Tangan Karyawan",
      "type": "string",
      "required": true
    },
    "employer_signature": {
      "field_name": "Tanda Tangan Pemberi Kerja",
      "type": "string",
      "required": true
    },
    "renewal_date": {
      "field_name": "Tanggal Pembaruan",
      "type": "date",
      "required": false
    },
    "department": {
      "field_name": "Departemen",
      "type": "string",
      "required": true
    },
    "supervisor": {
      "field_name": "Nama Supervisor",
      "type": "string",
      "required": true
    },
    "legal_status": {
      "field_name": "Status Hukum",
      "type": "string",
      "required": true
    },
    "amendment_count": {
      "field_name": "Jumlah Amandemen",
      "type": "number",
      "required": false
    },
    "approval_chain": {
      "field_name": "Rantai Persetujuan",
      "type": "string",
      "required": false
    }
  },
  "validation_rules": [
    {
      "rule_id": "pkwt_max_duration",
      "rule_type": "contract_law",
      "description": "PKWT maximum duration is 5 years",
      "conditions": {
        "contract_type": "PKWT",
        "max_months": 60
      },
      "error_message": "PKWT tidak boleh melebihi 5 tahun"
    },
    {
      "rule_id": "pkwt_no_probation",
      "rule_type": "contract_law",
      "description": "PKWT contracts cannot have probation period",
      "conditions": {
        "contract_type": "PKWT",
        "probation_required": false
      },
      "error_message": "Kontrak PKWT tidak boleh memiliki masa percobaan"
    },
    {
      "rule_id": "pkwtt_probation_max",
      "rule_type": "contract_law",
      "description": "PKWTT probation period maximum 3 months",
      "conditions": {
        "contract_type": "PKWTT",
        "max_probation_days": 90
      },
      "error_message": "Masa percobaan PKWTT tidak boleh melebihi 3 bulan"
    },
    {
      "rule_id": "salary_above_umr",
      "rule_type": "minimum_wage",
      "description": "Salary must be above regional minimum wage (UMR)",
      "conditions": {
        "salary_field": "salary",
        "umr_lookup": "regional"
      },
      "error_message": "Gaji harus di atas UMR regional"
    },
    {
      "rule_id": "minimum_annual_leave",
      "rule_type": "labor_standard",
      "description": "Minimum 12 days annual leave required",
      "conditions": {
        "field": "annual_leave_days",
        "minimum": 12
      },
      "error_message": "Cuti tahunan minimal 12 hari"
    },
    {
      "rule_id": "working_hours_max",
      "rule_type": "labor_standard",
      "description": "Maximum 40 hours per week",
      "conditions": {
        "field": "working_hours_per_week",
        "maximum": 40
      },
      "error_message": "Jam kerja tidak boleh melebihi 40 jam per minggu"
    },
    {
      "rule_id": "signed_before_start",
      "rule_type": "temporal",
      "description": "Contract must be signed before start date",
      "conditions": {
        "signed_date_field": "signed_date",
        "start_date_field": "start_date",
        "comparison": "before"
      },
      "error_message": "Kontrak harus ditandatangani sebelum tanggal mulai kerja"
    },
    {
      "rule_id": "dual_signature_required",
      "rule_type": "signature_check",
      "description": "Contract requires both employee and employer signatures",
      "conditions": {
        "employee_signature_required": true,
        "employer_signature_required": true
      },
      "error_message": "Kontrak harus ditandatangani oleh kedua belah pihak"
    }
  ],
  "action_triggers": [
    {
      "trigger_id": "renewal_notice_60days",
      "event": "scheduled",
      "action": "send_notification",
      "conditions": {
        "schedule": "0 8 * * 1",
        "check_field": "end_date",
        "days_before": 60
      },
      "payload": {
        "recipient_roles": ["HR_MANAGER", "EMPLOYEE"],
        "template": "contract_renewal_notice",
        "include_renewal_form": true
      }
    },
    {
      "trigger_id": "employee_notice_30days",
      "event": "scheduled",
      "action": "send_notification",
      "conditions": {
        "schedule": "0 8 * * 1",
        "check_field": "end_date",
        "days_before": 30
      },
      "payload": {
        "recipient": "employee",
        "template": "contract_expiry_notice",
        "priority": "high"
      }
    },
    {
      "trigger_id": "probation_evaluation",
      "event": "date_milestone",
      "action": "create_task",
      "conditions": {
        "trigger_date_offset_days": "probation_period_days",
        "base_date": "start_date"
      },
      "payload": {
        "task_type": "probation_evaluation",
        "assign_to": "supervisor",
        "template": "probation_assessment_form"
      }
    },
    {
      "trigger_id": "archive_expired_contract",
      "event": "date_milestone",
      "action": "archive",
      "conditions": {
        "trigger_date": "end_date",
        "offset_days": 0
      },
      "payload": {
        "target_status": "archived",
        "keep_reference": true,
        "notify_compliance": true
      }
    },
    {
      "trigger_id": "legal_alert_non_compliance",
      "event": "validation_failed",
      "action": "escalate",
      "conditions": {
        "failed_rules": ["salary_above_umr", "minimum_annual_leave", "working_hours_max"]
      },
      "payload": {
        "recipient_role": "LEGAL",
        "escalation_level": 2,
        "message": "Contract contains labor law non-compliance"
      }
    }
  ]
}
```

### Labor Law Compliance Engine
File: `backend/app/services/labor_law_compliance.py`

```python
from datetime import datetime, timedelta
from typing import List, Dict, Tuple
from enum import Enum

class ContractType(Enum):
    PKWT = "PKWT"  # Fixed-term contract
    PKWTT = "PKWTT"  # Permanent contract

class LaborLawCompliance:
    """Indonesian labor law compliance checker"""

    # Indonesian labor law constants
    PKWT_MAX_MONTHS = 60  # 5 years
    PKWT_MIN_MONTHS = 1
    PKWTT_PROBATION_MAX_DAYS = 90  # 3 months
    MIN_ANNUAL_LEAVE_DAYS = 12
    MAX_WORKING_HOURS_PER_WEEK = 40

    def __init__(self, regional_umr: Dict[str, float]):
        """
        regional_umr: Dict mapping province to minimum wage
        e.g., {"Jakarta": 4850000, "Surabaya": 3300000}
        """
        self.regional_umr = regional_umr

    def validate_contract(self, contract_data: Dict) -> Tuple[bool, List[str]]:
        """Comprehensive contract validation"""
        errors = []

        # PKWT validation
        if contract_data.get('contract_type') == ContractType.PKWT.value:
            if contract_data.get('probation_period_days', 0) > 0:
                errors.append("PKWT contracts cannot have probation period")

            duration = contract_data.get('contract_duration_months', 0)
            if duration > self.PKWT_MAX_MONTHS:
                errors.append(f"PKWT duration exceeds 5 years ({duration} months)")

        # PKWTT validation
        elif contract_data.get('contract_type') == ContractType.PKWTT.value:
            probation_days = contract_data.get('probation_period_days', 0)
            if probation_days > self.PKWTT_PROBATION_MAX_DAYS:
                errors.append(f"PKWTT probation exceeds 3 months ({probation_days} days)")

        # Salary validation
        province = contract_data.get('province')
        if province and province in self.regional_umr:
            salary = contract_data.get('salary', 0)
            umr = self.regional_umr[province]
            if salary < umr:
                errors.append(f"Salary ({salary}) below UMR ({umr})")

        # Leave days validation
        leave_days = contract_data.get('annual_leave_days', 0)
        if leave_days < self.MIN_ANNUAL_LEAVE_DAYS:
            errors.append(f"Annual leave below minimum ({leave_days} < {self.MIN_ANNUAL_LEAVE_DAYS} days)")

        # Working hours validation
        working_hours = contract_data.get('working_hours_per_week', 0)
        if working_hours > self.MAX_WORKING_HOURS_PER_WEEK:
            errors.append(f"Working hours exceed maximum ({working_hours} > {self.MAX_WORKING_HOURS_PER_WEEK}/week)")

        # Date validation
        signed_date = datetime.fromisoformat(contract_data.get('signed_date', ''))
        start_date = datetime.fromisoformat(contract_data.get('start_date', ''))
        if signed_date > start_date:
            errors.append("Contract signed after start date")

        # Signature validation
        if not contract_data.get('employee_signature'):
            errors.append("Missing employee signature")
        if not contract_data.get('employer_signature'):
            errors.append("Missing employer signature")

        return len(errors) == 0, errors

    def calculate_renewal_date(self, start_date: str, duration_months: int) -> str:
        """Calculate contract renewal date"""
        start = datetime.fromisoformat(start_date)
        renewal = start.replace(month=start.month + duration_months)
        return renewal.isoformat()

    def get_contract_warnings(self, contract_data: Dict) -> List[str]:
        """Get non-critical warnings"""
        warnings = []

        end_date = datetime.fromisoformat(contract_data.get('end_date', ''))
        days_until_end = (end_date - datetime.now()).days

        if 0 < days_until_end < 90:
            warnings.append(f"Contract expires in {days_until_end} days")

        amendment_count = contract_data.get('amendment_count', 0)
        if amendment_count > 3:
            warnings.append(f"Multiple amendments ({amendment_count}) - consider new contract")

        return warnings
```

### Contract Renewal Tracker
File: `backend/app/services/contract_renewal_tracker.py`

```python
from datetime import datetime, timedelta
from app.models import EmploymentContract, RenewalTask
from app.services.labor_law_compliance import LaborLawCompliance

class ContractRenewalTracker:
    """Track and manage contract renewals"""

    def find_contracts_needing_renewal(self, days_ahead: int = 60) -> List[EmploymentContract]:
        """Find contracts expiring within days_ahead"""
        cutoff_date = datetime.now().date() + timedelta(days=days_ahead)

        contracts = EmploymentContract.query.filter(
            EmploymentContract.end_date <= cutoff_date,
            EmploymentContract.end_date > datetime.now().date(),
            EmploymentContract.status == 'ACTIVE'
        ).all()

        return contracts

    def create_renewal_task(self, contract_id: str, days_before: int):
        """Create renewal task with scheduled reminder"""
        contract = EmploymentContract.query.get(contract_id)

        task_date = contract.end_date - timedelta(days=days_before)

        renewal_task = RenewalTask(
            contract_id=contract_id,
            employee_id=contract.employee_id,
            task_date=task_date,
            days_before_expiry=days_before,
            status='PENDING'
        )
        renewal_task.save()

        return renewal_task

    def generate_renewal_report(self) -> Dict:
        """Generate comprehensive renewal status report"""
        contracts_60days = self.find_contracts_needing_renewal(60)
        contracts_30days = self.find_contracts_needing_renewal(30)

        return {
            'total_expiring_60days': len(contracts_60days),
            'total_expiring_30days': len(contracts_30days),
            'by_department': self._group_by_department(contracts_60days),
            'by_contract_type': self._group_by_type(contracts_60days),
            'critical_actions_needed': len([c for c in contracts_30days if c.status == 'PENDING_RENEWAL'])
        }

    def _group_by_department(self, contracts: List[EmploymentContract]) -> Dict[str, int]:
        """Group contracts by department"""
        groups = {}
        for contract in contracts:
            dept = contract.employee.department
            groups[dept] = groups.get(dept, 0) + 1
        return groups

    def _group_by_type(self, contracts: List[EmploymentContract]) -> Dict[str, int]:
        """Group contracts by type (PKWT/PKWTT)"""
        groups = {'PKWT': 0, 'PKWTT': 0}
        for contract in contracts:
            groups[contract.contract_type] += 1
        return groups
```

### Acceptance Criteria for LON-150

- [ ] Template JSON valid with 19 fields for contract processing
- [ ] All 7 document types defined (PKWT, PKWTT, Amendment, NDA, etc.)
- [ ] All 8 labor law validation rules implemented
- [ ] 5 action triggers configured (renewal notice, probation evaluation, archive, legal alert)
- [ ] LaborLawCompliance service validates PKWT/PKWTT/UMR/leave/hours
- [ ] ContractRenewalTracker queries expiring contracts and generates reports
- [ ] Contract comparison view displays side-by-side amendments
- [ ] API endpoint returns compliance status for all active contracts

---

## LON-151: Background Verification Workflow Template

### Template Definition
File: `backend/templates/hr/hr-background-verification.json`

```json
{
  "metadata": {
    "id": "tmpl-hr-background-verification-001",
    "name": "Background Verification",
    "category": "HR Core",
    "description": "Comprehensive background verification and risk screening",
    "version": "1.0"
  },
  "document_types": [
    "SKCK",
    "BI SLIK",
    "OJK SLIK",
    "Reference Letter",
    "Education Verification",
    "Sanctions List",
    "PEP Screening"
  ],
  "extraction_schema": {
    "employee_id": {
      "field_name": "Employee ID",
      "type": "string",
      "required": true
    },
    "employee_name": {
      "field_name": "Full Name",
      "type": "string",
      "required": true
    },
    "skck_number": {
      "field_name": "SKCK Number",
      "type": "string",
      "required": true
    },
    "skck_status": {
      "field_name": "SKCK Status",
      "type": "string",
      "enum": ["CLEAR", "NOT_CLEAR"],
      "required": true
    },
    "skck_issue_date": {
      "field_name": "SKCK Issue Date",
      "type": "date",
      "required": true
    },
    "credit_history_status": {
      "field_name": "Credit History (SLIK)",
      "type": "string",
      "enum": ["1", "2", "3", "4", "5"],
      "required": true,
      "description": "Kolektibilitas score 1-5 (1-2 is good)"
    },
    "sanctions_match": {
      "field_name": "Sanctions/PEP Match",
      "type": "boolean",
      "required": true
    },
    "education_verified": {
      "field_name": "Education Verification",
      "type": "boolean",
      "required": true
    },
    "reference_check_1": {
      "field_name": "Reference Check 1 Status",
      "type": "string",
      "enum": ["POSITIVE", "NEUTRAL", "NEGATIVE"],
      "required": true
    },
    "reference_check_2": {
      "field_name": "Reference Check 2 Status",
      "type": "string",
      "enum": ["POSITIVE", "NEUTRAL", "NEGATIVE"],
      "required": true
    },
    "reference_check_3": {
      "field_name": "Reference Check 3 Status",
      "type": "string",
      "enum": ["POSITIVE", "NEUTRAL", "NEGATIVE"],
      "required": false
    },
    "employment_history_verified": {
      "field_name": "Employment History Verified",
      "type": "boolean",
      "required": true
    },
    "criminal_record": {
      "field_name": "Criminal Record",
      "type": "boolean",
      "required": true
    },
    "financial_risk_score": {
      "field_name": "Financial Risk Score",
      "type": "number",
      "required": false,
      "description": "0-100 scale"
    },
    "overall_risk_score": {
      "field_name": "Overall Risk Score",
      "type": "number",
      "required": true,
      "description": "0-100 scale"
    },
    "recommendation": {
      "field_name": "Recommendation",
      "type": "string",
      "enum": ["APPROVE", "CONDITIONAL_APPROVE", "REJECT", "ESCALATE"],
      "required": true
    },
    "verification_date": {
      "field_name": "Verification Date",
      "type": "date",
      "required": true
    },
    "verified_by": {
      "field_name": "Verified By",
      "type": "string",
      "required": true
    }
  },
  "validation_rules": [
    {
      "rule_id": "skck_clear_status",
      "rule_type": "status_check",
      "description": "SKCK must show CLEAR status",
      "conditions": {
        "field": "skck_status",
        "required_value": "CLEAR"
      },
      "error_message": "SKCK status not clear - verification blocked"
    },
    {
      "rule_id": "credit_kolektibilitas_check",
      "rule_type": "enumeration",
      "description": "Credit history (Kolektibilitas) must be 1-2",
      "conditions": {
        "field": "credit_history_status",
        "allowed": ["1", "2"]
      },
      "error_message": "Credit history shows payment issues"
    },
    {
      "rule_id": "no_sanctions_match",
      "rule_type": "boolean_check",
      "description": "No sanctions or PEP list matches",
      "conditions": {
        "field": "sanctions_match",
        "required_value": false
      },
      "error_message": "Candidate appears on sanctions or PEP list"
    },
    {
      "rule_id": "education_authentic",
      "rule_type": "boolean_check",
      "description": "Education credentials verified authentic",
      "conditions": {
        "field": "education_verified",
        "required_value": true
      },
      "error_message": "Education credentials could not be verified"
    },
    {
      "rule_id": "skck_freshness",
      "rule_type": "temporal",
      "description": "SKCK must be issued within last 6 months",
      "conditions": {
        "field": "skck_issue_date",
        "max_age_days": 180
      },
      "error_message": "SKCK is too old - requires fresh certificate"
    },
    {
      "rule_id": "reference_positive",
      "rule_type": "reference_check",
      "description": "At least 2 of 3 references must be POSITIVE",
      "conditions": {
        "reference_fields": ["reference_check_1", "reference_check_2", "reference_check_3"],
        "min_positive": 2
      },
      "error_message": "Insufficient positive references"
    },
    {
      "rule_id": "risk_threshold",
      "rule_type": "threshold",
      "description": "Overall risk score must be below 50",
      "conditions": {
        "field": "overall_risk_score",
        "max_value": 50
      },
      "error_message": "Overall risk score exceeds acceptable threshold"
    }
  ],
  "action_triggers": [
    {
      "trigger_id": "auto_approve_low_risk",
      "event": "validation_passed",
      "action": "approve",
      "conditions": {
        "overall_risk_score_max": 20,
        "all_checks_passed": true
      },
      "payload": {
        "recommendation": "APPROVE",
        "notify_hr": true,
        "auto_send_offer": true
      }
    },
    {
      "trigger_id": "escalate_high_risk",
      "event": "validation_warning",
      "action": "escalate",
      "conditions": {
        "overall_risk_score_min": 50,
        "overall_risk_score_max": 70
      },
      "payload": {
        "escalation_level": 2,
        "recipient_roles": ["HR_MANAGER", "COMPLIANCE"],
        "recommendation": "CONDITIONAL_APPROVE",
        "require_manual_review": true
      }
    },
    {
      "trigger_id": "reject_critical_issues",
      "event": "validation_failed",
      "action": "reject",
      "conditions": {
        "failed_rules": ["skck_clear_status", "sanctions_match", "credit_kolektibilitas_check"]
      },
      "payload": {
        "recommendation": "REJECT",
        "notify_candidate": true,
        "notify_hr": true
      }
    },
    {
      "trigger_id": "regulatory_report_sanctions",
      "event": "sanctions_match_detected",
      "action": "create_report",
      "conditions": {
        "sanctions_match": true
      },
      "payload": {
        "report_type": "regulatory_compliance",
        "recipient": "compliance_officer",
        "include_details": true
      }
    },
    {
      "trigger_id": "alert_legal_fraud",
      "event": "multiple_red_flags",
      "action": "escalate",
      "conditions": {
        "fraud_indicators": ["education_not_verified", "employment_history_mismatch", "reference_negative"]
      },
      "payload": {
        "escalation_level": 3,
        "recipient_role": "LEGAL",
        "action_required": "investigate_fraud"
      }
    },
    {
      "trigger_id": "generate_bg_report",
      "event": "workflow_complete",
      "action": "generate_document",
      "conditions": {},
      "payload": {
        "document_type": "background_check_report",
        "format": "PDF",
        "include_risk_score": true,
        "include_recommendations": true
      }
    }
  ]
}
```

### Risk Scoring Engine
File: `backend/app/services/risk_scoring_engine.py`

```python
from typing import Dict
from dataclasses import dataclass

@dataclass
class RiskScore:
    criminal_score: float  # 0-30 points
    financial_score: float  # 0-25 points
    employment_score: float  # 0-20 points
    education_score: float  # 0-15 points
    sanctions_score: float  # 0-10 points
    total_score: float  # 0-100
    recommendation: str  # APPROVE, CONDITIONAL_APPROVE, REJECT, ESCALATE
    risk_level: str  # LOW, MEDIUM, HIGH, CRITICAL

class RiskScoringEngine:
    """Calculate background verification risk score"""

    # Weighting factor
    WEIGHTS = {
        'criminal': 0.30,
        'financial': 0.25,
        'employment': 0.20,
        'education': 0.15,
        'sanctions': 0.10,
    }

    # Thresholds
    THRESHOLDS = {
        'approve': 20,
        'conditional': 50,
        'reject': 70,
    }

    def calculate_score(self, verification_data: Dict) -> RiskScore:
        """Calculate composite risk score from verification data"""

        criminal_score = self._score_criminal(verification_data)
        financial_score = self._score_financial(verification_data)
        employment_score = self._score_employment(verification_data)
        education_score = self._score_education(verification_data)
        sanctions_score = self._score_sanctions(verification_data)

        # Weighted sum
        total_score = (
            criminal_score * self.WEIGHTS['criminal'] +
            financial_score * self.WEIGHTS['financial'] +
            employment_score * self.WEIGHTS['employment'] +
            education_score * self.WEIGHTS['education'] +
            sanctions_score * self.WEIGHTS['sanctions']
        )

        # Determine recommendation
        if total_score <= self.THRESHOLDS['approve']:
            recommendation = 'APPROVE'
            risk_level = 'LOW'
        elif total_score <= self.THRESHOLDS['conditional']:
            recommendation = 'CONDITIONAL_APPROVE'
            risk_level = 'MEDIUM'
        elif total_score <= self.THRESHOLDS['reject']:
            recommendation = 'ESCALATE'
            risk_level = 'HIGH'
        else:
            recommendation = 'REJECT'
            risk_level = 'CRITICAL'

        return RiskScore(
            criminal_score=criminal_score,
            financial_score=financial_score,
            employment_score=employment_score,
            education_score=education_score,
            sanctions_score=sanctions_score,
            total_score=total_score,
            recommendation=recommendation,
            risk_level=risk_level
        )

    def _score_criminal(self, data: Dict) -> float:
        """Score criminal record (0-30)"""
        if data.get('skck_status') == 'NOT_CLEAR' or data.get('criminal_record'):
            return 30  # Maximum risk
        if data.get('skck_status') == 'CLEAR':
            return 0  # No criminal record
        return 15  # Unverified

    def _score_financial(self, data: Dict) -> float:
        """Score financial history (0-25)"""
        credit_status = data.get('credit_history_status')

        if credit_status in ['1', '2']:
            return 0  # Good standing
        elif credit_status in ['3', '4']:
            return 15  # Payment issues
        else:  # '5' or missing
            return 25  # Serious issues

    def _score_employment(self, data: Dict) -> float:
        """Score employment history (0-20)"""
        if not data.get('employment_history_verified'):
            return 20  # Unverified

        positive_refs = sum([
            1 for i in range(1, 4)
            if data.get(f'reference_check_{i}') == 'POSITIVE'
        ])

        if positive_refs >= 2:
            return 0
        elif positive_refs == 1:
            return 10
        else:
            return 20

    def _score_education(self, data: Dict) -> float:
        """Score education verification (0-15)"""
        if data.get('education_verified'):
            return 0
        else:
            return 15

    def _score_sanctions(self, data: Dict) -> float:
        """Score sanctions/PEP screening (0-10)"""
        if data.get('sanctions_match'):
            return 10  # Maximum risk
        else:
            return 0
```

### SLIK Mock Integration
File: `backend/app/integrations/slik_mock.py`

```python
from typing import Dict
import random

class SLIKMockIntegration:
    """Mock BI/OJK SLIK credit bureau integration for testing"""

    def query_credit_history(self, nik: str) -> Dict:
        """
        Query credit history from SLIK
        Returns: {
            'nik': str,
            'nama': str,
            'kolektibilitas': str (1-5),  # 1-2 good, 3+ problematic
            'total_loan': int,
            'outstanding_balance': int,
            'number_of_accounts': int
        }
        """
        # Mock data - in production would call real SLIK API
        kolektibilitas_scores = ['1', '1', '2', '2', '3', '4']  # Weighted toward good

        return {
            'nik': nik,
            'nama': 'Mock Credit Data',
            'kolektibilitas': random.choice(kolektibilitas_scores),
            'total_loan': random.randint(0, 500000000),
            'outstanding_balance': random.randint(0, 100000000),
            'number_of_accounts': random.randint(1, 5),
            'status': 'completed'
        }
```

### Background Check PDF Report Generator
File: `backend/app/services/report_generator.py`

```python
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from datetime import datetime
from io import BytesIO

class BackgroundCheckReportGenerator:
    """Generate PDF background verification reports"""

    def generate_report(self, verification_data: Dict, risk_score: RiskScore) -> bytes:
        """Generate complete background check report as PDF"""

        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        story = []

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=18,
            textColor=colors.HexColor('#003366')
        )

        # Title
        story.append(Paragraph("BACKGROUND VERIFICATION REPORT", title_style))
        story.append(Spacer(1, 0.3*inch))

        # Candidate Information
        story.append(Paragraph("CANDIDATE INFORMATION", styles['Heading2']))
        candidate_data = [
            ['Name:', verification_data.get('employee_name', 'N/A')],
            ['ID:', verification_data.get('employee_id', 'N/A')],
            ['Verification Date:', verification_data.get('verification_date', 'N/A')],
        ]
        story.append(Table(candidate_data))
        story.append(Spacer(1, 0.2*inch))

        # Risk Score Summary
        story.append(Paragraph("RISK ASSESSMENT", styles['Heading2']))
        risk_data = [
            ['Category', 'Score', 'Weight'],
            ['Criminal Record', f"{risk_score.criminal_score:.0f}/30", '30%'],
            ['Financial History', f"{risk_score.financial_score:.0f}/25", '25%'],
            ['Employment History', f"{risk_score.employment_score:.0f}/20", '20%'],
            ['Education', f"{risk_score.education_score:.0f}/15", '15%'],
            ['Sanctions/PEP', f"{risk_score.sanctions_score:.0f}/10", '10%'],
            ['TOTAL RISK SCORE', f"{risk_score.total_score:.0f}/100", '—'],
        ]

        risk_table = Table(risk_data)
        risk_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, -1), (-1, -1), colors.lightgrey),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ]))

        story.append(risk_table)
        story.append(Spacer(1, 0.3*inch))

        # Recommendation
        story.append(Paragraph("RECOMMENDATION", styles['Heading2']))
        rec_text = f"<b>{risk_score.recommendation}</b> ({risk_score.risk_level} RISK)"
        story.append(Paragraph(rec_text, styles['Normal']))

        doc.build(story)
        return buffer.getvalue()
```

### Acceptance Criteria for LON-151

- [ ] Template JSON valid with 17 fields for background verification
- [ ] All 7 document types defined (SKCK, BI SLIK, OJK SLIK, etc.)
- [ ] All 7 validation rules implemented
- [ ] 6 action triggers configured (auto-approve, escalate, reject, etc.)
- [ ] Risk scoring engine calculates composite score with 5 weighted components
- [ ] SLIK mock integration returns Kolektibilitas scores
- [ ] Background check PDF report generator creates valid reports
- [ ] API endpoint accepts verification data and returns risk score + recommendation

---

## Sprint 5 Summary

### Key Deliverables
1. **LON-147**: Universal TemplateRegistry service and UI for template management
2. **LON-148**: Complete KYC workflow with Indonesian validators and extraction
3. **LON-149**: License tracking with role-matrix and Celery monitoring
4. **LON-150**: Contract processing with labor law compliance engine
5. **LON-151**: Background verification with risk scoring engine

### Integration Points
- All templates use TemplateRegistry service
- Templates instantiated via unified API
- Frontend uses TemplateGalleryPage + TemplateCustomizeModal for all workflows
- Validators shared across templates (date, format, cross-document)
- Action triggers execute via unified event system

### Testing Requirements
- Unit tests for each validator and service
- Integration tests for template instantiation
- E2E tests for complete workflows (KYC → Contract → License Tracking → Background Check)
- Template schema validation tests
- Indonesian language compliance tests

### Deployment Checklist
- [ ] Database migrations for WorkflowTemplate model
- [ ] Celery Beat configuration for license monitoring
- [ ] SLIK and government API credentials configured
- [ ] Email template configurations loaded
- [ ] Indonesian locale configuration applied
- [ ] Risk scoring thresholds calibrated for organization
- [ ] Compliance dashboard metrics configured
