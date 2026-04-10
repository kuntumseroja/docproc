# Sprint 1: Core Extraction (Weeks 2-3)

This sprint establishes the core document extraction pipeline, from OCR processing through agent-based extraction to user-facing APIs and UI. The focus is building a robust, modular foundation that integrates multiple services: optical character recognition, intelligent extraction via LLM agents, async task processing, and a production-grade supervisor orchestration layer.

---

## Task 6: LON-122 — OCR Pipeline

**Objective:** Build a resilient OCR pipeline with Mistral OCR as the primary engine and Tesseract as fallback, supporting multiple document formats with robust image preprocessing.

**Full Instructions:**

Install dependencies:
```bash
pip install mistralai pytesseract Pillow pdf2image pymupdf
```

Create `backend/app/services/ocr.py` with the following classes and structure:

```python
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List
from abc import ABC, abstractmethod
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class OCRStatus(str, Enum):
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"


@dataclass
class OCRResult:
    """Container for OCR output from a single page."""
    page_number: int
    text: str
    confidence: float
    status: OCRStatus
    engine: str  # "mistral" or "tesseract"
    raw_response: Optional[dict] = None
    error_message: Optional[str] = None
    processing_time_ms: float = 0.0
    metadata: dict = field(default_factory=dict)


class BaseOCREngine(ABC):
    """Abstract base class for OCR engines."""

    def __init__(self, name: str):
        self.name = name

    @abstractmethod
    def process_image(self, image_path: Path) -> OCRResult:
        """Process a single image and return OCRResult."""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if the engine is available (dependencies installed, API keys set, etc.)."""
        pass


class MistralOCREngine(BaseOCREngine):
    """Mistral-powered OCR engine."""

    def __init__(self, api_key: Optional[str] = None, model: str = "mistral-ocr"):
        super().__init__("mistral")
        self.api_key = api_key
        self.model = model
        self.client = None
        self._init_client()

    def _init_client(self):
        """Initialize Mistral client."""
        try:
            from mistralai import Mistral
            self.client = Mistral(api_key=self.api_key)
        except Exception as e:
            logger.error(f"Failed to initialize Mistral client: {e}")
            self.client = None

    def is_available(self) -> bool:
        """Check if Mistral API is available."""
        return self.client is not None

    def process_image(self, image_path: Path) -> OCRResult:
        """Process image using Mistral OCR."""
        import time
        start = time.time()

        if not self.is_available():
            return OCRResult(
                page_number=0,
                text="",
                confidence=0.0,
                status=OCRStatus.FAILED,
                engine="mistral",
                error_message="Mistral client not initialized",
                processing_time_ms=0.0
            )

        try:
            with open(image_path, "rb") as f:
                image_data = f.read()

            # Call Mistral OCR API
            response = self.client.ocr.process(
                model=self.model,
                image=image_data
            )

            text = response.get("text", "") if hasattr(response, "get") else getattr(response, "text", "")
            confidence = response.get("confidence", 0.95) if hasattr(response, "get") else getattr(response, "confidence", 0.95)

            processing_time = (time.time() - start) * 1000

            return OCRResult(
                page_number=0,
                text=text,
                confidence=confidence,
                status=OCRStatus.SUCCESS,
                engine="mistral",
                raw_response=response if isinstance(response, dict) else None,
                processing_time_ms=processing_time
            )
        except Exception as e:
            processing_time = (time.time() - start) * 1000
            logger.error(f"Mistral OCR failed: {e}")
            return OCRResult(
                page_number=0,
                text="",
                confidence=0.0,
                status=OCRStatus.FAILED,
                engine="mistral",
                error_message=str(e),
                processing_time_ms=processing_time
            )


class TesseractOCREngine(BaseOCREngine):
    """Tesseract-powered OCR engine."""

    def __init__(self):
        super().__init__("tesseract")
        self.pytesseract = None
        self._init_tesseract()

    def _init_tesseract(self):
        """Initialize pytesseract."""
        try:
            import pytesseract
            self.pytesseract = pytesseract
        except Exception as e:
            logger.error(f"Failed to initialize Tesseract: {e}")

    def is_available(self) -> bool:
        """Check if Tesseract is available."""
        return self.pytesseract is not None

    def process_image(self, image_path: Path) -> OCRResult:
        """Process image using Tesseract OCR."""
        import time
        from PIL import Image

        start = time.time()

        if not self.is_available():
            return OCRResult(
                page_number=0,
                text="",
                confidence=0.0,
                status=OCRStatus.FAILED,
                engine="tesseract",
                error_message="Tesseract not available",
                processing_time_ms=0.0
            )

        try:
            image = Image.open(image_path)
            text = self.pytesseract.image_to_string(image)
            confidence = 0.85  # Tesseract doesn't provide confidence by default

            processing_time = (time.time() - start) * 1000

            return OCRResult(
                page_number=0,
                text=text,
                confidence=confidence,
                status=OCRStatus.SUCCESS,
                engine="tesseract",
                processing_time_ms=processing_time
            )
        except Exception as e:
            processing_time = (time.time() - start) * 1000
            logger.error(f"Tesseract OCR failed: {e}")
            return OCRResult(
                page_number=0,
                text="",
                confidence=0.0,
                status=OCRStatus.FAILED,
                engine="tesseract",
                error_message=str(e),
                processing_time_ms=processing_time
            )


class OCRPipeline:
    """Orchestrates OCR processing with primary/fallback engine strategy."""

    def __init__(
        self,
        primary_engine: BaseOCREngine,
        fallback_engine: Optional[BaseOCREngine] = None,
        min_confidence: float = 0.8
    ):
        self.primary_engine = primary_engine
        self.fallback_engine = fallback_engine
        self.min_confidence = min_confidence
        self.logger = logging.getLogger(__name__)

    def process_document(self, document_path: Path, page_numbers: Optional[List[int]] = None) -> List[OCRResult]:
        """Process entire document, extracting text from all pages."""
        results = []

        try:
            from pdf2image import convert_from_path
            images = convert_from_path(str(document_path))

            if page_numbers:
                images = [images[i] for i in page_numbers if i < len(images)]

            for page_num, image in enumerate(images):
                result = self.process_page(image, page_num + 1)
                results.append(result)
        except Exception as e:
            self.logger.error(f"Error processing document: {e}")

        return results

    def process_page(self, image_or_path, page_number: int = 1) -> OCRResult:
        """Process a single page with fallback logic."""
        # Convert image to path if needed
        if hasattr(image_or_path, 'save'):
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                image_or_path.save(tmp.name)
                image_path = Path(tmp.name)
        else:
            image_path = Path(image_or_path)

        # Try primary engine
        if self.primary_engine.is_available():
            result = self.primary_engine.process_image(image_path)
            result.page_number = page_number

            if result.status == OCRStatus.SUCCESS and result.confidence >= self.min_confidence:
                return result

        # Fallback to secondary engine
        if self.fallback_engine and self.fallback_engine.is_available():
            self.logger.info(f"Primary engine failed/low confidence, falling back to {self.fallback_engine.name}")
            result = self.fallback_engine.process_image(image_path)
            result.page_number = page_number
            return result

        # Both engines failed
        return OCRResult(
            page_number=page_number,
            text="",
            confidence=0.0,
            status=OCRStatus.FAILED,
            engine="none",
            error_message="Both OCR engines unavailable or failed"
        )

    def preprocess_image(self, image_path: Path) -> Path:
        """Apply preprocessing: contrast, brightness, denoise."""
        from PIL import Image, ImageEnhance, ImageFilter

        image = Image.open(image_path)

        # Enhance contrast
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(1.5)

        # Enhance brightness
        enhancer = ImageEnhance.Brightness(image)
        image = enhancer.enhance(1.1)

        # Denoise
        image = image.filter(ImageFilter.MedianFilter(size=3))

        # Save preprocessed image
        output_path = image_path.parent / f"{image_path.stem}_preprocessed.png"
        image.save(output_path)

        return output_path
```

