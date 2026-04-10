#!/usr/bin/env bash
# ============================================================
#  DocProc — Stop All Services + Backup
#  Usage: ./stop.sh [--no-backup] [--clean]
#
#  Options:
#    --no-backup    Skip database & MinIO backup
#    --clean        Remove volumes, logs, and PID files
#    --keep-infra   Keep Docker containers running
# ============================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
BACKEND_PID_FILE="$ROOT_DIR/.backend.pid"
FRONTEND_PID_FILE="$ROOT_DIR/.frontend.pid"
CELERY_PID_FILE="$ROOT_DIR/.celery.pid"
BACKEND_LOG="$ROOT_DIR/.backend.log"
FRONTEND_LOG="$ROOT_DIR/.frontend.log"
CELERY_LOG="$ROOT_DIR/.celery.log"
BACKUP_DIR="$ROOT_DIR/backups"

# Colors
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' B='\033[0;34m' C='\033[0;36m' NC='\033[0m'
BOLD='\033[1m'

log()  { echo -e "${B}[docproc]${NC} $*"; }
ok()   { echo -e "${G}  ✓${NC} $*"; }
warn() { echo -e "${Y}  ⚠${NC} $*"; }
fail() { echo -e "${R}  ✗${NC} $*"; }
info() { echo -e "${C}  ℹ${NC} $*"; }

# Parse flags
NO_BACKUP=false
CLEAN=false
KEEP_INFRA=false

for arg in "$@"; do
    case "$arg" in
        --no-backup)   NO_BACKUP=true ;;
        --clean)       CLEAN=true ;;
        --keep-infra)  KEEP_INFRA=true ;;
        --help|-h)
            echo ""
            echo -e "${BOLD}  DocProc — Stop All Services${NC}"
            echo ""
            echo "  Usage: ./stop.sh [options]"
            echo ""
            echo "  Options:"
            echo "    --no-backup    Skip database & MinIO backup"
            echo "    --clean        Remove volumes, logs, and PID files"
            echo "    --keep-infra   Keep Docker containers running"
            echo "    --help, -h     Show this help"
            echo ""
            exit 0
            ;;
    esac
done

# ── Banner ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${R}  ┌──────────────────────────────────────┐${NC}"
echo -e "${BOLD}${R}  │     DocProc — Stopping Services      │${NC}"
echo -e "${BOLD}${R}  └──────────────────────────────────────┘${NC}"
echo ""

# ── Step 1: Backup ──────────────────────────────────────────
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

if [ "$NO_BACKUP" = false ]; then
    log "Step 1/4 — Backup"

    mkdir -p "$BACKUP_DIR"

    COMPOSE_CMD="docker compose"
    if ! $COMPOSE_CMD version &>/dev/null; then
        COMPOSE_CMD="docker-compose"
    fi

    # Backup PostgreSQL
    if $COMPOSE_CMD ps --status running 2>/dev/null | grep -q postgres || \
       docker ps --format '{{.Names}}' 2>/dev/null | grep -q postgres; then

        DB_BACKUP="$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"
        log "  Backing up PostgreSQL..."
        if $COMPOSE_CMD exec -T postgres pg_dump -U docproc docproc 2>/dev/null | gzip > "$DB_BACKUP"; then
            BACKUP_SIZE=$(du -h "$DB_BACKUP" | cut -f1)
            ok "Database backup → $DB_BACKUP ($BACKUP_SIZE)"
        else
            warn "Database backup failed (PostgreSQL may not be running)"
            rm -f "$DB_BACKUP"
        fi
    else
        info "PostgreSQL not running, skipping DB backup"
    fi

    # Backup MinIO data manifest (list of objects)
    if $COMPOSE_CMD ps --status running 2>/dev/null | grep -q minio || \
       docker ps --format '{{.Names}}' 2>/dev/null | grep -q minio; then

        MINIO_BACKUP="$BACKUP_DIR/minio_manifest_${TIMESTAMP}.txt"
        log "  Creating MinIO file manifest..."
        if curl -s http://localhost:9000/minio/health/live &>/dev/null; then
            # List all uploaded files via MinIO API
            $COMPOSE_CMD exec -T minio sh -c 'find /data -type f 2>/dev/null' > "$MINIO_BACKUP" 2>/dev/null || true
            if [ -s "$MINIO_BACKUP" ]; then
                FILE_COUNT=$(wc -l < "$MINIO_BACKUP" | tr -d ' ')
                ok "MinIO manifest → $MINIO_BACKUP ($FILE_COUNT files)"
            else
                info "MinIO is empty, no files to list"
                rm -f "$MINIO_BACKUP"
            fi
        else
            info "MinIO not responding, skipping manifest"
        fi
    else
        info "MinIO not running, skipping manifest"
    fi

    # Backup .env
    if [ -f "$ROOT_DIR/.env" ]; then
        ENV_BACKUP="$BACKUP_DIR/env_${TIMESTAMP}.bak"
        cp "$ROOT_DIR/.env" "$ENV_BACKUP"
        ok ".env backup   → $ENV_BACKUP"
    fi

    # Cleanup old backups (keep last 10)
    BACKUP_COUNT=$(find "$BACKUP_DIR" -name "db_*.sql.gz" -type f 2>/dev/null | wc -l | tr -d ' ')
    if [ "$BACKUP_COUNT" -gt 10 ]; then
        log "  Cleaning old backups (keeping last 10)..."
        find "$BACKUP_DIR" -name "db_*.sql.gz" -type f | sort | head -n -10 | xargs rm -f
        find "$BACKUP_DIR" -name "minio_manifest_*.txt" -type f | sort | head -n -10 | xargs rm -f
        find "$BACKUP_DIR" -name "env_*.bak" -type f | sort | head -n -10 | xargs rm -f
        ok "Old backups cleaned"
    fi

    echo ""
