#!/usr/bin/env bash
# Деплой на VPS: git pull → docker build → migrate → up
# Использование: ./deploy.sh <user@host>
#   Пример: ./deploy.sh root@89.124.113.209
set -euo pipefail

REMOTE="${1:?Usage: ./deploy.sh user@host}"
HOST="${REMOTE##*@}"

echo "==> Pulling latest code on VPS..."
ssh "$REMOTE" "cd /opt/quorum && git pull"

echo "==> Building server image on VPS..."
ssh "$REMOTE" "cd /opt/quorum/infra && docker compose -f docker-compose.ip.yml --env-file .env.prod build server"

echo "==> Starting services..."
ssh "$REMOTE" "cd /opt/quorum/infra && docker compose -f docker-compose.ip.yml --env-file .env.prod up -d"

echo "==> Running migrations..."
ssh "$REMOTE" "cd /opt/quorum/infra && docker compose -f docker-compose.ip.yml --env-file .env.prod run --rm server node dist/db/migrate.js"

echo "==> Health check..."
sleep 3
curl -sf "http://$HOST:4421/health" && echo " OK" || echo " FAILED — check: ssh $REMOTE docker logs quorum-server --tail 50"
