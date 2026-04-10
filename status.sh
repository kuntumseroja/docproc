#!/usr/bin/env bash
# ============================================================
#  DocProc — Service Health Dashboard
#  Usage: ./status.sh [--watch] [--json]
#
#  Options:
#    --watch      Refresh every 5 seconds (Ctrl+C to stop)
#    --json       Output machine-readable JSON
#    --verbose    Show extra details (logs tail, connections)
# ============================================================

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PID_FILE="$ROOT_DIR/.backend.pid"
FRONTEND_PID_FILE="$ROOT_DIR/.frontend.pid"
CELERY_PID_FILE="$ROOT_DIR/.celery.pid"
BACKEND_LOG="$ROOT_DIR/.backend.log"
FRONTEND_LOG="$ROOT_DIR/.frontend.log"

# Colors
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' B='\033[0;34m' C='\033[0;36m' NC='\033[0m'
BOLD='\033[1m' DIM='\033[2m'

# Parse flags
WATCH=false
JSON_OUT=false
VERBOSE=false

for arg in "$@"; do
    case "$arg" in
        --watch|-w)   WATCH=true ;;
        --json|-j)    JSON_OUT=true ;;
        --verbose|-v) VERBOSE=true ;;
        --help|-h)
            echo ""
            echo -e "${BOLD}  DocProc — Service Health Dashboard${NC}"
            echo ""
            echo "  Usage: ./status.sh [options]"
            echo ""
            echo "  Options:"
            echo "    --watch, -w      Auto-refresh every 5 seconds"
            echo "    --json, -j       Output JSON format"
            echo "    --verbose, -v    Show extra details"
            echo "    --help, -h       Show this help"
            echo ""
            exit 0
            ;;
    esac
done

# ── Utility functions ──────────────────────────────────────

check_port() {
    local port=$1
    if command -v nc &>/dev/null; then
        nc -z localhost "$port" 2>/dev/null
    elif command -v lsof &>/dev/null; then
        lsof -i ":$port" &>/dev/null
    else
        (echo >/dev/tcp/localhost/"$port") 2>/dev/null
    fi
}

check_http() {
    local url=$1
    local timeout=${2:-3}
    curl -sf --max-time "$timeout" "$url" &>/dev/null
}

get_http_json() {
    local url=$1
    curl -sf --max-time 3 "$url" 2>/dev/null || echo ""
}

get_pid_status() {
    local pid_file=$1
    local proc_pattern=$2
    local pid=""

    if [ -f "$pid_file" ]; then
        pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo "$pid"
            return 0
        fi
    fi

    # Fallback: find by process name
    pid=$(pgrep -f "$proc_pattern" 2>/dev/null | head -1 || true)
    if [ -n "$pid" ]; then
        echo "$pid"
        return 0
    fi

    echo ""
    return 1
}

get_uptime() {
    local pid=$1
    if [ -z "$pid" ]; then echo "—"; return; fi
    if [[ "$OSTYPE" == "darwin"* ]]; then
        ps -p "$pid" -o etime= 2>/dev/null | xargs || echo "—"
    else
        ps -p "$pid" -o etime= 2>/dev/null | xargs || echo "—"
    fi
}

get_mem() {
    local pid=$1
    if [ -z "$pid" ]; then echo "—"; return; fi
    local rss
    rss=$(ps -p "$pid" -o rss= 2>/dev/null | xargs || echo "0")
    if [ "$rss" -gt 1048576 ] 2>/dev/null; then
        echo "$((rss / 1048576)) GB"
    elif [ "$rss" -gt 1024 ] 2>/dev/null; then
        echo "$((rss / 1024)) MB"
    else
        echo "${rss} KB"
    fi
}

get_cpu() {
    local pid=$1
    if [ -z "$pid" ]; then echo "—"; return; fi
    ps -p "$pid" -o %cpu= 2>/dev/null | xargs || echo "—"
}

# ── Docker / Compose detection ─────────────────────────────

COMPOSE_CMD="docker compose"
if ! $COMPOSE_CMD version &>/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
fi

DOCKER_OK=false
if docker info &>/dev/null 2>&1; then
    DOCKER_OK=true
fi

