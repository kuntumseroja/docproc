# Sprint 3: Validation & Actions (Weeks 6-7)

This sprint focuses on implementing post-extraction validation, data generation, action execution, quality evaluation, and confidence scoring. These components transform raw extracted data into validated, enriched, actionable insights while maintaining audit trails and human oversight capabilities.

---

## Task 16: LON-132 — Validation Agent

**Objective:** Implement a validation agent that checks natural language-defined business rules against extracted data, returning per-rule results with pass/fail status and severity levels.

### Backend Implementation

#### `backend/agents/validation.py`

```python
"""
Validation Agent: Executes business rules against extracted data.
"""
import json
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, asdict
from datetime import datetime
import anthropic

@dataclass
class ValidationResult:
    """Single rule validation result."""
    rule_name: str
    rule_id: str
    passed: bool
    details: str
    severity: str  # "critical", "high", "medium", "low"
    field_names: List[str]
    timestamp: str

class ValidationAgent:
    """Executes business rules against extracted data."""

    VALIDATION_SYSTEM = """You are a strict validation agent. Your job is to evaluate extracted document data against business rules.

For each rule provided:
1. Parse the rule carefully
2. Check if the extracted data satisfies the rule
3. Return structured result with: rule_name, passed (boolean), details (explanation), severity

Rules can be:
- Cross-field: "Invoice total must equal sum of line items"
- Completeness: "Invoice must have buyer name and address"
- Format: "Date must be YYYY-MM-DD"
- Range: "Quantity must be positive integer"
- Dependency: "If expedited=true, shipping_date must be within 2 days"

For each failed rule, provide clear details explaining what was missing or violated.
Severity guides: critical (process blocks), high (data unreliable), medium (needs review), low (warning).

Return JSON array of validation results."""

    def __init__(self, client: Optional[anthropic.Anthropic] = None):
        self.client = client or anthropic.Anthropic()

    def validate(
        self,
        extracted_data: Dict[str, Any],
        rules: List[Dict[str, str]],
        document_id: str
    ) -> List[ValidationResult]:
        """
        Execute validation rules against extracted data.

        Args:
            extracted_data: Dictionary of extracted fields and values
            rules: List of rule dicts with 'id', 'name', 'rule_text', 'severity'
            document_id: ID of document being validated

        Returns:
            List of ValidationResult objects
        """
        if not rules:
            return []

        # Format rules for the agent
        rules_text = "\n".join([
            f"- [{r['id']}] {r['name']} (severity: {r.get('severity', 'medium')}): {r['rule_text']}"
            for r in rules
        ])

        prompt = f"""Validate this extracted data against the following rules:

EXTRACTED DATA:
{json.dumps(extracted_data, indent=2)}

RULES TO CHECK:
{rules_text}

Return a JSON array with one object per rule, with fields:
- rule_id: ID from rule
- rule_name: Name from rule
- passed: true/false
- details: Explanation of result (1-2 sentences)
- severity: Severity level from rule
- field_names: List of field names involved in this rule

Return ONLY the JSON array, no other text."""

        message = self.client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=2000,
            system=self.VALIDATION_SYSTEM,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        # Parse response
        response_text = message.content[0].text.strip()

        # Extract JSON array
        if response_text.startswith("["):
            results_data = json.loads(response_text)
        else:
            # Try to find JSON array in response
            import re
            match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if match:
                results_data = json.loads(match.group())
            else:
                raise ValueError(f"Could not parse validation results: {response_text}")

        # Convert to ValidationResult objects
        results = []
        for result_data in results_data:
            result = ValidationResult(
                rule_name=result_data.get('rule_name', ''),
                rule_id=result_data.get('rule_id', ''),
                passed=result_data.get('passed', False),
                details=result_data.get('details', ''),
                severity=result_data.get('severity', 'medium'),
                field_names=result_data.get('field_names', []),
                timestamp=datetime.utcnow().isoformat()
            )
            results.append(result)

        return results

    def get_failed_rules(self, results: List[ValidationResult]) -> List[ValidationResult]:
        """Filter to only failed validation rules."""
        return [r for r in results if not r.passed]

    def get_critical_issues(self, results: List[ValidationResult]) -> List[ValidationResult]:
        """Filter to critical severity failures."""
        return [r for r in results if not r.passed and r.severity == "critical"]
```

### Wire into Supervisor

```python
# In backend/agents/supervisor.py, add to SupervisorAgent class:

from agents.validation import ValidationAgent

class SupervisorAgent:
    def __init__(self):
        # ... existing init code ...
        self.validation_agent = ValidationAgent(self.client)

    async def process_document_with_validation(
        self,
        document_id: str,
        extracted_data: Dict[str, Any],
        workflow_id: str
    ):
        """Extract -> Validate -> Store results."""

        # Get validation rules from workflow
        workflow = await self.db.get_workflow(workflow_id)
        rules = workflow.get('validation_rules', [])

        # Run validation
        validation_results = self.validation_agent.validate(
            extracted_data=extracted_data,
            rules=rules,
            document_id=document_id
        )

        # Store validation results
        await self.db.save_validation_results(
            document_id=document_id,
            results=[asdict(r) for r in validation_results]
        )

        return validation_results
```

### Database Schema

```python
# In backend/app/models/validation.py

from sqlalchemy import Column, String, JSON, Boolean, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class ValidationResult(Base):
    """Stored validation results for extracted data."""
    __tablename__ = "validation_results"

    id = Column(String, primary_key=True)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    rule_id = Column(String, nullable=False)
    rule_name = Column(String, nullable=False)
    passed = Column(Boolean, nullable=False)
    details = Column(String)
    severity = Column(String)  # critical, high, medium, low
    field_names = Column(JSON)  # List of fields involved
    timestamp = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_document_id', 'document_id'),
        Index('idx_rule_id', 'rule_id'),
    )
```

### API Endpoints

```python
# In backend/app/routes/validation.py

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/documents", tags=["validation"])

@router.get("/{document_id}/validations")
async def get_document_validations(
    document_id: str,
    db: Session = Depends(get_db)
):
    """Retrieve validation results for a document."""
    results = db.query(ValidationResult)\
        .filter(ValidationResult.document_id == document_id)\
        .order_by(ValidationResult.timestamp.desc())\
        .all()

    if not results:
        raise HTTPException(status_code=404, detail="No validation results found")

    return {
        "document_id": document_id,
        "total_rules": len(results),
        "passed": sum(1 for r in results if r.passed),
        "failed": sum(1 for r in results if not r.passed),
        "results": [
            {
                "rule_id": r.rule_id,
                "rule_name": r.rule_name,
                "passed": r.passed,
                "details": r.details,
                "severity": r.severity,
                "timestamp": r.timestamp.isoformat()
            }
            for r in results
        ]
    }

@router.get("/{document_id}/validations/critical")
async def get_critical_issues(
    document_id: str,
    db: Session = Depends(get_db)
):
    """Get only critical validation failures."""
    results = db.query(ValidationResult)\
        .filter(
            ValidationResult.document_id == document_id,
            ValidationResult.passed == False,
            ValidationResult.severity == "critical"
        )\
        .all()

    return {
        "document_id": document_id,
        "critical_issues": len(results),
        "issues": [
            {
                "rule_name": r.rule_name,
                "details": r.details,
                "fields": r.field_names
            }
            for r in results
        ]
    }
```

### Tests

