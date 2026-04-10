# DocProc — Demo Scenario Guide

## Quick Setup

```bash
# 1. Start infrastructure + services
./services.sh start all

# 2. Run database migrations
cd backend && .venv/bin/python -m alembic upgrade head

# 3. Seed demo data
cd backend && .venv/bin/python seed_demo.py

# Reset & re-seed (clears existing demo data first)
cd backend && .venv/bin/python seed_demo.py --reset

# 4. Open the app
open http://localhost:3000
```

---

## Demo Accounts

| Role | Name | Email | Password | Permissions |
|------|------|-------|----------|-------------|
| SME Admin | Sarah Chen | `admin@docproc.demo` | `demo1234` | Full access: workflows, upload, process, settings |
| Finance Manager | Lisa Wong | `finance@docproc.demo` | `demo1234` | Full access: focused on invoice/receipt workflows |
| Consumer | James Park | `viewer@docproc.demo` | `demo1234` | Read-only: chat, repository, export |

---

## Demo Files (demo-data/)

All files are pre-generated PDFs ready to upload during the demo.

### Invoices
| File | Vendor | Amount | Use For |
|------|--------|--------|---------|
| `acme_inv_2024_001.pdf` | ACME Corporation | $13,750.00 | Completed invoice — full pipeline |
| `globex_inv_9847.pdf` | Globex Industries | $48,816.00 | Completed invoice — multi-page |
| `stark_inv_7721.pdf` | Stark Enterprises | $8,800.00 | Validated — awaiting actions |
| `wayne_inv_5500.pdf` | Wayne Industries | $27,750.00 | Processing — in pipeline |
| `oscorp_inv_3300.pdf` | Oscorp Scientific | $12,760.00 | Failed — OCR error demo |

### Receipts
| File | Merchant | Amount | Use For |
|------|----------|--------|---------|
| `starbucks_receipt.pdf` | Starbucks Coffee | $17.28 | Completed receipt — expense logged |
| `uber_receipt.pdf` | Uber | $51.00 | Completed receipt — transportation |
| `hilton_receipt.pdf` | Hilton Hotels | $423.36 | Extracted — awaiting validation |
| `office_depot_receipt.pdf` | Office Depot | $130.25 | Uploaded — not processed yet |

### Contracts
| File | Title | Value | Use For |
|------|-------|-------|---------|
| `saas_agreement_cloudflare.pdf` | SaaS Agreement | $36,000/yr | Completed — multi-page contract |
| `nda_techpartner_2024.pdf` | NDA | N/A | Extracted — awaiting review |
| `maintenance_contract_2025.pdf` | IT Maintenance | $48,000/yr | Uploaded — not processed |

---

## Scenario 1: Invoice Processing End-to-End

**Login as:** Sarah Chen (`admin@docproc.demo` / `demo1234`)

### 1.1 — Dashboard Overview
1. Open `http://localhost:3000` and login
2. **Dashboard shows:**
   - 12 total documents across 3 workflows
   - 5 completed documents
   - 2 active workflows (Invoice Processing, Expense Receipts)
   - ~42% success rate
3. Recent documents table shows mix of statuses (completed, processing, failed)

### 1.2 — Review Invoice Workflow
1. Navigate to **Workflows** in the sidebar
2. Click **Invoice Processing** (green "active" tag)
3. Walk through the configuration:
   - **9 extraction fields:** vendor_name, invoice_number, invoice_date, due_date, subtotal, tax_amount, total_amount, payment_terms, po_number
   - **3 validation rules:** Total = Subtotal + Tax, amount range $1–$1M, date format check
   - **2 actions:** Webhook to ERP on completion, email to finance on validation failure

> **Talking point:** "This workflow was configured once by a business user — no code required. Every invoice that comes in is automatically routed through this pipeline."

### 1.3 — Review a Completed Invoice
1. Navigate to **Repository** or click the ACME invoice from dashboard
2. Document: `acme_inv_2024_001.pdf` (ID: `20000000-0000-4000-a000-000000000001`)
3. **Split view shows:**
   - Left: OCR-extracted text from the PDF
   - Right: Structured fields with confidence scores:

