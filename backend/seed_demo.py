#!/usr/bin/env python3
"""
DocProc Demo Data Seeder

Seeds the database with realistic demo data for demonstrations.
Run: cd backend && .venv/bin/python seed_demo.py

Creates:
  - 2 users (SME admin + consumer viewer)
  - 3 workflows (invoice, receipt, contract)
  - 12 documents across workflows with varied statuses
  - Extractions for completed/validated documents
  - Validation results
  - Action logs
"""
from __future__ import annotations

import asyncio
import uuid
import sys
import os
from datetime import datetime, timedelta

# Add backend to path and load .env from project root
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(project_root, ".env"), override=True)

from sqlalchemy import select, text
from app.db.session import async_session
from app.models.user import User, UserRole
from app.models.workflow import Workflow, WorkflowStatus
from app.models.document import Document, DocumentStatus
from app.models.extraction import Extraction
from app.models.validation_result import ValidationResult
from app.models.action_log import ActionLog
from app.services.auth import hash_password

# =============================================================================
# Fixed UUIDs for reproducible demo
# =============================================================================
DEMO_SME_ID = uuid.UUID("00000000-0000-4000-a000-000000000001")
DEMO_CONSUMER_ID = uuid.UUID("00000000-0000-4000-a000-000000000002")
DEMO_FINANCE_ID = uuid.UUID("00000000-0000-4000-a000-000000000003")

WF_INVOICE_ID = uuid.UUID("10000000-0000-4000-a000-000000000001")
WF_RECEIPT_ID = uuid.UUID("10000000-0000-4000-a000-000000000002")
WF_CONTRACT_ID = uuid.UUID("10000000-0000-4000-a000-000000000003")
WF_CV_ID = uuid.UUID("10000000-0000-4000-a000-000000000004")

# Document IDs: invoices
DOC_INV = [uuid.UUID(f"20000000-0000-4000-a000-00000000000{i}") for i in range(1, 6)]
# Document IDs: receipts
DOC_REC = [uuid.UUID(f"30000000-0000-4000-a000-00000000000{i}") for i in range(1, 5)]
# Document IDs: contracts
DOC_CON = [uuid.UUID(f"40000000-0000-4000-a000-00000000000{i}") for i in range(1, 4)]
# Document IDs: CVs
DOC_CV = [uuid.UUID(f"50000000-0000-4000-a000-00000000000{i}") for i in range(1, 5)]


def days_ago(n: int) -> datetime:
    return datetime.utcnow() - timedelta(days=n)


# =============================================================================
# Users
# =============================================================================
USERS = [
    User(
        id=DEMO_SME_ID,
        email="admin@docproc.demo",
        full_name="Sarah Chen",
        hashed_password=hash_password("demo1234"),
        role=UserRole.SME,
        is_active=True,
    ),
    User(
        id=DEMO_CONSUMER_ID,
        email="viewer@docproc.demo",
        full_name="James Park",
        hashed_password=hash_password("demo1234"),
        role=UserRole.CONSUMER,
        is_active=True,
    ),
    User(
        id=DEMO_FINANCE_ID,
        email="finance@docproc.demo",
        full_name="Lisa Wong",
        hashed_password=hash_password("demo1234"),
        role=UserRole.SME,
        is_active=True,
    ),
]

