#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_DIR="${ASCULTICOR_APP_DIR:-/opt/asculticor}"
BACKUP_ROOT="${ASCULTICOR_BACKUP_ROOT:-/var/backups/asculticor}"
RESTIC_ENV="${ASCULTICOR_RESTIC_ENV:-/root/.config/asculticor-restic.env}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
STAGE="$BACKUP_ROOT/.stage-$STAMP"
ARCHIVE="$BACKUP_ROOT/asculticor-$STAMP.tar.gz"

cleanup() {
  rm -rf "$STAGE"
}
trap cleanup EXIT

mkdir -p "$STAGE/config" "$STAGE/n8n/workflows" "$STAGE/n8n/credentials"
cp "$APP_DIR/.env" "$APP_DIR/docker-compose.yml" \
  "$APP_DIR/docker-compose.cloud.yml" "$STAGE/config/"
cp -a "$APP_DIR/nginx/certs" "$STAGE/config/"

if docker ps --format '{{.Names}}' | grep -qx asculticor-n8n; then
  export_dir=/home/node/.n8n/backup-export
  docker exec -u node asculticor-n8n rm -rf "$export_dir"
  docker exec -u node asculticor-n8n mkdir -p \
    "$export_dir/workflows" "$export_dir/credentials"
  docker exec -u node asculticor-n8n \
    n8n export:workflow --backup --output="$export_dir/workflows" || true
  docker exec -u node asculticor-n8n \
    n8n export:credentials --backup --output="$export_dir/credentials" || true
  docker cp "asculticor-n8n:$export_dir/." "$STAGE/n8n/"
  docker exec -u node asculticor-n8n rm -rf "$export_dir"
fi

tar -C "$STAGE" -czf "$ARCHIVE" .
find "$BACKUP_ROOT" -maxdepth 1 -type f \
  -name 'asculticor-*.tar.gz' -mtime +14 -delete

if [[ -f "$RESTIC_ENV" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$RESTIC_ENV"
  set +a
  restic backup "$ARCHIVE" --tag asculticor-production
  restic forget --tag asculticor-production \
    --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
fi
