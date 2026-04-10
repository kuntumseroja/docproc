#!/usr/bin/env bash
# DocProc Service Manager
# Usage: ./services.sh {start|stop|restart|status} [service]
# Services: infra, backend, frontend, all
# Examples:
#   ./services.sh start all        # Start everything
#   ./services.sh start infra      # Start only Docker infra
#   ./services.sh stop backend     # Stop only backend
#   ./services.sh restart frontend # Restart frontend
#   ./services.sh status           # Show status of all services

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PID_FILE="$ROOT_DIR/.backend.pid"
FRONTEND_PID_FILE="$ROOT_DIR/.frontend.pid"
BACKEND_LOG="$ROOT_DIR/.backend.log"
FRONTEND_LOG="$ROOT_DIR/.frontend.log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()   { echo -e "${BLUE}[docproc]${NC} $*"; }
ok()    { echo -e "${GREEN}[  ok  ]${NC} $*"; }
warn()  { echo -e "${YELLOW}[ warn ]${NC} $*"; }
fail()  { echo -e "${RED}[ fail ]${NC} $*"; }

# --- Infrastructure (Docker Compose) ---

infra_start() {
    log "Starting infrastructure (postgres, redis, minio)..."
    cd "$ROOT_DIR"
    docker compose up -d postgres redis minio 2>/dev/null || docker-compose up -d postgres redis minio
    ok "Infrastructure started"
    echo "  PostgreSQL: localhost:5432"
    echo "  Redis:      localhost:6379"
    echo "  MinIO:      localhost:9000 (console: 9001)"
}

infra_stop() {
    log "Stopping infrastructure..."
    cd "$ROOT_DIR"
    docker compose down 2>/dev/null || docker-compose down
    ok "Infrastructure stopped"
}

infra_status() {
    cd "$ROOT_DIR"
    if docker compose ps --status running 2>/dev/null | grep -q "postgres\|redis\|minio"; then
        ok "Infrastructure is running"
        docker compose ps 2>/dev/null || docker-compose ps
    else
        if docker-compose ps 2>/dev/null | grep -q "Up"; then
            ok "Infrastructure is running"
            docker-compose ps
        else
            warn "Infrastructure is not running"
        fi
    fi
}

# --- Backend (FastAPI + Uvicorn) ---

backend_start() {
    if [ -f "$BACKEND_PID_FILE" ] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
        warn "Backend already running (PID $(cat "$BACKEND_PID_FILE"))"
        return
    fi

    log "Starting backend (FastAPI on :8000)..."
    cd "$BACKEND_DIR"

    if [ ! -d ".venv" ]; then
        fail "No .venv found in $BACKEND_DIR. Run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
        return 1
    fi

    .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > "$BACKEND_LOG" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
    ok "Backend started (PID $!, log: .backend.log)"
    echo "  API:    http://localhost:8000"
    echo "  Docs:   http://localhost:8000/docs"
    echo "  Health: http://localhost:8000/health"
}

