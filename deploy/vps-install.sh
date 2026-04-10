#!/usr/bin/env bash
# =============================================================================
# DocProc VPS Installation Script
# Target: Niaga Hoster / Hostinger VPS (Ubuntu 22.04/24.04)
# Usage:  curl -sSL <raw-url>/vps-install.sh | sudo bash
#   or:   sudo bash vps-install.sh
#
# What this does:
#   1. Updates system & installs dependencies
#   2. Installs Docker + Docker Compose
#   3. Configures firewall (UFW)
#   4. Creates docproc user & project directory
#   5. Clones the repo & generates .env
#   6. Builds & starts all services
#   7. (Optional) Sets up SSL with Let's Encrypt
# =============================================================================

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[docproc]${NC} $*"; }
ok()   { echo -e "${GREEN}[  ok  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ warn ]${NC} $*"; }
fail() { echo -e "${RED}[ fail ]${NC} $*"; exit 1; }

# --- Pre-flight checks ---
if [ "$(id -u)" -ne 0 ]; then
    fail "This script must be run as root (use sudo)"
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_NAME="$ID"
    OS_VERSION="$VERSION_ID"
else
    fail "Cannot detect OS. This script supports Ubuntu 22.04/24.04"
fi

log "Detected: $OS_NAME $OS_VERSION"

if [[ "$OS_NAME" != "ubuntu" && "$OS_NAME" != "debian" ]]; then
    warn "This script is designed for Ubuntu/Debian. Proceeding anyway..."
fi

# --- Configuration ---
DEPLOY_USER="docproc"
DEPLOY_DIR="/opt/docproc"
REPO_URL="${REPO_URL:-}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     DocProc VPS Installation         ║"
echo "  ║     Niaga Hoster / Hostinger         ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Interactive prompts if not set via env
if [ -z "$REPO_URL" ]; then
    read -rp "Git repository URL (HTTPS): " REPO_URL
fi

if [ -z "$DOMAIN" ]; then
    read -rp "Domain name (or IP, e.g. docproc.example.com): " DOMAIN
fi

if [ -z "$EMAIL" ]; then
    read -rp "Email for SSL cert (leave blank to skip SSL): " EMAIL
fi

# Generate secure passwords
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
REDIS_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 48)
MINIO_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)

# =============================================================================
# Step 1: System Update & Dependencies
# =============================================================================
log "Step 1/7: Updating system packages..."

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    ufw \
    htop \
    fail2ban \
    unzip \
    jq

ok "System packages updated"

# =============================================================================
# Step 2: Install Docker
# =============================================================================
log "Step 2/7: Installing Docker..."

if command -v docker &> /dev/null; then
    ok "Docker already installed: $(docker --version)"
else
    # Add Docker GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/$OS_NAME/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    # Add Docker repo
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$OS_NAME \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    systemctl enable docker
    systemctl start docker
    ok "Docker installed: $(docker --version)"
fi

# Verify docker compose
if docker compose version &> /dev/null; then
    ok "Docker Compose: $(docker compose version --short)"
else
    fail "Docker Compose plugin not found"
fi

# =============================================================================
# Step 3: Firewall Configuration
# =============================================================================
log "Step 3/7: Configuring firewall (UFW)..."

ufw --force reset > /dev/null 2>&1
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "SSH"
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS"
ufw allow 9001/tcp comment "MinIO Console"
ufw --force enable

ok "Firewall configured (SSH, HTTP, HTTPS, MinIO Console)"

# =============================================================================
# Step 4: Create Deploy User & Directory
# =============================================================================
log "Step 4/7: Setting up deploy user..."

if id "$DEPLOY_USER" &>/dev/null; then
    ok "User '$DEPLOY_USER' already exists"
else
    useradd -m -s /bin/bash "$DEPLOY_USER"
    usermod -aG docker "$DEPLOY_USER"
    ok "Created user '$DEPLOY_USER' with Docker access"
fi

# Ensure docker group
usermod -aG docker "$DEPLOY_USER" 2>/dev/null || true

mkdir -p "$DEPLOY_DIR"
chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR"

ok "Deploy directory: $DEPLOY_DIR"

# =============================================================================
# Step 5: Clone Repository
# =============================================================================
log "Step 5/7: Cloning repository..."

if [ -d "$DEPLOY_DIR/.git" ]; then
    warn "Repository already exists, pulling latest..."
    cd "$DEPLOY_DIR"
    sudo -u "$DEPLOY_USER" git pull
else
    sudo -u "$DEPLOY_USER" git clone "$REPO_URL" "$DEPLOY_DIR"
fi

cd "$DEPLOY_DIR"
ok "Repository ready at $DEPLOY_DIR"