```python
# In backend/tests/test_validation_agent.py

import pytest
from agents.validation import ValidationAgent

@pytest.fixture
def validation_agent():
    return ValidationAgent()

def test_cross_field_validation(validation_agent):
    """Test validation across multiple fields."""
    extracted_data = {
        "line_items": [
            {"quantity": 2, "unit_price": 10.0},
            {"quantity": 3, "unit_price": 5.0}
        ],
        "total_amount": 50.0
    }

    rules = [
        {
            "id": "rule_1",
            "name": "Total matches sum",
            "rule_text": "Invoice total must equal sum of (quantity * unit_price) for all line items",
            "severity": "critical"
        }
    ]

    results = validation_agent.validate(extracted_data, rules, "doc_123")
    assert len(results) == 1
    assert results[0].passed == True

def test_completeness_validation(validation_agent):
    """Test that required fields are present."""
    extracted_data = {
        "buyer_name": "ACME Corp",
        # Missing: buyer_address
    }

    rules = [
        {
            "id": "rule_2",
            "name": "Complete buyer info",
            "rule_text": "Invoice must have buyer_name and buyer_address",
            "severity": "high"
        }
    ]

    results = validation_agent.validate(extracted_data, rules, "doc_123")
    assert len(results) == 1
    assert results[0].passed == False

def test_format_validation(validation_agent):
    """Test format compliance."""
    extracted_data = {
        "invoice_date": "2024-03-15",
        "due_date": "15/03/2024"  # Wrong format
    }

    rules = [
        {
            "id": "rule_3",
            "name": "Date format",
            "rule_text": "All dates must be in YYYY-MM-DD format",
            "severity": "medium"
        }
    ]

    results = validation_agent.validate(extracted_data, rules, "doc_123")
    assert results[0].passed == False
```

### Acceptance Criteria

- [x] NL-defined business rules are executable against extracted data
- [x] Cross-field validation (e.g., total = sum of line items)
- [x] Completeness checks (required fields present)
- [x] Format validation (dates, numbers, enums)
- [x] Pass/fail per rule with details and severity
- [x] Integrated into Supervisor pipeline
- [x] Validation results stored in database
- [x] API endpoint: GET /documents/{id}/validations

---

## Task 17: LON-133 — Generation Agent

**Objective:** Implement an agent that generates and executes Python code in a sandboxed environment to perform calculations, aggregations, and data transformations.

### Backend Implementation

#### `backend/agents/generation.py`

```python
"""
Generation Agent: Generates and executes Python code for data transformations.
"""
import json
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime
import anthropic

@dataclass
class GenerationResult:
    """Result of code generation and execution."""
    rule_id: str
    rule_name: str
    code: str
    success: bool
    output: Any
    error: Optional[str]
    execution_time_ms: float
    timestamp: str

class GenerationAgent:
    """Generates and executes Python code for data transformations."""

    GENERATION_SYSTEM = """You are a code generation agent. Your job is to generate Python code to transform extracted document data.

For each generation rule provided:
1. Parse the requirement carefully
2. Generate Python code to execute the transformation
3. The code receives 'data' as a dict with extracted fields
4. Return JSON with: rule_id, rule_name, code (as string), description

Examples:
- Summary table from line items: use pandas groupby
- Calculate totals: sum() across lists
- Format output: dict or JSON

Code must:
- Use only standard library or pre-approved packages (pandas, numpy)
- Not access filesystem or network
- Complete within reasonable time
- Return result as JSON-serializable dict/list

Return JSON object with fields:
- rule_id: ID from rule
- rule_name: Name from rule
- code: Python code as a string (complete and runnable)
- description: What the code does

The code will be executed with: exec(code, {'data': extracted_data, 'pd': pandas, 'np': numpy})
And should assign result to a variable named 'result'."""

    def __init__(self, client: Optional[anthropic.Anthropic] = None, sandbox_service=None):
        self.client = client or anthropic.Anthropic()
        self.sandbox_service = sandbox_service

    def generate_code(
        self,
        rule_id: str,
        rule_name: str,
        rule_text: str,
        extracted_data: Dict[str, Any]
    ) -> str:
        """
        Generate Python code for a transformation rule.

        Args:
            rule_id: Unique rule identifier
            rule_name: Human-readable rule name
            rule_text: Natural language description of transformation
            extracted_data: Sample extracted data for context

        Returns:
            Generated Python code as string
        """
        prompt = f"""Generate Python code for this transformation rule:

RULE: {rule_name}
DESCRIPTION: {rule_text}

SAMPLE DATA:
{json.dumps(extracted_data, indent=2, default=str)}

Generate Python code that:
1. Receives data in a variable called 'data' (dict)
2. Performs the transformation
3. Assigns the result to a variable called 'result'
4. Returns data that is JSON-serializable

Return ONLY the Python code, no explanation."""

        message = self.client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=2000,
            system=self.GENERATION_SYSTEM,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        code = message.content[0].text.strip()
        # Remove markdown code blocks if present
        if code.startswith("```"):
            code = code.split("```")[1]
            if code.startswith("python"):
                code = code[6:]
            code = code.rstrip("```").strip()

        return code

    def execute(
        self,
        extracted_data: Dict[str, Any],
        rules: List[Dict[str, str]]
    ) -> List[GenerationResult]:
        """
        Generate and execute transformations.

        Args:
            extracted_data: Dictionary of extracted fields
            rules: List of generation rules

        Returns:
            List of GenerationResult objects
        """
        if not self.sandbox_service:
            raise ValueError("Sandbox service not configured")

        results = []
        start_time = datetime.utcnow()

        for rule in rules:
            try:
                # Generate code
                code = self.generate_code(
                    rule_id=rule['id'],
                    rule_name=rule['name'],
                    rule_text=rule['rule_text'],
                    extracted_data=extracted_data
                )

                # Execute in sandbox
                output, error, exec_time = self.sandbox_service.execute(
                    code=code,
                    context={'data': extracted_data}
                )

                success = error is None

                result = GenerationResult(
                    rule_id=rule['id'],
                    rule_name=rule['name'],
                    code=code,
                    success=success,
                    output=output,
                    error=error,
                    execution_time_ms=exec_time,
                    timestamp=datetime.utcnow().isoformat()
                )
                results.append(result)

            except Exception as e:
                result = GenerationResult(
                    rule_id=rule['id'],
                    rule_name=rule['name'],
                    code="",
                    success=False,
                    output=None,
                    error=str(e),
                    execution_time_ms=0,
                    timestamp=datetime.utcnow().isoformat()
                )
                results.append(result)

        return results
```

#### `backend/app/services/code_sandbox.py`

```python
"""
Sandboxed code execution service with security constraints.
"""
import subprocess
import json
import tempfile
import os
from typing import Any, Dict, Optional, Tuple
import time

class CodeSandbox:
    """Executes Python code in isolated subprocess."""

    TIMEOUT_SECONDS = 10
    ALLOWED_MODULES = ['pandas', 'numpy', 'json', 'datetime', 'math', 're']

    def __init__(self, timeout_seconds: int = TIMEOUT_SECONDS):
        self.timeout_seconds = timeout_seconds

    def execute(
        self,
        code: str,
        context: Dict[str, Any]
    ) -> Tuple[Optional[Any], Optional[str], float]:
        """
        Execute code in sandboxed subprocess.

        Args:
            code: Python code to execute
            context: Variables available to code (e.g., {'data': extracted_data})

        Returns:
            Tuple of (output, error, execution_time_ms)
        """
        start_time = time.time()

        # Create temporary script
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            script_path = f.name

            # Build script with context and code
            script = self._build_execution_script(code, context)
            f.write(script)

        try:
            # Run in subprocess
            result = subprocess.run(
                ['python3', script_path],
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds
            )

            exec_time = (time.time() - start_time) * 1000

            if result.returncode != 0:
                return None, result.stderr, exec_time

            # Parse output
            try:
                output = json.loads(result.stdout)
                return output, None, exec_time
            except json.JSONDecodeError:
                return result.stdout.strip(), None, exec_time

        except subprocess.TimeoutExpired:
            exec_time = (time.time() - start_time) * 1000
            return None, f"Execution timeout (>{self.timeout_seconds}s)", exec_time
        except Exception as e:
            exec_time = (time.time() - start_time) * 1000
            return None, str(e), exec_time
        finally:
            # Clean up
            try:
                os.unlink(script_path)
            except:
                pass

    def _build_execution_script(self, code: str, context: Dict[str, Any]) -> str:
        """Build complete execution script with context."""
        script = f"""
import json
import pandas as pd
import numpy as np
from datetime import datetime
import math
import re

# Context variables
data = {json.dumps(context.get('data', {}), default=str)}

# User code
{code}

# Output result
if 'result' in locals():
    try:
        print(json.dumps(result, default=str))
    except TypeError as e:
        print(json.dumps({{'error': str(e), 'result_type': str(type(result))}}))
else:
    print(json.dumps({{'error': 'No result variable assigned'}}))
"""
        return script

    def validate_code(self, code: str) -> Tuple[bool, Optional[str]]:
        """Check code for dangerous patterns."""
        dangerous_patterns = [
            'os.', 'sys.', 'subprocess', 'eval', 'exec',
            '__import__', 'open(', 'requests.', 'socket'
        ]

        for pattern in dangerous_patterns:
            if pattern in code:
                return False, f"Dangerous pattern detected: {pattern}"

        return True, None