backend_stop() {
    if [ -f "$BACKEND_PID_FILE" ]; then
        local pid
        pid=$(cat "$BACKEND_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log "Stopping backend (PID $pid)..."
            kill "$pid" 2>/dev/null
            # Also kill child processes (uvicorn workers)
            pkill -P "$pid" 2>/dev/null || true
            rm -f "$BACKEND_PID_FILE"
            ok "Backend stopped"
        else
            warn "Backend PID $pid not running, cleaning up"
            rm -f "$BACKEND_PID_FILE"
        fi
    else
        # Try to find and kill uvicorn
        local pids
        pids=$(pgrep -f "uvicorn app.main:app" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            log "Stopping backend processes..."
            echo "$pids" | xargs kill 2>/dev/null || true
            ok "Backend stopped"
        else
            warn "Backend is not running"
        fi
    fi
}

backend_status() {
    if [ -f "$BACKEND_PID_FILE" ] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
        ok "Backend is running (PID $(cat "$BACKEND_PID_FILE")) on :8000"
    elif pgrep -f "uvicorn app.main:app" > /dev/null 2>&1; then
        ok "Backend is running on :8000"
    else
        warn "Backend is not running"
    fi
}

# --- Frontend (React Dev Server) ---

frontend_start() {
    if [ -f "$FRONTEND_PID_FILE" ] && kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
        warn "Frontend already running (PID $(cat "$FRONTEND_PID_FILE"))"
        return
    fi

    log "Starting frontend (React on :3000)..."
    cd "$FRONTEND_DIR"

    if [ ! -d "node_modules" ]; then
        fail "No node_modules found. Run: cd frontend && npm install"
        return 1
    fi

    BROWSER=none PORT=3000 npm start > "$FRONTEND_LOG" 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
    ok "Frontend started (PID $!, log: .frontend.log)"
    echo "  App: http://localhost:3000"
}

frontend_stop() {
    if [ -f "$FRONTEND_PID_FILE" ]; then
        local pid
        pid=$(cat "$FRONTEND_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log "Stopping frontend (PID $pid)..."
            kill "$pid" 2>/dev/null
            pkill -P "$pid" 2>/dev/null || true
            rm -f "$FRONTEND_PID_FILE"
            ok "Frontend stopped"
        else
            warn "Frontend PID $pid not running, cleaning up"
            rm -f "$FRONTEND_PID_FILE"
        fi
    else
        local pids
        pids=$(pgrep -f "react-scripts start" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            log "Stopping frontend processes..."
            echo "$pids" | xargs kill 2>/dev/null || true
            ok "Frontend stopped"
        else
            warn "Frontend is not running"
        fi
    fi
}

frontend_status() {
    if [ -f "$FRONTEND_PID_FILE" ] && kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
        ok "Frontend is running (PID $(cat "$FRONTEND_PID_FILE")) on :3000"
    elif pgrep -f "react-scripts start" > /dev/null 2>&1; then
        ok "Frontend is running on :3000"
    else
        warn "Frontend is not running"
    fi
}

# --- Commands ---

do_start() {
    local service="${1:-all}"
    case "$service" in
        infra)    infra_start ;;
        backend)  backend_start ;;
        frontend) frontend_start ;;
        all)
            infra_start
            echo ""
            backend_start
            echo ""
            frontend_start
            echo ""
            log "All services started. Run './services.sh status' to verify."
            ;;
        *) fail "Unknown service: $service" && exit 1 ;;
    esac
}

do_stop() {
    local service="${1:-all}"
    case "$service" in
        infra)    infra_stop ;;
        backend)  backend_stop ;;
        frontend) frontend_stop ;;
        all)
            frontend_stop
            backend_stop
            infra_stop
            ok "All services stopped"
            ;;
        *) fail "Unknown service: $service" && exit 1 ;;
    esac
}

do_restart() {
    local service="${1:-all}"
    do_stop "$service"
    sleep 1
    do_start "$service"
}

do_status() {
    echo ""
    echo "  DocProc Service Status"
    echo "  ======================"
    echo ""
    infra_status
    backend_status
    frontend_status
    echo ""
}

do_logs() {
    local service="${1:-backend}"
    case "$service" in
        backend)  tail -f "$BACKEND_LOG" ;;
        frontend) tail -f "$FRONTEND_LOG" ;;
        *) fail "Logs available for: backend, frontend" ;;
    esac
}

# --- Main ---

case "${1:-help}" in
    start)   do_start "${2:-all}" ;;
    stop)    do_stop "${2:-all}" ;;
    restart) do_restart "${2:-all}" ;;
    status)  do_status ;;
    logs)    do_logs "${2:-backend}" ;;
    help|*)
        echo ""
        echo "  DocProc Service Manager"
        echo ""
        echo "  Usage: ./services.sh <command> [service]"
        echo ""
        echo "  Commands:"
        echo "    start   [all|infra|backend|frontend]  Start services"
        echo "    stop    [all|infra|backend|frontend]  Stop services"
        echo "    restart [all|infra|backend|frontend]  Restart services"
        echo "    status                                Show service status"
        echo "    logs    [backend|frontend]            Tail service logs"
        echo ""
        echo "  Examples:"
        echo "    ./services.sh start all       # Start everything"
        echo "    ./services.sh start infra     # Docker only (pg, redis, minio)"
        echo "    ./services.sh stop backend    # Stop only the API server"
        echo "    ./services.sh logs backend    # Tail backend logs"
        echo ""
        ;;
esac
