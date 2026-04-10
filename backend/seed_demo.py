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

# Document IDs: invoices
DOC_INV = [uuid.UUID(f"20000000-0000-4000-a000-00000000000{i}") for i in range(1, 6)]
# Document IDs: receipts
DOC_REC = [uuid.UUID(f"30000000-0000-4000-a000-00000000000{i}") for i in range(1, 5)]
# Document IDs: contracts
DOC_CON = [uuid.UUID(f"40000000-0000-4000-a000-00000000000{i}") for i in range(1, 4)]


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
            await session.execute(text("DELETE FROM action_logs WHERE document_id::text LIKE '20000000%' OR document_id::text LIKE '30000000%' OR document_id::text LIKE '40000000%'"))
            await session.execute(text("DELETE FROM validation_results WHERE document_id::text LIKE '20000000%' OR document_id::text LIKE '30000000%' OR document_id::text LIKE '40000000%'"))
            await session.execute(text("DELETE FROM extractions WHERE document_id::text LIKE '20000000%' OR document_id::text LIKE '30000000%' OR document_id::text LIKE '40000000%'"))
            await session.execute(text("DELETE FROM documents WHERE id::text LIKE '20000000%' OR id::text LIKE '30000000%' OR id::text LIKE '40000000%'"))
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
        all_docs = INVOICE_DOCS + RECEIPT_DOCS + CONTRACT_DOCS
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
    print("  Workflows: 3 (Invoice, Receipt, Contract)")
    print("  Documents: 12 (varied statuses)")
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
    print("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")


if __name__ == "__main__":
    asyncio.run(seed())