Create `backend/app/services/document_processor.py`:

```python
from pathlib import Path
from typing import Optional, List
from dataclasses import dataclass
from .ocr import OCRPipeline, OCRResult
import logging

logger = logging.getLogger(__name__)


@dataclass
class ProcessedDocument:
    """Container for a processed document with all extracted pages."""
    document_id: str
    file_path: Path
    file_type: str
    total_pages: int
    ocr_results: List[OCRResult]
    status: str  # "success", "partial", "failed"
    error_message: Optional[str] = None


class DocumentProcessor:
    """Orchestrates document processing workflow."""

    def __init__(self, ocr_pipeline: OCRPipeline):
        self.ocr_pipeline = ocr_pipeline
        self.logger = logging.getLogger(__name__)

    def process(self, document_path: Path, document_id: str) -> ProcessedDocument:
        """Process a document end-to-end."""
        try:
            file_type = document_path.suffix.lower()

            # Preprocess if image
            if file_type in [".png", ".jpg", ".jpeg", ".tiff"]:
                preprocessed = self.ocr_pipeline.preprocess_image(document_path)
                ocr_results = [self.ocr_pipeline.process_page(preprocessed)]
            else:
                # PDF processing
                ocr_results = self.ocr_pipeline.process_document(document_path)

            status = "success" if ocr_results and ocr_results[0].text else "partial"

            return ProcessedDocument(
                document_id=document_id,
                file_path=document_path,
                file_type=file_type,
                total_pages=len(ocr_results),
                ocr_results=ocr_results,
                status=status
            )
        except Exception as e:
            self.logger.error(f"Document processing failed: {e}")
            return ProcessedDocument(
                document_id=document_id,
                file_path=document_path,
                file_type=document_path.suffix.lower(),
                total_pages=0,
                ocr_results=[],
                status="failed",
                error_message=str(e)
            )
```

Create `backend/app/services/storage.py` with S3/MinIO support:

```python
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class StorageBackend(ABC):
    """Abstract storage backend."""

    @abstractmethod
    def upload(self, local_path: Path, remote_path: str) -> str:
        """Upload file and return remote URL."""
        pass

    @abstractmethod
    def download(self, remote_path: str, local_path: Path) -> Path:
        """Download file from storage."""
        pass

    @abstractmethod
    def delete(self, remote_path: str) -> bool:
        """Delete file from storage."""
        pass


class S3Storage(StorageBackend):
    """AWS S3 storage backend."""

    def __init__(self, bucket: str, region: str = "us-east-1", access_key: Optional[str] = None, secret_key: Optional[str] = None):
        self.bucket = bucket
        self.region = region
        try:
            import boto3
            self.s3_client = boto3.client(
                "s3",
                region_name=region,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key
            )
        except Exception as e:
            logger.error(f"Failed to initialize S3 client: {e}")
            self.s3_client = None

    def upload(self, local_path: Path, remote_path: str) -> str:
        """Upload to S3."""
        try:
            self.s3_client.upload_file(str(local_path), self.bucket, remote_path)
            return f"s3://{self.bucket}/{remote_path}"
        except Exception as e:
            logger.error(f"S3 upload failed: {e}")
            raise

    def download(self, remote_path: str, local_path: Path) -> Path:
        """Download from S3."""
        try:
            self.s3_client.download_file(self.bucket, remote_path, str(local_path))
            return local_path
        except Exception as e:
            logger.error(f"S3 download failed: {e}")
            raise

    def delete(self, remote_path: str) -> bool:
        """Delete from S3."""
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=remote_path)
            return True
        except Exception as e:
            logger.error(f"S3 delete failed: {e}")
            return False


class MinIOStorage(StorageBackend):
    """MinIO storage backend."""

    def __init__(self, endpoint: str, bucket: str, access_key: str, secret_key: str):
        self.endpoint = endpoint
        self.bucket = bucket
        try:
            from minio import Minio
            self.client = Minio(
                endpoint,
                access_key=access_key,
                secret_key=secret_key,
                secure=True
            )
        except Exception as e:
            logger.error(f"Failed to initialize MinIO client: {e}")
            self.client = None

    def upload(self, local_path: Path, remote_path: str) -> str:
        """Upload to MinIO."""
        try:
            self.client.fput_object(self.bucket, remote_path, str(local_path))
            return f"minio://{self.endpoint}/{self.bucket}/{remote_path}"
        except Exception as e:
            logger.error(f"MinIO upload failed: {e}")
            raise

    def download(self, remote_path: str, local_path: Path) -> Path:
        """Download from MinIO."""
        try:
            self.client.fget_object(self.bucket, remote_path, str(local_path))
            return local_path
        except Exception as e:
            logger.error(f"MinIO download failed: {e}")
            raise

    def delete(self, remote_path: str) -> bool:
        """Delete from MinIO."""
        try:
            self.client.remove_object(self.bucket, remote_path)
            return True
        except Exception as e:
            logger.error(f"MinIO delete failed: {e}")
            return False
```

**Unit Tests:**

Create `backend/tests/test_ocr.py`:

```python
import pytest
from pathlib import Path
from backend.app.services.ocr import (
    OCRPipeline, MistralOCREngine, TesseractOCREngine, OCRResult, OCRStatus
)


@pytest.fixture
def sample_image(tmp_path):
    """Create a sample test image."""
    from PIL import Image
    img = Image.new("RGB", (100, 100), color="white")
    img_path = tmp_path / "test.png"
    img.save(img_path)
    return img_path


def test_tesseract_engine_available():
    """Test Tesseract engine availability check."""
    engine = TesseractOCREngine()
    # Should be available if Tesseract is installed
    assert isinstance(engine.is_available(), bool)


def test_ocr_result_creation():
    """Test OCRResult dataclass."""
    result = OCRResult(
        page_number=1,
        text="Sample text",
        confidence=0.95,
        status=OCRStatus.SUCCESS,
        engine="test"
    )
    assert result.page_number == 1
    assert result.text == "Sample text"
    assert result.confidence == 0.95


def test_ocr_pipeline_fallback():
    """Test OCR pipeline fallback logic."""
    primary = TesseractOCREngine()
    fallback = TesseractOCREngine()
    pipeline = OCRPipeline(primary, fallback, min_confidence=0.7)

    assert pipeline.primary_engine is not None
    assert pipeline.fallback_engine is not None
```