# =============================================================================
# Workflows
# =============================================================================
WORKFLOWS = [
    Workflow(
        id=WF_INVOICE_ID,
        name="Invoice Processing",
        description="Extract vendor info, line items, totals, and payment terms from invoices. Validates amounts and triggers AP workflow.",
        status=WorkflowStatus.ACTIVE,
        document_type="invoice",
        extraction_schema={
            "fields": [
                {"name": "vendor_name", "label": "Vendor Name", "field_type": "text", "required": True},
                {"name": "invoice_number", "label": "Invoice Number", "field_type": "text", "required": True},
                {"name": "invoice_date", "label": "Invoice Date", "field_type": "date", "required": True},
                {"name": "due_date", "label": "Due Date", "field_type": "date", "required": True},
                {"name": "subtotal", "label": "Subtotal", "field_type": "currency", "required": True},
                {"name": "tax_amount", "label": "Tax Amount", "field_type": "currency", "required": True},
                {"name": "total_amount", "label": "Total Amount", "field_type": "currency", "required": True},
                {"name": "payment_terms", "label": "Payment Terms", "field_type": "text", "required": False},
                {"name": "po_number", "label": "PO Number", "field_type": "text", "required": False},
            ]
        },
        validation_rules={
            "rules": [
                {"name": "total_check", "rule_type": "cross_field", "description": "Total = Subtotal + Tax", "config": {"expression": "subtotal + tax_amount == total_amount"}},
                {"name": "amount_range", "rule_type": "range", "description": "Total between $1 and $1,000,000", "config": {"field": "total_amount", "min": 1, "max": 1000000}},
                {"name": "date_format", "rule_type": "date_format", "description": "Valid date format", "config": {"field": "invoice_date", "format": "%Y-%m-%d"}},
            ]
        },
        action_config={
            "actions": [
                {"name": "ap_webhook", "action_type": "webhook", "trigger": "on_complete", "config": {"url": "https://erp.example.com/api/ap/invoices", "method": "POST"}},
                {"name": "notify_finance", "action_type": "email", "trigger": "on_validation_fail", "config": {"to": "finance@example.com", "subject": "Invoice validation failed"}},
            ]
        },
        created_by=DEMO_SME_ID,
    ),
    Workflow(
        id=WF_RECEIPT_ID,
        name="Expense Receipt Capture",
        description="Capture merchant, date, amount, and category from expense receipts for employee reimbursement.",
        status=WorkflowStatus.ACTIVE,
        document_type="receipt",
        extraction_schema={
            "fields": [
                {"name": "merchant_name", "label": "Merchant", "field_type": "text", "required": True},
                {"name": "receipt_date", "label": "Date", "field_type": "date", "required": True},
                {"name": "total_amount", "label": "Total", "field_type": "currency", "required": True},
                {"name": "tax_amount", "label": "Tax", "field_type": "currency", "required": False},
                {"name": "payment_method", "label": "Payment Method", "field_type": "text", "required": False},
                {"name": "category", "label": "Category", "field_type": "text", "required": True},
            ]
        },
        validation_rules={
            "rules": [
                {"name": "receipt_limit", "rule_type": "range", "description": "Receipt under $5,000", "config": {"field": "total_amount", "min": 0.01, "max": 5000}},
            ]
        },
        action_config={
            "actions": [
                {"name": "expense_export", "action_type": "database", "trigger": "on_complete", "config": {"table": "expense_reports"}},
            ]
        },
        created_by=DEMO_FINANCE_ID,
    ),
    Workflow(
        id=WF_CONTRACT_ID,
        name="Contract Review",
        description="Extract key terms, dates, parties, and obligations from legal contracts for compliance review.",
        status=WorkflowStatus.DRAFT,
        document_type="contract",
        extraction_schema={
            "fields": [
                {"name": "contract_title", "label": "Contract Title", "field_type": "text", "required": True},
                {"name": "party_a", "label": "Party A", "field_type": "text", "required": True},
                {"name": "party_b", "label": "Party B", "field_type": "text", "required": True},
                {"name": "effective_date", "label": "Effective Date", "field_type": "date", "required": True},
                {"name": "expiry_date", "label": "Expiry Date", "field_type": "date", "required": True},
                {"name": "contract_value", "label": "Contract Value", "field_type": "currency", "required": False},
                {"name": "governing_law", "label": "Governing Law", "field_type": "text", "required": False},
                {"name": "auto_renewal", "label": "Auto Renewal", "field_type": "boolean", "required": False},
            ]
        },
        validation_rules=None,
        action_config=None,
        created_by=DEMO_SME_ID,
    ),
    Workflow(
        id=WF_CV_ID,
        name="CV Skill Mapping",
        description="Extract candidate profile, skills, education, and experience from CVs/resumes. Automatically maps extracted skills against role-specific competency requirements to produce a fit score and gap analysis.",
        status=WorkflowStatus.ACTIVE,
        document_type="resume",
        extraction_schema={
            "fields": [
                {"name": "candidate_name", "label": "Candidate Name", "field_type": "text", "required": True},
                {"name": "email", "label": "Email", "field_type": "text", "required": True},
                {"name": "phone", "label": "Phone", "field_type": "text", "required": False},
                {"name": "current_job_title", "label": "Current Job Title", "field_type": "text", "required": False},
                {"name": "current_company", "label": "Current Company", "field_type": "text", "required": False},
                {"name": "total_years_experience", "label": "Years of Experience", "field_type": "number", "required": True},
                {"name": "education_level", "label": "Education Level", "field_type": "text", "required": True},
                {"name": "education_institution", "label": "Institution", "field_type": "text", "required": False},
                {"name": "education_major", "label": "Major / Field of Study", "field_type": "text", "required": False},
                {"name": "technical_skills", "label": "Technical Skills", "field_type": "list", "required": True},
                {"name": "soft_skills", "label": "Soft Skills", "field_type": "list", "required": False},
                {"name": "certifications", "label": "Certifications", "field_type": "list", "required": False},
                {"name": "languages_spoken", "label": "Languages", "field_type": "list", "required": False},
                {"name": "target_role", "label": "Target Role", "field_type": "text", "required": False},
            ]
        },
        validation_rules={
            "rules": [
                {"name": "min_experience", "rule_type": "range", "description": "Minimum experience for target role", "config": {"field": "total_years_experience", "min": 1}},
                {"name": "required_skills_match", "rule_type": "custom", "description": "Match skills against role requirements", "config": {"match_type": "required", "threshold": 0.6}},
                {"name": "certification_check", "rule_type": "custom", "description": "Verify required certifications", "config": {"match_type": "certification"}},
            ]
        },
        action_config={
            "actions": [
                {"name": "shortlist_candidate", "action_type": "webhook", "trigger": "on_validation_pass", "config": {"url": "https://ats.example.com/api/shortlist", "method": "POST"}},
                {"name": "notify_hr", "action_type": "email", "trigger": "on_complete", "config": {"to": "hr@example.com", "subject": "CV processed — skill mapping complete"}},
            ]
        },
        created_by=DEMO_SME_ID,
    ),
]

