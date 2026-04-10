#!/usr/bin/env bash
# ============================================================
#  DocProc — Start All Services
#  Usage: ./start.sh [--seed] [--ollama] [--skip-migrate] [--restore]
#
#  Options:
#    --seed           Run demo data seeder after backend starts
#    --ollama         Also start Ollama container (on-prem LLM)
#    --skip-migrate   Skip Alembic database migrations
#    --infra-only     Start only Docker infrastructure
#    --no-frontend    Start infra + backend only
#    --restore        Restore from latest backup before starting
#    --restore-from   Restore from specific backup timestamp
# ============================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PID_FILE="$ROOT_DIR/.backend.pid"
FRONTEND_PID_FILE="$ROOT_DIR/.frontend.pid"
CELERY_PID_FILE="$ROOT_DIR/.celery.pid"
BACKEND_LOG="$ROOT_DIR/.backend.log"
FRONTEND_LOG="$ROOT_DIR/.frontend.log"
CELERY_LOG="$ROOT_DIR/.celery.log"

# Colors
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' B='\033[0;34m' C='\033[0;36m' NC='\033[0m'
BOLD='\033[1m'

log()  { echo -e "${B}[docproc]${NC} $*"; }
ok()   { echo -e "${G}  ✓${NC} $*"; }
warn() { echo -e "${Y}  ⚠${NC} $*"; }
fail() { echo -e "${R}  ✗${NC} $*"; }
info() { echo -e "${C}  ℹ${NC} $*"; }

# Parse flags
SEED=false
OLLAMA=false
SKIP_MIGRATE=false
INFRA_ONLY=false
NO_FRONTEND=false
RESTORE=false
RESTORE_TS=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --seed)          SEED=true; shift ;;
        --ollama)        OLLAMA=true; shift ;;
        --skip-migrate)  SKIP_MIGRATE=true; shift ;;
        --infra-only)    INFRA_ONLY=true; shift ;;
        --no-frontend)   NO_FRONTEND=true; shift ;;
        --restore)       RESTORE=true; shift ;;
        --restore-from)  RESTORE=true; RESTORE_TS="$2"; shift 2 ;;
        --help|-h)
            echo ""
            echo -e "${BOLD}  DocProc — Start All Services${NC}"
            echo ""
            echo "  Usage: ./start.sh [options]"
            echo ""
            echo "  Options:"
            echo "    --seed                     Seed demo data (3 users + sample docs)"
            echo "    --ollama                   Start Ollama container for on-prem LLM"
            echo "    --skip-migrate             Skip database migrations"
            echo "    --infra-only               Start only Docker infrastructure"
            echo "    --no-frontend              Start infra + backend (no React)"
            echo "    --restore                  Restore from latest backup first"
            echo "    --restore-from <timestamp> Restore from specific backup"
            echo "    --help, -h                 Show this help"
            echo ""
            echo "  Examples:"
            echo "    ./start.sh                              # Start all"
            echo "    ./start.sh --seed --ollama               # Start all + seed + Ollama"
            echo "    ./start.sh --restore                     # Restore latest backup, then start"
            echo "    ./start.sh --restore-from 20260318_143000  # Restore specific backup"
            echo ""
            exit 0
            ;;
        *) shift ;;
    esac
done

# ── Banner ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${B}  ┌──────────────────────────────────────┐${NC}"
echo -e "${BOLD}${B}  │     DocProc — Starting Services      │${NC}"
echo -e "${BOLD}${B}  └──────────────────────────────────────┘${NC}"
echo ""

# ── Step 1: Docker Infrastructure ───────────────────────────
log "Step 1/6 — Docker Infrastructure"

# Check Docker is running
if ! docker info &>/dev/null; then
    fail "Docker is not running. Please start Docker Desktop first."
    exit 1
fi

cd "$ROOT_DIR"

COMPOSE_CMD="docker compose"
if ! $COMPOSE_CMD version &>/dev/null; then
    COMPOSE_CMD="docker-compose"