# =============================================================================
# Step 6: Generate .env & Build
# =============================================================================
log "Step 6/7: Generating production .env and building..."

# Create production .env
cat > "$DEPLOY_DIR/.env" << ENVEOF
# DocProc Production Configuration
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# VPS: Niaga Hoster / Hostinger

# Application
APP_NAME=DocProc API
DEBUG=false

# Database
DATABASE_URL=postgresql+asyncpg://docproc:${POSTGRES_PASSWORD}@postgres:5432/docproc
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# Redis
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
REDIS_PASSWORD=${REDIS_PASSWORD}

# MinIO / S3
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=${MINIO_PASSWORD}
MINIO_BUCKET=docproc
MINIO_USE_SSL=false

# JWT
SECRET_KEY=${JWT_SECRET}
ACCESS_TOKEN_EXPIRE_MINUTES=60

# LLM Provider: anthropic | openai | ollama | mistral
LLM_PROVIDER=anthropic
LLM_MODEL=

# API Keys (set the one matching your LLM_PROVIDER)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
MISTRAL_API_KEY=

# Ollama (on-prem)
OLLAMA_BASE_URL=http://ollama:11434

# CORS
CORS_ORIGINS=["https://${DOMAIN}","http://${DOMAIN}"]

# Domain
DOMAIN=${DOMAIN}
ENVEOF

chmod 600 "$DEPLOY_DIR/.env"
chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR/.env"

ok "Production .env generated (passwords auto-generated)"

# Build and start with production compose
log "Building Docker images (this may take a few minutes)..."

cd "$DEPLOY_DIR"
sudo -u "$DEPLOY_USER" docker compose -f deploy/docker-compose.prod.yml build

log "Starting services..."
sudo -u "$DEPLOY_USER" docker compose -f deploy/docker-compose.prod.yml up -d

ok "All services started"

# Wait for services to be healthy
log "Waiting for services to be healthy..."
sleep 10

HEALTH_OK=false
for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        HEALTH_OK=true
        break
    fi
    sleep 2
done

if [ "$HEALTH_OK" = true ]; then
    ok "Backend health check passed"
else
    warn "Backend not responding yet — check logs: docker compose -f deploy/docker-compose.prod.yml logs backend"
fi

# =============================================================================
# Step 7: SSL Setup (Let's Encrypt via Certbot)
# =============================================================================
if [ -n "$EMAIL" ] && [ "$DOMAIN" != "" ] && [[ "$DOMAIN" != *"."*"."* || "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    warn "Skipping SSL — domain appears to be an IP address"
elif [ -n "$EMAIL" ]; then
    log "Step 7/7: Setting up SSL with Let's Encrypt..."

    apt-get install -y -qq certbot

    # Stop nginx temporarily for standalone cert
    sudo -u "$DEPLOY_USER" docker compose -f deploy/docker-compose.prod.yml stop nginx

    certbot certonly --standalone \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        -d "$DOMAIN" \
        || { warn "SSL setup failed — continuing without SSL"; }

    if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
        # Create SSL nginx config
        mkdir -p "$DEPLOY_DIR/deploy/nginx/ssl"
        cp /etc/letsencrypt/live/"$DOMAIN"/fullchain.pem "$DEPLOY_DIR/deploy/nginx/ssl/"
        cp /etc/letsencrypt/live/"$DOMAIN"/privkey.pem "$DEPLOY_DIR/deploy/nginx/ssl/"

        # Create SSL-enabled nginx config
        cat > "$DEPLOY_DIR/deploy/nginx/nginx.conf" << 'NGINXEOF'
upstream backend {
    server backend:8000;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name _;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    client_max_body_size 50M;

    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    location /health {
        proxy_pass http://backend/health;
        proxy_set_header Host $host;
    }

    location /docs {
        proxy_pass http://backend/docs;
        proxy_set_header Host $host;
    }

    location /openapi.json {
        proxy_pass http://backend/openapi.json;
        proxy_set_header Host $host;
    }
}
NGINXEOF

        # Setup auto-renewal cron
        cat > /etc/cron.d/docproc-ssl-renew << CRONEOF
0 3 * * * root certbot renew --quiet --deploy-hook "cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem $DEPLOY_DIR/deploy/nginx/ssl/ && cp /etc/letsencrypt/live/$DOMAIN/privkey.pem $DEPLOY_DIR/deploy/nginx/ssl/ && cd $DEPLOY_DIR && docker compose -f deploy/docker-compose.prod.yml restart nginx"
CRONEOF

        ok "SSL configured with auto-renewal"
    fi

    # Restart nginx with SSL
    sudo -u "$DEPLOY_USER" docker compose -f deploy/docker-compose.prod.yml up -d nginx
else
    log "Step 7/7: Skipping SSL (no email provided)"
fi

# =============================================================================
# Setup fail2ban for SSH protection
# =============================================================================
log "Configuring fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban
ok "fail2ban active (SSH brute-force protection)"

# =============================================================================
# Create management aliases
# =============================================================================
cat > /usr/local/bin/docproc << 'MGMTEOF'
#!/usr/bin/env bash
# DocProc management shortcut
DEPLOY_DIR="/opt/docproc"
cd "$DEPLOY_DIR"

case "${1:-help}" in
    up|start)     docker compose -f deploy/docker-compose.prod.yml up -d ;;
    down|stop)    docker compose -f deploy/docker-compose.prod.yml down ;;
    restart)      docker compose -f deploy/docker-compose.prod.yml restart ${2:-} ;;
    logs)         docker compose -f deploy/docker-compose.prod.yml logs -f ${2:-} ;;
    ps|status)    docker compose -f deploy/docker-compose.prod.yml ps ;;
    build)        docker compose -f deploy/docker-compose.prod.yml build ${2:-} ;;
    update)
        git pull
        docker compose -f deploy/docker-compose.prod.yml build
        docker compose -f deploy/docker-compose.prod.yml up -d
        ;;
    shell)        docker compose -f deploy/docker-compose.prod.yml exec backend bash ;;
    dbshell)      docker compose -f deploy/docker-compose.prod.yml exec postgres psql -U docproc docproc ;;
    env)          cat .env ;;
    *)
        echo ""
        echo "  DocProc Management"
        echo ""
        echo "  Usage: docproc <command>"
        echo ""
        echo "  Commands:"
        echo "    up/start     Start all services"
        echo "    down/stop    Stop all services"
        echo "    restart      Restart services"
        echo "    logs [svc]   View logs (tail -f)"
        echo "    ps/status    Show running containers"
        echo "    build [svc]  Rebuild images"
        echo "    update       Git pull + rebuild + restart"
        echo "    shell        Bash into backend container"
        echo "    dbshell      PostgreSQL interactive shell"
        echo "    env          Show current .env"
        echo ""
        ;;