| Field | Value | Confidence |
|-------|-------|------------|
| Vendor Name | ACME Corporation | 97% |
| Invoice Number | INV-2024-001 | 99% |
| Invoice Date | 2024-11-15 | 95% |
| Subtotal | $12,500.00 | 96% |
| Tax Amount | $1,250.00 | 95% |
| Total Amount | $13,750.00 | 98% |
| PO Number | PO-2024-0892 | 93% |

4. Validation: all 3 rules passed (12500 + 1250 = 13750)
5. Action log: webhook sent to ERP → AP-2024-13750 created

> **Talking point:** "Zero human intervention — from PDF upload to ERP entry in seconds. The AI extracted 9 fields with 93–99% confidence, validated the math, and pushed it to accounts payable."

### 1.4 — Review the Second Completed Invoice
1. Click on **Globex Industries** invoice (ID: `20000000-0000-4000-a000-000000000002`)
2. 2-page invoice, $48,816.00 — 4 line items including scanners and installation
3. Validation passed, webhook created AP-2024-48816

### 1.5 — Show a Failed Document
1. Click on **Oscorp Scientific** invoice — red "failed" tag
2. Document ID: `20000000-0000-4000-a000-000000000005`
3. Error: "OCR failed: image too blurry, confidence below threshold"
4. Action log: notification email sent to finance@example.com

> **Talking point:** "When the AI can't confidently read a document, it stops and alerts a human rather than pushing bad data downstream."

### 1.6 — Upload a New Invoice (Live Demo)
1. Navigate to **Upload**
2. Drag-and-drop `wayne_inv_5500.pdf` from `demo-data/`
3. Select **Invoice Processing** workflow
4. Click **Upload** → status: "uploaded"
5. Click **Process** → status transitions to "processing"

> **Talking point:** "The agent pipeline kicks in — Mistral OCR reads the document, the extraction agent pulls structured fields, validation checks the math, and if everything passes, it pushes to our ERP."

---

## Scenario 2: Create a Workflow with Natural Language

**Login as:** Sarah Chen (`admin@docproc.demo` / `demo1234`)

### 2.1 — Open Workflow Builder
1. Navigate to **Workflows** → click **Create Workflow**
2. **Step 1 — Basic Info:**
   - Workflow Name: `Purchase Order Processing`
   - Description: `Extract PO details for procurement tracking`
   - Document Type: Select **Purchase Order** from dropdown

> Note: The **AI Model** dropdown in the top-right lets you select which LLM provider/model to use (e.g., Ollama / llama3.1:8b, Anthropic / Claude Sonnet 4). Changes apply immediately.

### 2.2 — Describe Fields in Plain English
3. **Step 2 — Describe Fields:**
   - Type: *"I need to extract the PO number, vendor name, order date, delivery date, each line item with description quantity and unit price, subtotal, shipping cost, and total amount"*
   - Click **Generate Schema**
   - AI generates 9+ field definitions with auto-detected types (text, date, currency)

> **Talking point:** "Business users describe what they need in everyday language. The AI generates a complete extraction schema — field names, data types, required flags — in seconds."

### 2.3 — Fine-Tune the Schema
4. **Step 3 — Configure Fields:**
   - DataTable shows all parsed fields
   - Edit `po_number` → mark as **Required**
   - Change `unit_price` type from text → **currency**
   - Add new field: `approval_status` (text)

> **Talking point:** "The AI gives you a 90% head start, but the SME stays in full control."

### 2.4 — Add Validation & Actions
5. **Step 4 — Validation Rules:**
   - AI pre-generates rules (e.g., `total_amount_calculated_correctly` — "Total amount must be calculated correctly from subtotal and shipping cost")
   - Review and edit existing rules — each has editable **Rule Name**, **Type** (Custom/Range/Regex/Cross-field), and **Description**
   - Click **+ Add Rule** → set name: `delivery_after_order`, type: **Cross-field**, description: `Delivery date must be after order date`
6. **Step 5 — Actions:**
   - Click **+ Add Action** → set name: `Notify Procurement`, type: **Webhook**, trigger: **On Complete**
   - Enter webhook URL: `https://api.procurement.example.com/webhook`
