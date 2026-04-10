# Sprint 0: Setup (Week 1)

This sprint establishes the foundational architecture for DocProc — a document processing platform combining React frontend, FastAPI backend, PostgreSQL database, and an agent-based extraction system. We'll scaffold the monorepo structure, set up the IBM Carbon Design System theme, configure the database with pgvector support, implement JWT authentication, and establish LLM provider abstraction for both on-premises and cloud-based models.

---

## Task 1: LON-118 — Project Scaffolding

Scaffold the monorepo structure for DocProc — React frontend + FastAPI backend + Agent module.

### 1. Project Root
- Create `docproc/` root directory
- Initialize git repo with `.gitignore` (Python, Node, .env, __pycache__, node_modules, .venv)
- Create root `docker-compose.yml` with services: frontend, backend, postgres, redis, minio

### 2. Frontend (`/frontend`)
```bash
npx create-react-app frontend --template typescript
cd frontend
npm install @carbon/react @carbon/icons-react @carbon/themes sass
npm install axios react-router-dom@6 zustand
npm install -D @types/react-router-dom
```

* Configure `src/index.scss` to import Carbon styles:
```scss
@use '@carbon/react' with (
  $font-family: 'IBM Plex Sans',
  $css--default-type: true
);
```
* Create folder structure: src/ with components/, pages/, services/, store/, theme/, types/
* Set up React Router with placeholder routes: `/`, `/workflows`, `/upload`, `/review`, `/chat`, `/settings`
* Create `src/services/api.ts` with axios instance pointing to `http://localhost:8000/api/v1`

### 3. Backend (`/backend`)
```bash
mkdir -p backend
cd backend
python -m venv .venv
pip install fastapi uvicorn[standard] sqlalchemy[asyncio] asyncpg alembic
pip install python-jose[cryptography] passlib[bcrypt] python-multipart
pip install celery[redis] boto3 httpx pydantic-settings
```
* Create folder structure: backend/app/ with __init__.py, main.py, config.py, models/, schemas/, api/v1/endpoints/, services/, db/
* `main.py`: Create FastAPI app with Title "DocProc API", CORS allowing localhost:3000, health check GET /health, include v1 router under /api/v1

### 4. Agents Module (`/agents`)
agents/ with __init__.py, supervisor.py, extraction.py, validation.py, generation.py, actions.py, base.py
* Create `BaseAgent` abstract class with methods: `async def execute(self, state: dict) -> dict`

### 5. Infrastructure (`/infra`)
* docker-compose.yml with services: frontend, backend, postgres (pgvector/pgvector:pg16), redis (redis:7-alpine), minio
* Dockerfiles for frontend and backend
* `.env.example` with all required environment variables

### 6. CI Config
* `.github/workflows/ci.yml` with frontend lint+build and backend lint+pytest

### Acceptance Criteria
- docker-compose up starts all services
- Frontend at localhost:3000 with Carbon default theme
- Backend health check at localhost:8000/health
- PostgreSQL with pgvector, Redis, MinIO running
- Git repo with proper .gitignore

---

## Task 2: LON-143 — Model Selection Abstraction

Implement model selection/provider abstraction layer for on-prem (Ollama) and cloud API providers (Anthropic, OpenAI, Mistral).

### 1. LLM Provider Interface
Create `backend/app/services/llm_provider.py` with:
- ProviderType enum (ANTHROPIC, OPENAI, OLLAMA, MISTRAL)
- LLMConfig dataclass (provider, model, api_key, base_url, temperature, max_tokens)
- LLMResponse dataclass (content, model, provider, input_tokens, output_tokens, latency_ms)
- BaseLLMProvider ABC with chat() and health_check()
- AnthropicProvider using anthropic.AsyncAnthropic
- OpenAIProvider using openai.AsyncOpenAI
- OllamaProvider using httpx.AsyncClient to localhost:11434
- MistralProvider using mistralai.Mistral

### 2. Provider Factory
LLMProviderFactory.create(config) returns appropriate provider

### 3. Settings Configuration
Update config.py with LLM_PROVIDER, LLM_MODEL, API keys, OLLAMA_BASE_URL, OCR_PROVIDER, TESSERACT_PATH

### 4. Model Selection API
backend/app/api/v1/endpoints/settings.py:
- GET /models/available — list models per provider (Ollama fetched live from /api/tags)
- GET /models/current — current active config
- PUT /models/current — switch provider (SME/Admin only)
- GET /models/health — health check all providers
- GET /models/ocr — current OCR config (provider + tesseract install status)
- PUT /models/ocr — switch OCR provider (tesseract | mistral)

