# DocProc PoC — Claude Code Master Instructions

## Project Overview
DocProc is an **Agentic AI-powered document processing platform** that empowers business users to define extraction, validation, and action workflows using natural language. This is a **Proof of Concept** with minimal resource deployment.

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + IBM Carbon Design System |
| Backend | Python 3.11 + FastAPI + SQLAlchemy (async) |
| AI Orchestration | LangGraph + custom agent framework |
| LLM Providers | Anthropic Claude / OpenAI / Ollama (on-prem) / Mistral (configurable) |
| OCR | Mistral OCR (primary) + Tesseract (fallback) |
| Database | PostgreSQL 16 + pgvector |
| Object Storage | MinIO (S3-compatible) |
| Queue | Redis + Celery |
| Deployment | Docker Compose (single-node PoC) |

## UI/UX Design System
- **Design System**: IBM Carbon Design System (`@carbon/react`)
- **Primary Color**: `#4589FF` (IBM Blue 50 — Light Soft Blue)
- **Background**: White `#FFFFFF` → Light Blue gradient `#EDF5FF`
- **Surface**: `#F4F4F4` (Gray 10) for cards/panels
- **Typography**: IBM Plex Sans Light (300) for body, Regular (400/450) for emphasis
- **Font Fallback**: Calibri Light, system-ui, sans-serif
- **Icons**: `@carbon/icons-react`
- **Spacing**: 8px grid (Carbon spacing tokens)
- **Border Radius**: 4px cards, 8px modals

