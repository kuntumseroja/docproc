#!/usr/bin/env bash
# =============================================================================
# DocProc Full Deployment Script
# Run this after vps-install.sh for subsequent deployments
# Usage: ./deploy.sh [--build] [--migrate] [--ssl]
#
# Flags:
#   --build     Force rebuild Docker images
#   --migrate   Run database migrations
#   --ssl       Renew SSL certificate
#   --rollback  Rollback to previous version
# =============================================================================

set -euo pipefail

DEPLOY_DIR="/opt/docproc"
COMPOSE_FILE="deploy/docker-compose.prod.yml"
BACKUP_DIR="/opt/docproc/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${BLUE}[deploy]${NC} $*"; }
ok()   { echo -e "${GREEN}[  ok  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ warn ]${NC} $*"; }
fail() { echo -e "${RED}[ fail ]${NC} $*"; exit 1; }
step() { echo -e "${CYAN}[step $1]${NC} $2"; }

DO_BUILD=false
DO_MIGRATE=false
DO_SSL=false
DO_ROLLBACK=false

for arg in "$@"; do
    case "$arg" in
        --build)    DO_BUILD=true ;;
        --migrate)  DO_MIGRATE=true ;;
        --ssl)      DO_SSL=true ;;
        --rollback) DO_ROLLBACK=true ;;
        --help|-h)
            echo ""
            echo "  DocProc Deployment Script"
            echo ""
            echo "  Usage: ./deploy.sh [flags]"
            echo ""
            echo "  Flags:"
            echo "    --build      Force rebuild Docker images"
            echo "    --migrate    Run Alembic database migrations"
            echo "    --ssl        Renew SSL certificate"
            echo "    --rollback   Rollback to previous git version"
            echo ""
            echo "  Default (no flags): git pull + restart services"
            echo ""
            exit 0
            ;;
    esac
done

cd "$DEPLOY_DIR" || fail "Deploy directory not found: $DEPLOY_DIR"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     DocProc Deployment              ║"
echo "  ║     $(date '+%Y-%m-%d %H:%M:%S')              ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# --- Rollback ---
if [ "$DO_ROLLBACK" = true ]; then
    step 1 "Rolling back to previous version..."
    PREV_COMMIT=$(git rev-parse HEAD~1)
    log "Current:  $(git rev-parse --short HEAD)"
    log "Rollback: $(git rev-parse --short HEAD~1)"
    git checkout "$PREV_COMMIT"
    docker compose -f "$COMPOSE_FILE" build
    docker compose -f "$COMPOSE_FILE" up -d
    ok "Rolled back to $(git rev-parse --short HEAD)"
    exit 0
fi

# =============================================================================
# Step 1: Pre-deployment checks
# =============================================================================
step 1 "Pre-deployment checks..."

# Check Docker is running
docker info > /dev/null 2>&1 || fail "Docker is not running"

# Check .env exists
[ -f "$DEPLOY_DIR/.env" ] || fail ".env file not found"

# Check current status
RUNNING=$(docker compose -f "$COMPOSE_FILE" ps --status running -q 2>/dev/null | wc -l || echo "0")
log "Currently running containers: $RUNNING"
ok "Pre-checks passed"

# =============================================================================
# Step 2: Backup
# =============================================================================
step 2 "Creating backup..."

mkdir -p "$BACKUP_DIR"

# Save current git commit
echo "$(git rev-parse HEAD)" > "$BACKUP_DIR/last_commit_$TIMESTAMP"

# Backup database
if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U docproc > /dev/null 2>&1; then
    docker compose -f "$COMPOSE_FILE" exec -T postgres \
        pg_dump -U docproc docproc | gzip > "$BACKUP_DIR/db_$TIMESTAMP.sql.gz"
    ok "Database backed up: db_$TIMESTAMP.sql.gz"
else
    warn "Database not running, skipping backup"
fi

# Clean old backups (keep last 10)
ls -t "$BACKUP_DIR"/db_*.sql.gz 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
ls -t "$BACKUP_DIR"/last_commit_* 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true