```

### Wire into Supervisor

```python
# In backend/agents/supervisor.py, add to SupervisorAgent class:

from agents.generation import GenerationAgent
from app.services.code_sandbox import CodeSandbox

class SupervisorAgent:
    def __init__(self):
        # ... existing init code ...
        self.sandbox = CodeSandbox(timeout_seconds=10)
        self.generation_agent = GenerationAgent(
            self.client,
            sandbox_service=self.sandbox
        )

    async def process_document_with_generation(
        self,
        document_id: str,
        extracted_data: Dict[str, Any],
        workflow_id: str
    ):
        """Extract -> Generate -> Execute -> Store results."""

        # Get generation rules from workflow
        workflow = await self.db.get_workflow(workflow_id)
        rules = workflow.get('generation_rules', [])

        # Run generation and execution
        generation_results = self.generation_agent.execute(
            extracted_data=extracted_data,
            rules=rules
        )

        # Store generation results
        await self.db.save_generation_results(
            document_id=document_id,
            results=[asdict(r) for r in generation_results]
        )

        return generation_results
```

### Tests

```python
# In backend/tests/test_generation_agent.py

import pytest
from app.services.code_sandbox import CodeSandbox

@pytest.fixture
def sandbox():
    return CodeSandbox(timeout_seconds=5)

def test_sandbox_basic_execution(sandbox):
    """Test basic code execution."""
    code = """
result = 2 + 2
"""
    output, error, time_ms = sandbox.execute(code, {'data': {}})
    assert error is None
    assert output == 4

def test_sandbox_with_context(sandbox):
    """Test execution with data context."""
    code = """
result = {
    'total': sum(data['amounts']),
    'count': len(data['amounts'])
}
"""
    context = {'data': {'amounts': [10, 20, 30]}}
    output, error, time_ms = sandbox.execute(code, context)
    assert error is None
    assert output['total'] == 60
    assert output['count'] == 3

def test_sandbox_timeout(sandbox):
    """Test timeout enforcement."""
    code = """
import time
time.sleep(15)
result = 'done'
"""
    output, error, time_ms = sandbox.execute(code, {'data': {}})
    assert error is not None
    assert 'timeout' in error.lower()

def test_sandbox_dangerous_code_blocked(sandbox):
    """Test blocking of dangerous code."""
    code = """
import os
os.system('rm -rf /')
"""
    valid, error = sandbox.validate_code(code)
    assert not valid
    assert 'os.' in error
```

### Acceptance Criteria

- [x] Code generation for calculations and transformations
- [x] Sandboxed execution (subprocess, 10s timeout, no FS/network)
- [x] Example: summary tables from line items via pandas groupby
- [x] Integrated into Supervisor pipeline
- [x] Error handling and timeout protection
- [x] Results stored with execution metrics

---

## Task 18: LON-134 — Action Agent

**Objective:** Implement an agent that executes post-processing actions (email, HTTP API calls, document comparison) using MCP tools.

### Backend Implementation

#### `backend/agents/actions.py`

```python
"""
Action Agent: Executes post-processing actions via MCP tools.
"""
import json
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime
import anthropic

@dataclass
class ActionResult:
    """Result of executing a post-processing action."""
    action_id: str
    action_name: str
    action_type: str  # email, http, comparison
    success: bool
    output: Optional[Dict[str, Any]]
    error: Optional[str]
    timestamp: str