fi

# Start core infra
$COMPOSE_CMD up -d postgres redis minio 2>&1 | grep -v "^$" || true
ok "PostgreSQL  → localhost:5433"
ok "Redis       → localhost:6380"
ok "MinIO       → localhost:9000 (console: 9001)"

# Optionally start Ollama
if [ "$OLLAMA" = true ]; then
    $COMPOSE_CMD --profile onprem up -d ollama 2>&1 | grep -v "^$" || true
    ok "Ollama      → localhost:11434"
fi

# Wait for PostgreSQL to be healthy
log "  Waiting for PostgreSQL..."
for i in $(seq 1 30); do
    if $COMPOSE_CMD exec -T postgres pg_isready -U docproc &>/dev/null; then
        ok "PostgreSQL is ready"
        break
    fi
    if [ "$i" -eq 30 ]; then
        fail "PostgreSQL did not become ready in time"
        exit 1
    fi
    sleep 1
done

# Wait for Redis to be healthy
log "  Waiting for Redis..."
for i in $(seq 1 15); do
    if $COMPOSE_CMD exec -T redis redis-cli ping &>/dev/null; then
        ok "Redis is ready"
        break
    fi
    if [ "$i" -eq 15 ]; then
        fail "Redis did not become ready in time"
        exit 1
    fi
    sleep 1
done

echo ""

# ── Restore from backup (if requested) ─────────────────────
if [ "$RESTORE" = true ]; then
    log "Restoring from backup..."
    RESTORE_ARGS=""
    if [ -n "$RESTORE_TS" ]; then
        RESTORE_ARGS="--backup $RESTORE_TS"
    else
        RESTORE_ARGS="--latest"
    fi
    if [ -f "$ROOT_DIR/restore.sh" ]; then
        bash "$ROOT_DIR/restore.sh" $RESTORE_ARGS
        ok "Backup restored"
    else
        fail "restore.sh not found — skipping restore"
    fi
    echo ""
fi

if [ "$INFRA_ONLY" = true ]; then
    echo -e "${G}${BOLD}  Infrastructure is running!${NC}"
    echo ""
    exit 0
fi

# ── Step 2: Backend Virtual Environment ─────────────────────
log "Step 2/6 — Backend Environment"

cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
    warn "No .venv found — creating virtual environment..."
    python3 -m venv .venv
    .venv/bin/pip install -q --upgrade pip
    .venv/bin/pip install -q -r requirements.txt
    ok "Virtual environment created and dependencies installed"
else
    ok "Virtual environment exists"
fi

echo ""

# ── Step 3: Database Migrations ─────────────────────────────
log "Step 3/6 — Database Migrations"

if [ "$SKIP_MIGRATE" = true ]; then
    info "Skipping migrations (--skip-migrate)"
else
    cd "$BACKEND_DIR"
    if .venv/bin/alembic upgrade head 2>&1 | tail -1; then
        ok "Migrations applied"
    else
        warn "Migration failed (may already be up to date)"
    fi
fi

# Seed demo data if requested
if [ "$SEED" = true ]; then
    log "  Seeding demo data..."
    cd "$BACKEND_DIR"
    .venv/bin/python seed_demo.py 2>&1 | tail -3
    ok "Demo data seeded"
fi

echo ""

# ── Step 4: Backend Server ──────────────────────────────────
log "Step 4/6 — Backend Server (FastAPI)"

cd "$BACKEND_DIR"

# Kill existing backend if running
if [ -f "$BACKEND_PID_FILE" ] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
    warn "Backend already running (PID $(cat "$BACKEND_PID_FILE")), restarting..."
    kill "$(cat "$BACKEND_PID_FILE")" 2>/dev/null || true
    pkill -P "$(cat "$BACKEND_PID_FILE")" 2>/dev/null || true
    sleep 1
fi

