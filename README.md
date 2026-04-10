# DocProc — Agentic AI Document Processing Platform

DocProc is an AI-powered document processing platform that empowers business users to define extraction, validation, and compliance workflows using natural language.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + IBM Carbon Design System |
| Backend | Python 3.11 + FastAPI + SQLAlchemy (async) |
| AI Orchestration | LangGraph + custom agent framework |
| LLM Providers | Anthropic Claude / OpenAI / Ollama / Mistral |
| OCR | Mistral OCR + Tesseract (fallback) |
| Database | PostgreSQL 16 + pgvector |
| Object Storage | MinIO (S3-compatible) |
| Queue | Redis + Celery |
| Deployment | Docker Compose |

## Prerequisites

- **Docker** and **Docker Compose** (for PostgreSQL, Redis, MinIO)
- **Python 3.11+**
- **Node.js 18+** and **npm**
- **Git**
- An LLM API key (at least one):
  - Anthropic API key (recommended) — get one at https://console.anthropic.com
  - OpenAI API key
  - Mistral API key
  - Or use Ollama for free local LLM (requires more RAM)

## Quick Start (Localhost)

### 1. Clone the repository

```bash
git clone https://github.com/kuntumseroja/docproc.git
cd docproc
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set your LLM provider and API key:

```env
# Choose your provider: anthropic | openai | ollama | mistral
LLM_PROVIDER=anthropic

# Set the API key for your chosen provider
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

Other settings (database, Redis, MinIO) use sensible defaults for localhost and generally don't need changes.

### 3. Start infrastructure (PostgreSQL, Redis, MinIO)

```bash
docker compose up -d postgres redis minio
```

Wait for services to be healthy:

```bash
docker compose ps
```

All three services should show `healthy` or `running`.

### 4. Set up the backend

```bash
cd backend

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate    # macOS/Linux
# .venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Seed demo data (optional — creates demo user admin@docproc.ai / admin123)
python seed_demo.py

# Start the backend server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The backend API will be available at **http://localhost:8000**.

API docs: http://localhost:8000/docs

### 5. Set up the frontend

Open a new terminal:

```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm start
```

The frontend will be available at **http://localhost:3000**.

### 6. Login

Open http://localhost:3000 in your browser.

If you ran the demo seeder (`python seed_demo.py`), login with:
- **Email:** `admin@docproc.ai`
- **Password:** `admin123`

## Alternative: One-Command Start

If you have all prerequisites installed, use the included start script:

```bash
# Start everything (infra + backend + frontend)
./start.sh

# With demo data seeding
./start.sh --seed

# With Ollama for local LLM
./start.sh --seed --ollama

# Infrastructure only (for manual backend/frontend start)
./start.sh --infra-only
```

To stop all services:

```bash
./stop.sh
```

Check service status:

```bash
./status.sh
```

## Using Ollama (Free Local LLM)

If you don't have a cloud API key, you can use Ollama for on-premise LLM:

```bash
# Start with Ollama profile
docker compose --profile onprem up -d

# Pull a model
docker exec -it docproc-poc-ollama-1 ollama pull llama3.1:8b
```

Update `.env`:

```env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.1:8b
OLLAMA_BASE_URL=http://localhost:11434
```

Note: Ollama requires 8+ GB RAM for the llama3.1:8b model.

## Full Docker Compose (All-in-One)

To run everything in Docker (no local Python/Node needed):

```bash
docker compose up -d
```

This starts all 5 services: frontend (3000), backend (8000), PostgreSQL (5433), Redis (6380), MinIO (9000/9001).

## Production Deployment

Production-ready configs are in the `deploy/` directory:

```bash
# On a VPS (Ubuntu 22.04+)
bash deploy/vps-install.sh

# Or manually
docker compose -f deploy/docker-compose.prod.yml up -d
```

See `deploy/` for Dockerfiles, Nginx config, and deployment scripts.

## Project Structure

```
docproc/
├── frontend/          # React + IBM Carbon UI
├── backend/           # FastAPI application
│   ├── app/
│   │   ├── api/       # REST endpoints
│   │   ├── models/    # SQLAlchemy models
│   │   ├── schemas/   # Pydantic schemas
│   │   ├── services/  # Business logic + LLM providers
│   │   ├── data/      # Regulation JSON datasets
│   │   └── db/        # Database session
│   └── alembic/       # Database migrations
├── agents/            # LangGraph agent orchestration
├── templates/         # HR workflow templates
├── demo-data/         # Sample documents for testing
├── deploy/            # Production deployment configs
├── docker-compose.yml # Development stack
├── start.sh           # Start all services
├── stop.sh            # Stop all services
└── services.sh        # Service-level control
```

## Key Features

- **Document Upload & OCR** — Upload PDF, TXT, DOC, DOCX, images; automatic text extraction
- **Compliance Checker** — Check documents against 12+ regulations (POJK, PBI, NIST, ISO, GDPR, ESG/ISSB/SASB)
- **AI Chat** — Ask questions about compliance findings and regulations
- **Workflow Builder** — Create custom extraction workflows using natural language
- **Multi-LLM Support** — Switch between Anthropic, OpenAI, Ollama, or Mistral at runtime
- **Data Repository** — Browse and export extracted data (CSV, Excel)
- **HR Templates** — 10 pre-built Indonesian banking HR workflow templates

## Ports Reference

| Service | Port | URL |
|---------|------|-----|
| Frontend | 3000 | http://localhost:3000 |
| Backend API | 8000 | http://localhost:8000 |
| API Docs | 8000 | http://localhost:8000/docs |
| PostgreSQL | 5433 | `postgresql://docproc:docproc@localhost:5433/docproc` |
| Redis | 6380 | `redis://localhost:6380/0` |
| MinIO API | 9000 | http://localhost:9000 |
| MinIO Console | 9001 | http://localhost:9001 (minioadmin/minioadmin) |
| Ollama | 11434 | http://localhost:11434 (optional) |

## Troubleshooting

**Backend won't start — database connection error:**
```bash
# Make sure PostgreSQL is running and healthy
docker compose ps postgres
# Re-run migrations
cd backend && alembic upgrade head
```

**Frontend shows "Session expired" warning:**
This is normal if the backend is not running or you're not logged in. The compliance checker falls back to demo mode automatically.

**PDF upload shows 0% score:**
Make sure you've done a hard refresh (Cmd+Shift+R) after updates. The frontend uses pdfjs-dist for client-side PDF text extraction.

**Ollama model not responding:**
```bash
# Check if Ollama is running
docker compose --profile onprem ps
# Pull model if not downloaded
docker exec -it docproc-poc-ollama-1 ollama pull llama3.1:8b
```

## License

Proof of Concept — Internal Use
