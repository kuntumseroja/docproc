#!/usr/bin/env bash
# ============================================================
#  DocProc — Restore from Backup
#  Usage: ./restore.sh [--latest] [--list] [--backup <timestamp>]
#
#  Options:
#    --latest              Restore from the most recent backup
#    --list                List all available backups
#    --backup <timestamp>  Restore from a specific backup (e.g. 20260318_143000)
#    --db-only             Restore database only (skip .env)
#    --env-only            Restore .env only (skip database)
# ============================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
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
USE_LATEST=false
LIST_ONLY=false
BACKUP_TS=""
DB_ONLY=false
ENV_ONLY=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --latest)     USE_LATEST=true; shift ;;
        --list)       LIST_ONLY=true; shift ;;
        --backup)     BACKUP_TS="$2"; shift 2 ;;
        --db-only)    DB_ONLY=true; shift ;;
        --env-only)   ENV_ONLY=true; shift ;;
        --help|-h)
            echo ""
            echo -e "${BOLD}  DocProc — Restore from Backup${NC}"
            echo ""
            echo "  Usage: ./restore.sh [options]"
            echo ""
            echo "  Options:"
            echo "    --latest              Restore most recent backup"
            echo "    --list                List available backups"
            echo "    --backup <timestamp>  Restore specific backup (e.g. 20260318_143000)"
            echo "    --db-only             Restore database only"
            echo "    --env-only            Restore .env only"
            echo "    --help, -h            Show this help"
            echo ""
            echo "  Examples:"
            echo "    ./restore.sh --latest"
            echo "    ./restore.sh --list"
            echo "    ./restore.sh --backup 20260318_143000"
            echo "    ./restore.sh --latest --db-only"
            echo ""
            exit 0
            ;;
        *) fail "Unknown option: $1"; exit 1 ;;
    esac
done

# ── Check backup dir exists ────────────────────────────────
if [ ! -d "$BACKUP_DIR" ]; then
    fail "No backups directory found at $BACKUP_DIR"
    echo "  Run ./stop.sh first to create a backup."
    exit 1
fi