# Start uvicorn
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > "$BACKEND_LOG" 2>&1 &
echo $! > "$BACKEND_PID_FILE"
ok "FastAPI     → http://localhost:8000"
ok "Swagger     → http://localhost:8000/docs"

# Wait for backend to respond
log "  Waiting for backend..."
for i in $(seq 1 20); do
    if curl -s http://localhost:8000/health &>/dev/null || curl -s http://localhost:8000/docs &>/dev/null; then
        ok "Backend is ready"
        break
    fi
    if [ "$i" -eq 20 ]; then
        warn "Backend may still be starting (check .backend.log)"
    fi
    sleep 1
done

# Start Celery worker (if celery is installed)
if .venv/bin/python -c "import celery" 2>/dev/null; then
    if [ -f "$CELERY_PID_FILE" ] && kill -0 "$(cat "$CELERY_PID_FILE")" 2>/dev/null; then
        warn "Celery already running, restarting..."
        kill "$(cat "$CELERY_PID_FILE")" 2>/dev/null || true
        sleep 1
    fi
    cd "$BACKEND_DIR"
    .venv/bin/celery -A app.tasks worker --loglevel=info > "$CELERY_LOG" 2>&1 &
    echo $! > "$CELERY_PID_FILE"
    ok "Celery      → background worker"
else
    info "Celery not installed, skipping worker"
fi

echo ""

if [ "$NO_FRONTEND" = true ]; then
    echo -e "${G}${BOLD}  Backend is running!${NC}"
    echo ""
    exit 0
fi

# ── Step 5: Frontend Dev Server ─────────────────────────────
log "Step 5/6 — Frontend Server (React)"

cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
    warn "No node_modules found — installing dependencies..."
    npm install --silent
    ok "Dependencies installed"
else
    ok "node_modules exists"
fi

# Kill existing frontend if running
if [ -f "$FRONTEND_PID_FILE" ] && kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
    warn "Frontend already running (PID $(cat "$FRONTEND_PID_FILE")), restarting..."
    kill "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null || true
    pkill -P "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null || true
    sleep 1
fi

BROWSER=none PORT=3000 npm start > "$FRONTEND_LOG" 2>&1 &
echo $! > "$FRONTEND_PID_FILE"
ok "React App   → http://localhost:3000"

echo ""

# ── Summary ─────────────────────────────────────────────────
echo -e "${G}${BOLD}  ┌──────────────────────────────────────┐${NC}"
echo -e "${G}${BOLD}  │     All Services Started!            │${NC}"
echo -e "${G}${BOLD}  └──────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${BOLD}Services:${NC}"
echo -e "    PostgreSQL   ${C}localhost:5433${NC}"
echo -e "    Redis        ${C}localhost:6380${NC}"
echo -e "    MinIO        ${C}localhost:9000${NC}  (console: ${C}9001${NC})"
[ "$OLLAMA" = true ] && echo -e "    Ollama       ${C}localhost:11434${NC}"
echo -e "    Backend API  ${C}http://localhost:8000${NC}"
echo -e "    Swagger UI   ${C}http://localhost:8000/docs${NC}"
echo -e "    Frontend     ${C}http://localhost:3000${NC}"
echo ""
echo -e "  ${BOLD}Logs:${NC}"
echo -e "    Backend:  ${Y}tail -f .backend.log${NC}"
echo -e "    Frontend: ${Y}tail -f .frontend.log${NC}"
echo ""
echo -e "  ${BOLD}Stop:${NC}  ${Y}./stop.sh${NC}"
echo ""
echo -e "  ${BOLD}Demo Accounts:${NC}"
echo -e "    Admin:   ${C}admin@docproc.demo${NC}   / demo1234  (Sarah Chen)"
echo -e "    Finance: ${C}finance@docproc.demo${NC} / demo1234  (Lisa Wong)"
echo -e "    Viewer:  ${C}viewer@docproc.demo${NC}  / demo1234  (James Park)"
echo ""