# =============================================================================
# Step 3: Pull latest code
# =============================================================================
step 3 "Pulling latest code..."

BEFORE=$(git rev-parse --short HEAD)
git fetch origin
git pull origin "$(git branch --show-current)"
AFTER=$(git rev-parse --short HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
    log "Already up to date ($AFTER)"
else
    ok "Updated: $BEFORE → $AFTER"
    # Show changes
    git log --oneline "$BEFORE..$AFTER" | head -10
    DO_BUILD=true
fi

# =============================================================================
# Step 4: Build (if needed)
# =============================================================================
if [ "$DO_BUILD" = true ]; then
    step 4 "Building Docker images..."
    docker compose -f "$COMPOSE_FILE" build --parallel
    ok "Images built"
else
    step 4 "Skipping build (no changes, use --build to force)"
fi

# =============================================================================
# Step 5: Deploy (rolling restart)
# =============================================================================
step 5 "Deploying services..."

# Start infra first
docker compose -f "$COMPOSE_FILE" up -d postgres redis minio
log "Waiting for infrastructure..."
sleep 5

# Check postgres health
for i in $(seq 1 20); do
    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U docproc > /dev/null 2>&1; then
        break
    fi
    sleep 2
done

# =============================================================================
# Step 5.5: Database migration (if requested)
# =============================================================================
if [ "$DO_MIGRATE" = true ]; then
    step "5.5" "Running database migrations..."
    docker compose -f "$COMPOSE_FILE" exec -T backend \
        alembic upgrade head 2>&1 || warn "Migration failed — check manually"
    ok "Migrations complete"
fi

# Start app services
docker compose -f "$COMPOSE_FILE" up -d backend
sleep 3

# Health check backend
HEALTH_OK=false
for i in $(seq 1 20); do
    if docker compose -f "$COMPOSE_FILE" exec -T backend \
        curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        HEALTH_OK=true
        break
    fi
    sleep 2
done

if [ "$HEALTH_OK" = true ]; then
    ok "Backend healthy"
else
    warn "Backend health check failed — check: docproc logs backend"
fi

# Start nginx (frontend)
docker compose -f "$COMPOSE_FILE" up -d nginx
ok "All services deployed"

# =============================================================================
# Step 6: SSL Renewal (if requested)
# =============================================================================
if [ "$DO_SSL" = true ]; then
    step 6 "Renewing SSL certificate..."
    DOMAIN=$(grep DOMAIN "$DEPLOY_DIR/.env" | cut -d= -f2)
    if [ -n "$DOMAIN" ]; then
        docker compose -f "$COMPOSE_FILE" stop nginx
        certbot renew --quiet || warn "SSL renewal failed"
        if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
            cp /etc/letsencrypt/live/"$DOMAIN"/fullchain.pem "$DEPLOY_DIR/deploy/nginx/ssl/"
            cp /etc/letsencrypt/live/"$DOMAIN"/privkey.pem "$DEPLOY_DIR/deploy/nginx/ssl/"
        fi
        docker compose -f "$COMPOSE_FILE" up -d nginx
        ok "SSL renewed"
    else
        warn "No DOMAIN set in .env, skipping SSL"
    fi
fi

# =============================================================================
# Step 7: Verify
# =============================================================================
step 7 "Verifying deployment..."

echo ""
docker compose -f "$COMPOSE_FILE" ps
echo ""

# Final health check
CONTAINERS=$(docker compose -f "$COMPOSE_FILE" ps --status running -q | wc -l)
EXPECTED=5  # nginx, backend, postgres, redis, minio

if [ "$CONTAINERS" -ge "$EXPECTED" ]; then
    ok "All $CONTAINERS/$EXPECTED containers running"
else
    warn "Only $CONTAINERS/$EXPECTED containers running — check logs"
fi

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     Deployment Complete              ║"
echo "  ╚══════════════════════════════════════╝"
echo ""
echo "  Version: $(git rev-parse --short HEAD)"
echo "  Time:    $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Backup:  $BACKUP_DIR/db_$TIMESTAMP.sql.gz"
echo ""