**Acceptance Criteria:**
- Mistral OCR engine + Tesseract fallback implemented
- PDF, PNG, JPG, TIFF support
- OCR accuracy >90%
- Per-page extraction with page numbering
- Image preprocessing (contrast, brightness, denoise)
- Unit tests passing
- Logging at key checkpoints

---

## Task 7: LON-123 — Extraction Agent

**Objective:** Create an intelligent LLM-based extraction agent that converts OCR text and workflow configurations into structured, validated JSON output.

**Full Instructions:**

Create `backend/agents/extraction.py`:

```python
import json
import logging
from typing import Any, Dict, Optional
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class ExtractionField:
    """Represents an extracted field with metadata."""
    name: str
    value: Any
    confidence: ConfidenceLevel
    raw_text: str
    note: Optional[str] = None


@dataclass
class ExtractionResult:
    """Container for extraction results."""
    fields: Dict[str, ExtractionField]
    tables: Dict[str, list]
    raw_response: str
    success: bool
    error_message: Optional[str] = None


EXTRACTION_SYSTEM_PROMPT = """You are a document extraction agent. Your task is to extract structured information from OCR-extracted text.

You will be given:
1. OCR text from a document
2. A workflow configuration defining what fields/tables to extract

Your output MUST be valid JSON with this structure:
{
    "fields": {
        "field_name": {
            "value": "extracted_value",
            "confidence": "high|medium|low",
            "raw_text": "original text from document",
            "note": "any clarification"
        }
    },
    "tables": {
        "table_name": [
            {"col1": "val1", "col2": "val2"},
            ...
        ]
    }
}

Be precise. If you cannot confidently extract a field, set confidence to "low" and explain in "note".
Extract exactly what is asked for in the workflow config. Do not invent data."""


class ExtractionAgent:
    """LLM-based extraction agent."""

    def __init__(self, llm_client):
        """
        Initialize extraction agent.

        Args:
            llm_client: LLM client (e.g., Anthropic, OpenAI)
        """
        self.llm_client = llm_client
        self.logger = logging.getLogger(__name__)

    def execute(self, ocr_text: str, workflow_config: Dict[str, Any]) -> ExtractionResult:
        """
        Execute extraction on OCR text using workflow config.

        Args:
            ocr_text: Text extracted by OCR
            workflow_config: Dictionary with 'fields' and 'tables' keys

        Returns:
            ExtractionResult with extracted fields and tables
        """
        try:
            # Build extraction prompt
            user_prompt = self._build_extraction_prompt(ocr_text, workflow_config)

            # Call LLM
            response = self.llm_client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=4096,
                system=EXTRACTION_SYSTEM_PROMPT,
                messages=[
                    {"role": "user", "content": user_prompt}
                ]
            )

            response_text = response.content[0].text

            # Parse response
            result = self._parse_extraction(response_text, ocr_text, workflow_config)
            return result
        except Exception as e:
            self.logger.error(f"Extraction failed: {e}")
            return ExtractionResult(
                fields={},
                tables={},
                raw_response="",
                success=False,
                error_message=str(e)
            )

    def _build_extraction_prompt(self, ocr_text: str, workflow_config: Dict[str, Any]) -> str:
        """Build the extraction prompt for the LLM."""
        fields_desc = "\n".join([
            f"- {field['name']}: {field.get('description', 'N/A')}"
            for field in workflow_config.get('fields', [])
        ])

        tables_desc = "\n".join([
            f"- {table['name']}: {table.get('description', 'N/A')} (columns: {', '.join(table.get('columns', []))})"
            for table in workflow_config.get('tables', [])
        ])

        prompt = f"""Extract the following information from the document text:

FIELDS TO EXTRACT:
{fields_desc}

TABLES TO EXTRACT:
{tables_desc}

DOCUMENT TEXT:
{ocr_text}

Return the extraction as valid JSON matching the required format."""

        return prompt

    def _parse_extraction(self, response_text: str, ocr_text: str, workflow_config: Dict[str, Any]) -> ExtractionResult:
        """Parse LLM response and validate against workflow config."""
        try:
            # Extract JSON from response
            json_str = response_text
            if "```json" in response_text:
                json_str = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                json_str = response_text.split("```")[1].split("```")[0]

            data = json.loads(json_str)

            # Build ExtractionField objects
            fields = {}
            for field_name, field_data in data.get("fields", {}).items():
                fields[field_name] = ExtractionField(
                    name=field_name,
                    value=field_data.get("value"),
                    confidence=ConfidenceLevel(field_data.get("confidence", "low")),
                    raw_text=field_data.get("raw_text", ""),
                    note=field_data.get("note")
                )

            # Extract tables
            tables = data.get("tables", {})

            return ExtractionResult(
                fields=fields,
                tables=tables,
                raw_response=response_text,
                success=True
            )
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON from LLM response: {e}")
            return ExtractionResult(
                fields={},
                tables={},
                raw_response=response_text,
                success=False,
                error_message=f"JSON parsing error: {e}"
            )
```

Create `backend/app/services/extraction_service.py`:

```python
from typing import Dict, Any, Optional
from backend.agents.extraction import ExtractionAgent, ExtractionResult
import logging

logger = logging.getLogger(__name__)


class ExtractionService:
    """Service layer for document extraction."""

    def __init__(self, llm_client):
        self.agent = ExtractionAgent(llm_client)
        self.logger = logging.getLogger(__name__)

    def extract(
        self,
        ocr_text: str,
        workflow_config: Dict[str, Any],
        document_id: Optional[str] = None
    ) -> ExtractionResult:
        """
        Extract structured data from OCR text.

        Args:
            ocr_text: OCR-extracted text
            workflow_config: Workflow defining what to extract
            document_id: Optional document identifier for logging

        Returns:
            ExtractionResult with fields and tables
        """
        self.logger.info(f"Starting extraction for document: {document_id}")

        result = self.agent.execute(ocr_text, workflow_config)

        if result.success:
            self.logger.info(f"Extraction successful for document: {document_id}")
        else:
            self.logger.error(f"Extraction failed for document {document_id}: {result.error_message}")

        return result

    def batch_extract(
        self,
        ocr_texts: list,
        workflow_config: Dict[str, Any]
    ) -> list:
        """Extract from multiple OCR texts."""
        results = []
        for i, text in enumerate(ocr_texts):
            result = self.extract(text, workflow_config, f"batch_{i}")
            results.append(result)
        return results
```

**Tests:**

Create `backend/tests/test_extraction.py`:

```python
import pytest
from unittest.mock import Mock, MagicMock
from backend.agents.extraction import ExtractionAgent, ExtractionResult, ConfidenceLevel
from backend.app.services.extraction_service import ExtractionService


@pytest.fixture
def mock_llm_client():
    """Create a mock LLM client."""
    client = Mock()
    return client