# ── Collect status ──────────────────────────────────────────

run_status() {

    # Docker Engine
    local docker_status="DOWN"
    local docker_ver="—"
    if [ "$DOCKER_OK" = true ]; then
        docker_status="UP"
        docker_ver=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "?")
    fi

    # PostgreSQL
    local pg_status="DOWN" pg_port=5433 pg_ver="—" pg_conns="—" pg_size="—"
    if [ "$DOCKER_OK" = true ]; then
        if $COMPOSE_CMD exec -T postgres pg_isready -U docproc &>/dev/null 2>&1; then
            pg_status="UP"
            pg_ver=$($COMPOSE_CMD exec -T postgres psql -U docproc -d docproc -tAc "SELECT version();" 2>/dev/null | head -1 | grep -oE 'PostgreSQL [0-9.]+' || echo "?")
            pg_conns=$($COMPOSE_CMD exec -T postgres psql -U docproc -d docproc -tAc "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null | xargs || echo "?")
            pg_size=$($COMPOSE_CMD exec -T postgres psql -U docproc -d docproc -tAc "SELECT pg_size_pretty(pg_database_size('docproc'));" 2>/dev/null | xargs || echo "?")
        elif check_port "$pg_port"; then
            pg_status="PORT_OPEN"
        fi
    fi

    # Redis
    local redis_status="DOWN" redis_port=6380 redis_keys="—" redis_mem="—"
    if [ "$DOCKER_OK" = true ]; then
        local redis_ping
        redis_ping=$($COMPOSE_CMD exec -T redis redis-cli ping 2>/dev/null || echo "")
        if [ "$redis_ping" = "PONG" ]; then
            redis_status="UP"
            redis_keys=$($COMPOSE_CMD exec -T redis redis-cli dbsize 2>/dev/null | grep -oE '[0-9]+' || echo "?")
            redis_mem=$($COMPOSE_CMD exec -T redis redis-cli info memory 2>/dev/null | grep "used_memory_human" | cut -d: -f2 | tr -d '\r' || echo "?")
        elif check_port "$redis_port"; then
            redis_status="PORT_OPEN"
        fi
    fi

    # MinIO
    local minio_status="DOWN" minio_port=9000
    if check_http "http://localhost:$minio_port/minio/health/live"; then
        minio_status="UP"
    elif check_port "$minio_port"; then
        minio_status="PORT_OPEN"
    fi

    # Backend (FastAPI)
    local be_status="DOWN" be_pid="" be_uptime="—" be_mem="—" be_cpu="—" be_health=""
    be_pid=$(get_pid_status "$BACKEND_PID_FILE" "uvicorn app.main:app" || true)
    if [ -n "$be_pid" ]; then
        be_status="RUNNING"
        be_uptime=$(get_uptime "$be_pid")
        be_mem=$(get_mem "$be_pid")
        be_cpu=$(get_cpu "$be_pid")
        be_health=$(get_http_json "http://localhost:8000/health")
        if [ -n "$be_health" ]; then
            be_status="HEALTHY"
        fi
    elif check_port 8000; then
        be_status="PORT_OPEN"
    fi

    # Celery
    local celery_status="DOWN" celery_pid="" celery_uptime="—" celery_mem="—"
    celery_pid=$(get_pid_status "$CELERY_PID_FILE" "celery.*worker" || true)
    if [ -n "$celery_pid" ]; then
        celery_status="UP"
        celery_uptime=$(get_uptime "$celery_pid")
        celery_mem=$(get_mem "$celery_pid")
    fi

    # Frontend (React)
    local fe_status="DOWN" fe_pid="" fe_uptime="—" fe_mem="—"
    fe_pid=$(get_pid_status "$FRONTEND_PID_FILE" "react-scripts start" || true)
    if [ -n "$fe_pid" ]; then
        fe_status="RUNNING"
        fe_uptime=$(get_uptime "$fe_pid")
        fe_mem=$(get_mem "$fe_pid")
        if check_http "http://localhost:3000"; then
            fe_status="HEALTHY"
        fi
    elif check_port 3000; then
        fe_status="PORT_OPEN"
    fi

    # ── JSON output ─────────────────────────────────────────
    if [ "$JSON_OUT" = true ]; then
        cat <<ENDJSON
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "services": {
    "docker":     { "status": "$docker_status", "version": "$docker_ver" },
    "postgresql":  { "status": "$pg_status", "port": $pg_port, "version": "$pg_ver", "connections": "$pg_conns", "size": "$pg_size" },
    "redis":       { "status": "$redis_status", "port": $redis_port, "keys": "$redis_keys", "memory": "$redis_mem" },
    "minio":       { "status": "$minio_status", "port": $minio_port },
    "backend":     { "status": "$be_status", "pid": "${be_pid:-null}", "port": 8000, "uptime": "$be_uptime", "memory": "$be_mem", "cpu": "$be_cpu" },
    "celery":      { "status": "$celery_status", "pid": "${celery_pid:-null}", "uptime": "$celery_uptime", "memory": "$celery_mem" },
    "frontend":    { "status": "$fe_status", "pid": "${fe_pid:-null}", "port": 3000, "uptime": "$fe_uptime", "memory": "$fe_mem" }
  }
}
ENDJSON
        return
    fi

    # ── Pretty output ──────────────────────────────────────

    # Status badge function
    badge() {
        local s=$1
        case "$s" in
            UP|HEALTHY)   echo -e "${G}● $s${NC}" ;;
            RUNNING)      echo -e "${G}● $s${NC}" ;;
            PORT_OPEN)    echo -e "${Y}◐ PORT OPEN${NC}" ;;
            DOWN)         echo -e "${R}○ DOWN${NC}" ;;
            *)            echo -e "${Y}? $s${NC}" ;;
        esac
    }

    echo ""
    echo -e "${BOLD}${B}  ┌─────────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${BOLD}${B}  │              DocProc — Service Health Dashboard                 │${NC}"
    echo -e "${BOLD}${B}  │              $(date '+%Y-%m-%d %H:%M:%S')                               │${NC}"
    echo -e "${BOLD}${B}  └─────────────────────────────────────────────────────────────────┘${NC}"
    echo ""

    # ── Infrastructure ──
    echo -e "  ${BOLD}Infrastructure${NC}"
    echo -e "  ─────────────────────────────────────────────────────────────"
    echo -e "  Docker Engine    $(badge "$docker_status")  ${DIM}v${docker_ver}${NC}"
    echo -e "  PostgreSQL       $(badge "$pg_status")  ${DIM}:${pg_port}${NC}"
    if [ "$pg_status" = "UP" ]; then
        echo -e "                   ${DIM}${pg_ver} | ${pg_conns} connections | ${pg_size}${NC}"
    fi
    echo -e "  Redis            $(badge "$redis_status")  ${DIM}:${redis_port}${NC}"
    if [ "$redis_status" = "UP" ]; then
        echo -e "                   ${DIM}${redis_keys} keys | ${redis_mem} memory${NC}"
    fi
    echo -e "  MinIO            $(badge "$minio_status")  ${DIM}:${minio_port} (console: 9001)${NC}"
    echo ""

    # ── Application ──
    echo -e "  ${BOLD}Application${NC}"
    echo -e "  ─────────────────────────────────────────────────────────────"
    echo -e "  Backend API      $(badge "$be_status")  ${DIM}:8000${NC}"
    if [ -n "$be_pid" ]; then
        echo -e "                   ${DIM}PID ${be_pid} | uptime ${be_uptime} | ${be_mem} | CPU ${be_cpu}%${NC}"
    fi
    echo -e "  Celery Worker    $(badge "$celery_status")"
    if [ -n "$celery_pid" ]; then
        echo -e "                   ${DIM}PID ${celery_pid} | uptime ${celery_uptime} | ${celery_mem}${NC}"
    fi
    echo -e "  Frontend         $(badge "$fe_status")  ${DIM}:3000${NC}"
    if [ -n "$fe_pid" ]; then
        echo -e "                   ${DIM}PID ${fe_pid} | uptime ${fe_uptime} | ${fe_mem}${NC}"
    fi
    echo ""

    # ── Quick URLs ──
    echo -e "  ${BOLD}URLs${NC}"
    echo -e "  ─────────────────────────────────────────────────────────────"
    if [ "$be_status" = "HEALTHY" ]; then
        echo -e "  API          ${C}http://localhost:8000${NC}"
        echo -e "  Swagger      ${C}http://localhost:8000/docs${NC}"
        echo -e "  Health       ${C}http://localhost:8000/health${NC}"
    else
        echo -e "  API          ${DIM}http://localhost:8000 (not responding)${NC}"
    fi
    if [ "$fe_status" = "HEALTHY" ]; then
        echo -e "  Frontend     ${C}http://localhost:3000${NC}"
    else
        echo -e "  Frontend     ${DIM}http://localhost:3000 (not responding)${NC}"
    fi
    if [ "$minio_status" = "UP" ]; then
        echo -e "  MinIO Console ${C}http://localhost:9001${NC}"
    fi
    echo ""

    # ── Overall health ──
    local total=7 up=0
    [ "$docker_status" != "DOWN" ] && ((up++))
    [ "$pg_status" = "UP" ] && ((up++))
    [ "$redis_status" = "UP" ] && ((up++))
    [ "$minio_status" = "UP" ] && ((up++))
    [[ "$be_status" == "HEALTHY" || "$be_status" == "RUNNING" ]] && ((up++))
    [ "$celery_status" = "UP" ] && ((up++))
    [[ "$fe_status" == "HEALTHY" || "$fe_status" == "RUNNING" ]] && ((up++))

    local bar=""
    for ((i=0; i<up; i++)); do bar+="█"; done
    for ((i=up; i<total; i++)); do bar+="░"; done

    if [ "$up" -eq "$total" ]; then
        echo -e "  ${G}${BOLD}Health: ${bar} ${up}/${total} — All systems operational ✓${NC}"
    elif [ "$up" -ge 4 ]; then
        echo -e "  ${Y}${BOLD}Health: ${bar} ${up}/${total} — Partially running${NC}"
    else
        echo -e "  ${R}${BOLD}Health: ${bar} ${up}/${total} — Services need attention${NC}"
    fi
    echo ""

    # ── Verbose: recent log lines ──
    if [ "$VERBOSE" = true ]; then
        echo -e "  ${BOLD}Recent Logs${NC}"
        echo -e "  ─────────────────────────────────────────────────────────────"
        if [ -f "$BACKEND_LOG" ]; then
            echo -e "  ${DIM}Backend (last 5 lines):${NC}"
            tail -5 "$BACKEND_LOG" 2>/dev/null | while read -r line; do
                echo -e "    ${DIM}${line}${NC}"
            done
        fi
        if [ -f "$FRONTEND_LOG" ]; then
            echo -e "  ${DIM}Frontend (last 5 lines):${NC}"
            tail -5 "$FRONTEND_LOG" 2>/dev/null | while read -r line; do
                echo -e "    ${DIM}${line}${NC}"
            done
        fi
        echo ""
    fi

    # ── Hints ──
    if [ "$up" -lt "$total" ]; then
        echo -e "  ${BOLD}Hints${NC}"
        echo -e "  ─────────────────────────────────────────────────────────────"
        [ "$docker_status" = "DOWN" ]  && echo -e "  ${Y}→ Start Docker:   colima start${NC}"
        if [ "$pg_status" = "DOWN" ] || [ "$redis_status" = "DOWN" ] || [ "$minio_status" = "DOWN" ]; then
            echo -e "  ${Y}→ Start infra:    docker compose up -d postgres redis minio${NC}"
        fi
        [ "$be_status" = "DOWN" ]      && echo -e "  ${Y}→ Start backend:  ./start.sh --no-frontend${NC}"
        [ "$fe_status" = "DOWN" ]      && echo -e "  ${Y}→ Start frontend: cd frontend && npm start${NC}"
        echo -e "  ${Y}→ Start all:      ./start.sh${NC}"
        echo ""
    fi
}

# ── Main ────────────────────────────────────────────────────

if [ "$WATCH" = true ]; then
    while true; do
        clear
        run_status
        echo -e "  ${DIM}Auto-refreshing every 5s — Press Ctrl+C to stop${NC}"
        sleep 5
    done
else
    run_status
fi
