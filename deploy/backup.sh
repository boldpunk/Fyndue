#!/usr/bin/env bash
# Nightly backup of the Fyndue database and documents (docs/deployment.md, step 8).
#   crontab (as ubuntu): 30 22 * * * BACKUP_DIR=$HOME/backups /opt/fyndue/deploy/backup.sh >> $HOME/backups/backup.log 2>&1
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/fyndue}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H%M)"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
cd "$APP_DIR"

# Consistent SQL dump from the running database container.
docker compose exec -T db pg_dump -U fyndue -d fyndue --format=custom > "$BACKUP_DIR/db_$STAMP.dump"

# Documents volume as a tarball.
docker run --rm -v fyndue_documents:/data:ro -v "$BACKUP_DIR":/backup alpine:3.22 \
  tar -czf "/backup/documents_$STAMP.tar.gz" -C /data .

chmod 600 "$BACKUP_DIR"/*_"$STAMP".*
find "$BACKUP_DIR" -type f -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: db_$STAMP.dump documents_$STAMP.tar.gz"