7. **Step 6 — Review & Save** → click **Create Workflow**

---

## Scenario 3: Expense Receipt Processing

**Login as:** Lisa Wong (`finance@docproc.demo` / `demo1234`)

### 3.1 — Review Expense Workflow
1. Navigate to **Workflows** → click **Expense Receipt Capture** (active)
2. **6 fields:** merchant_name, receipt_date, total_amount, tax_amount, payment_method, category
3. **Validation:** receipt limit under $5,000
4. **Action:** insert into expense_reports database on completion

### 3.2 — Review Completed Receipts
1. Open Starbucks receipt (ID: `30000000-0000-4000-a000-000000000001`)
   - Merchant: Starbucks Coffee (98%), Total: $17.28 (97%)
   - Category auto-classified: "Meals & Entertainment" (88%, by Claude)
   - Action: expense logged as EXP-2024-0017
2. Open Uber receipt (ID: `30000000-0000-4000-a000-000000000002`)
   - Total: $51.00, Category: "Transportation" (95%)
   - Expense logged as EXP-2024-0018

### 3.3 — Upload a New Receipt (Live Demo)
1. Drag-and-drop `office_depot_receipt.pdf` from `demo-data/`
2. Select **Expense Receipt Capture** workflow → Upload → Process

> **Talking point:** "Receipts are photos or PDFs of varying quality. The AI handles narrow receipt formats, different languages, and auto-categorizes expenses."

---

## Scenario 4: Chat with Documents

**Login as:** James Park (`viewer@docproc.demo` / `demo1234`)

### 4.1 — General Questions
1. Navigate to **Chat**
2. Select your preferred model from the **Model** dropdown (e.g., Ollama / llama3.1:8b)
3. Ask: *"What invoices do we have from ACME?"*
   - Response: ACME INV-2024-001, $13,750.00, November 15 2024, completed
   - Responses stream in with a typewriter effect and show a model badge (provider/model/latency) below each response.
4. Ask: *"What's the total value of all completed invoices?"*
   - AI calculates: $13,750 (ACME) + $48,816 (Globex) = **$62,566**
5. Ask: *"Which documents failed processing?"*
   - Response: Oscorp INV-3300, reason: OCR failure (blurry image)

> **Talking point:** "No query language, no complex filters. Business users just ask in plain English and get instant answers. The chat queries **real extracted data** from the database, not generic responses."

### 4.2 — Document-Specific Chat
6. Paste document ID `20000000-0000-4000-a000-000000000001` in the context field
7. Ask: *"What are the payment terms for this invoice?"*
   - Response: "Net 30" with source reference
8. Ask: *"Is this invoice overdue?"*
   - AI compares due date (Dec 15, 2024) to today
9. Ask: *"What was the PO number?"*
   - Response: "PO-2024-0892"

### 4.3 — Contract Questions
10. Clear document context
11. Ask: *"What contracts are expiring this year?"*
    - Response: Cloudflare SaaS agreement expires December 31, 2025
12. Ask: *"Does the Cloudflare contract auto-renew?"*
    - Response: Yes, 30-day notice required to cancel

### 4.4 — Receipt Questions (Lisa Wong)

**Login as:** Lisa Wong (`finance@docproc.demo` / `demo1234`)

1. Navigate to **Chat**
2. Ask: *"What's the total value of all completed receipts?"*
   - AI calculates from actual data: $130.25 + $423.36 + $17.28 = **$570.89**
3. Ask: *"Which receipt has the highest amount?"*
   - Response: Hilton Hotels receipt at $423.36
4. Ask: *"List all vendors from my processed receipts"*
5. Ask in Bahasa: *"Berapa total nilai semua receipt yang sudah selesai diproses?"*
   - AI responds in Bahasa with correct totals

> **Talking point:** "The chat queries actual extracted document data — not hallucinated answers. It also supports multilingual queries."

---

## Scenario 5: Data Repository & Export

**Login as:** Lisa Wong (`finance@docproc.demo` / `demo1234`)

### 5.1 — Browse & Filter
1. Navigate to **Repository**
2. Filter by status: **completed** → shows 5 documents
3. Search: "Globex" → narrows to Globex invoice ($48,816)
4. Filter by status: **failed** → shows Oscorp document