## Project Structure
```
docproc/
├── frontend/                 # React + Carbon UI
│   ├── src/
│   │   ├── components/       # Shared UI components
│   │   ├── pages/            # Route-level pages
│   │   ├── services/         # API client (axios)
│   │   ├── store/            # Zustand state stores
│   │   ├── theme/            # Carbon theme tokens
│   │   └── types/            # TypeScript interfaces
│   └── Dockerfile
├── backend/                  # FastAPI application
│   ├── app/
│   │   ├── api/v1/endpoints/ # REST endpoints
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── services/         # Business logic
│   │   ├── tasks/            # Celery async tasks
│   │   └── db/               # Database session
│   ├── alembic/              # Migrations
│   └── Dockerfile
├── agents/                   # Agent orchestration
│   ├── base.py               # BaseAgent + AgentState
│   ├── supervisor.py         # LangGraph supervisor
│   ├── extraction.py         # Field extraction agent
│   ├── validation.py         # Business rule validation
│   ├── generation.py         # Code-model calculations
│   ├── actions.py            # MCP post-processing
│   ├── judge.py              # LLM-as-Judge quality
│   └── chat.py               # NL query agent
├── templates/                # Pre-built workflow templates
│   └── hr/                   # HR workflow JSON templates
│       ├── hr-onboarding-kyc.json
│       ├── hr-license-tracking.json
│       ├── hr-employment-contracts.json
│       ├── hr-background-verification.json
│       ├── hr-payroll-tax.json
│       ├── hr-leave-benefits.json
│       ├── hr-performance-appraisal.json
│       ├── hr-training-certification.json
│       ├── hr-compensation-bonus.json
│       ├── hr-disciplinary-exit.json
│       ├── prompts/          # Agent prompt templates per workflow
│       └── data/             # Reference data (role-cert matrix, tax brackets)
├── infra/
│   └── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

## LLM Provider Configuration
The platform supports **4 LLM providers** via a unified abstraction layer:

| Provider | Type | Default Model | Config |
|----------|------|--------------|--------|
| Anthropic | Cloud API | claude-sonnet-4-20250514 | `ANTHROPIC_API_KEY` |
| OpenAI | Cloud API | gpt-4o | `OPENAI_API_KEY` |
| Ollama | On-Premise | llama3.1:8b | `OLLAMA_BASE_URL` |
| Mistral | Cloud API | mistral-large-latest | `MISTRAL_API_KEY` |

Set `LLM_PROVIDER` in `.env` to switch. All agents use `BaseLLMProvider` interface.

> **Note:** The active model can be switched at runtime from the **Chat** and **Workflow Builder** pages without restarting the server.

## Sprint Execution Order
Execute sprints sequentially. Each sprint builds on the previous.

### Sprint 0: Setup (Week 1) — LON-118, LON-119, LON-120, LON-121, LON-143
1. **LON-118**: Project scaffolding (monorepo, Docker Compose, CI)
2. **LON-143**: Model selection abstraction (Ollama + Cloud API providers)
3. **LON-119**: IBM Carbon theme setup (soft-blue, IBM Plex Sans Light)
4. **LON-120**: Database schema (PostgreSQL + pgvector, Alembic)
5. **LON-121**: JWT authentication (login, register, role-based access)

### Sprint 1: Core Extraction (Weeks 2-3) — LON-122 to LON-126
6. **LON-122**: OCR pipeline (Mistral OCR + Tesseract fallback)
7. **LON-123**: Extraction Agent (LLM-based field extraction)
8. **LON-124**: Document upload UI (Carbon drag-and-drop)
9. **LON-125**: Document processing API (upload, store, trigger)
10. **LON-126**: Supervisor Agent (LangGraph orchestration)

### Sprint 2: Workflow Builder (Weeks 4-5) — LON-127 to LON-131
11. **LON-127**: Workflow Builder UI (6-step guided wizard)
12. **LON-128**: Workflow API (CRUD endpoints)
13. **LON-129**: NL-to-Schema parser (natural language → extraction config)
14. **LON-130**: Field tuning UI (editable DataTable)
15. **LON-131**: Sample processing review (split-view + corrections)

### Sprint 3: Validation & Actions (Weeks 6-7) — LON-132 to LON-136
16. **LON-132**: Validation Agent (business rule engine)
17. **LON-133**: Generation Agent (code-model calculations)
18. **LON-134**: Action Agent (MCP integration)
19. **LON-135**: LLM-as-Judge (quality reflection)
20. **LON-136**: Confidence scoring (multi-factor)

### Sprint 4: Polish & Integration (Week 8) — LON-137 to LON-142
21. **LON-137**: Chat interface (document + database queries)
22. **LON-138**: Data repository view (filtered DataTable)
23. **LON-139**: Dashboard (metrics, workflows, activity)
24. **LON-140**: Document classification (auto-routing)
25. **LON-141**: E2E testing (full pipeline integration)
26. **LON-142**: Data export (CSV, Excel, webhook)

### Sprint 5: HR Core Workflows (Weeks 9-10) — LON-147 to LON-151
27. **LON-147**: HR Workflow Template Engine (registry, API, gallery UI, customization modal)
28. **LON-148**: Employee Onboarding KYC Workflow Template (KTP, NPWP, SKCK extraction + Indonesian validators)
29. **LON-149**: Regulatory License Tracking Workflow Template (BSMR, OJK certifications + role-certification matrix)
30. **LON-150**: Employment Contract Processing Workflow Template (PKWT/PKWTT, UU Cipta Kerja compliance)
31. **LON-151**: Background Verification Workflow Template (SLIK credit check, sanctions screening, risk scoring)

### Sprint 6: HR Operations Workflows (Weeks 11-12) — LON-152 to LON-157
32. **LON-152**: Payroll & Tax Processing Workflow Template (PPh 21 calculator, BPJS validator, payroll reconciliation)
33. **LON-153**: Leave & Benefits Claims Workflow Template (leave balance tracker, UU 13/2003 entitlements)
34. **LON-154**: Performance Appraisal Workflow Template (KPI extraction, rating distribution analytics)
35. **LON-155**: Training & Certification Workflow Template (AML/fraud training tracker, CPD hours)
36. **LON-156**: Compensation & Bonus Calculation Workflow Template (compa-ratio, salary bands, THR)
37. **LON-157**: Disciplinary & Exit Processing Workflow Template (severance calculator, exit clearance)

## Key Design Patterns
- **Agent Pattern**: Supervisor → sub-agents via LangGraph state graph
- **Provider Abstraction**: `BaseLLMProvider` interface for all LLM calls
- **Async Processing**: Celery + Redis for document pipeline
- **Event-Driven**: Status transitions (UPLOADED → PROCESSING → EXTRACTED → VALIDATED → COMPLETED)
- **Human-in-the-Loop**: Corrections feed back into prompt tuning

## Getting Started
```bash
# Clone and setup
git clone <repo> && cd docproc

# Configure LLM provider (edit .env)
# LLM_PROVIDER=ollama
# LLM_MODEL=llama3.1:8b

# Start infrastructure
docker compose up -d postgres redis minio

# Optional: Start Ollama for on-prem LLM
docker compose --profile onprem up -d ollama

# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# Frontend
cd frontend && npm install && npm start
```

## Linear Project
All tasks tracked at: https://linear.app/lontarchain/project/docproc-266aad5d2f77
Issues: LON-118 through LON-157 (37 tasks total)