else
    info "Skipping backup (--no-backup)"
    echo ""
fi

# ── Step 2: Stop Frontend ──────────────────────────────────
log "Step 2/4 — Frontend"

if [ -f "$FRONTEND_PID_FILE" ]; then
    pid=$(cat "$FRONTEND_PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        pkill -P "$pid" 2>/dev/null || true
        ok "Frontend stopped (PID $pid)"
    else
        info "Frontend PID $pid already stopped"
    fi
    rm -f "$FRONTEND_PID_FILE"
else
    # Try to find by process name
    pids=$(pgrep -f "react-scripts start" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill 2>/dev/null || true
        ok "Frontend stopped"
    else
        info "Frontend not running"
    fi
fi

echo ""

# ── Step 3: Stop Backend + Celery ───────────────────────────
log "Step 3/4 — Backend & Celery"

# Stop Celery
if [ -f "$CELERY_PID_FILE" ]; then
    pid=$(cat "$CELERY_PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        pkill -P "$pid" 2>/dev/null || true
        ok "Celery stopped (PID $pid)"
    else
        info "Celery PID $pid already stopped"
    fi
    rm -f "$CELERY_PID_FILE"
else
    pids=$(pgrep -f "celery.*worker" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill 2>/dev/null || true
        ok "Celery stopped"
    fi
fi

# Stop Backend
if [ -f "$BACKEND_PID_FILE" ]; then
    pid=$(cat "$BACKEND_PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        pkill -P "$pid" 2>/dev/null || true
        ok "Backend stopped (PID $pid)"
    else
        info "Backend PID $pid already stopped"
    fi
    rm -f "$BACKEND_PID_FILE"
else
    pids=$(pgrep -f "uvicorn app.main:app" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill 2>/dev/null || true
        ok "Backend stopped"
    else
        info "Backend not running"
    fi
fi

echo ""

# ── Step 4: Stop Docker Infrastructure ─────────────────────
log "Step 4/4 — Docker Infrastructure"

if [ "$KEEP_INFRA" = true ]; then
    info "Keeping infrastructure running (--keep-infra)"
else
    cd "$ROOT_DIR"

    COMPOSE_CMD="docker compose"
    if ! $COMPOSE_CMD version &>/dev/null; then
        COMPOSE_CMD="docker-compose"
    fi

    if [ "$CLEAN" = true ]; then
        log "  Removing containers and volumes (--clean)..."
        $COMPOSE_CMD down -v 2>&1 | grep -v "^$" || true
        ok "Containers and volumes removed"
    else
        $COMPOSE_CMD down 2>&1 | grep -v "^$" || true
        ok "Containers stopped (volumes preserved)"
    fi
fi

echo ""

# ── Cleanup logs if --clean ─────────────────────────────────
if [ "$CLEAN" = true ]; then
    log "Cleaning up logs and PID files..."
    rm -f "$BACKEND_LOG" "$FRONTEND_LOG" "$CELERY_LOG"
    rm -f "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE" "$CELERY_PID_FILE"
    ok "Logs and PID files removed"
    echo ""
fi

# ── Summary ─────────────────────────────────────────────────
echo -e "${G}${BOLD}  ┌──────────────────────────────────────┐${NC}"
echo -e "${G}${BOLD}  │     All Services Stopped!            │${NC}"
echo -e "${G}${BOLD}  └──────────────────────────────────────┘${NC}"
echo ""
if [ "$NO_BACKUP" = false ]; then
    echo -e "  ${BOLD}Backups:${NC} $BACKUP_DIR/"
    ls -1t "$BACKUP_DIR"/*_${TIMESTAMP}* 2>/dev/null | while read -r f; do
        echo -e "    ${C}$(basename "$f")${NC}"
    done
    echo ""
fi
echo -e "  ${BOLD}Restart:${NC}  ${Y}./start.sh${NC}"
echo -e "  ${BOLD}With seed:${NC} ${Y}./start.sh --seed${NC}"
echo ""