# =============================================================================
# Documents — Invoices
# =============================================================================
INVOICE_DOCS = [
    {
        "id": DOC_INV[0], "filename": f"{DOC_INV[0]}_acme_inv_2024_001.pdf",
        "original_filename": "acme_inv_2024_001.pdf", "content_type": "application/pdf",
        "file_size": 245_760, "status": DocumentStatus.COMPLETED,
        "storage_path": f"uploads/{DOC_INV[0]}/acme_inv_2024_001.pdf",
        "ocr_text": "ACME Corporation\nInvoice #INV-2024-001\nDate: 2024-11-15\nDue: 2024-12-15\nCloud Services - November 2024\nSubtotal: $12,500.00\nTax (10%): $1,250.00\nTotal: $13,750.00\nPayment Terms: Net 30\nPO: PO-2024-0892",
        "page_count": 1, "created_at": days_ago(14),
        "extractions": [
            {"field_name": "vendor_name", "field_value": "ACME Corporation", "confidence": 0.97, "model_used": "mistral-ocr"},
            {"field_name": "invoice_number", "field_value": "INV-2024-001", "confidence": 0.99, "model_used": "mistral-ocr"},
            {"field_name": "invoice_date", "field_value": "2024-11-15", "field_type": "date", "confidence": 0.95, "model_used": "mistral-ocr"},
            {"field_name": "due_date", "field_value": "2024-12-15", "field_type": "date", "confidence": 0.94, "model_used": "mistral-ocr"},
            {"field_name": "subtotal", "field_value": "12500.00", "field_type": "currency", "confidence": 0.96, "model_used": "mistral-ocr"},
            {"field_name": "tax_amount", "field_value": "1250.00", "field_type": "currency", "confidence": 0.95, "model_used": "mistral-ocr"},
            {"field_name": "total_amount", "field_value": "13750.00", "field_type": "currency", "confidence": 0.98, "model_used": "mistral-ocr"},
            {"field_name": "payment_terms", "field_value": "Net 30", "confidence": 0.92, "model_used": "mistral-ocr"},
            {"field_name": "po_number", "field_value": "PO-2024-0892", "confidence": 0.93, "model_used": "mistral-ocr"},
        ],
    },
    {
        "id": DOC_INV[1], "filename": f"{DOC_INV[1]}_globex_inv_9847.pdf",
        "original_filename": "globex_inv_9847.pdf", "content_type": "application/pdf",
        "file_size": 189_440, "status": DocumentStatus.COMPLETED,
        "storage_path": f"uploads/{DOC_INV[1]}/globex_inv_9847.pdf",
        "ocr_text": "Globex Industries\nInvoice #GLX-9847\nDate: 2024-11-20\nDue: 2025-01-19\nManufacturing Parts - Q4 Batch\nSubtotal: $45,200.00\nTax (8%): $3,616.00\nTotal: $48,816.00\nPayment Terms: Net 60",
        "page_count": 2, "created_at": days_ago(10),
        "extractions": [
            {"field_name": "vendor_name", "field_value": "Globex Industries", "confidence": 0.96, "model_used": "mistral-ocr"},
            {"field_name": "invoice_number", "field_value": "GLX-9847", "confidence": 0.98, "model_used": "mistral-ocr"},
            {"field_name": "invoice_date", "field_value": "2024-11-20", "field_type": "date", "confidence": 0.94, "model_used": "mistral-ocr"},
            {"field_name": "due_date", "field_value": "2025-01-19", "field_type": "date", "confidence": 0.93, "model_used": "mistral-ocr"},
            {"field_name": "subtotal", "field_value": "45200.00", "field_type": "currency", "confidence": 0.95, "model_used": "mistral-ocr"},
            {"field_name": "tax_amount", "field_value": "3616.00", "field_type": "currency", "confidence": 0.97, "model_used": "mistral-ocr"},
            {"field_name": "total_amount", "field_value": "48816.00", "field_type": "currency", "confidence": 0.97, "model_used": "mistral-ocr"},
            {"field_name": "payment_terms", "field_value": "Net 60", "confidence": 0.91, "model_used": "mistral-ocr"},
        ],
    },
    {
        "id": DOC_INV[2], "filename": f"{DOC_INV[2]}_stark_inv_7721.pdf",
        "original_filename": "stark_inv_7721.pdf", "content_type": "application/pdf",
        "file_size": 312_000, "status": DocumentStatus.VALIDATED,
        "storage_path": f"uploads/{DOC_INV[2]}/stark_inv_7721.pdf",
        "ocr_text": "Stark Enterprises\nInvoice #STK-7721\nDate: 2024-12-01\nDue: 2024-12-31\nConsulting Services\nSubtotal: $8,000.00\nTax (10%): $800.00\nTotal: $8,800.00",
        "page_count": 1, "created_at": days_ago(7),
        "extractions": [
            {"field_name": "vendor_name", "field_value": "Stark Enterprises", "confidence": 0.95, "model_used": "mistral-ocr"},
            {"field_name": "invoice_number", "field_value": "STK-7721", "confidence": 0.97, "model_used": "mistral-ocr"},
            {"field_name": "invoice_date", "field_value": "2024-12-01", "field_type": "date", "confidence": 0.96, "model_used": "mistral-ocr"},
            {"field_name": "due_date", "field_value": "2024-12-31", "field_type": "date", "confidence": 0.94, "model_used": "mistral-ocr"},
            {"field_name": "subtotal", "field_value": "8000.00", "field_type": "currency", "confidence": 0.93, "model_used": "mistral-ocr"},
            {"field_name": "tax_amount", "field_value": "800.00", "field_type": "currency", "confidence": 0.94, "model_used": "mistral-ocr"},
            {"field_name": "total_amount", "field_value": "8800.00", "field_type": "currency", "confidence": 0.96, "model_used": "mistral-ocr"},
        ],
    },
    {
        "id": DOC_INV[3], "filename": f"{DOC_INV[3]}_wayne_inv_5500.pdf",
        "original_filename": "wayne_inv_5500.pdf", "content_type": "application/pdf",
        "file_size": 156_000, "status": DocumentStatus.PROCESSING,
        "storage_path": f"uploads/{DOC_INV[3]}/wayne_inv_5500.pdf",
        "page_count": 1, "created_at": days_ago(2),
        "extractions": [],
    },
    {
        "id": DOC_INV[4], "filename": f"{DOC_INV[4]}_oscorp_inv_3300.pdf",
        "original_filename": "oscorp_inv_3300.pdf", "content_type": "application/pdf",
        "file_size": 98_000, "status": DocumentStatus.FAILED,
        "storage_path": f"uploads/{DOC_INV[4]}/oscorp_inv_3300.pdf",
        "page_count": 0, "created_at": days_ago(5),
        "metadata_json": {"error": "OCR failed: image too blurry, confidence below threshold"},
        "extractions": [],
    },
]

