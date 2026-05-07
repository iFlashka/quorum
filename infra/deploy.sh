#!/usr/bin/env bash
# Собирает сервер и загружает артефакты на VPS.
# Использование: ./deploy.sh <vps-user>@<vps-host>
#   Пример: ./deploy.sh root@89.124.113.209
set -euo pipefail

REMOTE="${1:?Usage: ./deploy.sh user@host}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$REPO_ROOT/apps/server"
INFRA_DIR="$REPO_ROOT/infra"
DIST_DEST="$INFRA_DIR/server-dist"

echo "==> Building server..."
cd "$REPO_ROOT"
pnpm --filter @quorum/server build

echo "==> Preparing server-dist..."
rm -rf "$DIST_DEST"
mkdir -p "$DIST_DEST"
cp -r "$SERVER_DIR/dist" "$DIST_DEST/dist"
cp "$SERVER_DIR/package.json" "$DIST_DEST/package.json"

echo "==> Uploading server-dist to $REMOTE:/opt/quorum/infra/server-dist ..."
rsync -az --delete "$DIST_DEST/" "$REMOTE:/opt/quorum/infra/server-dist/"

echo "==> Pulling latest infra config on VPS..."
ssh "$REMOTE" "cd /opt/quorum && git pull"

echo "==> Building Docker image and restarting server..."
ssh "$REMOTE" "cd /opt/quorum/infra && docker compose -f docker-compose.ip.yml --env-file .env.prod build server && docker compose -f docker-compose.ip.yml --env-file .env.prod up -d server"

echo "==> Running migrations..."
ssh "$REMOTE" "cd /opt/quorum/infra && docker compose -f docker-compose.ip.yml --env-file .env.prod run --rm server node dist/db/migrate.js"

echo "==> Done. Health check..."
sleep 3
curl -sf "http://${REMOTE##*@}:4421/health" && echo " OK" || echo " FAILED — check logs"