### 5.2 — Export Data
5. Select all completed invoices (ACME + Globex)
6. Click **Export CSV** → structured CSV with all extracted fields
7. Click **Export Excel** → formatted .xlsx spreadsheet
   - Note: Excel export requires `openpyxl` package (included in requirements.txt).
8. Click **Export JSON** → machine-readable format

> **Talking point:** "One click to get structured data into Excel, your ERP, or downstream systems via webhook."

### 5.3 — Contract Repository
9. Filter by workflow: Contract Review
10. Show Cloudflare SaaS ($36K/yr, auto-renewal) and TechPartner NDA
11. Export contract data for compliance reporting

---

## Scenario 6: Multi-Provider LLM & OCR Settings

**Login as:** Sarah Chen (`admin@docproc.demo` / `demo1234`)

### 6.1 — LLM Provider Configuration
1. Navigate to **Settings**
2. Show current provider: **Ollama** (llama3.1:8b)
3. Switch to **OpenAI** (GPT-4o) → Save
4. Switch to **Anthropic** (Claude Sonnet) → Save
5. Switch to **Mistral** → Save
6. Switch back to **Ollama**

> Note: The model can also be changed directly from the **Chat** and **Workflow Builder** pages via the AI Model dropdown.

> **Talking point:** "Zero vendor lock-in. Switch between 4 providers with one click. For sensitive documents — legal contracts, financial data — run everything on-premises with Ollama. No data leaves your infrastructure."

### 6.2 — OCR Provider Configuration
1. Scroll down to **OCR Settings** section
2. Show current OCR provider: **Tesseract (Local)** with green "installed" tag
3. Switch to **Mistral OCR (Cloud API)** → saves instantly
4. Switch back to **Tesseract**
5. Note: If Tesseract is not installed, a warning banner with install instructions appears

> **Talking point:** "OCR and LLM are independent — you can run Tesseract locally for text extraction while using Claude in the cloud for intelligent field extraction. Or use Mistral for both OCR and LLM if you prefer a single vendor."

---

## Seeded Data Reference

### Document IDs (for API/Chat demos)

| Document | ID | Status |
|----------|----|--------|
| ACME Invoice | `20000000-0000-4000-a000-000000000001` | completed |
| Globex Invoice | `20000000-0000-4000-a000-000000000002` | completed |
| Stark Invoice | `20000000-0000-4000-a000-000000000003` | validated |
| Wayne Invoice | `20000000-0000-4000-a000-000000000004` | processing |
| Oscorp Invoice | `20000000-0000-4000-a000-000000000005` | failed |
| Starbucks Receipt | `30000000-0000-4000-a000-000000000001` | completed |
| Uber Receipt | `30000000-0000-4000-a000-000000000002` | completed |
| Hilton Receipt | `30000000-0000-4000-a000-000000000003` | extracted |
| Office Depot Receipt | `30000000-0000-4000-a000-000000000004` | uploaded |
| Cloudflare Contract | `40000000-0000-4000-a000-000000000001` | completed |
| TechPartner NDA | `40000000-0000-4000-a000-000000000002` | extracted |
| Maintenance Contract | `40000000-0000-4000-a000-000000000003` | uploaded |

### Workflow IDs

| Workflow | ID | Status |
|----------|----|--------|
| Invoice Processing | `10000000-0000-4000-a000-000000000001` | active |
| Expense Receipt Capture | `10000000-0000-4000-a000-000000000002` | active |
| Contract Review | `10000000-0000-4000-a000-000000000003` | draft |

### Dashboard Metrics (Expected)

| Metric | Value |
|--------|-------|
| Total Documents | 12 |
| Completed | 5 |
| In Progress | 4 (validated: 1, processing: 1, extracted: 2) |
| Not Started | 2 (uploaded) |
| Failed | 1 |
| Active Workflows | 2 |
| Success Rate | ~42% |
| Total Invoice Value (completed) | $62,566 |
| Total Receipt Value (completed) | $68.28 |
| Total Contract Value (completed) | $36,000/yr |

---

## API Walkthrough (Technical Demo)