# =============================================================================
# Documents — Receipts
# =============================================================================
RECEIPT_DOCS = [
    {
        "id": DOC_REC[0], "filename": f"{DOC_REC[0]}_starbucks_receipt.jpg",
        "original_filename": "starbucks_receipt.jpg", "content_type": "image/jpeg",
        "file_size": 524_288, "status": DocumentStatus.COMPLETED,
        "storage_path": f"uploads/{DOC_REC[0]}/starbucks_receipt.jpg",
        "ocr_text": "Starbucks Coffee\n123 Main St\nDate: 2024-12-10\nGrande Latte x2: $11.90\nMuffin: $3.95\nTax: $1.43\nTotal: $17.28\nVisa ****4521",
        "page_count": 1, "created_at": days_ago(6),
        "extractions": [
            {"field_name": "merchant_name", "field_value": "Starbucks Coffee", "confidence": 0.98, "model_used": "mistral-ocr"},
            {"field_name": "receipt_date", "field_value": "2024-12-10", "field_type": "date", "confidence": 0.95, "model_used": "mistral-ocr"},
            {"field_name": "total_amount", "field_value": "17.28", "field_type": "currency", "confidence": 0.97, "model_used": "mistral-ocr"},
            {"field_name": "tax_amount", "field_value": "1.43", "field_type": "currency", "confidence": 0.94, "model_used": "mistral-ocr"},
            {"field_name": "payment_method", "field_value": "Visa ****4521", "confidence": 0.92, "model_used": "mistral-ocr"},
            {"field_name": "category", "field_value": "Meals & Entertainment", "confidence": 0.88, "model_used": "claude-sonnet"},
        ],
    },
    {
        "id": DOC_REC[1], "filename": f"{DOC_REC[1]}_uber_receipt.pdf",
        "original_filename": "uber_receipt.pdf", "content_type": "application/pdf",
        "file_size": 67_000, "status": DocumentStatus.COMPLETED,
        "storage_path": f"uploads/{DOC_REC[1]}/uber_receipt.pdf",
        "ocr_text": "Uber Technologies\nTrip: Dec 11, 2024\nPickup: Office HQ\nDropoff: Airport Terminal 2\nFare: $42.50\nTip: $8.50\nTotal: $51.00",
        "page_count": 1, "created_at": days_ago(5),
        "extractions": [
            {"field_name": "merchant_name", "field_value": "Uber Technologies", "confidence": 0.99, "model_used": "mistral-ocr"},
            {"field_name": "receipt_date", "field_value": "2024-12-11", "field_type": "date", "confidence": 0.93, "model_used": "mistral-ocr"},
            {"field_name": "total_amount", "field_value": "51.00", "field_type": "currency", "confidence": 0.96, "model_used": "mistral-ocr"},
            {"field_name": "category", "field_value": "Transportation", "confidence": 0.95, "model_used": "claude-sonnet"},
        ],
    },
    {
        "id": DOC_REC[2], "filename": f"{DOC_REC[2]}_hilton_receipt.pdf",
        "original_filename": "hilton_receipt.pdf", "content_type": "application/pdf",
        "file_size": 198_000, "status": DocumentStatus.EXTRACTED,
        "storage_path": f"uploads/{DOC_REC[2]}/hilton_receipt.pdf",
        "ocr_text": "Hilton Hotels\nGuest: James Park\nCheck-in: Dec 11\nCheck-out: Dec 13\nRoom: $189/night x 2 = $378.00\nTax: $45.36\nTotal: $423.36",
        "page_count": 1, "created_at": days_ago(4),
        "extractions": [
            {"field_name": "merchant_name", "field_value": "Hilton Hotels", "confidence": 0.97, "model_used": "mistral-ocr"},
            {"field_name": "receipt_date", "field_value": "2024-12-13", "field_type": "date", "confidence": 0.90, "model_used": "mistral-ocr"},
            {"field_name": "total_amount", "field_value": "423.36", "field_type": "currency", "confidence": 0.94, "model_used": "mistral-ocr"},
            {"field_name": "tax_amount", "field_value": "45.36", "field_type": "currency", "confidence": 0.93, "model_used": "mistral-ocr"},
            {"field_name": "category", "field_value": "Lodging", "confidence": 0.96, "model_used": "claude-sonnet"},
        ],
    },
    {
        "id": DOC_REC[3], "filename": f"{DOC_REC[3]}_office_depot_receipt.png",
        "original_filename": "office_depot_receipt.png", "content_type": "image/png",
        "file_size": 1_200_000, "status": DocumentStatus.UPLOADED,
        "storage_path": f"uploads/{DOC_REC[3]}/office_depot_receipt.png",
        "page_count": 1, "created_at": days_ago(1),
        "extractions": [],
    },
]

# =============================================================================
# Documents — Contracts
# =============================================================================
CONTRACT_DOCS = [
    {
        "id": DOC_CON[0], "filename": f"{DOC_CON[0]}_saas_agreement.pdf",
        "original_filename": "saas_agreement_cloudflare.pdf", "content_type": "application/pdf",
        "file_size": 890_000, "status": DocumentStatus.COMPLETED,
        "storage_path": f"uploads/{DOC_CON[0]}/saas_agreement_cloudflare.pdf",
        "ocr_text": "SaaS Service Agreement\nBetween: DocProc Inc. (Client) and Cloudflare Inc. (Provider)\nEffective: January 1, 2025\nExpires: December 31, 2025\nAnnual Value: $36,000\nGoverning Law: State of California\nAuto-Renewal: Yes, 30-day notice to cancel",
        "page_count": 12, "created_at": days_ago(20),
        "extractions": [
            {"field_name": "contract_title", "field_value": "SaaS Service Agreement", "confidence": 0.96, "model_used": "claude-sonnet"},
            {"field_name": "party_a", "field_value": "DocProc Inc.", "confidence": 0.94, "model_used": "claude-sonnet"},
            {"field_name": "party_b", "field_value": "Cloudflare Inc.", "confidence": 0.95, "model_used": "claude-sonnet"},
            {"field_name": "effective_date", "field_value": "2025-01-01", "field_type": "date", "confidence": 0.97, "model_used": "claude-sonnet"},
            {"field_name": "expiry_date", "field_value": "2025-12-31", "field_type": "date", "confidence": 0.96, "model_used": "claude-sonnet"},
            {"field_name": "contract_value", "field_value": "36000.00", "field_type": "currency", "confidence": 0.93, "model_used": "claude-sonnet"},
            {"field_name": "governing_law", "field_value": "State of California", "confidence": 0.91, "model_used": "claude-sonnet"},
            {"field_name": "auto_renewal", "field_value": "true", "field_type": "boolean", "confidence": 0.89, "model_used": "claude-sonnet"},
        ],
    },
    {
        "id": DOC_CON[1], "filename": f"{DOC_CON[1]}_nda_partner.pdf",
        "original_filename": "nda_techpartner_2024.pdf", "content_type": "application/pdf",
        "file_size": 245_000, "status": DocumentStatus.EXTRACTED,
        "storage_path": f"uploads/{DOC_CON[1]}/nda_techpartner_2024.pdf",
        "ocr_text": "Non-Disclosure Agreement\nBetween: DocProc Inc. and TechPartner Ltd.\nEffective: November 1, 2024\nExpires: October 31, 2026\nGoverning Law: Singapore",
        "page_count": 4, "created_at": days_ago(12),
        "extractions": [
            {"field_name": "contract_title", "field_value": "Non-Disclosure Agreement", "confidence": 0.98, "model_used": "claude-sonnet"},
            {"field_name": "party_a", "field_value": "DocProc Inc.", "confidence": 0.95, "model_used": "claude-sonnet"},
            {"field_name": "party_b", "field_value": "TechPartner Ltd.", "confidence": 0.94, "model_used": "claude-sonnet"},
            {"field_name": "effective_date", "field_value": "2024-11-01", "field_type": "date", "confidence": 0.96, "model_used": "claude-sonnet"},
            {"field_name": "expiry_date", "field_value": "2026-10-31", "field_type": "date", "confidence": 0.95, "model_used": "claude-sonnet"},
            {"field_name": "governing_law", "field_value": "Singapore", "confidence": 0.92, "model_used": "claude-sonnet"},
        ],
    },
    {
        "id": DOC_CON[2], "filename": f"{DOC_CON[2]}_maintenance_contract.pdf",
        "original_filename": "maintenance_contract_2025.pdf", "content_type": "application/pdf",
        "file_size": 456_000, "status": DocumentStatus.UPLOADED,
        "storage_path": f"uploads/{DOC_CON[2]}/maintenance_contract_2025.pdf",
        "page_count": 8, "created_at": days_ago(1),
        "extractions": [],
    },
]

