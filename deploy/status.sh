#!/usr/bin/env bash
# =============================================================================
# DocProc — Service Status (VPS)
# Shows container state, health, recent logs, resource usage
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

log()  { echo -e "${BLUE}[status]${NC} $*"; }
ok()   { echo -e "${GREEN}[  ok  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ warn ]${NC} $*"; }
fail() { echo -e "${RED}[ fail ]${NC} $*"; exit 1; }
hdr()  { echo -e "${CYAN}── $* ──${NC}"; }

cd "$DEPLOY_DIR" || fail "Deploy directory not found: $DEPLOY_DIR"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║       DocProc — Service Status       ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

hdr "Containers"
docker compose -f "$COMPOSE_FILE" ps
echo ""

# Count expected vs running
RUNNING=$(docker compose -f "$COMPOSE_FILE" ps --status running -q 2>/dev/null | wc -l | tr -d ' ')
EXPECTED=5  # nginx, backend, postgres, redis, minio
if [ "$RUNNING" -ge "$EXPECTED" ]; then
    ok "$RUNNING/$EXPECTED containers running"
else
    warn "$RUNNING/$EXPECTED containers running — some services may be down"
fi
echo ""

hdr "Health checks"

# Backend health
if docker compose -f "$COMPOSE_FILE" exec -T backend \
    python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=2)" >/dev/null 2>&1; then
    ok "backend  : /health responding"
else
    warn "backend  : /health NOT responding"
fi

# Postgres
if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U docproc >/dev/null 2>&1; then
    ok "postgres : accepting connections"
else
    warn "postgres : NOT ready"
fi

# Redis
REDIS_PASS=$(grep -E '^REDIS_PASSWORD=' "$DEPLOY_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "")
if [ -n "$REDIS_PASS" ]; then
    if docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli -a "$REDIS_PASS" ping 2>/dev/null | grep -q PONG; then
        ok "redis    : PONG"
    else
        warn "redis    : not responding"
    fi
else
    if docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
        ok "redis    : PONG"
    else
        warn "redis    : not responding (or password required)"
    fi
fi

# Nginx
if docker compose -f "$COMPOSE_FILE" exec -T nginx wget -q -O - http://localhost/ 2>/dev/null | head -c 50 >/dev/null; then
    ok "nginx    : serving on :80"
else
    warn "nginx    : not serving"
fi

# MinIO
if docker compose -f "$COMPOSE_FILE" exec -T minio curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1; then
    ok "minio    : live"
else
    # MinIO slim may not have curl; fallback to process check
    if docker compose -f "$COMPOSE_FILE" exec -T minio pgrep -f minio >/dev/null 2>&1; then
        ok "minio    : process running"
    else
        warn "minio    : not running"
    fi
fi
echo ""

hdr "Endpoints"
DOMAIN=$(grep -E '^DOMAIN=' "$DEPLOY_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "")
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "<vps-ip>")
BASE="${DOMAIN:-$IP}"
echo "  Frontend      : http://$BASE/"
echo "  API docs      : http://$BASE/docs"
echo "  API available : http://$BASE/api/v1/models/available"
echo "  MinIO console : http://$BASE:9001"
echo ""

hdr "Resource usage (last snapshot)"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" \
    $(docker compose -f "$COMPOSE_FILE" ps -q 2>/dev/null) 2>/dev/null || warn "stats unavailable"
echo ""

hdr "Tail of recent backend logs (last 10 lines)"
docker compose -f "$COMPOSE_FILE" logs --tail=10 backend 2>/dev/null || warn "no logs"
echo ""