def test_extraction_agent_execute(mock_llm_client):
    """Test extraction agent execution."""
    # Mock LLM response
    mock_response = Mock()
    mock_response.content = [Mock(text='{"fields": {"name": {"value": "John Doe", "confidence": "high", "raw_text": "John Doe"}}, "tables": {}}')]
    mock_llm_client.messages.create.return_value = mock_response

    agent = ExtractionAgent(mock_llm_client)
    workflow = {
        "fields": [{"name": "name", "description": "Person's name"}],
        "tables": []
    }

    result = agent.execute("John Doe is the name", workflow)

    assert result.success
    assert "name" in result.fields
    assert result.fields["name"].value == "John Doe"
    assert result.fields["name"].confidence == ConfidenceLevel.HIGH


def test_extraction_service_extract(mock_llm_client):
    """Test extraction service."""
    mock_response = Mock()
    mock_response.content = [Mock(text='{"fields": {}, "tables": {}}')]
    mock_llm_client.messages.create.return_value = mock_response

    service = ExtractionService(mock_llm_client)
    workflow = {"fields": [], "tables": []}

    result = service.extract("test text", workflow, "doc_123")

    assert result.success


def test_extraction_confidence_levels():
    """Test confidence level enum."""
    assert ConfidenceLevel.HIGH.value == "high"
    assert ConfidenceLevel.MEDIUM.value == "medium"
    assert ConfidenceLevel.LOW.value == "low"
```

**Acceptance Criteria:**
- Accepts workflow config + OCR text
- Returns structured JSON extraction
- Supports flat fields + tables
- Includes confidence scoring (high/medium/low)
- Proper error handling with meaningful messages
- Tests with mock LLM pass

---

## Task 8: LON-124 — Document Upload UI

**Objective:** Build a React TypeScript UI for document upload with drag-drop, progress tracking, and workflow selection.

**Full Instructions:**

Create `frontend/src/pages/UploadPage.tsx`:

```typescript
import React, { useState } from "react";
import { FileUploaderDropContainer } from "../components/FileUploaderDropContainer";
import { DocumentPreview } from "../components/DocumentPreview";
import styles from "./UploadPage.module.css";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

interface WorkflowOption {
  id: string;
  name: string;
  description: string;
}

const WORKFLOWS: WorkflowOption[] = [
  {
    id: "invoice",
    name: "Invoice Extraction",
    description: "Extract invoice details (number, date, amount, vendor)"
  },
  {
    id: "contract",
    name: "Contract Analysis",
    description: "Extract contract terms, parties, effective dates"
  },
  {
    id: "resume",
    name: "Resume Parsing",
    description: "Extract contact info, experience, skills"
  },
  {
    id: "generic",
    name: "Generic Document",
    description: "General-purpose document extraction"
  }
];

export const UploadPage: React.FC = () => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>("generic");
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);

  const handleFilesSelected = (selectedFiles: File[]) => {
    const newFiles: UploadedFile[] = selectedFiles.map((file, idx) => ({
      id: `${Date.now()}_${idx}`,
      name: file.name,
      size: file.size,
      progress: 0,
      status: "pending"
    }));

    setFiles((prev) => [...prev, ...newFiles]);

    // Simulate upload
    newFiles.forEach((file) => {
      simulateUpload(file.id);
    });
  };

  const simulateUpload = (fileId: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, status: "uploading" } : f))
    );

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 30;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, progress: 100, status: "success" } : f
          )
        );
      } else {
        setFiles((prev) =>
          prev.map((f) => (f.id === fileId ? { ...f, progress } : f))
        );
      }
    }, 500);
  };

  const handleBatchProcess = async () => {
    const filesToProcess = files.filter((f) => f.status === "success");
    if (filesToProcess.length === 0) {
      alert("No files ready for processing");
      return;
    }

    setIsProcessing(true);
    try {
      // Call API to batch process
      const response = await fetch("/api/v1/documents/process-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_ids: filesToProcess.map((f) => f.id),
          workflow_id: selectedWorkflow
        })
      });

      if (!response.ok) throw new Error("Batch process failed");

      // Handle success
      alert("Processing started");
    } catch (error) {
      alert(`Error: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    if (previewFile?.id === fileId) {
      setPreviewFile(null);
    }
  };

  return (
    <div className={styles.container}>
      <h1>Document Upload & Processing</h1>

      <div className={styles.mainContent}>
        <div className={styles.uploadSection}>
          <FileUploaderDropContainer onFilesSelected={handleFilesSelected} />

          <div className={styles.fileList}>
            {files.length === 0 ? (
              <p className={styles.emptyState}>No files selected</p>
            ) : (
              <>
                <h3>Selected Files ({files.length})</h3>
                {files.map((file) => (
                  <div key={file.id} className={styles.fileItem}>
                    <div className={styles.fileInfo}>
                      <div className={styles.fileName}>{file.name}</div>
                      <div className={styles.fileSize}>
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>

                    <div className={styles.progressContainer}>
                      <div
                        className={styles.progressBar}
                        style={{
                          width: `${file.progress}%`,
                          backgroundColor:
                            file.status === "success"
                              ? "#4589FF"
                              : file.status === "error"
                              ? "#FF0000"
                              : "#FFA500"
                        }}
                      />
                    </div>

                    <div className={styles.fileStatus}>
                      {file.status === "success" && "✓ Uploaded"}
                      {file.status === "uploading" && "⏳ Uploading..."}
                      {file.status === "error" && `✗ ${file.error}`}
                      {file.status === "pending" && "⏸ Pending"}
                    </div>

                    <button
                      className={styles.removeButton}
                      onClick={() => handleRemoveFile(file.id)}
                    >
                      ×
                    </button>

                    <button
                      className={styles.previewButton}
                      onClick={() => setPreviewFile(file)}
                    >
                      Preview
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className={styles.configSection}>
          <h3>Processing Options</h3>

          <div className={styles.workflowSelector}>
            <label htmlFor="workflow">Select Workflow:</label>
            <select
              id="workflow"
              value={selectedWorkflow}
              onChange={(e) => setSelectedWorkflow(e.target.value)}
            >
              {WORKFLOWS.map((wf) => (
                <option key={wf.id} value={wf.id}>
                  {wf.name}
                </option>
              ))}
            </select>
            <p className={styles.workflowDesc}>
              {WORKFLOWS.find((w) => w.id === selectedWorkflow)?.description}
            </p>
          </div>

          <button
            className={styles.processButton}
            onClick={handleBatchProcess}
            disabled={isProcessing || files.filter((f) => f.status === "success").length === 0}
          >
            {isProcessing ? "Processing..." : "Start Batch Processing"}
          </button>

          <div className={styles.stats}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Total Files:</span>
              <span className={styles.statValue}>{files.length}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Ready:</span>
              <span className={styles.statValue}>
                {files.filter((f) => f.status === "success").length}
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Total Size:</span>
              <span className={styles.statValue}>
                {(
                  files.reduce((sum, f) => sum + f.size, 0) /
                  1024 /
                  1024
                ).toFixed(2)}{" "}
                MB
              </span>
            </div>
          </div>
        </div>
      </div>

      {previewFile && <DocumentPreview file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  );
};
```

Create `frontend/src/components/FileUploaderDropContainer.tsx`:

```typescript
import React, { useRef, useState } from "react";
import styles from "./FileUploaderDropContainer.module.css";

interface FileUploaderDropContainerProps {
  onFilesSelected: (files: File[]) => void;
  acceptedFormats?: string[];
}

export const FileUploaderDropContainer: React.FC<FileUploaderDropContainerProps> = ({
  onFilesSelected,
  acceptedFormats = [".pdf", ".png", ".jpg", ".jpeg", ".tiff"]
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    const validFiles = droppedFiles.filter((file) =>
      acceptedFormats.some((fmt) =>
        file.name.toLowerCase().endsWith(fmt)
      )
    );

    onFilesSelected(validFiles);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onFilesSelected(Array.from(e.target.files));
    }
  };

  const handleClickUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`${styles.dropContainer} ${
        isDragging ? styles.dragging : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        backgroundColor: "#EDF5FF",
        border: isDragging ? "2px solid #4589FF" : "2px dashed #4589FF"
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        style={{ display: "none" }}
        accept={acceptedFormats.join(",")}
      />

      <div className={styles.uploadIcon}>📄</div>
      <h2>Drag and drop your documents here</h2>
      <p>Supported formats: {acceptedFormats.join(", ")}</p>
      <button onClick={handleClickUpload} className={styles.selectButton}>
        Or select files
      </button>
    </div>
  );
};
```

Create `frontend/src/components/DocumentPreview.tsx`:

```typescript
import React from "react";
import styles from "./DocumentPreview.module.css";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
}