# =============================================================================
# Documents — CVs / Resumes
# =============================================================================
CV_DOCS = [
    {
        "id": DOC_CV[0], "filename": f"{DOC_CV[0]}_cv_rina_pratiwi.pdf",
        "original_filename": "CV_Rina_Pratiwi_Software_Engineer.pdf", "content_type": "application/pdf",
        "file_size": 345_000, "status": DocumentStatus.COMPLETED,
        "storage_path": f"uploads/{DOC_CV[0]}/CV_Rina_Pratiwi_Software_Engineer.pdf",
        "ocr_text": """RINA PRATIWI
Software Engineer

Email: rina.pratiwi@email.com | Phone: +62 812-3456-7890
Location: Jakarta, Indonesia | LinkedIn: linkedin.com/in/rinapratiwi

PROFESSIONAL SUMMARY
Experienced software engineer with 5 years of expertise in full-stack development, specializing in Python, React, and cloud-native applications. Passionate about building scalable microservices and implementing CI/CD pipelines. Proven track record of delivering high-quality products in agile teams within fintech and banking sectors.

WORK EXPERIENCE

Senior Software Engineer | PT Bank Digital Indonesia (BDI)
January 2022 — Present (3 years)
- Led development of core banking API serving 2M+ daily transactions using Python/FastAPI
- Designed and implemented microservices architecture on AWS ECS with Docker/Kubernetes
- Reduced API response time by 40% through Redis caching and database query optimization
- Mentored 4 junior developers, conducted code reviews and technical design sessions
- Implemented CI/CD pipeline using GitHub Actions, reducing deployment time from 2 hours to 15 minutes

Software Engineer | Tokopedia (GoTo Group)
July 2019 — December 2021 (2.5 years)
- Developed e-commerce checkout and payment integration modules using Go and React
- Built real-time notification service handling 500K+ events/day using Kafka and WebSocket
- Contributed to migration from monolith to microservices, improving system reliability to 99.95%
- Participated in on-call rotation, resolved production incidents within SLA targets

Junior Developer | PT Startup Teknologi
March 2018 — June 2019 (1.3 years)
- Developed REST APIs using Django and PostgreSQL for SaaS platform
- Built admin dashboard with React and Material UI
- Wrote unit and integration tests achieving 85% code coverage

EDUCATION
S1 (Bachelor) Computer Science — Universitas Indonesia, 2017
GPA: 3.72 / 4.00

TECHNICAL SKILLS
Programming: Python, JavaScript, TypeScript, Go, SQL
Frameworks: FastAPI, React, Django, Express.js, Next.js
Cloud & DevOps: AWS (EC2, ECS, S3, Lambda, RDS), Docker, Kubernetes, Terraform, GitHub Actions
Databases: PostgreSQL, Redis, MongoDB, Elasticsearch
Tools: Git, JIRA, Confluent Kafka, Datadog, Grafana, Prometheus

SOFT SKILLS
Team Leadership, Agile/Scrum, Technical Communication, Problem Solving, Mentoring

CERTIFICATIONS
- AWS Certified Solutions Architect — Associate (2023)
- Google Cloud Professional Cloud Developer (2022)
- Certified Kubernetes Application Developer — CKAD (2023)

LANGUAGES
- Indonesian (Native)
- English (Professional — IELTS 7.5)
- Japanese (Elementary — JLPT N4)""",
        "page_count": 2, "created_at": days_ago(3),
        "extractions": [
            {"field_name": "candidate_name", "field_value": "Rina Pratiwi", "confidence": 0.99, "model_used": "claude-sonnet"},
            {"field_name": "email", "field_value": "rina.pratiwi@email.com", "confidence": 0.99, "model_used": "claude-sonnet"},
            {"field_name": "phone", "field_value": "+62 812-3456-7890", "confidence": 0.98, "model_used": "claude-sonnet"},
            {"field_name": "current_job_title", "field_value": "Senior Software Engineer", "confidence": 0.97, "model_used": "claude-sonnet"},
            {"field_name": "current_company", "field_value": "PT Bank Digital Indonesia (BDI)", "confidence": 0.97, "model_used": "claude-sonnet"},
            {"field_name": "total_years_experience", "field_value": "5", "field_type": "number", "confidence": 0.95, "model_used": "claude-sonnet"},
            {"field_name": "education_level", "field_value": "S1/Bachelor", "confidence": 0.98, "model_used": "claude-sonnet"},
            {"field_name": "education_institution", "field_value": "Universitas Indonesia", "confidence": 0.97, "model_used": "claude-sonnet"},
            {"field_name": "education_major", "field_value": "Computer Science", "confidence": 0.97, "model_used": "claude-sonnet"},
            {"field_name": "technical_skills", "field_value": "Python, JavaScript, TypeScript, Go, SQL, FastAPI, React, Django, Docker, Kubernetes, AWS, Terraform, PostgreSQL, Redis, Kafka", "confidence": 0.96, "model_used": "claude-sonnet"},
            {"field_name": "certifications", "field_value": "AWS Solutions Architect Associate, Google Cloud Professional, CKAD", "confidence": 0.97, "model_used": "claude-sonnet"},
            {"field_name": "target_role", "field_value": "Software Engineer", "confidence": 0.90, "model_used": "claude-sonnet"},
        ],
    },
    {
        "id": DOC_CV[1], "filename": f"{DOC_CV[1]}_cv_budi_santoso.pdf",
        "original_filename": "CV_Budi_Santoso_Risk_Analyst.pdf", "content_type": "application/pdf",
        "file_size": 290_000, "status": DocumentStatus.COMPLETED,
        "storage_path": f"uploads/{DOC_CV[1]}/CV_Budi_Santoso_Risk_Analyst.pdf",
        "ocr_text": """BUDI SANTOSO
Risk Analyst

Email: budi.santoso@email.com | Phone: +62 821-9876-5432
Location: Jakarta, Indonesia

PROFESSIONAL SUMMARY
Risk management professional with 4 years of experience in credit risk analysis, financial modeling, and regulatory compliance in the banking sector. Strong background in Basel III/IV frameworks, stress testing, and IFRS 9 implementation. Certified BSMR Level 2 with working knowledge of OJK regulations.

WORK EXPERIENCE

Risk Analyst | PT Bank Mandiri (Persero) Tbk
March 2021 — Present (3 years)
- Conduct credit risk assessment for corporate portfolio valued at IDR 45 trillion
- Developed IFRS 9 Expected Credit Loss (ECL) model using Python and SAS
- Performed quarterly stress testing for credit, market, and liquidity risk scenarios
- Prepared regulatory reports for OJK including risk profile and capital adequacy
- Collaborated with IT team to automate risk dashboard using Power BI and SQL

Credit Analyst | PT Bank CIMB Niaga Tbk
August 2019 — February 2021 (1.5 years)
- Analyzed creditworthiness of SME borrowers using financial ratio analysis
- Maintained credit scoring models and performed periodic model validation
- Processed 200+ credit proposals per quarter with 95% accuracy rate
- Supported internal audit reviews for credit risk processes

EDUCATION
S2 (Master) Finance — Universitas Gadjah Mada, 2019
S1 (Bachelor) Economics — Universitas Airlangga, 2017
GPA: 3.65 / 4.00

TECHNICAL SKILLS
Risk Management: Credit Risk, Market Risk, Operational Risk, Liquidity Risk
Frameworks: Basel III/IV, IFRS 9, POJK Risk Management, Stress Testing
Analytics: Python, R, SAS, SQL, Excel Advanced (VBA), Power BI
Tools: Bloomberg Terminal, Moody's Analytics, SAS Enterprise Miner

SOFT SKILLS
Analytical Thinking, Attention to Detail, Regulatory Communication, Report Writing

CERTIFICATIONS
- BSMR Level 2 — Badan Sertifikasi Manajemen Risiko (2022)
- Financial Risk Manager (FRM) Part I — GARP (2023)
- OJK Fit & Proper — Otoritas Jasa Keuangan (2021)

LANGUAGES
- Indonesian (Native)
- English (Professional — TOEFL iBT 95)""",
        "page_count": 2, "created_at": days_ago(5),
        "extractions": [
            {"field_name": "candidate_name", "field_value": "Budi Santoso", "confidence": 0.99, "model_used": "claude-sonnet"},
            {"field_name": "email", "field_value": "budi.santoso@email.com", "confidence": 0.99, "model_used": "claude-sonnet"},
            {"field_name": "phone", "field_value": "+62 821-9876-5432", "confidence": 0.98, "model_used": "claude-sonnet"},
            {"field_name": "current_job_title", "field_value": "Risk Analyst", "confidence": 0.97, "model_used": "claude-sonnet"},
            {"field_name": "current_company", "field_value": "PT Bank Mandiri (Persero) Tbk", "confidence": 0.97, "model_used": "claude-sonnet"},
            {"field_name": "total_years_experience", "field_value": "4", "field_type": "number", "confidence": 0.95, "model_used": "claude-sonnet"},
            {"field_name": "education_level", "field_value": "S2/Master", "confidence": 0.98, "model_used": "claude-sonnet"},
            {"field_name": "education_institution", "field_value": "Universitas Gadjah Mada", "confidence": 0.97, "model_used": "claude-sonnet"},
            {"field_name": "education_major", "field_value": "Finance", "confidence": 0.97, "model_used": "claude-sonnet"},
            {"field_name": "technical_skills", "field_value": "Credit Risk, Market Risk, Financial Modeling, Basel III/IV, IFRS 9, Stress Testing, Python, R, SAS, SQL, VBA, Power BI", "confidence": 0.96, "model_used": "claude-sonnet"},
            {"field_name": "certifications", "field_value": "BSMR Level 2, FRM Part I, OJK Fit & Proper", "confidence": 0.98, "model_used": "claude-sonnet"},
            {"field_name": "target_role", "field_value": "Risk Analyst (Banking)", "confidence": 0.92, "model_used": "claude-sonnet"},
        ],
    },
    {
        "id": DOC_CV[2], "filename": f"{DOC_CV[2]}_cv_maya_kusuma.pdf",
        "original_filename": "CV_Maya_Kusuma_Data_Scientist.pdf", "content_type": "application/pdf",
        "file_size": 310_000, "status": DocumentStatus.EXTRACTED,
        "storage_path": f"uploads/{DOC_CV[2]}/CV_Maya_Kusuma_Data_Scientist.pdf",
        "ocr_text": """MAYA KUSUMA
Data Scientist

Email: maya.kusuma@email.com | Phone: +62 813-5555-1234
Location: Bandung, Indonesia | GitHub: github.com/mayakusuma

PROFESSIONAL SUMMARY
Data scientist with 3 years of experience in machine learning, NLP, and predictive analytics. Skilled in building production ML pipelines and deploying models at scale. Experience in banking and e-commerce domains with focus on fraud detection and customer analytics.

WORK EXPERIENCE

Data Scientist | OVO (Grab Financial Group)
June 2022 — Present (2 years)
- Built fraud detection ML model (XGBoost + neural network ensemble) achieving 96% precision at 0.1% FPR
- Developed NLP-based customer complaint classification system processing 50K+ tickets/month
- Implemented MLOps pipeline using MLflow, Airflow, and Kubernetes for model deployment
- Created customer segmentation model driving 15% increase in targeted marketing ROI

Junior Data Scientist | PT Telkom Indonesia
January 2021 — May 2022 (1.5 years)
- Developed churn prediction model using Random Forest and LightGBM
- Built automated reporting dashboard using Streamlit and Python
- Conducted A/B testing analysis for product feature experiments

EDUCATION
S1 (Bachelor) Statistics — Institut Teknologi Bandung (ITB), 2020
GPA: 3.80 / 4.00

TECHNICAL SKILLS
ML/AI: Scikit-learn, TensorFlow, PyTorch, XGBoost, NLP (Hugging Face), Computer Vision
Programming: Python, R, SQL, Julia
Data: Pandas, NumPy, Apache Spark, Airflow, dbt, BigQuery, PostgreSQL
MLOps: MLflow, Kubeflow, Docker, Kubernetes, Feature Store
Visualization: Matplotlib, Seaborn, Plotly, Streamlit, Tableau

CERTIFICATIONS
- Google Professional Machine Learning Engineer (2023)
- TensorFlow Developer Certificate (2022)
- AWS Machine Learning Specialty (2023)

LANGUAGES
- Indonesian (Native)
- English (Fluent)""",
        "page_count": 1, "created_at": days_ago(2),
        "extractions": [
            {"field_name": "candidate_name", "field_value": "Maya Kusuma", "confidence": 0.99, "model_used": "claude-sonnet"},
            {"field_name": "email", "field_value": "maya.kusuma@email.com", "confidence": 0.99, "model_used": "claude-sonnet"},
            {"field_name": "current_job_title", "field_value": "Data Scientist", "confidence": 0.97, "model_used": "claude-sonnet"},
            {"field_name": "current_company", "field_value": "OVO (Grab Financial Group)", "confidence": 0.96, "model_used": "claude-sonnet"},
            {"field_name": "total_years_experience", "field_value": "3", "field_type": "number", "confidence": 0.95, "model_used": "claude-sonnet"},
            {"field_name": "education_level", "field_value": "S1/Bachelor", "confidence": 0.98, "model_used": "claude-sonnet"},
            {"field_name": "education_institution", "field_value": "Institut Teknologi Bandung (ITB)", "confidence": 0.97, "model_used": "claude-sonnet"},
            {"field_name": "education_major", "field_value": "Statistics", "confidence": 0.97, "model_used": "claude-sonnet"},
            {"field_name": "technical_skills", "field_value": "Machine Learning, NLP, Deep Learning, Python, R, SQL, TensorFlow, PyTorch, Spark, Airflow, Docker, Kubernetes, MLflow", "confidence": 0.96, "model_used": "claude-sonnet"},
            {"field_name": "certifications", "field_value": "Google ML Engineer, TensorFlow Developer, AWS ML Specialty", "confidence": 0.97, "model_used": "claude-sonnet"},
            {"field_name": "target_role", "field_value": "Data Scientist", "confidence": 0.91, "model_used": "claude-sonnet"},
        ],
    },
    {
        "id": DOC_CV[3], "filename": f"{DOC_CV[3]}_cv_ahmad_fresh_grad.pdf",
        "original_filename": "CV_Ahmad_Fauzan_Fresh_Graduate.pdf", "content_type": "application/pdf",
        "file_size": 180_000, "status": DocumentStatus.UPLOADED,
        "storage_path": f"uploads/{DOC_CV[3]}/CV_Ahmad_Fauzan_Fresh_Graduate.pdf",
        "ocr_text": """AHMAD FAUZAN
Fresh Graduate — Aspiring Software Developer

Email: ahmad.fauzan@email.com | Phone: +62 857-1122-3344
Location: Yogyakarta, Indonesia | GitHub: github.com/ahmadfauzan

EDUCATION
S1 (Bachelor) Informatics Engineering — Universitas Gadjah Mada, 2024
GPA: 3.55 / 4.00

Thesis: "Development of REST API-based Student Information System using Node.js and MongoDB"

INTERNSHIP EXPERIENCE

Software Engineering Intern | Bukalapak
June 2023 — December 2023 (6 months)
- Developed backend API endpoints using Go and PostgreSQL
- Contributed to CI/CD pipeline improvements
- Participated in code reviews and daily standup meetings

PROJECTS
- E-commerce Web App (React, Node.js, MongoDB) — Final year capstone project
- Weather Prediction ML Model (Python, Scikit-learn) — Data Science course project
- Mobile Banking UI Prototype (Flutter, Dart) — Hackathon winner at UGM Tech Fest 2023

TECHNICAL SKILLS
Programming: JavaScript, Python, Go, Dart, SQL
Frameworks: React, Node.js, Express.js, Flutter
Tools: Git, Docker, VS Code, Postman, Linux
Databases: PostgreSQL, MongoDB, MySQL

SOFT SKILLS
Quick Learner, Team Player, Communication

CERTIFICATIONS
- Meta Back-End Developer Professional Certificate (Coursera, 2023)
- Google IT Automation with Python (Coursera, 2023)

LANGUAGES
- Indonesian (Native)
- English (Intermediate)""",
        "page_count": 1, "created_at": days_ago(1),
        "extractions": [],
    },
]

