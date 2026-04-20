#!/usr/bin/env bash
# =============================================================================
# DocProc — Service Management (VPS)
# Usage:
#   ./services.sh                    Show interactive menu
#   ./services.sh restart <svc>      Restart a single service
#   ./services.sh logs <svc>         Tail logs for a single service (Ctrl-C to exit)
#   ./services.sh exec <svc> <cmd>   Run a command inside a container
#   ./services.sh list               List all services
#
# Services: nginx | backend | postgres | redis | minio
# =============================================================================

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/docproc}"
COMPOSE_FILE="deploy/docker-compose.prod.yml"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${BLUE}[svc ]${NC} $*"; }
ok()   { echo -e "${GREEN}[ ok ]${NC} $*"; }
fail() { echo -e "${RED}[fail]${NC} $*"; exit 1; }

cd "$DEPLOY_DIR" || fail "Deploy directory not found: $DEPLOY_DIR"
[ -f "$COMPOSE_FILE" ] || fail "Compose file not found: $COMPOSE_FILE"

SERVICES=(nginx backend postgres redis minio)
is_valid_service() {
    local s="$1"
    for v in "${SERVICES[@]}"; do [ "$v" = "$s" ] && return 0; done
    return 1
}

usage() {
    cat <<EOF

  DocProc Service Management

  Usage:
    ./services.sh                    Interactive menu
    ./services.sh list               List services and status
    ./services.sh restart <svc>      Restart a single service
    ./services.sh stop <svc>         Stop a single service
    ./services.sh start <svc>        Start a single service
    ./services.sh logs <svc>         Tail logs (Ctrl-C to exit)
    ./services.sh exec <svc> <cmd>   Exec a command inside a container
    ./services.sh shell <svc>        Open an interactive shell in a container

  Services: ${SERVICES[*]}

EOF
}

cmd_list() {
    echo ""
    echo -e "${CYAN}── Services ──${NC}"
    docker compose -f "$COMPOSE_FILE" ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
    echo ""
}

cmd_restart() {
    local svc="$1"
    is_valid_service "$svc" || fail "Unknown service: $svc (valid: ${SERVICES[*]})"
    log "Restarting $svc..."
    docker compose -f "$COMPOSE_FILE" restart "$svc"
    ok "$svc restarted"
}

cmd_stop() {
    local svc="$1"
    is_valid_service "$svc" || fail "Unknown service: $svc"
    log "Stopping $svc..."
    docker compose -f "$COMPOSE_FILE" stop "$svc"
    ok "$svc stopped"
}

cmd_start() {
    local svc="$1"
    is_valid_service "$svc" || fail "Unknown service: $svc"
    log "Starting $svc..."
    docker compose -f "$COMPOSE_FILE" up -d "$svc"
    ok "$svc started"
}

cmd_logs() {
    local svc="$1"
    is_valid_service "$svc" || fail "Unknown service: $svc"
    log "Tailing logs for $svc (Ctrl-C to exit)..."
    docker compose -f "$COMPOSE_FILE" logs -f --tail=100 "$svc"
}

cmd_exec() {
    local svc="$1"; shift
    is_valid_service "$svc" || fail "Unknown service: $svc"
    [ $# -gt 0 ] || fail "No command given. Usage: services.sh exec <svc> <cmd>"
    docker compose -f "$COMPOSE_FILE" exec "$svc" "$@"
}

cmd_shell() {
    local svc="$1"
    is_valid_service "$svc" || fail "Unknown service: $svc"
    # Try bash first, fall back to sh
    if docker compose -f "$COMPOSE_FILE" exec "$svc" bash -c 'exit 0' >/dev/null 2>&1; then
        docker compose -f "$COMPOSE_FILE" exec "$svc" bash
    else
        docker compose -f "$COMPOSE_FILE" exec "$svc" sh
    fi
}

interactive_menu() {
    while true; do
        echo ""
        echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
        echo -e "${CYAN}║   DocProc Service Management         ║${NC}"
        echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
        echo ""
        echo "  1) List services + status"
        echo "  2) Restart a service"
        echo "  3) Stop a service"
        echo "  4) Start a service"
        echo "  5) Tail logs for a service"
        echo "  6) Open shell in a service"
        echo "  7) Quit"
        echo ""
        read -r -p "  Choice: " choice
        case "$choice" in
            1) cmd_list ;;
            2|3|4|5|6)
                echo ""
                echo "  Services: ${SERVICES[*]}"
                read -r -p "  Service name: " svc
                case "$choice" in
                    2) cmd_restart "$svc" ;;
                    3) cmd_stop "$svc" ;;
                    4) cmd_start "$svc" ;;
                    5) cmd_logs "$svc" ;;
                    6) cmd_shell "$svc" ;;
                esac
                ;;
            7|q|Q) echo ""; exit 0 ;;
            *) echo "Invalid choice" ;;
        esac
    done
}

# --- Entry point ---
if [ $# -eq 0 ]; then
    interactive_menu
    exit 0
fi

case "${1:-}" in
    list)            cmd_list ;;
    restart)         shift; cmd_restart "${1:?service name required}" ;;
    stop)            shift; cmd_stop "${1:?service name required}" ;;
    start)           shift; cmd_start "${1:?service name required}" ;;
    logs)            shift; cmd_logs "${1:?service name required}" ;;
    exec)            shift; cmd_exec "$@" ;;
    shell)           shift; cmd_shell "${1:?service name required}" ;;
    --help|-h|help)  usage ;;
    *)               usage; exit 1 ;;
esac