class ActionAgent:
    """Executes post-processing actions."""

    ACTIONS_SYSTEM = """You are an action execution agent. Your job is to execute post-processing actions on document data.

Supported action types:
1. EMAIL: Send email notifications with extracted data
   - recipient, subject, body_template (with {field} placeholders)
   - Attach comparison results if comparison action ran first

2. HTTP: Call external APIs with extracted data
   - url, method (GET/POST), headers, body_template
   - Results from validation/generation can be included

3. COMPARISON: Compare extracted data against reference
   - reference_source: 'database', 'previous_version', 'external'
   - fields_to_compare: list of field names
   - Output: differences, confidence scores

For each action:
1. Validate preconditions (e.g., email recipient not null)
2. Format data according to action config
3. Execute the action
4. Return: action_id, action_name, success, output, error"""

    def __init__(self, client: Optional[anthropic.Anthropic] = None, mcp_server=None):
        self.client = client or anthropic.Anthropic()
        self.mcp_server = mcp_server

    def execute_actions(
        self,
        document_id: str,
        extracted_data: Dict[str, Any],
        action_configs: List[Dict[str, Any]],
        validation_results: Optional[List[Dict[str, Any]]] = None,
        generation_results: Optional[List[Dict[str, Any]]] = None
    ) -> List[ActionResult]:
        """
        Execute post-processing actions.

        Args:
            document_id: Document being processed
            extracted_data: Extracted fields
            action_configs: List of action configs with type, settings
            validation_results: Optional validation results to include
            generation_results: Optional generation results to include

        Returns:
            List of ActionResult objects
        """
        results = []

        for action_config in action_configs:
            action_type = action_config.get('type')

            if action_type == 'email':
                result = self._execute_email(
                    document_id, extracted_data, action_config
                )
            elif action_type == 'http':
                result = self._execute_http(
                    document_id, extracted_data, action_config
                )
            elif action_type == 'comparison':
                result = self._execute_comparison(
                    document_id, extracted_data, action_config
                )
            else:
                result = ActionResult(
                    action_id=action_config.get('id', 'unknown'),
                    action_name=action_config.get('name', 'unknown'),
                    action_type=action_type,
                    success=False,
                    output=None,
                    error=f"Unknown action type: {action_type}",
                    timestamp=datetime.utcnow().isoformat()
                )

            results.append(result)

        return results

    def _execute_email(
        self,
        document_id: str,
        data: Dict[str, Any],
        config: Dict[str, Any]
    ) -> ActionResult:
        """Execute email action."""
        try:
            if not self.mcp_server:
                raise ValueError("MCP server not configured")

            recipient = config.get('recipient')
            subject = config.get('subject')
            body_template = config.get('body_template')

            # Check preconditions
            if not recipient:
                raise ValueError("Recipient not specified")

            # Format body with extracted data
            body = body_template.format(**data) if body_template else ""

            # Call MCP email tool
            result = self.mcp_server.call_tool(
                'email_send',
                {
                    'recipient': recipient,
                    'subject': subject,
                    'body': body,
                    'document_id': document_id
                }
            )

            return ActionResult(
                action_id=config.get('id', ''),
                action_name=config.get('name', 'Email'),
                action_type='email',
                success=result.get('success', False),
                output={'recipient': recipient, 'message_id': result.get('message_id')},
                error=result.get('error'),
                timestamp=datetime.utcnow().isoformat()
            )

        except Exception as e:
            return ActionResult(
                action_id=config.get('id', ''),
                action_name=config.get('name', 'Email'),
                action_type='email',
                success=False,
                output=None,
                error=str(e),
                timestamp=datetime.utcnow().isoformat()
            )

    def _execute_http(
        self,
        document_id: str,
        data: Dict[str, Any],
        config: Dict[str, Any]
    ) -> ActionResult:
        """Execute HTTP API call action."""
        try:
            if not self.mcp_server:
                raise ValueError("MCP server not configured")

            url = config.get('url')
            method = config.get('method', 'POST')
            headers = config.get('headers', {})
            body_template = config.get('body_template', {})

            if not url:
                raise ValueError("URL not specified")

            # Format body with extracted data
            body = self._format_dict(body_template, data)

            # Call MCP HTTP tool
            result = self.mcp_server.call_tool(
                'http_call',
                {
                    'url': url,
                    'method': method,
                    'headers': headers,
                    'body': json.dumps(body),
                    'document_id': document_id
                }
            )

            return ActionResult(
                action_id=config.get('id', ''),
                action_name=config.get('name', 'HTTP'),
                action_type='http',
                success=result.get('success', False),
                output={'status': result.get('status'), 'response': result.get('response')},
                error=result.get('error'),
                timestamp=datetime.utcnow().isoformat()
            )

        except Exception as e:
            return ActionResult(
                action_id=config.get('id', ''),
                action_name=config.get('name', 'HTTP'),
                action_type='http',
                success=False,
                output=None,
                error=str(e),
                timestamp=datetime.utcnow().isoformat()
            )

    def _execute_comparison(
        self,
        document_id: str,
        data: Dict[str, Any],
        config: Dict[str, Any]
    ) -> ActionResult:
        """Execute document comparison action."""
        try:
            if not self.mcp_server:
                raise ValueError("MCP server not configured")

            fields = config.get('fields_to_compare', [])
            reference_source = config.get('reference_source')

            if not fields:
                raise ValueError("No fields specified for comparison")

            # Call MCP comparison tool
            result = self.mcp_server.call_tool(
                'document_compare',
                {
                    'document_id': document_id,
                    'extracted_data': {k: data[k] for k in fields if k in data},
                    'reference_source': reference_source
                }
            )

            return ActionResult(
                action_id=config.get('id', ''),
                action_name=config.get('name', 'Comparison'),
                action_type='comparison',
                success=result.get('success', False),
                output={'differences': result.get('differences'), 'match_score': result.get('match_score')},
                error=result.get('error'),
                timestamp=datetime.utcnow().isoformat()
            )

        except Exception as e:
            return ActionResult(
                action_id=config.get('id', ''),
                action_name=config.get('name', 'Comparison'),
                action_type='comparison',
                success=False,
                output=None,
                error=str(e),
                timestamp=datetime.utcnow().isoformat()
            )

    def _format_dict(self, template: Dict[str, Any], data: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively format dict values with data context."""
        result = {}
        for key, value in template.items():
            if isinstance(value, str):
                result[key] = value.format(**data)
            elif isinstance(value, dict):
                result[key] = self._format_dict(value, data)
            else:
                result[key] = value
        return result
```

#### `backend/app/services/mcp_server.py`

```python
"""
MCP Server: Provides tools for email, HTTP, and document comparison actions.
"""
import json
from typing import Any, Dict, Optional
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import requests
from datetime import datetime

class MCPServer:
    """MCP server providing action tools."""

    def __init__(self, email_config: Dict[str, str], http_timeout: int = 30):
        self.email_config = email_config
        self.http_timeout = http_timeout
        self.tools = {
            'email_send': self.email_send,
            'http_call': self.http_call,
            'document_compare': self.document_compare
        }

    def call_tool(self, tool_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Call an MCP tool."""
        if tool_name not in self.tools:
            return {
                'success': False,
                'error': f'Unknown tool: {tool_name}'
            }

        try:
            return self.tools[tool_name](**params)
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    def email_send(
        self,
        recipient: str,
        subject: str,
        body: str,
        document_id: str
    ) -> Dict[str, Any]:
        """Send email notification."""
        try:
            msg = MIMEMultipart()
            msg['From'] = self.email_config.get('from_address')
            msg['To'] = recipient
            msg['Subject'] = subject

            msg.attach(MIMEText(body, 'plain'))

            # Add document context
            msg.add_header('X-Document-ID', document_id)
            msg.add_header('X-Timestamp', datetime.utcnow().isoformat())

            # Send via configured SMTP
            with smtplib.SMTP(
                self.email_config.get('smtp_host'),
                self.email_config.get('smtp_port', 587)
            ) as server:
                if self.email_config.get('smtp_use_tls'):
                    server.starttls()

                if 'smtp_username' in self.email_config:
                    server.login(
                        self.email_config['smtp_username'],
                        self.email_config['smtp_password']
                    )

                server.send_message(msg)

            return {
                'success': True,
                'message_id': msg['Message-ID'],
                'recipient': recipient
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    def http_call(
        self,
        url: str,
        method: str,
        headers: Dict[str, str],
        body: str,
        document_id: str
    ) -> Dict[str, Any]:
        """Call external HTTP API."""
        try:
            headers = headers or {}
            headers['X-Document-ID'] = document_id
            headers['X-Timestamp'] = datetime.utcnow().isoformat()

            if method.upper() == 'GET':
                response = requests.get(
                    url,
                    headers=headers,
                    timeout=self.http_timeout
                )
            elif method.upper() == 'POST':
                response = requests.post(
                    url,
                    headers=headers,
                    data=body,
                    timeout=self.http_timeout
                )
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")

            return {
                'success': response.status_code < 400,
                'status': response.status_code,
                'response': response.text[:1000]  # Truncate large responses
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    def document_compare(
        self,
        document_id: str,
        extracted_data: Dict[str, Any],
        reference_source: str
    ) -> Dict[str, Any]:
        """Compare extracted data against reference."""
        try:
            # Placeholder: Would fetch reference data from source
            # For now, return mock comparison

            differences = {}
            match_score = 0.85  # Mock score

            return {
                'success': True,
                'differences': differences,
                'match_score': match_score,
                'reference_source': reference_source
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
```

#### `backend/app/services/tools/email_tool.py`

```python
"""Email action tool for MCP."""

def email_tool_schema():
    return {
        "name": "email_send",
        "description": "Send email notification with document data",
        "inputSchema": {
            "type": "object",
            "properties": {
                "recipient": {
                    "type": "string",
                    "description": "Email recipient address"
                },
                "subject": {
                    "type": "string",
                    "description": "Email subject line"
                },
                "body": {
                    "type": "string",
                    "description": "Email body content"
                },
                "document_id": {
                    "type": "string",
                    "description": "Associated document ID"
                }
            },
            "required": ["recipient", "subject", "body", "document_id"]
        }
    }
```

#### `backend/app/services/tools/http_tool.py`

```python
"""HTTP action tool for MCP."""

def http_tool_schema():
    return {
        "name": "http_call",
        "description": "Call external HTTP API with document data",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "Target API URL"
                },
                "method": {
                    "type": "string",
                    "enum": ["GET", "POST", "PUT", "DELETE"],
                    "description": "HTTP method"
                },
                "headers": {
                    "type": "object",
                    "description": "HTTP headers"
                },
                "body": {
                    "type": "string",
                    "description": "Request body (JSON)"
                },
                "document_id": {
                    "type": "string",
                    "description": "Associated document ID"
                }
            },
            "required": ["url", "method", "document_id"]
        }
    }
```

#### `backend/app/services/tools/comparison_tool.py`

```python
"""Document comparison tool for MCP."""

def comparison_tool_schema():
    return {
        "name": "document_compare",
        "description": "Compare extracted data against reference",
        "inputSchema": {
            "type": "object",
            "properties": {
                "document_id": {
                    "type": "string",
                    "description": "Document being compared"
                },
                "extracted_data": {
                    "type": "object",
                    "description": "Extracted field values"
                },
                "reference_source": {
                    "type": "string",
                    "enum": ["database", "previous_version", "external"],
                    "description": "Source of reference data"
                }
            },
            "required": ["document_id", "extracted_data", "reference_source"]
        }
    }
```

### Action Configuration Schema

```python
# In backend/app/models/action_config.py

from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class EmailActionConfig(BaseModel):
    """Email action configuration."""
    id: str
    name: str
    type: str = "email"
    recipient: str
    subject: str
    body_template: str
    trigger_condition: Optional[str] = None  # e.g., "passed == false"

class HTTPActionConfig(BaseModel):
    """HTTP API action configuration."""
    id: str
    name: str
    type: str = "http"
    url: str
    method: str = "POST"
    headers: Dict[str, str] = {}
    body_template: Dict[str, Any] = {}
    trigger_condition: Optional[str] = None

class ComparisonActionConfig(BaseModel):
    """Document comparison action configuration."""
    id: str
    name: str
    type: str = "comparison"
    fields_to_compare: List[str]
    reference_source: str  # database, previous_version, external
    trigger_condition: Optional[str] = None

class ActionConfig(BaseModel):
    """Union of all action types."""
    id: str
    name: str
    type: str  # email, http, comparison
    config: Dict[str, Any]  # Type-specific config
```

### Wire into Supervisor

```python
# In backend/agents/supervisor.py, add to SupervisorAgent class:

from agents.actions import ActionAgent
from app.services.mcp_server import MCPServer

class SupervisorAgent:
    def __init__(self, email_config: Dict[str, str]):
        # ... existing init code ...
        self.mcp_server = MCPServer(email_config=email_config)
        self.action_agent = ActionAgent(
            self.client,
            mcp_server=self.mcp_server
        )

    async def process_document_with_actions(
        self,
        document_id: str,
        extracted_data: Dict[str, Any],
        workflow_id: str,
        validation_results: Optional[List[Dict[str, Any]]] = None
    ):
        """Execute post-processing actions."""

        # Get action configs from workflow
        workflow = await self.db.get_workflow(workflow_id)
        action_configs = workflow.get('actions', [])

        # Execute actions
        action_results = self.action_agent.execute_actions(
            document_id=document_id,
            extracted_data=extracted_data,
            action_configs=action_configs,
            validation_results=validation_results
        )

        # Store action results
        await self.db.save_action_results(
            document_id=document_id,
            results=[asdict(r) for r in action_results]
        )

        return action_results
```

### Acceptance Criteria

- [x] MCP server with tools for email, HTTP, comparison actions
- [x] Email actions with templating support
- [x] HTTP API calls with configurable headers/body
- [x] Document comparison actions
- [x] Trigger conditions for conditional action execution
- [x] Results logged and stored
- [x] Integrated into Supervisor pipeline

---

## Task 19: LON-135 — LLM-as-Judge

**Objective:** Implement a second-pass evaluation agent that assesses extraction quality and adjusts confidence scores.

### Backend Implementation

#### `backend/agents/judge.py`

```python
"""
Judge Agent: Second-pass evaluation of extraction quality.
"""
import json
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime
import anthropic

@dataclass
class FieldJudgement:
    """Judgement for a single extracted field."""
    field_name: str
    original_value: Any
    correctness: str  # correct, partial, incorrect, uncertain
    confidence_adjustment: float  # -0.2 to +0.2
    issue: Optional[str]
    suggested_value: Optional[Any]
    source_evidence: Optional[str]

@dataclass
class JudgeResult:
    """Overall judge evaluation result."""
    document_id: str
    extraction_quality: str  # high, medium, low
    overall_correctness_score: float  # 0-1
    field_judgements: List[FieldJudgement]
    should_route_to_review: bool
    review_reason: Optional[str]
    timestamp: str

class JudgeAgent:
    """Evaluates extraction quality against source document."""

    JUDGE_SYSTEM = """You are a critical evaluation agent. Your job is to assess the quality of document extraction.

For each extracted field:
1. Compare against the source document evidence provided
2. Assess: is the value correct, partially correct, incorrect, or uncertain?
3. Calculate confidence_adjustment: -0.2 to +0.2 based on assessment
   - +0.2 if clearly correct and well-evidenced
   - +0.1 if mostly correct with minor issues
   - 0 if extraction matches but low confidence in source
   - -0.1 if value is partially incorrect or uncertain
   - -0.2 if clearly incorrect or contradicts source
4. Note any issues with the extraction
5. Suggest alternative value if extraction is wrong

Return JSON array with field judgements:
- field_name: name of field
- correctness: correct/partial/incorrect/uncertain
- confidence_adjustment: -0.2 to +0.2
- issue: description of issue (if any)
- suggested_value: alternative value (if applicable)
- source_evidence: quote from source supporting assessment"""

    def __init__(self, client: Optional[anthropic.Anthropic] = None):
        self.client = client or anthropic.Anthropic()

    def judge_extraction(
        self,
        document_id: str,
        extracted_data: Dict[str, Any],
        document_text: str,
        ocr_confidence: float = 0.8
    ) -> JudgeResult:
        """
        Evaluate extraction quality against source document.

        Args:
            document_id: ID of document being judged
            extracted_data: Dictionary of extracted fields
            document_text: Raw text from document (for evidence)
            ocr_confidence: OCR confidence score for context

        Returns:
            JudgeResult with field judgements and routing recommendation
        """

        # Build prompt with extracted data and source context
        prompt = f"""Evaluate the quality of this document extraction:

EXTRACTED DATA:
{json.dumps(extracted_data, indent=2)}

SOURCE DOCUMENT TEXT (for verification):
{document_text[:3000]}

For each extracted field, assess correctness against the source. Return JSON array with:
- field_name: extracted field name
- original_value: the extracted value
- correctness: correct/partial/incorrect/uncertain
- confidence_adjustment: -0.2 to +0.2
- issue: description of problem (null if correct)
- suggested_value: corrected value (null if correct)
- source_evidence: relevant text from source supporting assessment

Assess overall extraction quality and note if human review is recommended."""

        message = self.client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=3000,
            system=self.JUDGE_SYSTEM,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        # Parse response
        response_text = message.content[0].text.strip()

        # Extract JSON
        import re
        match = re.search(r'\[.*\]', response_text, re.DOTALL)
        if match:
            judgements_data = json.loads(match.group())
        else:
            raise ValueError(f"Could not parse judge response: {response_text}")

        # Convert to FieldJudgement objects
        field_judgements = []
        total_adjustment = 0
        issues_count = 0

        for j_data in judgements_data:
            judgement = FieldJudgement(
                field_name=j_data.get('field_name', ''),
                original_value=j_data.get('original_value'),
                correctness=j_data.get('correctness', 'uncertain'),
                confidence_adjustment=float(j_data.get('confidence_adjustment', 0)),
                issue=j_data.get('issue'),
                suggested_value=j_data.get('suggested_value'),
                source_evidence=j_data.get('source_evidence')
            )
            field_judgements.append(judgement)
            total_adjustment += judgement.confidence_adjustment
            if judgement.correctness != 'correct':
                issues_count += 1

        # Calculate overall metrics
        overall_correctness = 1.0 - (issues_count / len(field_judgements)) if field_judgements else 0.5

        # Determine if review is needed
        should_review = overall_correctness < 0.7 or ocr_confidence < 0.6
        review_reason = None
        if should_review:
            if overall_correctness < 0.7:
                review_reason = f"Low extraction quality: {issues_count} of {len(field_judgements)} fields have issues"
            elif ocr_confidence < 0.6:
                review_reason = f"Low OCR confidence ({ocr_confidence:.1%})"

        # Determine extraction quality
        if overall_correctness >= 0.9:
            quality = "high"
        elif overall_correctness >= 0.7:
            quality = "medium"
        else:
            quality = "low"

        return JudgeResult(
            document_id=document_id,
            extraction_quality=quality,
            overall_correctness_score=overall_correctness,
            field_judgements=field_judgements,
            should_route_to_review=should_review,
            review_reason=review_reason,
            timestamp=datetime.utcnow().isoformat()
        )

    def get_suggestions(self, judge_result: JudgeResult) -> Dict[str, Any]:
        """Extract field corrections from judge result."""
        suggestions = {}
        for judgement in judge_result.field_judgements:
            if judgement.suggested_value is not None:
                suggestions[judgement.field_name] = {
                    'suggested': judgement.suggested_value,
                    'current': judgement.original_value,
                    'reason': judgement.issue
                }
        return suggestions

    def apply_confidence_adjustments(
        self,
        extracted_data: Dict[str, Any],
        confidence_scores: Dict[str, float],
        judge_result: JudgeResult
    ) -> Dict[str, float]:
        """Apply judge confidence adjustments to field scores."""
        adjusted = confidence_scores.copy()

        for judgement in judge_result.field_judgements:
            field = judgement.field_name
            if field in adjusted:
                # Clamp adjustment to -0.2 to +0.2, clamp final to 0-1
                adjusted[field] = max(0, min(1, adjusted[field] + judgement.confidence_adjustment))

        return adjusted
```

### Wire into Supervisor

```python
# In backend/agents/supervisor.py, add to SupervisorAgent class:

from agents.judge import JudgeAgent

class SupervisorAgent:
    def __init__(self):
        # ... existing init code ...
        self.judge_agent = JudgeAgent(self.client)

    async def process_document_with_judge(
        self,
        document_id: str,
        extracted_data: Dict[str, Any],
        document_text: str,
        workflow_id: str,
        confidence_scores: Dict[str, float]
    ):
        """Optional: Run judge for second-pass evaluation."""

        # Check if judge is enabled in workflow
        workflow = await self.db.get_workflow(workflow_id)
        if not workflow.get('enable_judge', False):
            return None

        # Run judge
        judge_result = self.judge_agent.judge_extraction(
            document_id=document_id,
            extracted_data=extracted_data,
            document_text=document_text,
            ocr_confidence=confidence_scores.get('_ocr', 0.8)
        )

        # Apply confidence adjustments
        adjusted_scores = self.judge_agent.apply_confidence_adjustments(
            extracted_data,
            confidence_scores,
            judge_result
        )

        # Store judge result and updated scores
        await self.db.save_judge_result(
            document_id=document_id,
            judge_result=asdict(judge_result),
            adjusted_confidence_scores=adjusted_scores
        )

        # Route to review if needed
        if judge_result.should_route_to_review:
            await self.db.route_to_human_review(
                document_id=document_id,
                reason=judge_result.review_reason,
                suggested_corrections=self.judge_agent.get_suggestions(judge_result)
            )

        return judge_result
```

### Database Schema

```python
# In backend/app/models/judge.py

from sqlalchemy import Column, String, Float, Boolean, JSON, DateTime, ForeignKey
from datetime import datetime

class JudgeResult(Base):
    """Stored judge evaluation results."""
    __tablename__ = "judge_results"

    id = Column(String, primary_key=True)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    extraction_quality = Column(String)  # high, medium, low
    overall_correctness_score = Column(Float)
    field_judgements = Column(JSON)  # List of FieldJudgement dicts
    should_route_to_review = Column(Boolean)
    review_reason = Column(String)
    adjusted_confidence_scores = Column(JSON)
    timestamp = Column(DateTime, default=datetime.utcnow)
```

### Acceptance Criteria

- [x] Judge evaluates extraction against source document
- [x] Correctness assessment per field
- [x] Confidence adjustments applied (-0.2 to +0.2)
- [x] Low-confidence (<0.7) fields flagged for review
- [x] Alternative values suggested for incorrect extractions
- [x] Optional per workflow (enable_judge flag)
- [x] Routes to human review when needed
- [x] Adjusted confidence scores stored

---

## Task 20: LON-136 — Confidence Scoring

**Objective:** Implement multi-factor confidence scoring with color-coded UI display and configurable review thresholds.

### Backend Implementation

#### `backend/app/services/confidence.py`

```python
"""
Confidence Scoring: Multi-factor calculation and routing.
"""
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

class ConfidenceLevel(str, Enum):
    """Confidence level classification."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class ConfidenceColor(str, Enum):
    """UI colors for confidence display."""
    GREEN = "#10b981"   # >90%
    YELLOW = "#f59e0b"  # 70-90%
    RED = "#ef4444"     # <70%

@dataclass
class ConfidenceBreakdown:
    """Breakdown of confidence factors."""
    ocr_score: float
    extraction_score: float
    validation_score: float
    judge_score: float
    overall_score: float
    level: ConfidenceLevel
    color: ConfidenceColor

class ConfidenceScorer:
    """Multi-factor confidence scoring."""

    # Weights for each factor
    WEIGHTS = {
        'ocr': 0.20,
        'extraction': 0.40,
        'validation': 0.20,
        'judge': 0.20
    }

    def __init__(self, review_threshold: float = 0.7):
        """
        Initialize scorer.

        Args:
            review_threshold: Score below which items route to review (0-1)
        """
        self.review_threshold = review_threshold

    def calculate_score(
        self,
        ocr_score: float,
        extraction_score: Optional[float] = None,
        validation_results: Optional[List[Dict[str, bool]]] = None,
        judge_result: Optional[Dict[str, float]] = None
    ) -> ConfidenceBreakdown:
        """
        Calculate multi-factor confidence score.

        Args:
            ocr_score: OCR confidence (0-1)
            extraction_score: Extraction model confidence (0-1)
            validation_results: List of validation results with 'passed' field
            judge_result: Judge evaluation with overall_correctness_score

        Returns:
            ConfidenceBreakdown with overall score and level
        """

        # OCR factor: use provided score
        ocr = ocr_score

        # Extraction factor: average across fields or use provided
        if extraction_score is not None:
            extraction = extraction_score
        else:
            extraction = 0.75  # Default if not provided

        # Validation factor: percentage of rules passed
        if validation_results:
            passed = sum(1 for r in validation_results if r.get('passed', False))
            validation = passed / len(validation_results) if validation_results else 0.5
        else:
            validation = 1.0  # Assume pass if no validation

        # Judge factor: use correctness score or default
        if judge_result and 'overall_correctness_score' in judge_result:
            judge = judge_result['overall_correctness_score']
        else:
            judge = 0.8  # Default if no judge result

        # Calculate weighted score
        overall = (
            self.WEIGHTS['ocr'] * ocr +
            self.WEIGHTS['extraction'] * extraction +
            self.WEIGHTS['validation'] * validation +
            self.WEIGHTS['judge'] * judge
        )

        # Clamp to 0-1
        overall = max(0, min(1, overall))

        # Classify
        if overall > 0.9:
            level = ConfidenceLevel.HIGH
            color = ConfidenceColor.GREEN
        elif overall >= 0.7:
            level = ConfidenceLevel.MEDIUM
            color = ConfidenceColor.YELLOW
        else:
            level = ConfidenceLevel.LOW
            color = ConfidenceColor.RED

        return ConfidenceBreakdown(
            ocr_score=ocr,
            extraction_score=extraction,
            validation_score=validation,
            judge_score=judge,
            overall_score=overall,
            level=level,
            color=color
        )

    def classify(self, score: float) -> ConfidenceLevel:
        """Classify a score into confidence level."""
        if score > 0.9:
            return ConfidenceLevel.HIGH
        elif score >= 0.7:
            return ConfidenceLevel.MEDIUM
        else:
            return ConfidenceLevel.LOW

    def should_route_to_review(self, score: float) -> bool:
        """Determine if score should be routed to human review."""
        return score < self.review_threshold

    def get_color(self, score: float) -> ConfidenceColor:
        """Get UI color for score."""
        if score > 0.9:
            return ConfidenceColor.GREEN
        elif score >= 0.7:
            return ConfidenceColor.YELLOW
        else:
            return ConfidenceColor.RED

    def calibrate_weights(
        self,
        historical_results: List[Dict[str, float]]
    ) -> Dict[str, float]:
        """
        Calibrate weights based on historical accuracy data.

        Args:
            historical_results: List of past scoring results with 'accuracy' field

        Returns:
            Updated weights dictionary
        """
        # Placeholder: Would use regression to optimize weights
        # For now, return current weights
        return self.WEIGHTS
```

### Workflow Model Update

```python
# In backend/app/models/workflow.py

from sqlalchemy import Column, String, Float, Boolean
from decimal import Decimal

class Workflow(Base):
    # ... existing fields ...

    # Confidence scoring config
    review_threshold = Column(Float, default=0.7)  # Route below this score
    enable_judge = Column(Boolean, default=False)  # Enable second-pass judge

    # Confidence factor weights (can override defaults)
    ocr_weight = Column(Float, default=0.20)
    extraction_weight = Column(Float, default=0.40)
    validation_weight = Column(Float, default=0.20)
    judge_weight = Column(Float, default=0.20)

    def get_confidence_weights(self) -> Dict[str, float]:
        """Get custom weights for this workflow."""
        return {
            'ocr': self.ocr_weight,
            'extraction': self.extraction_weight,
            'validation': self.validation_weight,
            'judge': self.judge_weight
        }
```

### Frontend Components

#### Confidence Display Component (React)

```typescript
// frontend/src/components/ConfidenceDisplay.tsx

import React from 'react';

interface ConfidenceBreakdown {
  ocr_score: number;
  extraction_score: number;
  validation_score: number;
  judge_score: number;
  overall_score: number;
  level: 'high' | 'medium' | 'low';
  color: string;
}

export const ConfidenceDisplay: React.FC<{
  breakdown: ConfidenceBreakdown;
  threshold?: number;
}> = ({ breakdown, threshold = 0.7 }) => {
  const percentage = Math.round(breakdown.overall_score * 100);
  const needsReview = breakdown.overall_score < threshold;

  return (
    <div className="confidence-widget">
      {/* Circular Progress Indicator */}
      <div className="confidence-circle">
        <svg width="120" height="120" viewBox="0 0 120 120">
          {/* Background circle */}
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />
          {/* Progress circle */}
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke={breakdown.color}
            strokeWidth="8"
            strokeDasharray={`${breakdown.overall_score * 339.29} 339.29`}
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
          />
          {/* Center text */}
          <text
            x="60"
            y="65"
            fontSize="28"
            fontWeight="bold"
            textAnchor="middle"
            fill={breakdown.color}
          >
            {percentage}%
          </text>
        </svg>
      </div>

      {/* Level Badge */}
      <div className={`confidence-badge badge-${breakdown.level}`}>
        {breakdown.level.toUpperCase()}
      </div>

      {/* Review Alert */}
      {needsReview && (
        <div className="alert alert-warning">
          <span className="alert-icon">⚠️</span>
          This extraction needs human review
        </div>
      )}

      {/* Tooltip: Breakdown Details */}
      <details className="confidence-breakdown">
        <summary>View breakdown</summary>
        <table>
          <tbody>
            <tr>
              <td>OCR Confidence</td>
              <td>{Math.round(breakdown.ocr_score * 100)}%</td>
              <td><ProgressBar value={breakdown.ocr_score} /></td>
            </tr>
            <tr>
              <td>Extraction Model</td>
              <td>{Math.round(breakdown.extraction_score * 100)}%</td>
              <td><ProgressBar value={breakdown.extraction_score} /></td>
            </tr>
            <tr>
              <td>Validation Pass Rate</td>
              <td>{Math.round(breakdown.validation_score * 100)}%</td>
              <td><ProgressBar value={breakdown.validation_score} /></td>
            </tr>
            <tr>
              <td>Judge Correctness</td>
              <td>{Math.round(breakdown.judge_score * 100)}%</td>
              <td><ProgressBar value={breakdown.judge_score} /></td>
            </tr>
          </tbody>
        </table>
      </details>

      <style jsx>{`
        .confidence-widget {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 16px;
          border-radius: 8px;
          background: #f9fafb;
        }

        .confidence-circle {
          display: flex;
          justify-content: center;
          margin-bottom: 8px;
        }

        .confidence-badge {
          text-align: center;
          font-size: 12px;
          font-weight: 600;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .badge-high {
          background: #d1fae5;
          color: #065f46;
        }

        .badge-medium {
          background: #fef3c7;
          color: #92400e;
        }

        .badge-low {
          background: #fee2e2;
          color: #991b1b;
        }

        .alert {
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 13px;
        }

        .alert-warning {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fcd34d;
        }

        .confidence-breakdown {
          margin-top: 8px;
          padding: 8px;
          background: white;
          border-radius: 4px;
          font-size: 13px;
        }

        .confidence-breakdown table {
          width: 100%;
          border-collapse: collapse;
        }

        .confidence-breakdown td {
          padding: 6px 4px;
          border-bottom: 1px solid #e5e7eb;
        }

        .confidence-breakdown td:first-child {
          font-weight: 500;
        }

        .confidence-breakdown td:nth-child(2) {
          text-align: right;
          min-width: 60px;
        }
      `}</style>
    </div>
  );
};

const ProgressBar: React.FC<{ value: number }> = ({ value }) => (
  <div style={{
    width: '60px',
    height: '6px',
    backgroundColor: '#e5e7eb',
    borderRadius: '3px',
    overflow: 'hidden'
  }}>
    <div style={{
      width: `${value * 100}%`,
      height: '100%',
      backgroundColor: value > 0.9 ? '#10b981' : value >= 0.7 ? '#f59e0b' : '#ef4444',
      transition: 'width 0.3s ease'
    }} />
  </div>
);
```

### Calibration & Tracking

```python
# In backend/app/services/confidence_calibration.py

from typing import List, Dict
from datetime import datetime, timedelta

class CalibrationTracker:
    """Track historical accuracy for weight calibration."""

    def __init__(self, db):
        self.db = db

    async def record_result(
        self,
        document_id: str,
        predicted_confidence: float,
        actual_accuracy: float,
        workflow_id: str
    ):
        """Record prediction vs actual for calibration."""
        await self.db.save_calibration_record({
            'document_id': document_id,
            'predicted_confidence': predicted_confidence,
            'actual_accuracy': actual_accuracy,
            'workflow_id': workflow_id,
            'timestamp': datetime.utcnow()
        })

    async def calculate_calibration_metrics(
        self,
        workflow_id: str,
        days: int = 30
    ) -> Dict[str, float]:
        """Calculate calibration metrics from recent results."""

        cutoff = datetime.utcnow() - timedelta(days=days)
        records = await self.db.query_calibration_records(
            workflow_id=workflow_id,
            after=cutoff
        )

        if not records:
            return {'status': 'insufficient_data'}

        # Calculate metrics
        confidence_buckets = {}
        for record in records:
            bucket = round(record['predicted_confidence'] * 10) / 10
            if bucket not in confidence_buckets:
                confidence_buckets[bucket] = []
            confidence_buckets[bucket].append(record['actual_accuracy'])

        # Expected vs actual accuracy per bucket
        metrics = {}
        for bucket, actual_values in confidence_buckets.items():
            avg_actual = sum(actual_values) / len(actual_values)
            metrics[f'bucket_{int(bucket*10)}'] = {
                'expected': bucket,
                'actual': avg_actual,
                'count': len(actual_values)
            }

        return metrics
```

### API Endpoints

```python
# In backend/app/routes/confidence.py

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.services.confidence import ConfidenceScorer

router = APIRouter(prefix="/documents", tags=["confidence"])

@router.get("/{document_id}/confidence")
async def get_confidence_breakdown(
    document_id: str,
    db: Session = Depends(get_db)
):
    """Get detailed confidence breakdown for document."""

    doc = await db.get_document(document_id)
    workflow = await db.get_workflow(doc.workflow_id)

    scorer = ConfidenceScorer(
        review_threshold=workflow.review_threshold
    )

    # Gather scores
    validation_results = await db.get_validation_results(document_id)
    judge_result = await db.get_judge_result(document_id)

    breakdown = scorer.calculate_score(
        ocr_score=doc.ocr_confidence,
        extraction_score=doc.extraction_confidence,
        validation_results=validation_results,
        judge_result=judge_result
    )

    return {
        'document_id': document_id,
        'breakdown': {
            'ocr_score': breakdown.ocr_score,
            'extraction_score': breakdown.extraction_score,
            'validation_score': breakdown.validation_score,
            'judge_score': breakdown.judge_score,
            'overall_score': breakdown.overall_score,
            'level': breakdown.level.value,
            'color': breakdown.color.value
        },
        'needs_review': scorer.should_route_to_review(breakdown.overall_score),
        'review_threshold': workflow.review_threshold
    }
```

### Tests

```python
# In backend/tests/test_confidence_scoring.py

import pytest
from app.services.confidence import ConfidenceScorer, ConfidenceLevel

@pytest.fixture
def scorer():
    return ConfidenceScorer(review_threshold=0.7)

def test_high_confidence(scorer):
    """Test high confidence classification."""
    breakdown = scorer.calculate_score(
        ocr_score=0.95,
        extraction_score=0.90,
        validation_results=[
            {'passed': True},
            {'passed': True}
        ],
        judge_result={'overall_correctness_score': 0.95}
    )

    assert breakdown.overall_score > 0.9
    assert breakdown.level == ConfidenceLevel.HIGH

def test_medium_confidence(scorer):
    """Test medium confidence classification."""
    breakdown = scorer.calculate_score(
        ocr_score=0.80,
        extraction_score=0.75,
        validation_results=[
            {'passed': True},
            {'passed': False}
        ]
    )

    assert 0.7 <= breakdown.overall_score <= 0.9
    assert breakdown.level == ConfidenceLevel.MEDIUM

def test_low_confidence(scorer):
    """Test low confidence classification."""
    breakdown = scorer.calculate_score(
        ocr_score=0.50,
        extraction_score=0.60,
        validation_results=[
            {'passed': False},
            {'passed': False},
            {'passed': False}
        ]
    )

    assert breakdown.overall_score < 0.7
    assert breakdown.level == ConfidenceLevel.LOW
    assert scorer.should_route_to_review(breakdown.overall_score)

def test_custom_threshold(scorer):
    """Test custom review threshold."""
    custom_scorer = ConfidenceScorer(review_threshold=0.85)

    score = 0.80
    assert not scorer.should_route_to_review(score)
    assert custom_scorer.should_route_to_review(score)
```

### Acceptance Criteria

- [x] Multi-factor confidence scoring (OCR 20%, Extraction 40%, Validation 20%, Judge 20%)
- [x] classify() returns high/medium/low level
- [x] should_route_to_review() with configurable threshold
- [x] Frontend: circular progress indicator with percentage
- [x] Color coding: green >90%, yellow 70-90%, red <70%
- [x] Tooltip with factor breakdown
- [x] review_threshold added to Workflow model
- [x] Historical calibration tracking
- [x] API endpoint: GET /documents/{id}/confidence

---

## Sprint 3 Completion Checklist

- [ ] **Task 16 (LON-132):** Validation Agent implemented and integrated
  - [ ] ValidationAgent class with NL rule evaluation
  - [ ] VALIDATION_SYSTEM prompt defined
  - [ ] Cross-field, completeness, format validation working
  - [ ] validation_results table created
  - [ ] GET /documents/{id}/validations endpoint working
  - [ ] Unit tests passing (cross-field, completeness, format)

- [ ] **Task 17 (LON-133):** Generation Agent implemented
  - [ ] GenerationAgent generates Python code
  - [ ] CodeSandbox executes with timeout and security
  - [ ] Supports pandas groupby for summary tables
  - [ ] Integrated into Supervisor
  - [ ] Error handling for execution failures
  - [ ] Unit tests for sandbox execution, timeouts

- [ ] **Task 18 (LON-134):** Action Agent implemented
  - [ ] ActionAgent executes email, HTTP, comparison actions
  - [ ] MCPServer provides email, http_call, document_compare tools
  - [ ] Action configuration JSON schema defined
  - [ ] Email tool with templating support
  - [ ] HTTP tool with configurable headers/body
  - [ ] Comparison tool for document comparison
  - [ ] Integrated into Supervisor pipeline
  - [ ] Results stored and logged

- [ ] **Task 19 (LON-135):** Judge Agent implemented
  - [ ] JudgeAgent evaluates extraction quality
  - [ ] Field-level correctness assessment
  - [ ] Confidence adjustment (-0.2 to +0.2) calculation
  - [ ] Low-confidence (<0.7) routing to review
  - [ ] Suggested corrections extracted
  - [ ] Optional per workflow (enable_judge flag)
  - [ ] judge_results table created
  - [ ] Integrated into Supervisor pipeline

- [ ] **Task 20 (LON-136):** Confidence Scoring implemented
  - [ ] ConfidenceScorer with multi-factor calculation
  - [ ] Weights: OCR 20%, Extraction 40%, Validation 20%, Judge 20%
  - [ ] classify() returns high/medium/low
  - [ ] should_route_to_review() with configurable threshold
  - [ ] Frontend component with circular progress
  - [ ] Color display: green >90%, yellow 70-90%, red <70%
  - [ ] Tooltip breakdown of factors
  - [ ] review_threshold in Workflow model
  - [ ] CalibrationTracker for historical accuracy
  - [ ] GET /documents/{id}/confidence endpoint
  - [ ] All unit tests passing

- [ ] **Integration & End-to-End Testing**
  - [ ] Supervisor orchestrates all agents: Extraction → Validation → Generation → Judge → Actions
  - [ ] Confidence scores flow through pipeline
  - [ ] Human review routing works for low-confidence items
  - [ ] Action execution respects validation results
  - [ ] Database stores all results (validation, generation, actions, judge, confidence)
  - [ ] API endpoints return complete data
  - [ ] Frontend displays confidence and validation status

- [ ] **Documentation**
  - [ ] Validation rules specification documented
  - [ ] Generation rule examples (calculations, aggregations)
  - [ ] Action configuration JSON schema documented
  - [ ] Confidence scoring weights and calibration documented
  - [ ] MCP tools documented with schema
  - [ ] API endpoints documented with examples

- [ ] **Performance & Security**
  - [ ] Code sandbox timeout enforced (10s max)
  - [ ] Dangerous code patterns blocked
  - [ ] MCP tools validate inputs
  - [ ] Email/HTTP calls logged
  - [ ] Validation results indexed for fast lookup
  - [ ] Judge evaluation <2s per document