```bash
# --- Authentication ---

# Login as SME Admin
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@docproc.demo","password":"demo1234"}' | jq -r '.access_token')

# Login as Finance Manager
TOKEN_FIN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"finance@docproc.demo","password":"demo1234"}' | jq -r '.access_token')

# Login as Consumer
TOKEN_VIEW=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"viewer@docproc.demo","password":"demo1234"}' | jq -r '.access_token')

# Check current user
curl -s http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN" | jq

# --- Documents ---

# List all documents
curl -s http://localhost:8000/api/v1/documents/list \
  -H "Authorization: Bearer $TOKEN" | jq

# Get ACME invoice extraction results
curl -s http://localhost:8000/api/v1/documents/results/20000000-0000-4000-a000-000000000001 \
  -H "Authorization: Bearer $TOKEN" | jq

# Get Globex invoice status
curl -s http://localhost:8000/api/v1/documents/status/20000000-0000-4000-a000-000000000002 \
  -H "Authorization: Bearer $TOKEN" | jq

# Upload a new document
curl -s -X POST http://localhost:8000/api/v1/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@../demo-data/wayne_inv_5500.pdf" \
  -F "workflow_id=10000000-0000-4000-a000-000000000001" | jq

# --- Workflows ---

# List workflows
curl -s http://localhost:8000/api/v1/workflows/ \
  -H "Authorization: Bearer $TOKEN" | jq

# Get Invoice Processing workflow
curl -s http://localhost:8000/api/v1/workflows/10000000-0000-4000-a000-000000000001 \
  -H "Authorization: Bearer $TOKEN" | jq

# --- Chat ---

# Ask about invoices
curl -s -X POST http://localhost:8000/api/v1/chat/message \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"What invoices have been completed?"}' | jq

# Ask about a specific document
curl -s -X POST http://localhost:8000/api/v1/chat/message \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"What are the payment terms?","document_id":"20000000-0000-4000-a000-000000000001"}' | jq

# --- OCR Settings ---

# Get current OCR config
curl -s http://localhost:8000/api/v1/models/ocr \
  -H "Authorization: Bearer $TOKEN" | jq

# Switch to Mistral OCR
curl -s -X PUT http://localhost:8000/api/v1/models/ocr \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider":"mistral"}' | jq

# Switch back to Tesseract
curl -s -X PUT http://localhost:8000/api/v1/models/ocr \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider":"tesseract"}' | jq

# --- Export ---

# Export ACME + Globex invoices as CSV
curl -s -X POST http://localhost:8000/api/v1/export/download \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"document_ids":["20000000-0000-4000-a000-000000000001","20000000-0000-4000-a000-000000000002"],"format":"csv"}' \
  -o invoices.csv

# Export as Excel
curl -s -X POST http://localhost:8000/api/v1/export/download \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"document_ids":["20000000-0000-4000-a000-000000000001"],"format":"xlsx"}' \
  -o invoice_acme.xlsx
```

---

## Demo Timing Guide

| Scenario | Duration | Audience |
|----------|----------|----------|
| 1. Invoice E2E | 8–10 min | Business stakeholders, Finance |
| 2. Workflow Builder | 5–7 min | SMEs, Product managers |
| 3. Expense Receipts | 4–5 min | Finance, HR |
| 4. Chat | 5–6 min | All users |
| 5. Repository & Export | 3–4 min | Finance, Compliance |
| 6. LLM & OCR Settings | 3–4 min | IT, Security |
| **Full demo** | **~30 min** | |
| **Executive summary** | **~15 min** | Scenarios 1 + 4 + 6 only |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "No demo data" on dashboard | `cd backend && .venv/bin/python seed_demo.py` |
| "Demo data already exists" | `cd backend && .venv/bin/python seed_demo.py --reset` |
| Login fails (401) | Check postgres is running: `./services.sh status` |
| Token expired (401 on API) | Re-login to get a new token |
| Frontend blank page | Verify frontend running: `./services.sh status` |
| Backend not responding | Check logs: `./services.sh logs backend` |
| Demo PDFs missing | Regenerate: `cd demo-data && python generate_docs.py` |
| Wrong password | All demo accounts use: `demo1234` |
