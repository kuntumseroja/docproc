#!/usr/bin/env bash
# =============================================================================
# DocProc — Stop All Services (VPS)
# Default: stop containers but keep them (data volumes preserved)
# Pass --down to also remove containers, or --purge to remove + wipe volumes
# =============================================================================

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/docproc}"
COMPOSE_FILE="deploy/docker-compose.prod.yml"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${BLUE}[stop]${NC} $*"; }
ok()   { echo -e "${GREEN}[ ok ]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
fail() { echo -e "${RED}[fail]${NC} $*"; exit 1; }

MODE="stop"
for arg in "$@"; do
    case "$arg" in
        --down)  MODE="down" ;;
        --purge) MODE="purge" ;;
        --help|-h)
            echo ""
            echo "  Usage: ./stop.sh [flags]"
            echo ""
            echo "  Flags:"
            echo "    (none)    Stop containers, keep them for fast restart (default)"
            echo "    --down    Stop and remove containers (volumes preserved)"
            echo "    --purge   Stop, remove containers AND volumes (DESTROYS DB DATA)"
            echo ""
            exit 0
            ;;
    esac
done

cd "$DEPLOY_DIR" || fail "Deploy directory not found: $DEPLOY_DIR"
[ -f "$COMPOSE_FILE" ] || fail "Compose file not found: $COMPOSE_FILE"

# ── Also free up known dev ports left behind by stray processes ────────────
# Skip with: SKIP_PORT_CLEANUP=1 ./stop.sh
free_dev_ports() {
    [ "${SKIP_PORT_CLEANUP:-0}" = "1" ] && return 0
    command -v lsof >/dev/null 2>&1 || return 0
    PORTS_TO_FREE="${PORTS_TO_FREE:-3000 5173 8000 8080}"
    for p in $PORTS_TO_FREE; do
        pids=$(lsof -ti ":$p" 2>/dev/null || true)
        [ -z "$pids" ] && continue
        non_docker_pids=""
        for pid in $pids; do
            pname=$(ps -p "$pid" -o comm= 2>/dev/null || true)
            case "$pname" in
                *docker*|*com.docker*) ;;
                *) non_docker_pids="$non_docker_pids $pid" ;;
            esac
        done
        if [ -n "$non_docker_pids" ]; then
            log "Freeing dev port $p (PIDs:$non_docker_pids)"
            kill -9 $non_docker_pids 2>/dev/null || true
        fi
    done
}

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     DocProc — Stopping Services     ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

free_dev_ports

case "$MODE" in
    stop)
        # Stop in reverse order: nginx first (take off traffic), then backend, then infra
        log "Stopping nginx..."
        docker compose -f "$COMPOSE_FILE" stop nginx || true
        log "Stopping backend..."
        docker compose -f "$COMPOSE_FILE" stop backend || true
        log "Stopping redis + minio..."
        docker compose -f "$COMPOSE_FILE" stop redis minio || true
        log "Stopping postgres..."
        docker compose -f "$COMPOSE_FILE" stop postgres || true
        ok "All services stopped (data preserved)"
        ;;
    down)
        log "Removing containers (data volumes preserved)..."
        docker compose -f "$COMPOSE_FILE" down
        ok "Containers removed — data in volumes kept"
        ;;
    purge)
        warn "PURGE mode — this will DELETE all database + MinIO data!"
        read -r -p "Type 'PURGE' to confirm: " confirm
        if [ "$confirm" = "PURGE" ]; then
            docker compose -f "$COMPOSE_FILE" down -v
            ok "Containers and volumes removed"
        else
            fail "Aborted"
        fi
        ;;
esac

echo ""