interface DocumentPreviewProps {
  file: UploadedFile;
  onClose: () => void;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  file,
  onClose
}) => {
  const isPDF = file.name.toLowerCase().endsWith(".pdf");
  const isImage = [".png", ".jpg", ".jpeg", ".tiff"].some((ext) =>
    file.name.toLowerCase().endsWith(ext)
  );

  return (
    <div className={styles.modal} onClick={onClose}>
      <div
        className={styles.modalContent}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2>Preview: {file.name}</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.body}>
          {isPDF && (
            <div className={styles.preview}>
              <p>PDF preview not yet implemented</p>
              <p>File size: {(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          )}
          {isImage && (
            <div className={styles.preview}>
              <p>Image preview</p>
              <p>File size: {(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          )}
          {!isPDF && !isImage && (
            <div className={styles.preview}>
              <p>Preview not available for this file type</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
```

Register the `/upload` route in `frontend/src/App.tsx`:

```typescript
import { UploadPage } from "./pages/UploadPage";

// In your router configuration:
{
  path: "/upload",
  element: <UploadPage />
}
```

Create `frontend/src/pages/UploadPage.module.css`:

```css
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.mainContent {
  display: grid;
  grid-template-columns: 1fr 350px;
  gap: 20px;
  margin-top: 30px;
}

.uploadSection {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.fileList {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  max-height: 600px;
  overflow-y: auto;
}

.emptyState {
  color: #999;
  text-align: center;
  padding: 40px 20px;
}

.fileItem {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  align-items: center;
  gap: 15px;
  padding: 12px;
  border-bottom: 1px solid #eee;
}

.fileInfo {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.fileName {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fileSize {
  font-size: 12px;
  color: #999;
}

.progressContainer {
  width: 150px;
  height: 4px;
  background: #e0e0e0;
  border-radius: 2px;
  overflow: hidden;
}

.progressBar {
  height: 100%;
  transition: width 0.3s ease;
}

.fileStatus {
  font-size: 12px;
  white-space: nowrap;
}

.removeButton,
.previewButton {
  padding: 6px 10px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.removeButton:hover,
.previewButton:hover {
  background: #f5f5f5;
}

.configSection {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  height: fit-content;
  position: sticky;
  top: 20px;
}

.workflowSelector {
  margin-bottom: 20px;
}

.workflowSelector label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.workflowSelector select {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.workflowDesc {
  font-size: 12px;
  color: #666;
  margin-top: 8px;
}

.processButton {
  width: 100%;
  padding: 12px;
  background: #4589FF;
  color: white;
  border: none;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 20px;
}

.processButton:hover:not(:disabled) {
  background: #3a70d6;
}

.processButton:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.stats {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 14px;
}

.statItem {
  display: flex;
  justify-content: space-between;
  padding: 8px;
  background: #f9f9f9;
  border-radius: 4px;
}

.statLabel {
  font-weight: 500;
}

.statValue {
  color: #4589FF;
  font-weight: 600;
}

@media (max-width: 900px) {
  .mainContent {
    grid-template-columns: 1fr;
  }

  .configSection {
    position: static;
  }
}
```

**Acceptance Criteria:**
- Drag-drop file upload functional
- Multi-file support
- Real-time progress bars
- Status indicators (pending/uploading/success/error)
- Workflow selector dropdown
- Batch process button
- File preview modal
- Responsive design

---

## Task 9: LON-125 — Document Processing API

**Objective:** Create REST API endpoints for document upload, async processing, and results retrieval.

**Full Instructions:**

Create `backend/schemas/document.py`:

```python
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class DocumentStatus(str, Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class DocumentUploadRequest(BaseModel):
    file_name: str
    file_size: int
    workflow_id: str


class DocumentUploadResponse(BaseModel):
    document_id: str
    file_name: str
    upload_timestamp: datetime
    status: DocumentStatus = DocumentStatus.UPLOADED


class DocumentProcessRequest(BaseModel):
    document_id: str
    workflow_id: str


class DocumentStatusResponse(BaseModel):
    document_id: str
    status: DocumentStatus
    progress_percent: int = 0
    created_at: datetime
    updated_at: datetime
    error_message: Optional[str] = None


class ExtractionFieldResponse(BaseModel):
    value: str
    confidence: str
    raw_text: str
    note: Optional[str] = None


class DocumentResultsResponse(BaseModel):
    document_id: str
    file_name: str
    status: DocumentStatus
    fields: dict  # { field_name: ExtractionFieldResponse }
    tables: dict
    processing_time_ms: float
    ocr_engine: str
    completed_at: datetime


class BatchProcessRequest(BaseModel):
    document_ids: List[str]
    workflow_id: str


class BatchProcessResponse(BaseModel):
    batch_id: str
    document_count: int
    created_at: datetime
```

Create `backend/api/v1/endpoints/documents.py`:

```python
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import List, Optional
import uuid
from datetime import datetime
import logging

from backend.schemas.document import (
    DocumentUploadResponse,
    DocumentStatusResponse,
    DocumentResultsResponse,
    BatchProcessRequest,
    BatchProcessResponse,
    DocumentStatus
)
from backend.app.services.document_processor import DocumentProcessor
from backend.app.services.extraction_service import ExtractionService
from backend.app.services.storage import StorageBackend
from backend.tasks.processing import process_document_task

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/documents", tags=["documents"])

# These would be injected via dependency injection in a real app
document_processor: Optional[DocumentProcessor] = None
extraction_service: Optional[ExtractionService] = None
storage_backend: Optional[StorageBackend] = None


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(file: UploadFile = File(...), workflow_id: str = "generic"):
    """
    Upload a document file.

    - **file**: PDF, PNG, JPG, TIFF
    - **workflow_id**: Processing workflow to apply
    """
    document_id = str(uuid.uuid4())

    try:
        # Validate file type
        allowed_types = ["application/pdf", "image/png", "image/jpeg", "image/tiff"]
        if file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="Unsupported file type")

        # Save to storage
        file_content = await file.read()
        remote_path = f"uploads/{document_id}/{file.filename}"
        storage_backend.upload_file(file_content, remote_path)

        logger.info(f"Document uploaded: {document_id}")

        return DocumentUploadResponse(
            document_id=document_id,
            file_name=file.filename,
            upload_timestamp=datetime.utcnow()
        )
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process/{document_id}")
async def process_document(
    document_id: str,
    workflow_id: str = "generic",
    background_tasks: BackgroundTasks = None
):
    """
    Trigger async processing of a document.
    """
    try:
        # Queue async task
        background_tasks.add_task(
            process_document_task,
            document_id,
            workflow_id
        )

        logger.info(f"Processing queued for document: {document_id}")

        return {"status": "processing", "document_id": document_id}
    except Exception as e:
        logger.error(f"Failed to queue processing: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-batch", response_model=BatchProcessResponse)
async def process_batch(
    request: BatchProcessRequest,
    background_tasks: BackgroundTasks
):
    """
    Process multiple documents in batch.
    """
    batch_id = str(uuid.uuid4())

    try:
        for doc_id in request.document_ids:
            background_tasks.add_task(
                process_document_task,
                doc_id,
                request.workflow_id
            )

        logger.info(f"Batch processing queued: {batch_id}")

        return BatchProcessResponse(
            batch_id=batch_id,
            document_count=len(request.document_ids),
            created_at=datetime.utcnow()
        )
    except Exception as e:
        logger.error(f"Batch processing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{document_id}", response_model=DocumentStatusResponse)
async def get_document_status(document_id: str):
    """
    Get processing status of a document.
    """
    try:
        # Fetch from database/cache
        status_data = {}  # Would fetch from DB

        return DocumentStatusResponse(
            document_id=document_id,
            status=DocumentStatus.PROCESSING,
            progress_percent=50,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
    except Exception as e:
        logger.error(f"Failed to get status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/results/{document_id}", response_model=DocumentResultsResponse)
async def get_document_results(document_id: str):
    """
    Get extraction results for a completed document.
    """
    try:
        # Fetch results from database
        results_data = {}  # Would fetch from DB

        return DocumentResultsResponse(
            document_id=document_id,
            file_name="example.pdf",
            status=DocumentStatus.COMPLETED,
            fields={},
            tables={},
            processing_time_ms=1500.0,
            ocr_engine="mistral",
            completed_at=datetime.utcnow()
        )
    except Exception as e:
        logger.error(f"Failed to get results: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list", response_model=List[DocumentStatusResponse])
async def list_documents(workflow_id: Optional[str] = None, status: Optional[str] = None):
    """
    List all documents, optionally filtered by workflow or status.
    """
    try:
        # Query database
        documents = []  # Would fetch from DB

        return documents
    except Exception as e:
        logger.error(f"Failed to list documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

Create `backend/tasks/processing.py` with Celery task:

```python
import logging
from celery import shared_task
from pathlib import Path
from typing import Optional

from backend.app.services.document_processor import DocumentProcessor
from backend.app.services.extraction_service import ExtractionService
from backend.app.services.storage import StorageBackend
from backend.app.services.ocr import OCRPipeline, MistralOCREngine, TesseractOCREngine

logger = logging.getLogger(__name__)


@shared_task
def process_document_task(document_id: str, workflow_id: str = "generic"):
    """
    Celery task for async document processing.
    """
    logger.info(f"Processing document: {document_id} with workflow: {workflow_id}")

    try:
        # Initialize services
        mistral_engine = MistralOCREngine()
        tesseract_engine = TesseractOCREngine()
        ocr_pipeline = OCRPipeline(mistral_engine, tesseract_engine)
        document_processor = DocumentProcessor(ocr_pipeline)

        # This would be injected
        # extraction_service = ExtractionService(llm_client)
        # storage_backend = StorageBackend()

        # Download document from storage
        # local_path = storage_backend.download(f"uploads/{document_id}/*")

        # Process document
        # processed_doc = document_processor.process(local_path, document_id)

        # Extract data
        # workflow_config = get_workflow_config(workflow_id)
        # extraction_result = extraction_service.extract(
        #     ocr_text=processed_doc.ocr_results[0].text,
        #     workflow_config=workflow_config,
        #     document_id=document_id
        # )

        # Save results to database
        # save_results_to_db(document_id, extraction_result)

        logger.info(f"Document processing completed: {document_id}")
        return {"status": "completed", "document_id": document_id}

    except Exception as e:
        logger.error(f"Document processing failed: {document_id} - {e}")
        # save_error_to_db(document_id, str(e))
        raise


def get_workflow_config(workflow_id: str) -> dict:
    """Load workflow configuration."""
    workflows = {
        "invoice": {
            "fields": [
                {"name": "invoice_number", "description": "Invoice ID"},
                {"name": "invoice_date", "description": "Issue date"},
                {"name": "total_amount", "description": "Total amount due"},
                {"name": "vendor_name", "description": "Issuing vendor"}
            ],
            "tables": [
                {
                    "name": "line_items",
                    "description": "Invoice line items",
                    "columns": ["description", "quantity", "unit_price", "total"]
                }
            ]
        },
        "contract": {
            "fields": [
                {"name": "parties", "description": "Contract parties"},
                {"name": "effective_date", "description": "Contract start date"},
                {"name": "expiration_date", "description": "Contract end date"},
                {"name": "payment_terms", "description": "Payment terms"}
            ],
            "tables": []
        },
        "resume": {
            "fields": [
                {"name": "full_name", "description": "Candidate name"},
                {"name": "email", "description": "Email address"},
                {"name": "phone", "description": "Phone number"},
                {"name": "summary", "description": "Professional summary"}
            ],
            "tables": [
                {
                    "name": "experience",
                    "description": "Work experience",
                    "columns": ["company", "position", "start_date", "end_date"]
                },
                {
                    "name": "skills",
                    "description": "Technical and soft skills",
                    "columns": ["skill_name", "proficiency_level"]
                }
            ]
        },
        "generic": {
            "fields": [
                {"name": "title", "description": "Document title"},
                {"name": "date", "description": "Document date"},
                {"name": "author", "description": "Document author"}
            ],
            "tables": []
        }
    }

    return workflows.get(workflow_id, workflows["generic"])
```

Register the router in `backend/app/main.py`:

```python
from backend.api.v1.endpoints import documents

app.include_router(documents.router, prefix="/api/v1")
```

**Acceptance Criteria:**
- `/upload` endpoint stores files in S3/MinIO
- Async processing via Celery
- `/process-batch` supports multiple documents
- `/status/{id}` and `/results/{id}` endpoints functional
- File type validation (PDF, PNG, JPG, TIFF)
- Error handling with meaningful messages

---

## Task 10: LON-126 — Supervisor Agent

**Objective:** Implement LangGraph-based supervisor orchestrating the extraction workflow through validate → generate → act → finalize states.

**Full Instructions:**

Install dependencies:
```bash
pip install langgraph langchain-core
```

Update `backend/agents/base.py` with AgentState:

```python
from typing import TypedDict, List, Optional, Any
from dataclasses import dataclass


class AgentState(TypedDict):
    """State shared across all agents in the workflow."""
    document_id: str
    ocr_text: str
    workflow_config: dict
    validation_errors: List[str]
    validation_passed: bool
    generated_fields: dict
    generated_tables: dict
    action_results: dict
    final_extraction: dict
    error_message: Optional[str]
    messages: List[str]


@dataclass
class AgentContext:
    """Context information for agents."""
    workflow_id: str
    document_id: str
    timestamp: str
```

Create `backend/agents/supervisor.py`:

```python
import logging
from typing import Literal, Optional
from langgraph.graph import StateGraph, END
from backend.agents.base import AgentState, AgentContext
from backend.agents.extraction import ExtractionAgent, ExtractionResult

logger = logging.getLogger(__name__)


class ValidationAgent:
    """Validates OCR text and workflow configuration."""

    def __init__(self):
        self.logger = logging.getLogger(__name__)

    def execute(self, state: AgentState) -> dict:
        """Validate OCR text and workflow config."""
        errors = []

        if not state["ocr_text"] or len(state["ocr_text"]) < 10:
            errors.append("OCR text is too short or empty")

        if "fields" not in state["workflow_config"]:
            errors.append("Workflow missing 'fields' configuration")

        if "tables" not in state["workflow_config"]:
            errors.append("Workflow missing 'tables' configuration")

        passed = len(errors) == 0

        self.logger.info(f"Validation result: {'passed' if passed else 'failed'} ({len(errors)} errors)")

        return {
            "validation_errors": errors,
            "validation_passed": passed,
            "messages": state.get("messages", []) + [
                f"Validation {'passed' if passed else 'failed'}"
            ]
        }


class GenerationAgent:
    """Generates extraction prompts and coordinates extraction."""

    def __init__(self, extraction_agent: ExtractionAgent):
        self.extraction_agent = extraction_agent
        self.logger = logging.getLogger(__name__)

    def execute(self, state: AgentState) -> dict:
        """Generate extraction using the extraction agent."""
        if not state.get("validation_passed"):
            return {
                "error_message": "Validation failed, skipping generation",
                "messages": state.get("messages", []) + ["Skipped generation due to validation failure"]
            }

        try:
            result = self.extraction_agent.execute(
                state["ocr_text"],
                state["workflow_config"]
            )

            generated_fields = {name: field.value for name, field in result.fields.items()}

            self.logger.info(f"Generation complete: {len(generated_fields)} fields extracted")

            return {
                "generated_fields": generated_fields,
                "generated_tables": result.tables,
                "messages": state.get("messages", []) + [
                    f"Generated {len(generated_fields)} fields"
                ]
            }
        except Exception as e:
            self.logger.error(f"Generation failed: {e}")
            return {
                "error_message": str(e),
                "messages": state.get("messages", []) + [f"Generation failed: {e}"]
            }


class ActionAgent:
    """Performs post-processing actions on extracted data."""

    def __init__(self):
        self.logger = logging.getLogger(__name__)

    def execute(self, state: AgentState) -> dict:
        """Post-process and validate extracted data."""
        if not state.get("generated_fields"):
            return {
                "action_results": {},
                "messages": state.get("messages", []) + ["No fields to act on"]
            }

        action_results = {}
        for field_name, field_value in state["generated_fields"].items():
            # Example: normalization, validation
            action_results[field_name] = {
                "original": field_value,
                "processed": str(field_value).strip().title() if isinstance(field_value, str) else field_value
            }

        self.logger.info(f"Action complete: processed {len(action_results)} fields")

        return {
            "action_results": action_results,
            "messages": state.get("messages", []) + [
                f"Processed {len(action_results)} fields"
            ]
        }


class FinalizeAgent:
    """Finalizes extraction and prepares output."""

    def __init__(self):
        self.logger = logging.getLogger(__name__)

    def execute(self, state: AgentState) -> dict:
        """Finalize extraction output."""
        final_extraction = {
            "document_id": state.get("document_id"),
            "fields": state.get("generated_fields", {}),
            "tables": state.get("generated_tables", {}),
            "action_results": state.get("action_results", {}),
            "validation_errors": state.get("validation_errors", []),
            "status": "success" if state.get("validation_passed") else "partial"
        }

        self.logger.info(f"Finalization complete for document: {state.get('document_id')}")

        return {
            "final_extraction": final_extraction,
            "messages": state.get("messages", []) + ["Extraction finalized"]
        }


class SupervisorAgent:
    """LangGraph supervisor orchestrating the extraction workflow."""

    def __init__(self, extraction_agent: ExtractionAgent):
        self.validation_agent = ValidationAgent()
        self.generation_agent = GenerationAgent(extraction_agent)
        self.action_agent = ActionAgent()
        self.finalize_agent = FinalizeAgent()
        self.logger = logging.getLogger(__name__)
        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        """Build the LangGraph state machine."""
        graph = StateGraph(AgentState)

        # Add nodes
        graph.add_node("validate", self._validate_node)
        graph.add_node("generate", self._generate_node)
        graph.add_node("act", self._act_node)
        graph.add_node("finalize", self._finalize_node)

        # Set entry point
        graph.set_entry_point("validate")

        # Add edges with conditional logic
        graph.add_conditional_edges(
            "validate",
            self._should_continue_to_generate,
            {
                True: "generate",
                False: "finalize"  # Skip to finalize if validation fails
            }
        )

        graph.add_edge("generate", "act")
        graph.add_edge("act", "finalize")
        graph.add_edge("finalize", END)

        return graph.compile()

    def _validate_node(self, state: AgentState) -> dict:
        """Validation node."""
        return self.validation_agent.execute(state)

    def _generate_node(self, state: AgentState) -> dict:
        """Generation node."""
        return self.generation_agent.execute(state)

    def _act_node(self, state: AgentState) -> dict:
        """Action node."""
        return self.action_agent.execute(state)

    def _finalize_node(self, state: AgentState) -> dict:
        """Finalize node."""
        return self.finalize_agent.execute(state)

    def _should_continue_to_generate(self, state: AgentState) -> bool:
        """Determine if we should proceed to generation."""
        return state.get("validation_passed", False)

    def execute(self, state: AgentState) -> dict:
        """Execute the entire workflow."""
        try:
            self.logger.info(f"Starting supervisor workflow for document: {state.get('document_id')}")

            result = self.graph.invoke(state)

            self.logger.info(f"Supervisor workflow completed for document: {state.get('document_id')}")

            return result
        except Exception as e:
            self.logger.error(f"Supervisor workflow failed: {e}")
            return {
                "error_message": str(e),
                "final_extraction": None,
                "messages": state.get("messages", []) + [f"Workflow failed: {e}"]
            }
```

Integrate with Celery task in `backend/tasks/processing.py`:

```python
from backend.agents.supervisor import SupervisorAgent
from backend.agents.extraction import ExtractionAgent
from backend.app.services.storage import StorageBackend

@shared_task
def process_document_task(document_id: str, workflow_id: str = "generic"):
    """
    Celery task for async document processing using supervisor.
    """
    logger.info(f"Processing document: {document_id} with workflow: {workflow_id}")

    try:
        # Initialize agents
        extraction_agent = ExtractionAgent(llm_client)
        supervisor = SupervisorAgent(extraction_agent)

        # Download document
        local_path = storage_backend.download(f"uploads/{document_id}/*")

        # Process with OCR
        processed_doc = document_processor.process(local_path, document_id)

        # Build initial state
        ocr_text = "\n".join([r.text for r in processed_doc.ocr_results])
        workflow_config = get_workflow_config(workflow_id)

        initial_state = {
            "document_id": document_id,
            "ocr_text": ocr_text,
            "workflow_config": workflow_config,
            "validation_errors": [],
            "validation_passed": False,
            "generated_fields": {},
            "generated_tables": {},
            "action_results": {},
            "final_extraction": {},
            "error_message": None,
            "messages": []
        }

        # Execute supervisor
        result = supervisor.execute(initial_state)

        # Save results
        save_results_to_db(document_id, result["final_extraction"])

        logger.info(f"Document processing completed: {document_id}")
        return result

    except Exception as e:
        logger.error(f"Document processing failed: {document_id} - {e}")
        save_error_to_db(document_id, str(e))
        raise
```

**Tests:**

Create `backend/tests/test_supervisor.py`:

```python
import pytest
from unittest.mock import Mock, MagicMock
from backend.agents.supervisor import SupervisorAgent, ValidationAgent, GenerationAgent
from backend.agents.base import AgentState


@pytest.fixture
def sample_state() -> AgentState:
    """Create a sample agent state."""
    return {
        "document_id": "doc_123",
        "ocr_text": "Sample invoice document with line items and totals",
        "workflow_config": {
            "fields": [
                {"name": "invoice_number", "description": "Invoice ID"},
                {"name": "total_amount", "description": "Total amount"}
            ],
            "tables": []
        },
        "validation_errors": [],
        "validation_passed": False,
        "generated_fields": {},
        "generated_tables": {},
        "action_results": {},
        "final_extraction": {},
        "error_message": None,
        "messages": []
    }


def test_validation_agent_passes(sample_state):
    """Test validation agent with valid input."""
    agent = ValidationAgent()
    result = agent.execute(sample_state)

    assert result["validation_passed"] is True
    assert len(result["validation_errors"]) == 0


def test_validation_agent_fails_on_empty_text(sample_state):
    """Test validation agent with empty OCR text."""
    sample_state["ocr_text"] = ""
    agent = ValidationAgent()
    result = agent.execute(sample_state)

    assert result["validation_passed"] is False
    assert len(result["validation_errors"]) > 0


def test_supervisor_graph_compiles(sample_state):
    """Test that supervisor graph compiles correctly."""
    mock_extraction = Mock()
    mock_extraction.execute.return_value = Mock(fields={}, tables={})

    supervisor = SupervisorAgent(mock_extraction)

    assert supervisor.graph is not None


def test_supervisor_executes_workflow(sample_state):
    """Test complete supervisor workflow execution."""
    mock_extraction = Mock()
    mock_extraction.execute.return_value = Mock(
        fields={"invoice_number": Mock(value="INV-001", confidence="high", raw_text="INV-001")},
        tables={}
    )

    supervisor = SupervisorAgent(mock_extraction)
    result = supervisor.execute(sample_state)

    assert result is not None
    assert "final_extraction" in result
```

**Acceptance Criteria:**
- LangGraph compiles and runs without errors
- State passes between all agents (validate → generate → act → finalize)
- Conditional edges work (skip generation on validation failure)
- Error handling at each stage
- Extensible design (easy to add new agents)
- Unit tests passing

---

## Sprint 1 Completion Checklist

**Task 6: OCR Pipeline**
- [ ] Mistral OCR engine implemented
- [ ] Tesseract OCR fallback implemented
- [ ] PDF, PNG, JPG, TIFF support verified
- [ ] OCR accuracy >90% on test documents
- [ ] Per-page extraction with page numbering
- [ ] Image preprocessing (contrast, brightness, denoise) applied
- [ ] Unit tests for OCRPipeline passing
- [ ] Error handling and logging in place

**Task 7: Extraction Agent**
- [ ] ExtractionAgent class accepts workflow config + OCR text
- [ ] Returns structured JSON with fields and tables
- [ ] Confidence scoring (high/medium/low) implemented
- [ ] Error handling with meaningful messages
- [ ] Mock LLM tests passing
- [ ] ExtractionService wraps agent correctly
- [ ] Batch extraction support verified

**Task 8: Document Upload UI**
- [ ] UploadPage.tsx renders correctly
- [ ] Drag-drop file upload functional
- [ ] Multi-file support working
- [ ] Progress bars display during upload
- [ ] Status indicators (pending/uploading/success/error) show correctly
- [ ] Workflow selector dropdown functional
- [ ] Batch process button triggers API call
- [ ] DocumentPreview modal opens/closes
- [ ] Responsive design on mobile/tablet
- [ ] Styling matches design spec (#EDF5FF background, #4589FF accents)

**Task 9: Document Processing API**
- [ ] POST `/upload` endpoint stores files in S3/MinIO
- [ ] POST `/process/{id}` triggers async Celery task
- [ ] POST `/process-batch` processes multiple documents
- [ ] GET `/status/{id}` returns processing status
- [ ] GET `/results/{id}` returns extraction results
- [ ] GET `/list` returns paginated document list
- [ ] File type validation (PDF, PNG, JPG, TIFF)
- [ ] Error responses with meaningful messages
- [ ] All schemas validate input correctly

**Task 10: Supervisor Agent**
- [ ] LangGraph StateGraph compiles successfully
- [ ] AgentState TypedDict defined correctly
- [ ] ValidationAgent executes and validates state
- [ ] GenerationAgent calls ExtractionAgent
- [ ] ActionAgent post-processes fields
- [ ] FinalizeAgent prepares output
- [ ] Conditional edges route correctly (validate → generate or finalize)
- [ ] Error handling at each node
- [ ] Supervisor integrates with Celery task
- [ ] Unit tests for graph execution passing
- [ ] Extensible design for adding new agents

**Integration Tests**
- [ ] End-to-end: Upload → OCR → Extract → Results
- [ ] Batch processing: Multiple documents processed concurrently
- [ ] Fallback: Mistral fails → Tesseract succeeds
- [ ] Error recovery: Failed extraction logged and reported
- [ ] API: Upload, process, check status, retrieve results workflow

**Documentation & Code Quality**
- [ ] All docstrings present and clear
- [ ] Type hints throughout backend code
- [ ] Error logging at key checkpoints
- [ ] README updated with API endpoint documentation
- [ ] Docker/docker-compose for local development verified