# =============================================================================
# Validation Results
# =============================================================================
VALIDATION_RESULTS = [
    # Invoice 1 — all pass
    {"document_id": DOC_INV[0], "rule_name": "total_check", "rule_description": "Total = Subtotal + Tax", "passed": True, "message": "12500.00 + 1250.00 = 13750.00 ✓"},
    {"document_id": DOC_INV[0], "rule_name": "amount_range", "rule_description": "Total between $1 and $1,000,000", "passed": True, "message": "$13,750.00 is within range"},
    {"document_id": DOC_INV[0], "rule_name": "date_format", "rule_description": "Valid date format", "passed": True, "message": "2024-11-15 is valid"},
    # Invoice 2 — all pass
    {"document_id": DOC_INV[1], "rule_name": "total_check", "rule_description": "Total = Subtotal + Tax", "passed": True, "message": "45200.00 + 3616.00 = 48816.00 ✓"},
    {"document_id": DOC_INV[1], "rule_name": "amount_range", "rule_description": "Total between $1 and $1,000,000", "passed": True, "message": "$48,816.00 is within range"},
    # Invoice 3 — validated
    {"document_id": DOC_INV[2], "rule_name": "total_check", "rule_description": "Total = Subtotal + Tax", "passed": True, "message": "8000.00 + 800.00 = 8800.00 ✓"},
    {"document_id": DOC_INV[2], "rule_name": "amount_range", "rule_description": "Total between $1 and $1,000,000", "passed": True, "message": "$8,800.00 is within range"},
    # Receipt 1 — pass
    {"document_id": DOC_REC[0], "rule_name": "receipt_limit", "rule_description": "Receipt under $5,000", "passed": True, "message": "$17.28 is within limit"},
    # Receipt 2 — pass
    {"document_id": DOC_REC[1], "rule_name": "receipt_limit", "rule_description": "Receipt under $5,000", "passed": True, "message": "$51.00 is within limit"},
]

