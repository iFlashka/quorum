#!/usr/bin/env bash
# Daily PostgreSQL backup для Quorum prod.
# Поставь на cron: 0 3 * * * /opt/quorum/infra/backup.sh
#
# Хранит 7 последних дампов в data/backups/, старые удаляет.
# Дампы gzip'ятся, имена с timestamp.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$ROOT_DIR/data/backups"
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT_FILE="$BACKUP_DIR/quorum_$TIMESTAMP.sql.gz"

# pg_dump через docker exec — постгрес не выставляет порт наружу в prod.
docker exec quorum-postgres \
  pg_dump -U quorum -d quorum --no-owner --no-acl \
  | gzip -9 > "$OUT_FILE"

if [ ! -s "$OUT_FILE" ]; then
  echo "Backup FAILED — пустой файл: $OUT_FILE" >&2
  rm -f "$OUT_FILE"
  exit 1
fi

find "$BACKUP_DIR" -name 'quorum_*.sql.gz' -mtime +$RETENTION_DAYS -delete

echo "Backup OK: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