esac
MGMTEOF

chmod +x /usr/local/bin/docproc
ok "Management command installed: 'docproc' (run from anywhere)"

# =============================================================================
# Setup log rotation
# =============================================================================
cat > /etc/logrotate.d/docproc << LOGEOF
/opt/docproc/deploy/*.log {
    daily
    missingok
    rotate 14
    compress
    notifempty
}
LOGEOF

# =============================================================================
# Final Summary
# =============================================================================
echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║              DocProc Installation Complete               ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Access:"
if [ -n "$EMAIL" ] && [ -d "/etc/letsencrypt/live/$DOMAIN" ] 2>/dev/null; then
    echo "    App:          https://$DOMAIN"
    echo "    API Docs:     https://$DOMAIN/docs"
    echo "    Health:       https://$DOMAIN/health"
else
    echo "    App:          http://$DOMAIN"
    echo "    API Docs:     http://$DOMAIN/docs"
    echo "    Health:       http://$DOMAIN/health"
fi
echo "    MinIO Console: http://$DOMAIN:9001"
echo ""
echo "  Management:"
echo "    docproc status    — show running services"
echo "    docproc logs      — tail all logs"
echo "    docproc update    — pull & redeploy"
echo "    docproc restart   — restart all services"
echo ""
echo "  Files:"
echo "    Project:    $DEPLOY_DIR"
echo "    Env:        $DEPLOY_DIR/.env"
echo "    Compose:    $DEPLOY_DIR/deploy/docker-compose.prod.yml"
echo ""
echo "  IMPORTANT — Next Steps:"
echo "    1. Edit .env to add your LLM API key:"
echo "       nano $DEPLOY_DIR/.env"
echo "    2. Restart after editing:"
echo "       docproc restart"
echo ""
echo "  Credentials saved to: $DEPLOY_DIR/.credentials"
echo ""

# Save credentials file
cat > "$DEPLOY_DIR/.credentials" << CREDEOF
# DocProc Auto-Generated Credentials
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# KEEP THIS FILE SECURE — delete after noting credentials

PostgreSQL Password: ${POSTGRES_PASSWORD}
Redis Password:      ${REDIS_PASSWORD}
JWT Secret:          ${JWT_SECRET}
MinIO Password:      ${MINIO_PASSWORD}

Database URL: postgresql://docproc:${POSTGRES_PASSWORD}@localhost:5432/docproc
CREDEOF

chmod 600 "$DEPLOY_DIR/.credentials"
chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR/.credentials"

warn "Save your credentials from $DEPLOY_DIR/.credentials then delete the file!"
echo ""