### 5. Frontend Settings Page
frontend/src/pages/SettingsPage.tsx with:
- Radio group for LLM providers, model selector, Ollama config section, health check
- OCR Settings section: Tesseract (Local) vs Mistral OCR (Cloud) toggle with install status tags

### 6. Docker Compose — optional Ollama service with profile "onprem"

### 7. Update All Agents to use BaseLLMProvider interface

### Acceptance Criteria
- Provider abstraction supports all 4 providers
- Ollama integration with local models
- Cloud API providers with API keys
- Health check endpoint
- Settings UI with Carbon components
- All agents use BaseLLMProvider

---

## Task 3: LON-119 — IBM Carbon Theme Setup

Configure IBM Carbon Design System with custom DocProc theme — light soft-blue palette, IBM Plex Sans Light.

### 1. Install IBM Plex Sans Font in index.html

### 2. Create theme token overrides (docproc-theme.scss) with #4589FF primary, #FFFFFF/#EDF5FF background, #F4F4F4 surface

### 3. Create global.scss with gradient background, card styles, header gradient, sidebar, stat callouts

### 4. Create AppShell.tsx with Header, SideNav, Content using Carbon components

### 5. Verify theme renders correctly

### Acceptance Criteria
- Carbon tokens overridden with #4589FF
- IBM Plex Sans Light (300) renders
- Background gradient visible
- App shell with Header + SideNav + Content
- All components inherit custom theme

---

## Task 4: LON-120 — Database Schema

Database schema with PostgreSQL + pgvector + Alembic migrations.

### 1. Configure async database connection (session.py, config.py)

### 2. Create models: TimestampMixin, User (with roles), Workflow (with statuses), Document (with processing statuses), Extraction, ValidationResult, ActionLog

### 3. Set up Alembic with async engine

### 4. Enable pgvector extension, add embedding column to documents

### Acceptance Criteria
- 7 models with relationships
- Alembic migrations run
- pgvector enabled
- UUID primary keys, timestamps
- Indexes on key columns

---

## Task 5: LON-121 — JWT Authentication

JWT authentication with two roles (SME and Consumer).

### 1. Auth service (verify_password, create_access_token, decode_token)

### 2. Auth schemas (UserRegister, UserLogin, Token, UserResponse)

### 3. Auth dependencies (get_current_user, require_sme)

### 4. Auth endpoints (register, login, me)

### 5. Frontend LoginPage with Carbon components

### 6. Zustand auth store

### 7. ProtectedRoute wrapper

### Acceptance Criteria
- Register/login/me endpoints working
- JWT token auth
- Role-based access control
- Frontend login page with Carbon theme
- Token stored and attached to requests

---

## Sprint 0 Completion Checklist

### Project Scaffolding (LON-118)
- [ ] `docker-compose up` starts all services
- [ ] Frontend at localhost:3000 with Carbon default theme
- [ ] Backend health check at localhost:8000/health
- [ ] PostgreSQL with pgvector, Redis, MinIO running
- [ ] Git repo with proper .gitignore

### Model Selection Abstraction (LON-143)
- [x] Provider abstraction supports all 4 providers (Anthropic, OpenAI, Ollama, Mistral)
- [x] Ollama integration with local models (live model fetch from /api/tags)
- [x] Cloud API providers with API keys
- [x] Health check endpoint working
- [x] Settings UI with Carbon components (LLM + OCR sections)
- [x] OCR provider toggle (Tesseract/Mistral) with install status
- [ ] All agents use BaseLLMProvider

### IBM Carbon Theme Setup (LON-119)
- [ ] Carbon tokens overridden with #4589FF primary color
- [ ] IBM Plex Sans Light (300) font renders
- [ ] Background gradient visible
- [ ] App shell with Header + SideNav + Content
- [ ] All components inherit custom theme

### Database Schema (LON-120)
- [ ] 7 models created with proper relationships
- [ ] Alembic migrations run successfully
- [ ] pgvector extension enabled
- [ ] UUID primary keys and timestamps configured
- [ ] Indexes created on key columns

### JWT Authentication (LON-121)
- [ ] Register/login/me endpoints working
- [ ] JWT token authentication functional
- [ ] Role-based access control (SME and Consumer roles)
- [ ] Frontend login page with Carbon theme
- [ ] Token stored in client and attached to requests
