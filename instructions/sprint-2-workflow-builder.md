# Sprint 2: Workflow Builder (Weeks 4-5)

Sprint 2 focuses on building the core workflow builder interface and backend services that enable SMEs to define document extraction workflows through a no-code, natural language-driven UI. The workflow builder guides users through a structured 6-step process to capture document samples, define extraction requirements in plain English, map fields, establish validation rules, review the generated schema, and test before publishing.

## Task 11: LON-127 — Workflow Builder UI

**Objective:** Create the 6-step workflow builder UI with ProgressIndicator wizard navigation.

**Steps:**
1. **Upload Samples** - Users upload sample documents (PDF/images)
2. **Define Context** - Capture natural language description of the document type and extraction purpose
3. **Extraction Fields** - Natural language input for desired fields with example hints
4. **Validation Rules** - Define field-level validation requirements in NL
5. **Review Schema** - Preview generated schema structure before publishing
6. **Test & Publish** - Run extraction tests on samples and publish the workflow

**Implementation:**

Create `frontend/src/pages/WorkflowBuilderPage.tsx`:

```typescript
import React, { useState } from 'react';
import { ProgressIndicator, ProgressStep } from '@carbon/react';
import { Button, TextInput, TextArea, Tile, Loading } from '@carbon/react';
import { Upload, ChevronRight, ChevronLeft } from '@carbon/icons-react';
import SampleUploadStep from '../components/workflow-builder/SampleUploadStep';
import DefineContextStep from '../components/workflow-builder/DefineContextStep';
import ExtractionFieldsStep from '../components/workflow-builder/ExtractionFieldsStep';
import ValidationRulesStep from '../components/workflow-builder/ValidationRulesStep';
import ReviewSchemaStep from '../components/workflow-builder/ReviewSchemaStep';
import TestPublishStep from '../components/workflow-builder/TestPublishStep';
import { WorkflowBuilderContext } from '../contexts/WorkflowBuilderContext';
import styles from './WorkflowBuilderPage.module.scss';

interface WorkflowDraft {
  name: string;
  description: string;
  samples: File[];
  documentContext: string;
  extractionFields: string;
  validationRules: string;
  schema?: Record<string, unknown>;
  testResults?: Record<string, unknown>;
}

const WorkflowBuilderPage: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [draftWorkflow, setDraftWorkflow] = useState<WorkflowDraft>({
    name: '',
    description: '',
    samples: [],
    documentContext: '',
    extractionFields: '',
    validationRules: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  const steps = [
    { label: 'Upload Samples', component: SampleUploadStep },
    { label: 'Define Context', component: DefineContextStep },
    { label: 'Extraction Fields', component: ExtractionFieldsStep },
    { label: 'Validation Rules', component: ValidationRulesStep },
    { label: 'Review Schema', component: ReviewSchemaStep },
    { label: 'Test & Publish', component: TestPublishStep },
  ];

  const CurrentStepComponent = steps[currentStep].component;

  const handleStepChange = (data: Partial<WorkflowDraft>) => {
    setDraftWorkflow((prev) => ({
      ...prev,
      ...data,
    }));
  };

  const handleNext = async () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Final step - publish
      setIsLoading(true);
      try {
        // Publish workflow
        const response = await fetch(`/api/workflows/${draftWorkflow.name}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draftWorkflow),
        });
        if (response.ok) {
          window.location.href = '/workflows';
        }
      } catch (error) {
        console.error('Failed to publish workflow:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Auto-save draft to localStorage
  React.useEffect(() => {
    localStorage.setItem('workflowDraft', JSON.stringify(draftWorkflow));
  }, [draftWorkflow]);

  return (
    <div className={styles.workflowBuilder}>
      <div className={styles.header}>
        <h1>Create Extraction Workflow</h1>
        <p className={styles.subtitle}>
          Define a document type and extraction rules in 6 simple steps
        </p>
      </div>

      <div className={styles.container}>
        <div className={styles.progressSection}>
          <ProgressIndicator currentIndex={currentStep} vertical={false}>
            {steps.map((step, index) => (
              <ProgressStep
                key={index}
                label={step.label}
                onClick={() => index <= currentStep && setCurrentStep(index)}
                secondaryLabel={index === currentStep ? 'Current' : ''}
                complete={index < currentStep}
              />
            ))}
          </ProgressIndicator>
        </div>

        <div className={styles.stepContent}>
          <WorkflowBuilderContext.Provider value={{ draftWorkflow, updateDraft: handleStepChange }}>
            <CurrentStepComponent />
          </WorkflowBuilderContext.Provider>
        </div>

        <div className={styles.navigation}>
          <Button
            kind="secondary"
            onClick={handlePrevious}
            disabled={currentStep === 0}
            renderIcon={ChevronLeft}
          >
            Previous
          </Button>
          <Button
            onClick={handleNext}
            disabled={isLoading}
            renderIcon={isLoading ? undefined : ChevronRight}
          >
            {isLoading ? <Loading small /> : currentStep === steps.length - 1 ? 'Publish' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WorkflowBuilderPage;
```

Create step components with NL text inputs and example hints:

`frontend/src/components/workflow-builder/DefineContextStep.tsx`:

```typescript
import React, { useContext } from 'react';
import { TextInput, TextArea, Tile } from '@carbon/react';
import { WorkflowBuilderContext } from '../../contexts/WorkflowBuilderContext';
import styles from './DefineContextStep.module.scss';

const DefineContextStep: React.FC = () => {
  const { draftWorkflow, updateDraft } = useContext(WorkflowBuilderContext);

  return (
    <div className={styles.step}>
      <h2>Define Document Context</h2>
      <p>Describe the document type and what you want to extract from it.</p>

      <div className={styles.formGroup}>
        <TextInput
          id="workflow-name"
          labelText="Workflow Name"
          placeholder="e.g., Invoice Processing"
          value={draftWorkflow.name}
          onChange={(e) => updateDraft({ name: e.target.value })}
          className={styles.fullWidth}
        />
      </div>

      <div className={styles.formGroup}>
        <TextArea
          id="document-context"
          labelText="Document Description"
          placeholder="Describe the document type and extraction goal..."
          value={draftWorkflow.documentContext}
          onChange={(e) => updateDraft({ documentContext: e.target.value })}
          className={styles.fullWidth}
          rows={5}
        />
        <Tile className={styles.exampleTile}>
          <strong>Example:</strong>
          <p>
            "This is an invoice document from vendors. We need to extract invoice number, date,
            vendor name, total amount, and list of line items with quantities and unit prices."
          </p>
        </Tile>
      </div>
    </div>
  );
};

export default DefineContextStep;
```

`frontend/src/components/workflow-builder/ExtractionFieldsStep.tsx`:

```typescript
import React, { useContext } from 'react';
import { TextArea, Tile } from '@carbon/react';
import { WorkflowBuilderContext } from '../../contexts/WorkflowBuilderContext';
import styles from './ExtractionFieldsStep.module.scss';

const ExtractionFieldsStep: React.FC = () => {
  const { draftWorkflow, updateDraft } = useContext(WorkflowBuilderContext);

  return (
    <div className={styles.step}>
      <h2>Define Extraction Fields</h2>
      <p>
        Describe the fields you want to extract in natural language. List field names, types, and
        any special requirements.
      </p>

      <div className={styles.formGroup}>
        <TextArea
          id="extraction-fields"
          labelText="Fields to Extract"
          placeholder="List the fields you want to extract..."
          value={draftWorkflow.extractionFields}
          onChange={(e) => updateDraft({ extractionFields: e.target.value })}
          className={styles.fullWidth}
          rows={8}
        />
        <Tile className={styles.exampleTile}>
          <strong>Example:</strong>
          <p>
            {`1. invoice_number (string) - The unique invoice identifier
2. invoice_date (date) - The date the invoice was issued
3. vendor_name (string) - Name of the vendor/seller
4. total_amount (decimal) - Total invoice amount
5. line_items (table) - Table with columns: item_name, quantity, unit_price, total_price
6. payment_terms (string) - Terms for payment (Net 30, Due on Receipt, etc.)`}
          </p>
        </Tile>
      </div>
    </div>
  );
};

export default ExtractionFieldsStep;
```

**Styling: `frontend/src/pages/WorkflowBuilderPage.module.scss`:**

```scss
.workflowBuilder {
  padding: 2rem;
  background: #ffffff;

  .header {
    margin-bottom: 2rem;

    h1 {
      font-size: 1.75rem;
      font-weight: 600;
      color: #0043ce;
      margin: 0;
    }

    .subtitle {
      color: #525252;
      margin: 0.5rem 0 0 0;
      font-size: 0.95rem;
    }
  }

  .container {
    max-width: 900px;
    margin: 0 auto;
  }

  .progressSection {
    margin-bottom: 3rem;
    background: #f4f4f4;
    padding: 1.5rem;
    border-radius: 4px;

    :global(.cds--progress) {
      display: flex;
      justify-content: space-between;
    }
  }

  .stepContent {
    background: #edf5ff;
    padding: 2rem;
    border-radius: 4px;
    min-height: 400px;
    margin-bottom: 2rem;
  }

  .navigation {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
  }
}
```

`frontend/src/components/workflow-builder/DefineContextStep.module.scss`:

```scss
.step {
  h2 {
    font-size: 1.35rem;
    color: #0043ce;
    margin-bottom: 0.5rem;
  }

  p {
    color: #525252;
    margin-bottom: 2rem;
  }

  .formGroup {
    margin-bottom: 2rem;
  }

  .fullWidth {
    width: 100%;
  }

  .exampleTile {
    background: #edf5ff;
    border-left: 4px solid #0043ce;
    padding: 1rem;
    margin-top: 1rem;

    strong {
      color: #0043ce;
      display: block;
      margin-bottom: 0.5rem;
    }

    p {
      font-size: 0.9rem;
      color: #262626;
      margin: 0.25rem 0;
      font-family: 'IBM Plex Mono', monospace;
    }
  }
}
```

**Acceptance Criteria:**
- 6-step progress indicator with current step highlighting (blue color #0043ce)
- Step components support natural language text inputs
- Example hints displayed in example cards with #EDF5FF background
- TextArea and TextInput components from Carbon Design System
- Draft state persisted to localStorage
- Users can navigate back and forth between steps
- Publish button on final step triggers workflow creation

---

## Task 12: LON-128 — Workflow API

**Objective:** Create CRUD endpoints and state management for workflows.

**Implementation:**

Create `backend/app/models/workflow.py`:

```python
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class WorkflowStatus(str, Enum):
    DRAFT = "DRAFT"
    TESTING = "TESTING"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"

class ExtractionField(BaseModel):
    name: str
    type: str  # string, date, decimal, table, etc.
    description: str
    synonyms: List[str] = []
    required: bool = False

class TableDefinition(BaseModel):
    name: str
    columns: List[ExtractionField]
    description: str

class GenerationRule(BaseModel):
    field_name: str
    rule: str

class ValidationRule(BaseModel):
    field_name: str
    rule_type: str  # required, email, date_format, numeric_range, etc.
    parameters: Dict[str, Any]

class WorkflowSchema(BaseModel):
    fields: List[ExtractionField]
    tables: List[TableDefinition] = []
    generation_rules: List[GenerationRule] = []
    validation_rules: List[ValidationRule] = []

class WorkflowCreate(BaseModel):
    name: str
    description: str
    document_context: str
    extraction_fields_nl: str
    validation_rules_nl: str
    samples: List[str] = []  # file paths or IDs

class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    document_context: Optional[str] = None
    extraction_fields_nl: Optional[str] = None
    validation_rules_nl: Optional[str] = None
    schema: Optional[WorkflowSchema] = None

class WorkflowResponse(BaseModel):
    id: str
    name: str
    description: str
    status: WorkflowStatus
    document_context: str
    extraction_fields_nl: str
    validation_rules_nl: str
    schema: Optional[WorkflowSchema]
    created_at: datetime
    updated_at: datetime
    created_by: str
    sample_ids: List[str] = []
    test_results: Optional[Dict[str, Any]] = None

class WorkflowTestRequest(BaseModel):
    sample_ids: List[str]  # IDs of samples to test against

class WorkflowTestResponse(BaseModel):
    test_id: str
    workflow_id: str
    status: str  # success, partial, failed
    results: List[Dict[str, Any]]
    summary: Dict[str, Any]
    timestamp: datetime
```

Create `backend/app/services/workflow_service.py`:

```python
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models.workflow import (
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowResponse,
    WorkflowStatus,
    WorkflowTestRequest,
    WorkflowTestResponse,
)
from app.database import Workflow as WorkflowModel
from app.services.nl_parser import NLParser

class WorkflowService:
    def __init__(self, db: Session):
        self.db = db
        self.nl_parser = NLParser()

    def create_workflow(self, workflow_data: WorkflowCreate, user_id: str) -> WorkflowResponse:
        """Create a new workflow in DRAFT status."""
        now = datetime.utcnow()
        workflow = WorkflowModel(
            id=f"wf_{datetime.now().timestamp()}",
            name=workflow_data.name,
            description=workflow_data.description,
            status=WorkflowStatus.DRAFT,
            document_context=workflow_data.document_context,
            extraction_fields_nl=workflow_data.extraction_fields_nl,
            validation_rules_nl=workflow_data.validation_rules_nl,
            schema=None,
            created_at=now,
            updated_at=now,
            created_by=user_id,
            sample_ids=workflow_data.samples,
        )
        self.db.add(workflow)
        self.db.commit()
        return self._to_response(workflow)

    def get_workflow(self, workflow_id: str) -> Optional[WorkflowResponse]:
        """Retrieve a workflow by ID."""
        workflow = self.db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
        return self._to_response(workflow) if workflow else None

    def list_workflows(self, skip: int = 0, limit: int = 50) -> List[WorkflowResponse]:
        """List all workflows."""
        workflows = (
            self.db.query(WorkflowModel)
            .order_by(WorkflowModel.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
        return [self._to_response(w) for w in workflows]

    def update_workflow(
        self, workflow_id: str, workflow_data: WorkflowUpdate
    ) -> Optional[WorkflowResponse]:
        """Update a workflow (only in DRAFT status)."""
        workflow = self.db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
        if not workflow:
            return None

        if workflow.status != WorkflowStatus.DRAFT:
            raise ValueError(f"Cannot update workflow in {workflow.status} status")

        update_data = workflow_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(workflow, key, value)
        workflow.updated_at = datetime.utcnow()
        self.db.commit()
        return self._to_response(workflow)

    async def parse_instructions(self, workflow_id: str) -> Optional[WorkflowResponse]:
        """Parse NL instructions and generate schema."""
        workflow = self.db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
        if not workflow:
            return None

        # Parse extraction fields and validation rules
        schema = await self.nl_parser.parse_instructions(
            extraction_fields=workflow.extraction_fields_nl,
            validation_rules=workflow.validation_rules_nl,
            context=workflow.document_context,
        )

        workflow.schema = schema.dict()
        workflow.updated_at = datetime.utcnow()
        self.db.commit()
        return self._to_response(workflow)

    async def test_workflow(
        self, workflow_id: str, test_request: WorkflowTestRequest
    ) -> WorkflowTestResponse:
        """Run extraction tests against sample documents."""
        workflow = self.db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
        if not workflow:
            raise ValueError(f"Workflow {workflow_id} not found")

        if workflow.status == WorkflowStatus.DRAFT:
            workflow.status = WorkflowStatus.TESTING
            self.db.commit()

        # Run tests (mock implementation)
        test_id = f"test_{datetime.now().timestamp()}"
        results = []
        for sample_id in test_request.sample_ids:
            result = await self._test_sample(workflow, sample_id)
            results.append(result)

        summary = self._summarize_test_results(results)
        workflow.test_results = {
            "test_id": test_id,
            "results": results,
            "summary": summary,
        }
        self.db.commit()

        return WorkflowTestResponse(
            test_id=test_id,
            workflow_id=workflow_id,
            status=summary["status"],
            results=results,
            summary=summary,
            timestamp=datetime.utcnow(),
        )

    async def publish_workflow(self, workflow_id: str) -> Optional[WorkflowResponse]:
        """Publish a workflow (transitions from TESTING/DRAFT to PUBLISHED)."""
        workflow = self.db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
        if not workflow:
            return None

        if workflow.schema is None:
            raise ValueError("Cannot publish workflow without schema")

        workflow.status = WorkflowStatus.PUBLISHED
        workflow.updated_at = datetime.utcnow()
        self.db.commit()
        return self._to_response(workflow)

    async def _test_sample(self, workflow: WorkflowModel, sample_id: str) -> Dict[str, Any]:
        """Test extraction on a single sample."""
        # Mock implementation
        return {
            "sample_id": sample_id,
            "status": "success",
            "fields": {},
            "confidence": 0.95,
        }

    def _summarize_test_results(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Summarize test results across all samples."""
        total = len(results)
        success = sum(1 for r in results if r["status"] == "success")
        return {
            "status": "success" if success == total else "partial",
            "total_tests": total,
            "passed": success,
            "failed": total - success,
        }

    def _to_response(self, workflow: WorkflowModel) -> WorkflowResponse:
        """Convert ORM model to response DTO."""
        return WorkflowResponse(
            id=workflow.id,
            name=workflow.name,
            description=workflow.description,
            status=workflow.status,
            document_context=workflow.document_context,
            extraction_fields_nl=workflow.extraction_fields_nl,
            validation_rules_nl=workflow.validation_rules_nl,
            schema=workflow.schema,
            created_at=workflow.created_at,
            updated_at=workflow.updated_at,
            created_by=workflow.created_by,
            sample_ids=workflow.sample_ids,
            test_results=workflow.test_results,
        )
```

Create `backend/app/routers/workflows.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.workflow import (
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowResponse,
    WorkflowTestRequest,
    WorkflowTestResponse,
)
from app.services.workflow_service import WorkflowService
from app.auth import get_current_user

router = APIRouter(prefix="/workflows", tags=["workflows"])

@router.post("/", response_model=WorkflowResponse)
async def create_workflow(
    workflow: WorkflowCreate,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Create a new workflow. SME role required."""
    # TODO: Check user role is SME
    service = WorkflowService(db)
    return service.create_workflow(workflow, current_user)

@router.get("/", response_model=List[WorkflowResponse])
async def list_workflows(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """List all workflows."""
    service = WorkflowService(db)
    return service.list_workflows(skip, limit)

@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: str,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Get a workflow by ID."""
    service = WorkflowService(db)
    workflow = service.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow

@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: str,
    workflow_update: WorkflowUpdate,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Update a workflow (only in DRAFT status)."""
    service = WorkflowService(db)
    updated = service.update_workflow(workflow_id, workflow_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return updated

@router.post("/{workflow_id}/parse", response_model=WorkflowResponse)
async def parse_workflow(
    workflow_id: str,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Parse NL instructions and generate schema."""
    service = WorkflowService(db)
    result = await service.parse_instructions(workflow_id)
    if not result:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return result

@router.post("/{workflow_id}/test", response_model=WorkflowTestResponse)
async def test_workflow(
    workflow_id: str,
    test_request: WorkflowTestRequest,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Run extraction tests against sample documents."""
    service = WorkflowService(db)
    return await service.test_workflow(workflow_id, test_request)

@router.post("/{workflow_id}/publish", response_model=WorkflowResponse)
async def publish_workflow(
    workflow_id: str,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Publish a workflow."""
    service = WorkflowService(db)
    result = await service.publish_workflow(workflow_id)
    if not result:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return result
```

**Acceptance Criteria:**
- Full CRUD operations (POST, GET, GET by ID, PUT)
- Workflow schema and state transitions (DRAFT→TESTING→PUBLISHED)
- POST /workflows/{id}/parse triggers NL parser
- POST /workflows/{id}/test runs extraction on samples
- POST /workflows/{id}/publish validates schema and publishes
- Status transitions enforced at service layer
- Proper error handling and validation

---

## Task 13: LON-129 — NL-to-Schema Parser

**Objective:** Convert natural language descriptions to structured extraction schemas.

**Implementation:**

Create `backend/app/services/nl_parser.py`:

```python
import json
import re
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from app.models.workflow import (
    WorkflowSchema,
    ExtractionField,
    TableDefinition,
    GenerationRule,
    ValidationRule,
)
import openai

NL_PARSER_SYSTEM_PROMPT = """You are an expert document extraction schema designer. Your task is to convert natural language descriptions of document extraction requirements into structured JSON schemas.

When parsing field definitions:
- Extract field name, type (string, date, decimal, boolean, table, etc.), description
- Identify synonyms (alternative names/labels for the same field)
- Mark required vs optional fields
- For tables, extract column definitions similarly

When parsing validation rules:
- Identify field-level constraints (required, format, range, etc.)
- Extract business validation requirements
- Convert NL rules to structured format

Output format: Return valid JSON with structure:
{
  "fields": [
    {
      "name": "field_name",
      "type": "string|date|decimal|boolean|table",
      "description": "what this field is",
      "synonyms": ["alt_name1", "alt_name2"],
      "required": true/false
    }
  ],
  "tables": [
    {
      "name": "table_name",
      "description": "table purpose",
      "columns": [/* ExtractionField definitions */]
    }
  ],
  "generation_rules": [
    {
      "field_name": "field_name",
      "rule": "rule description"
    }
  ],
  "validation_rules": [
    {
      "field_name": "field_name",
      "rule_type": "required|email|date_format|numeric_range|pattern",
      "parameters": {}
    }
  ]
}

Be precise, structured, and complete."""

class NLParser:
    def __init__(self, model: str = "gpt-4"):
        self.model = model
        self.client = openai.OpenAI()

    async def parse_instructions(
        self,
        extraction_fields: str,
        validation_rules: str,
        context: str = "",
    ) -> WorkflowSchema:
        """
        Parse natural language extraction and validation rules into schema.
        """
        # Combine all NL inputs
        full_prompt = f"""Document Context:
{context}

Extraction Fields:
{extraction_fields}

Validation Rules:
{validation_rules}

Generate a structured extraction schema for this document type."""

        response = self.client.messages.create(
            model=self.model,
            max_tokens=2000,
            messages=[
                {"role": "user", "content": NL_PARSER_SYSTEM_PROMPT},
                {"role": "user", "content": full_prompt},
            ],
        )

        schema_json = self._extract_json(response.content[0].text)
        return WorkflowSchema(**schema_json)

    async def refine_schema(
        self,
        schema: WorkflowSchema,
        feedback: str,
        iteration: int = 1,
    ) -> WorkflowSchema:
        """
        Refine schema based on user feedback.
        """
        if iteration > 3:
            raise ValueError("Maximum refinement iterations reached")

        current_schema = schema.dict()
        refinement_prompt = f"""Current schema:
{json.dumps(current_schema, indent=2)}

User feedback for refinement:
{feedback}

Please refine the schema based on this feedback. Output valid JSON."""

        response = self.client.messages.create(
            model=self.model,
            max_tokens=2000,
            messages=[
                {"role": "user", "content": NL_PARSER_SYSTEM_PROMPT},
                {"role": "user", "content": refinement_prompt},
            ],
        )

        schema_json = self._extract_json(response.content[0].text)
        return WorkflowSchema(**schema_json)

    def _extract_json(self, text: str) -> Dict[str, Any]:
        """Extract JSON from LLM response, handling markdown code blocks."""
        # Try to find JSON block in markdown
        match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if match:
            text = match.group(1)

        # Find and parse JSON object
        json_match = re.search(r"\{[\s\S]*\}", text)
        if json_match:
            return json.loads(json_match.group())

        raise ValueError("Could not extract valid JSON from response")

    def _validate_schema(self, schema_dict: Dict[str, Any]) -> bool:
        """Validate schema structure."""
        required_keys = {"fields"}
        return all(key in schema_dict for key in required_keys)
```

Wire into workflow router:

```python
# In backend/app/routers/workflows.py, add to parse_workflow endpoint:

@router.post("/{workflow_id}/parse", response_model=WorkflowResponse)
async def parse_workflow(
    workflow_id: str,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Parse NL instructions and generate schema."""
    service = WorkflowService(db)
    result = await service.parse_instructions(workflow_id)
    if not result:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return result
```

**Acceptance Criteria:**
- Converts NL field descriptions to structured JSON
- Extracts field names, types, descriptions, synonyms
- Identifies required vs optional fields
- Parses table definitions with columns
- Extracts validation rules from NL
- Handles multi-line, freeform input
- Returns valid WorkflowSchema
- Refinement loop with user feedback

---

## Task 14: LON-130 — Field Tuning UI

**Objective:** Create an editable schema editor for reviewing and adjusting extracted fields.

**Implementation:**

Create `frontend/src/components/SchemaEditor.tsx`:

```typescript
import React, { useState } from 'react';
import { DataTable, TableHead, TableRow, TableHeader, TableBody, TableCell } from '@carbon/react';
import { Button, TextInput, Select, SelectItem, Tag, TextArea, Toggle } from '@carbon/react';
import { Add, TrashCan, Edit } from '@carbon/icons-react';
import { ExtractionField, WorkflowSchema } from '../types';
import styles from './SchemaEditor.module.scss';

interface SchemaEditorProps {
  schema: WorkflowSchema;
  onSchemaChange: (schema: WorkflowSchema) => void;
}

const SchemaEditor: React.FC<SchemaEditorProps> = ({ schema, onSchemaChange }) => {
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<ExtractionField | null>(null);
  const [newSynonym, setNewSynonym] = useState('');

  const fieldTypes = ['string', 'date', 'decimal', 'boolean', 'table', 'currency'];

  const handleEditField = (index: number) => {
    setEditingFieldIndex(index);
    setEditingField({ ...schema.fields[index] });
  };

  const handleSaveField = (index: number) => {
    if (editingField) {
      const updatedFields = [...schema.fields];
      updatedFields[index] = editingField;
      onSchemaChange({ ...schema, fields: updatedFields });
      setEditingFieldIndex(null);
      setEditingField(null);
    }
  };

  const handleAddField = () => {
    const newField: ExtractionField = {
      name: 'new_field',
      type: 'string',
      description: '',
      synonyms: [],
      required: false,
    };
    onSchemaChange({ ...schema, fields: [...schema.fields, newField] });
  };

  const handleDeleteField = (index: number) => {
    const updatedFields = schema.fields.filter((_, i) => i !== index);
    onSchemaChange({ ...schema, fields: updatedFields });
  };

  const handleAddSynonym = (fieldIndex: number) => {
    if (newSynonym.trim() && editingField) {
      setEditingField({
        ...editingField,
        synonyms: [...editingField.synonyms, newSynonym],
      });
      setNewSynonym('');
    }
  };

  const handleRemoveSynonym = (fieldIndex: number, synIndex: number) => {
    if (editingField) {
      setEditingField({
        ...editingField,
        synonyms: editingField.synonyms.filter((_, i) => i !== synIndex),
      });
    }
  };

  return (
    <div className={styles.schemaEditor}>
      <div className={styles.header}>
        <h3>Extraction Fields</h3>
        <Button onClick={handleAddField} renderIcon={Add} kind="primary">
          Add Field
        </Button>
      </div>

      <div className={styles.tableContainer}>
        <DataTable
          rows={schema.fields.map((field, index) => ({
            id: `field-${index}`,
            index,
            name: field.name,
            displayName: field.name,
            type: field.type,
            description: field.description,
            synonyms: field.synonyms,
            required: field.required,
          }))}
          headers={[
            { key: 'name', header: 'Field Name' },
            { key: 'type', header: 'Type' },
            { key: 'description', header: 'Description' },
            { key: 'synonyms', header: 'Synonyms' },
            { key: 'required', header: 'Required' },
            { key: 'actions', header: 'Actions' },
          ]}
        >
          {({ rows, headers, getHeaderProps, getRowProps, getTableProps }) => (
            <table {...getTableProps()} className={styles.table}>
              <TableHead>
                <TableRow>
                  {headers.map((header) => (
                    <TableHeader {...getHeaderProps({ header })} key={header.key}>
                      {header.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow {...getRowProps({ row })} key={row.id}>
                    {row.cells.map((cell) => (
                      <TableCell key={cell.id}>
                        {editingFieldIndex === row.index ? (
                          <EditableFieldRow
                            field={editingField!}
                            fieldTypes={fieldTypes}
                            onChange={setEditingField}
                            onAddSynonym={() => handleAddSynonym(row.index)}
                            onRemoveSynonym={(synIndex) =>
                              handleRemoveSynonym(row.index, synIndex)
                            }
                            newSynonym={newSynonym}
                            onSynonymChange={setNewSynonym}
                            cellKey={cell.info.header}
                          />
                        ) : (
                          <div>
                            {cell.info.header === 'synonyms' && (
                              <div className={styles.synonymTags}>
                                {(cell.value as string[]).map((syn, i) => (
                                  <Tag key={i} type="blue" className={styles.synonymTag}>
                                    {syn}
                                  </Tag>
                                ))}
                              </div>
                            )}
                            {cell.info.header === 'required' && (
                              <span>{cell.value ? '✓ Required' : 'Optional'}</span>
                            )}
                            {cell.info.header === 'actions' && (
                              <div className={styles.actions}>
                                <Button
                                  size="sm"
                                  kind="ghost"
                                  onClick={() => handleEditField(row.index)}
                                  renderIcon={Edit}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  kind="danger--ghost"
                                  onClick={() => handleDeleteField(row.index)}
                                  renderIcon={TrashCan}
                                >
                                  Delete
                                </Button>
                              </div>
                            )}
                            {cell.info.header !== 'actions' &&
                              cell.info.header !== 'synonyms' &&
                              cell.info.header !== 'required' && (
                                <span>{cell.value}</span>
                              )}
                          </div>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </table>
          )}
        </DataTable>
      </div>

      {editingFieldIndex !== null && (
        <div className={styles.editPanel}>
          <Button kind="primary" onClick={() => handleSaveField(editingFieldIndex)}>
            Save Changes
          </Button>
          <Button kind="secondary" onClick={() => setEditingFieldIndex(null)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
};

interface EditableFieldRowProps {
  field: ExtractionField;
  fieldTypes: string[];
  onChange: (field: ExtractionField) => void;
  onAddSynonym: () => void;
  onRemoveSynonym: (index: number) => void;
  newSynonym: string;
  onSynonymChange: (value: string) => void;
  cellKey: string;
}

const EditableFieldRow: React.FC<EditableFieldRowProps> = ({
  field,
  fieldTypes,
  onChange,
  onAddSynonym,
  onRemoveSynonym,
  newSynonym,
  onSynonymChange,
  cellKey,
}) => {
  switch (cellKey) {
    case 'name':
      return (
        <TextInput
          size="sm"
          value={field.name}
          onChange={(e) => onChange({ ...field, name: e.target.value })}
        />
      );
    case 'type':
      return (
        <Select
          id="type-select"
          size="sm"
          value={field.type}
          onChange={(e) => onChange({ ...field, type: e.target.value })}
        >
          {fieldTypes.map((type) => (
            <SelectItem key={type} value={type} text={type} />
          ))}
        </Select>
      );
    case 'description':
      return (
        <TextArea
          value={field.description}
          onChange={(e) => onChange({ ...field, description: e.target.value })}
        />
      );
    case 'synonyms':
      return (
        <div className={styles.synonymEditor}>
          {field.synonyms.map((syn, i) => (
            <Tag
              key={i}
              onClose={() => onRemoveSynonym(i)}
              type="blue"
              className={styles.synonymTag}
            >
              {syn}
            </Tag>
          ))}
          <TextInput
            size="sm"
            placeholder="Add synonym..."
            value={newSynonym}
            onChange={(e) => onSynonymChange(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                onAddSynonym();
              }
            }}
          />
        </div>
      );
    case 'required':
      return (
        <Toggle
          id={`required-${field.name}`}
          toggled={field.required}
          onChange={(e) => onChange({ ...field, required: e.target.checked })}
        />
      );
    default:
      return <span>{field.name}</span>;
  }
};

export default SchemaEditor;
```

Create `frontend/src/components/TableSchemaEditor.tsx`:

```typescript
import React, { useState } from 'react';
import { Button, TextInput, Accordion, AccordionItem } from '@carbon/react';
import { Add } from '@carbon/icons-react';
import { TableDefinition, ExtractionField } from '../types';
import SchemaEditor from './SchemaEditor';
import styles from './TableSchemaEditor.module.scss';

interface TableSchemaEditorProps {
  tables: TableDefinition[];
  onTablesChange: (tables: TableDefinition[]) => void;
}

const TableSchemaEditor: React.FC<TableSchemaEditorProps> = ({ tables, onTablesChange }) => {
  const handleAddTable = () => {
    const newTable: TableDefinition = {
      name: 'new_table',
      columns: [],
      description: '',
    };
    onTablesChange([...tables, newTable]);
  };

  const handleUpdateTable = (index: number, updatedTable: TableDefinition) => {
    const newTables = [...tables];
    newTables[index] = updatedTable;
    onTablesChange(newTables);
  };

  return (
    <div className={styles.tableSchemaEditor}>
      <div className={styles.header}>
        <h3>Table Definitions</h3>
        <Button onClick={handleAddTable} renderIcon={Add} kind="primary">
          Add Table
        </Button>
      </div>

      <Accordion>
        {tables.map((table, index) => (
          <AccordionItem key={index} title={table.name}>
            <div className={styles.tableEditor}>
              <TextInput
                labelText="Table Name"
                value={table.name}
                onChange={(e) =>
                  handleUpdateTable(index, {
                    ...table,
                    name: e.target.value,
                  })
                }
              />
              <TextInput
                labelText="Description"
                value={table.description}
                onChange={(e) =>
                  handleUpdateTable(index, {
                    ...table,
                    description: e.target.value,
                  })
                }
              />
              <SchemaEditor
                schema={{
                  fields: table.columns,
                  tables: [],
                  generation_rules: [],
                  validation_rules: [],
                }}
                onSchemaChange={(schema) =>
                  handleUpdateTable(index, {
                    ...table,
                    columns: schema.fields,
                  })
                }
              />
            </div>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

export default TableSchemaEditor;
```

**Styling: `frontend/src/components/SchemaEditor.module.scss`:**

```scss
.schemaEditor {
  padding: 1.5rem;
  background: #ffffff;
  border-radius: 4px;

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;

    h3 {
      margin: 0;
      color: #0043ce;
    }
  }

  .tableContainer {
    overflow-x: auto;
    margin-bottom: 1rem;
  }

  .table {
    width: 100%;
    background: #ffffff;
    border-collapse: collapse;

    :global(thead) {
      background: #d0e2ff;
      color: #0043ce;
      font-weight: 600;

      th {
        padding: 1rem;
        text-align: left;
        border-bottom: 2px solid #0043ce;
      }
    }

    :global(tbody) {
      tr {
        border-bottom: 1px solid #e0e0e0;

        &:hover {
          background: #f5f5f5;
        }

        td {
          padding: 0.75rem 1rem;
        }
      }
    }
  }

  .synonymTags {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .synonymTag {
    background: #edf5ff;
    color: #0043ce;
  }

  .synonymEditor {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .editPanel {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #e0e0e0;
  }
}
```

**Acceptance Criteria:**
- Editable DataTable with inline field editing
- Type dropdown with predefined options
- Synonym tag input with add/remove
- Required toggle for each field
- Add and delete field buttons
- Table schema editor with expandable definitions
- Integration with workflow builder Step 5
- Styling with #D0E2FF header, #EDF5FF synonym tags, #FFF8E1 edit mode
- Save changes to backend API

---

## Task 15: LON-131 — Sample Processing Review

**Objective:** Create split-view interface for reviewing extraction results against original documents.

**Implementation:**

Create `frontend/src/components/DocumentViewer.tsx`:

```typescript
import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button, NumberInput } from '@carbon/react';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from '@carbon/icons-react';
import styles from './DocumentViewer.module.scss';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface DocumentViewerProps {
  documentUrl: string;
  fileName: string;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ documentUrl, fileName }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(100);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const handleZoom = (direction: 'in' | 'out') => {
    if (direction === 'in' && zoom < 200) {
      setZoom(zoom + 10);
    } else if (direction === 'out' && zoom > 50) {
      setZoom(zoom - 10);
    }
  };

  const handlePageChange = (direction: 'next' | 'prev') => {
    if (direction === 'next' && pageNumber < numPages) {
      setPageNumber(pageNumber + 1);
    } else if (direction === 'prev' && pageNumber > 1) {
      setPageNumber(pageNumber - 1);
    }
  };

  return (
    <div className={styles.documentViewer}>
      <div className={styles.header}>
        <h3>{fileName}</h3>
        <div className={styles.controls}>
          <Button
            size="sm"
            kind="ghost"
            onClick={() => handlePageChange('prev')}
            disabled={pageNumber === 1}
            renderIcon={ChevronLeft}
          >
            Prev
          </Button>
          <NumberInput
            id="page-number"
            min={1}
            max={numPages}
            value={pageNumber}
            onChange={(e) => setPageNumber(Math.min(Math.max(1, parseInt(e.target.value)), numPages))}
            hideSteppers
            size="sm"
            className={styles.pageInput}
          />
          <span className={styles.pageCount}>/ {numPages}</span>
          <Button
            size="sm"
            kind="ghost"
            onClick={() => handlePageChange('next')}
            disabled={pageNumber === numPages}
            renderIcon={ChevronRight}
          >
            Next
          </Button>
          <div className={styles.divider} />
          <Button
            size="sm"
            kind="ghost"
            onClick={() => handleZoom('out')}
            renderIcon={ZoomOut}
          >
            -
          </Button>
          <span className={styles.zoomLevel}>{zoom}%</span>
          <Button
            size="sm"
            kind="ghost"
            onClick={() => handleZoom('in')}
            renderIcon={ZoomIn}
          >
            +
          </Button>
        </div>
      </div>

      <div className={styles.content}>
        <Document
          file={documentUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div>Loading PDF...</div>}
        >
          <Page pageNumber={pageNumber} scale={zoom / 100} />
        </Document>
      </div>
    </div>
  );
};

export default DocumentViewer;
```

Create `frontend/src/components/ExtractionResults.tsx`:

```typescript
import React, { useState } from 'react';
import { Button, TextInput, NumberInput, Select, SelectItem } from '@carbon/react';
import { Edit, Checkmark, Close } from '@carbon/icons-react';
import styles from './ExtractionResults.module.scss';

interface ExtractedField {
  name: string;
  value: string | number | boolean;
  confidence: number;
  corrected?: boolean;
  corrections?: string | number | boolean;
}

interface ExtractionResultsProps {
  results: ExtractedField[];
  onCorrect: (fieldName: string, newValue: string | number | boolean) => void;
  onRerun: () => void;
}

const ExtractionResults: React.FC<ExtractionResultsProps> = ({
  results,
  onCorrect,
  onRerun,
}) => {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'green';
    if (confidence >= 0.6) return 'yellow';
    return 'red';
  };

  const handleEdit = (field: ExtractedField) => {
    setEditingField(field.name);
    setEditValue(String(field.corrections ?? field.value));
  };

  const handleSave = (fieldName: string) => {
    onCorrect(fieldName, editValue);
    setEditingField(null);
  };

  const handleCancel = () => {
    setEditingField(null);
    setEditValue('');
  };

  return (
    <div className={styles.extractionResults}>
      <div className={styles.header}>
        <h3>Extracted Fields</h3>
        <Button onClick={onRerun} kind="secondary">
          Re-run Extraction
        </Button>
      </div>

      <div className={styles.fieldsList}>
        {results.map((field) => (
          <div
            key={field.name}
            className={`${styles.fieldItem} ${
              field.corrected ? styles.corrected : ''
            } ${getConfidenceColor(field.confidence)}`}
          >
            <div className={styles.fieldHeader}>
              <span className={styles.fieldName}>{field.name}</span>
              <div className={styles.confidence}>
                <span
                  className={`${styles.confidenceBadge} ${styles[getConfidenceColor(
                    field.confidence
                  )]}`}
                >
                  {(field.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {editingField === field.name ? (
              <div className={styles.editMode}>
                <TextInput
                  id={`edit-${field.name}`}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className={styles.editInput}
                />
                <div className={styles.editActions}>
                  <Button
                    size="sm"
                    kind="primary"
                    onClick={() => handleSave(field.name)}
                    renderIcon={Checkmark}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    kind="secondary"
                    onClick={handleCancel}
                    renderIcon={Close}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className={styles.fieldValue}>
                <span className={styles.value}>
                  {field.corrections ?? field.value}
                </span>
                <Button
                  size="sm"
                  kind="ghost"
                  onClick={() => handleEdit(field)}
                  renderIcon={Edit}
                >
                  Correct
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExtractionResults;
```

Create `frontend/src/components/SampleReviewPanel.tsx`:

```typescript
import React, { useState } from 'react';
import DocumentViewer from './DocumentViewer';
import ExtractionResults from './ExtractionResults';
import styles from './SampleReviewPanel.module.scss';

interface ExtractedField {
  name: string;
  value: string | number | boolean;
  confidence: number;
  corrected?: boolean;
  corrections?: string | number | boolean;
}

interface Sample {
  id: string;
  fileName: string;
  documentUrl: string;
  extractedFields: ExtractedField[];
}

interface SampleReviewPanelProps {
  sample: Sample;
  onCorrections: (corrections: Record<string, string | number | boolean>) => void;
  onRerun: () => void;
}

const SampleReviewPanel: React.FC<SampleReviewPanelProps> = ({
  sample,
  onCorrections,
  onRerun,
}) => {
  const [corrections, setCorrections] = useState<Record<string, string | number | boolean>>({});

  const handleCorrect = (fieldName: string, newValue: string | number | boolean) => {
    const updated = {
      ...corrections,
      [fieldName]: newValue,
    };
    setCorrections(updated);
    onCorrections(updated);

    // Call API to save correction
    fetch(`/api/extractions/${sample.id}/correct`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [fieldName]: newValue }),
    }).catch((error) => console.error('Failed to save correction:', error));
  };

  return (
    <div className={styles.sampleReviewPanel}>
      <div className={styles.splitView}>
        <div className={styles.leftPanel}>
          <DocumentViewer
            documentUrl={sample.documentUrl}
            fileName={sample.fileName}
          />
        </div>
        <div className={styles.rightPanel}>
          <ExtractionResults
            results={sample.extractedFields.map((field) => ({
              ...field,
              corrections: corrections[field.name] ?? field.corrections,
            }))}
            onCorrect={handleCorrect}
            onRerun={onRerun}
          />
        </div>
      </div>
    </div>
  );
};

export default SampleReviewPanel;
```

**Styling: `frontend/src/components/SampleReviewPanel.module.scss`:**

```scss
.sampleReviewPanel {
  width: 100%;
  height: 100%;
  padding: 1.5rem;

  .splitView {
    display: flex;
    gap: 2rem;
    height: 100%;

    @media (max-width: 1200px) {
      flex-direction: column;
      gap: 2rem;
    }
  }

  .leftPanel {
    flex: 1;
    min-width: 0;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    overflow: hidden;
  }

  .rightPanel {
    flex: 1;
    min-width: 0;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    overflow-y: auto;
  }
}
```

`frontend/src/components/DocumentViewer.module.scss`:

```scss
.documentViewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f4f4f4;

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: #ffffff;
    border-bottom: 1px solid #e0e0e0;

    h3 {
      margin: 0;
      color: #0043ce;
      font-size: 0.95rem;
    }

    .controls {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .pageInput {
      width: 50px;
    }

    .pageCount {
      font-size: 0.85rem;
      color: #525252;
    }

    .divider {
      width: 1px;
      height: 24px;
      background: #e0e0e0;
      margin: 0 0.5rem;
    }

    .zoomLevel {
      font-size: 0.85rem;
      color: #525252;
      min-width: 45px;
      text-align: center;
    }
  }

  .content {
    flex: 1;
    overflow: auto;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 1rem;
    background: #f4f4f4;

    :global(canvas) {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
  }
}
```

`frontend/src/components/ExtractionResults.module.scss`:

```scss
.extractionResults {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1rem;
  background: #ffffff;

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e0e0e0;

    h3 {
      margin: 0;
      color: #0043ce;
    }
  }

  .fieldsList {
    flex: 1;
    overflow-y: auto;
  }

  .fieldItem {
    padding: 1rem;
    margin-bottom: 0.75rem;
    border-radius: 4px;
    border-left: 4px solid #e0e0e0;
    background: #ffffff;

    &.corrected {
      border-left-color: #0043ce;
      background: #f0f7ff;
    }

    &.green {
      border-left-color: #24a148;
    }

    &.yellow {
      border-left-color: #f1c21b;
    }

    &.red {
      border-left-color: #da1e28;
    }
  }

  .fieldHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .fieldName {
    font-weight: 600;
    color: #0043ce;
  }

  .confidence {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .confidenceBadge {
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;

    &.green {
      background: #d0f2d0;
      color: #24a148;
    }

    &.yellow {
      background: #fff8d6;
      color: #b8860b;
    }

    &.red {
      background: #ffd4d4;
      color: #da1e28;
    }
  }

  .fieldValue {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    background: #f4f4f4;
    border-radius: 2px;

    .value {
      color: #262626;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.9rem;
    }
  }

  .editMode {
    display: flex;
    gap: 0.5rem;
    background: #fff8e1;
    padding: 0.5rem;
    border-radius: 2px;

    .editInput {
      flex: 1;
    }

    .editActions {
      display: flex;
      gap: 0.5rem;
    }
  }
}
```

**Acceptance Criteria:**
- Split-view layout with PDF viewer on left, extraction results on right
- PDF page navigation and zoom controls (zoom in/out, page number input)
- Extracted fields displayed as list with confidence badges
- Color-coded confidence: green ≥80%, yellow ≥60%, red <60%
- Inline edit mode for field corrections (click "Correct" button)
- Corrected fields highlighted with blue border
- Save corrections via PUT /extractions/{id}/correct
- Re-run extraction button
- Responsive layout (stacked on smaller screens)

---

## Sprint 2 Completion Checklist

- [ ] Task 11 (LON-127): Workflow Builder UI with 6-step ProgressIndicator completed
  - [ ] All 6 step components created and functional
  - [ ] NL text inputs with example hints
  - [ ] Draft state persists to localStorage
  - [ ] Navigation between steps working
  - [ ] Publish button on final step

- [ ] Task 12 (LON-128): Workflow API endpoints completed
  - [ ] POST /workflows (create, SME only)
  - [ ] GET /workflows (list all)
  - [ ] GET /workflows/{id} (retrieve)
  - [ ] PUT /workflows/{id} (update DRAFT workflows)
  - [ ] POST /workflows/{id}/parse (triggers NL parser)
  - [ ] POST /workflows/{id}/test (runs extraction tests)
  - [ ] POST /workflows/{id}/publish (publishes workflow)
  - [ ] Status transitions enforced (DRAFT→TESTING→PUBLISHED)

- [ ] Task 13 (LON-129): NL-to-Schema Parser completed
  - [ ] NLParser class with parse_instructions() method
  - [ ] Converts NL descriptions to structured JSON schemas
  - [ ] Extracts fields with names, types, descriptions, synonyms
  - [ ] Identifies required vs optional fields
  - [ ] Parses table definitions with columns
  - [ ] Extracts validation rules from NL
  - [ ] Refinement loop with user feedback working
  - [ ] Integrated into POST /workflows/{id}/parse

- [ ] Task 14 (LON-130): Field Tuning UI completed
  - [ ] SchemaEditor.tsx with Carbon DataTable
  - [ ] Inline editing for all field properties
  - [ ] Type dropdown with predefined options
  - [ ] Synonym tag input with add/remove
  - [ ] Required toggle for each field
  - [ ] Add/delete field buttons
  - [ ] TableSchemaEditor.tsx for table definitions
  - [ ] Integrated into workflow builder Step 5
  - [ ] Proper styling with #D0E2FF header, #EDF5FF tags
  - [ ] Changes save to API

- [ ] Task 15 (LON-131): Sample Processing Review completed
  - [ ] Split-view layout (DocumentViewer + ExtractionResults)
  - [ ] PDF viewer with page navigation and zoom
  - [ ] Extracted fields list with confidence badges
  - [ ] Color-coded confidence (green/yellow/red)
  - [ ] Inline correction mode
  - [ ] Corrections saved via PUT /extractions/{id}/correct
  - [ ] Re-run extraction button
  - [ ] Corrected fields highlighted with blue border
  - [ ] Responsive layout

- [ ] Code quality and testing
  - [ ] All components have TypeScript types
  - [ ] Error handling implemented
  - [ ] Loading states for async operations
  - [ ] Unit tests for parser and service layer
  - [ ] Integration tests for API endpoints

- [ ] Documentation
  - [ ] API endpoints documented
  - [ ] Component prop types documented
  - [ ] NL parser system prompt documented
  - [ ] Schema validation rules documented

- [ ] Deployment and integration
  - [ ] Frontend routes configured
  - [ ] Backend routes mounted in main app
  - [ ] Database migrations for workflow table
  - [ ] Environment variables configured