# =============================================================================
# Action Logs
# =============================================================================
ACTION_LOGS = [
    {"document_id": DOC_INV[0], "action_type": "webhook", "status": "completed",
     "action_config": {"url": "https://erp.example.com/api/ap/invoices", "method": "POST"},
     "result": {"status_code": 200, "response": {"ap_id": "AP-2024-13750"}}},
    {"document_id": DOC_INV[1], "action_type": "webhook", "status": "completed",
     "action_config": {"url": "https://erp.example.com/api/ap/invoices", "method": "POST"},
     "result": {"status_code": 200, "response": {"ap_id": "AP-2024-48816"}}},
    {"document_id": DOC_REC[0], "action_type": "database", "status": "completed",
     "action_config": {"table": "expense_reports"},
     "result": {"rows_inserted": 1, "expense_id": "EXP-2024-0017"}},
    {"document_id": DOC_REC[1], "action_type": "database", "status": "completed",
     "action_config": {"table": "expense_reports"},
     "result": {"rows_inserted": 1, "expense_id": "EXP-2024-0018"}},
    {"document_id": DOC_INV[4], "action_type": "email", "status": "completed",
     "action_config": {"to": "finance@example.com", "subject": "Document processing failed"},
     "result": {"message_id": "msg-fail-notify-001"}},
]