# ── List backups ────────────────────────────────────────────
list_backups() {
    echo ""
    echo -e "${BOLD}  Available Backups${NC}"
    echo -e "  ════════════════════════════════════════════"
    echo ""

    # Find unique timestamps from db backups
    local timestamps=()
    while IFS= read -r f; do
        ts=$(basename "$f" | sed 's/^db_//; s/\.sql\.gz$//')
        timestamps+=("$ts")
    done < <(find "$BACKUP_DIR" -name "db_*.sql.gz" -type f 2>/dev/null | sort -r)

    # Also check env-only backups (in case no DB backup exists)
    while IFS= read -r f; do
        ts=$(basename "$f" | sed 's/^env_//; s/\.bak$//')
        # Only add if not already in list
        local found=false
        for existing in "${timestamps[@]:-}"; do
            if [ "$existing" = "$ts" ]; then found=true; break; fi
        done
        if [ "$found" = false ]; then timestamps+=("$ts"); fi
    done < <(find "$BACKUP_DIR" -name "env_*.bak" -type f 2>/dev/null | sort -r)

    if [ ${#timestamps[@]} -eq 0 ]; then
        warn "No backups found in $BACKUP_DIR"
        echo ""
        return 1
    fi

    local idx=1
    for ts in "${timestamps[@]}"; do
        # Format timestamp for display
        local display_date
        display_date=$(echo "$ts" | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)_\([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3 \4:\5:\6/')

        local has_db="" has_env="" has_minio=""
        [ -f "$BACKUP_DIR/db_${ts}.sql.gz" ] && has_db="${G}DB${NC} "
        [ -f "$BACKUP_DIR/env_${ts}.bak" ] && has_env="${G}ENV${NC} "
        [ -f "$BACKUP_DIR/minio_manifest_${ts}.txt" ] && has_minio="${G}MINIO${NC} "

        local db_size=""
        if [ -f "$BACKUP_DIR/db_${ts}.sql.gz" ]; then
            db_size=" ($(du -h "$BACKUP_DIR/db_${ts}.sql.gz" | cut -f1))"
        fi

        echo -e "  ${BOLD}${idx}.${NC} ${C}${ts}${NC}  ${display_date}  [${has_db}${has_env}${has_minio}]${db_size}"
        idx=$((idx + 1))
    done

    echo ""
    echo -e "  Restore with: ${Y}./restore.sh --backup <timestamp>${NC}"
    echo ""
}

if [ "$LIST_ONLY" = true ]; then
    list_backups
    exit 0
fi

# ── Determine which backup to use ──────────────────────────
if [ "$USE_LATEST" = true ]; then
    # Find the latest DB backup timestamp
    LATEST_DB=$(find "$BACKUP_DIR" -name "db_*.sql.gz" -type f 2>/dev/null | sort -r | head -1)
    if [ -n "$LATEST_DB" ]; then
        BACKUP_TS=$(basename "$LATEST_DB" | sed 's/^db_//; s/\.sql\.gz$//')
    else
        # Try latest env backup
        LATEST_ENV=$(find "$BACKUP_DIR" -name "env_*.bak" -type f 2>/dev/null | sort -r | head -1)
        if [ -n "$LATEST_ENV" ]; then
            BACKUP_TS=$(basename "$LATEST_ENV" | sed 's/^env_//; s/\.bak$//')
        else
            fail "No backups found"
            exit 1
        fi
    fi
    info "Using latest backup: $BACKUP_TS"
fi

if [ -z "$BACKUP_TS" ]; then
    echo ""
    warn "No backup specified. Use --latest or --backup <timestamp>"
    echo ""
    list_backups
    exit 1
fi

# ── Verify backup files exist ──────────────────────────────
DB_FILE="$BACKUP_DIR/db_${BACKUP_TS}.sql.gz"
ENV_FILE="$BACKUP_DIR/env_${BACKUP_TS}.bak"
MINIO_FILE="$BACKUP_DIR/minio_manifest_${BACKUP_TS}.txt"

HAS_DB=false
HAS_ENV=false
HAS_MINIO=false

[ -f "$DB_FILE" ] && HAS_DB=true
[ -f "$ENV_FILE" ] && HAS_ENV=true
[ -f "$MINIO_FILE" ] && HAS_MINIO=true

if [ "$HAS_DB" = false ] && [ "$HAS_ENV" = false ]; then
    fail "No backup files found for timestamp: $BACKUP_TS"
    list_backups
    exit 1
fi

# ── Banner ──────────────────────────────────────────────────
DISPLAY_DATE=$(echo "$BACKUP_TS" | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)_\([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3 \4:\5:\6/')

echo ""
echo -e "${BOLD}${B}  ┌──────────────────────────────────────┐${NC}"
echo -e "${BOLD}${B}  │     DocProc — Restore Backup         │${NC}"
echo -e "${BOLD}${B}  └──────────────────────────────────────┘${NC}"
echo ""
echo -e "  Backup: ${C}${BACKUP_TS}${NC} (${DISPLAY_DATE})"
echo -e "  Files:  ${HAS_DB:+DB }${HAS_ENV:+ENV }${HAS_MINIO:+MINIO}"
echo ""

# ── Docker compose command ─────────────────────────────────
COMPOSE_CMD="docker compose"
if ! $COMPOSE_CMD version &>/dev/null; then
    COMPOSE_CMD="docker-compose"
fi

# ── Restore Database ───────────────────────────────────────
if [ "$HAS_DB" = true ] && [ "$ENV_ONLY" = false ]; then
    log "Restoring PostgreSQL database..."

    # Make sure PostgreSQL is running
    cd "$ROOT_DIR"
    if ! $COMPOSE_CMD ps --status running 2>/dev/null | grep -q postgres; then
        log "  Starting PostgreSQL..."
        $COMPOSE_CMD up -d postgres 2>&1 | grep -v "^$" || true

        # Wait for healthy
        for i in $(seq 1 30); do
            if $COMPOSE_CMD exec -T postgres pg_isready -U docproc &>/dev/null; then
                break
            fi
            if [ "$i" -eq 30 ]; then
                fail "PostgreSQL did not become ready"
                exit 1
            fi
            sleep 1
        done
    fi

    # Drop and recreate the database
    log "  Dropping existing data..."
    $COMPOSE_CMD exec -T postgres psql -U docproc -d postgres \
        -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='docproc' AND pid <> pg_backend_pid();" \
        &>/dev/null || true

    $COMPOSE_CMD exec -T postgres psql -U docproc -d postgres \
        -c "DROP DATABASE IF EXISTS docproc;" &>/dev/null || true

    $COMPOSE_CMD exec -T postgres psql -U docproc -d postgres \
        -c "CREATE DATABASE docproc OWNER docproc;" &>/dev/null || true

    # Restore from backup
    log "  Restoring from $DB_FILE..."
    if gunzip -c "$DB_FILE" | $COMPOSE_CMD exec -T postgres psql -U docproc -d docproc &>/dev/null; then
        DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
        ok "Database restored ($DB_SIZE compressed)"
    else
        fail "Database restore failed"
        warn "You may need to run: ./start.sh --seed"
    fi

    echo ""
fi

# ── Restore .env ────────────────────────────────────────────
if [ "$HAS_ENV" = true ] && [ "$DB_ONLY" = false ]; then
    log "Restoring .env configuration..."

    # Create a backup of current .env before overwriting
    if [ -f "$ROOT_DIR/.env" ]; then
        cp "$ROOT_DIR/.env" "$ROOT_DIR/.env.pre-restore"
        info "Current .env saved to .env.pre-restore"
    fi

    cp "$ENV_FILE" "$ROOT_DIR/.env"
    ok ".env restored from $ENV_FILE"

    # Show key config values
    if [ -f "$ROOT_DIR/.env" ]; then
        PROVIDER=$(grep "^LLM_PROVIDER=" "$ROOT_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "unknown")
        MODEL=$(grep "^LLM_MODEL=" "$ROOT_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "unknown")
        info "LLM Provider: $PROVIDER | Model: $MODEL"
    fi

    echo ""
fi

# ── MinIO manifest info ────────────────────────────────────
if [ "$HAS_MINIO" = true ]; then
    log "MinIO file manifest"
    FILE_COUNT=$(wc -l < "$MINIO_FILE" | tr -d ' ')
    info "Manifest contains $FILE_COUNT file paths"
    info "Note: MinIO data is stored in Docker volumes and persists across restarts."
    info "      Full MinIO backup/restore requires mc (MinIO Client) — see docs."
    echo ""
fi

# ── Summary ─────────────────────────────────────────────────
echo -e "${G}${BOLD}  ┌──────────────────────────────────────┐${NC}"
echo -e "${G}${BOLD}  │     Restore Complete!                │${NC}"
echo -e "${G}${BOLD}  └──────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo -e "    ${Y}./start.sh${NC}              Start all services"
echo -e "    ${Y}./start.sh --seed${NC}       Start + re-seed demo data"
echo ""
