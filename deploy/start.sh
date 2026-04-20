#!/usr/bin/env bash
# =============================================================================
# DocProc — Start All Services (VPS)
# Starts the full production stack: postgres, redis, minio, backend, nginx
# Run from /opt/docproc (or pass --dir <path> to override)
# =============================================================================

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/docproc}"
COMPOSE_FILE="deploy/docker-compose.prod.yml"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${BLUE}[start]${NC} $*"; }
ok()   { echo -e "${GREEN}[ ok  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn ]${NC} $*"; }
fail() { echo -e "${RED}[fail ]${NC} $*"; exit 1; }

cd "$DEPLOY_DIR" || fail "Deploy directory not found: $DEPLOY_DIR"
[ -f "$COMPOSE_FILE" ] || fail "Compose file not found: $COMPOSE_FILE"
[ -f "$DEPLOY_DIR/.env" ] || fail ".env file not found in $DEPLOY_DIR"

docker info >/dev/null 2>&1 || fail "Docker is not running"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     DocProc — Starting Services     ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Start infrastructure first (databases, object storage)
log "Starting infrastructure: postgres, redis, minio..."
docker compose -f "$COMPOSE_FILE" up -d postgres redis minio

# Wait for postgres to be healthy before starting app services
log "Waiting for postgres to become healthy..."
for i in $(seq 1 30); do
    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U docproc >/dev/null 2>&1; then
        ok "Postgres is ready"
        break
    fi
    [ "$i" -eq 30 ] && warn "Postgres did not report ready in 60s — continuing anyway"
    sleep 2
done

# Start application services
log "Starting backend..."
docker compose -f "$COMPOSE_FILE" up -d backend
sleep 3

log "Starting nginx (frontend + reverse proxy on 80/443)..."
docker compose -f "$COMPOSE_FILE" up -d nginx

# Backend health check
log "Verifying backend /health..."
HEALTH_OK=false
for i in $(seq 1 20); do
    if docker compose -f "$COMPOSE_FILE" exec -T backend \
        python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=2)" >/dev/null 2>&1; then
        HEALTH_OK=true
        break
    fi
    sleep 2
done

if [ "$HEALTH_OK" = true ]; then
    ok "Backend is healthy"
else
    warn "Backend health check failed — inspect with: ./deploy/status.sh"
fi

echo ""
docker compose -f "$COMPOSE_FILE" ps
echo ""
ok "All services started"
echo ""
echo "  Frontend : http://<your-vps-ip>/   (or https:// if SSL enabled)"
echo "  API docs : http://<your-vps-ip>/docs"
echo "  MinIO    : http://<your-vps-ip>:9001  (console)"
echo ""