# =============================================================================
# Seed Function
# =============================================================================
async def seed():
    print("\n  DocProc Demo Data Seeder")
    print("  =======================\n")

    async with async_session() as session:
        # Check if already seeded
        result = await session.execute(select(User).where(User.id == DEMO_SME_ID))
        if result.scalar_one_or_none():
            print("  ⚠  Demo data already exists. To re-seed, run with --reset\n")
            if "--reset" not in sys.argv:
                return
            print("  Clearing existing demo data...")
            await session.execute(text("DELETE FROM action_logs WHERE document_id::text LIKE '20000000%' OR document_id::text LIKE '30000000%' OR document_id::text LIKE '40000000%' OR document_id::text LIKE '50000000%'"))
            await session.execute(text("DELETE FROM validation_results WHERE document_id::text LIKE '20000000%' OR document_id::text LIKE '30000000%' OR document_id::text LIKE '40000000%' OR document_id::text LIKE '50000000%'"))
            await session.execute(text("DELETE FROM extractions WHERE document_id::text LIKE '20000000%' OR document_id::text LIKE '30000000%' OR document_id::text LIKE '40000000%' OR document_id::text LIKE '50000000%'"))
            await session.execute(text("DELETE FROM documents WHERE id::text LIKE '20000000%' OR id::text LIKE '30000000%' OR id::text LIKE '40000000%' OR id::text LIKE '50000000%'"))
            await session.execute(text("DELETE FROM workflows WHERE id::text LIKE '10000000%'"))
            await session.execute(text("DELETE FROM users WHERE id::text LIKE '00000000%'"))
            await session.commit()
            print("  Cleared.\n")

        # 1. Users
        for user in USERS:
            session.add(user)
        await session.flush()
        print(f"  ✓ Created {len(USERS)} users")

        # 2. Workflows
        for wf in WORKFLOWS:
            session.add(wf)
        await session.flush()
        print(f"  ✓ Created {len(WORKFLOWS)} workflows")

        # 3. Documents + Extractions
        all_docs = INVOICE_DOCS + RECEIPT_DOCS + CONTRACT_DOCS + CV_DOCS
        ext_count = 0
        for doc_data in all_docs:
            extractions = doc_data.pop("extractions")
            metadata_json = doc_data.pop("metadata_json", None)
            ocr_text = doc_data.pop("ocr_text", None)
            created_at = doc_data.pop("created_at", None)

            # Determine workflow
            if doc_data["id"] in DOC_INV:
                wf_id = WF_INVOICE_ID
            elif doc_data["id"] in DOC_REC:
                wf_id = WF_RECEIPT_ID
            elif doc_data["id"] in DOC_CV:
                wf_id = WF_CV_ID
            else:
                wf_id = WF_CONTRACT_ID

            # Assign receipt docs to Lisa Wong (finance user)
            uploader = DEMO_FINANCE_ID if wf_id == WF_RECEIPT_ID else DEMO_SME_ID

            doc = Document(
                workflow_id=wf_id,
                uploaded_by=uploader,
                ocr_text=ocr_text,
                metadata_json=metadata_json,
                **doc_data,
            )
            if created_at:
                doc.created_at = created_at
                doc.updated_at = created_at
            session.add(doc)
            await session.flush()

            for ext_data in extractions:
                ext = Extraction(
                    document_id=doc.id,
                    field_name=ext_data["field_name"],
                    field_value=ext_data["field_value"],
                    field_type=ext_data.get("field_type", "string"),
                    confidence=ext_data.get("confidence"),
                    model_used=ext_data.get("model_used"),
                )
                session.add(ext)
                ext_count += 1

        await session.flush()
        print(f"  ✓ Created {len(all_docs)} documents with {ext_count} extractions")

        # 4. Validation Results
        for vr_data in VALIDATION_RESULTS:
            vr = ValidationResult(**vr_data)
            session.add(vr)
        await session.flush()
        print(f"  ✓ Created {len(VALIDATION_RESULTS)} validation results")

        # 5. Action Logs
        for al_data in ACTION_LOGS:
            al = ActionLog(**al_data)
            session.add(al)
        await session.flush()
        print(f"  ✓ Created {len(ACTION_LOGS)} action logs")

        await session.commit()

    print("\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  Demo data seeded successfully!")
    print("")
    print("  Login credentials:")
    print("    SME Admin:     admin@docproc.demo   / demo1234")
    print("    Consumer:      viewer@docproc.demo  / demo1234")
    print("    Finance Mgr:   finance@docproc.demo / demo1234")
    print("")
    print("  Workflows: 4 (Invoice, Receipt, Contract, CV Skill Mapping)")
    print("  Documents: 16 (varied statuses)")
    print("")
    print("  Demo files: ../demo-data/")
    print("    Invoices:  acme_inv_2024_001.pdf, globex_inv_9847.pdf,")
    print("               stark_inv_7721.pdf, wayne_inv_5500.pdf,")
    print("               oscorp_inv_3300.pdf")
    print("    Receipts:  starbucks_receipt.pdf, uber_receipt.pdf,")
    print("               hilton_receipt.pdf, office_depot_receipt.pdf")
    print("    Contracts: saas_agreement_cloudflare.pdf,")
    print("               nda_techpartner_2024.pdf,")
    print("               maintenance_contract_2025.pdf")
    print("    CVs:       CV_Rina_Pratiwi_Software_Engineer.pdf,")
    print("               CV_Budi_Santoso_Risk_Analyst.pdf,")
    print("               CV_Maya_Kusuma_Data_Scientist.pdf,")
    print("               CV_Ahmad_Fauzan_Fresh_Graduate.pdf")
    print("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")


if __name__ == "__main__":
    asyncio.run(seed())
