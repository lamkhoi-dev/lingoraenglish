#!/bin/sh
# Mục 3.5: "Có phương án sao lưu dữ liệu định kỳ và quy trình khôi phục đã được
# kiểm chứng." Runs ON THE VPS, against the Postgres container.
#
# Install (once, on the VPS):
#   scp deploy/backup-db.sh root@221.132.19.75:/root/lingoraenglish-app/
#   ssh root@221.132.19.75 "chmod +x /root/lingoraenglish-app/backup-db.sh"
#   ssh root@221.132.19.75 "crontab -l 2>/dev/null; echo '15 3 * * * /root/lingoraenglish-app/backup-db.sh >> /var/log/lingora-backup.log 2>&1'" | ssh root@221.132.19.75 "crontab -"
#   -> nightly at 03:15 server time.
#
# RESTORE — the half that matters, and the half people discover is broken when
# they finally need it. Verify it on a scratch database, never straight onto
# production:
#   1. gunzip -c /root/backups/lingoraenglish-YYYY-MM-DD.sql.gz > /tmp/restore.sql
#   2. docker exec -i lingoraenglish-postgres psql -U lingora -d postgres \
#        -c "create database restore_check;"
#   3. docker exec -i lingoraenglish-postgres psql -U lingora -d restore_check < /tmp/restore.sql
#   4. docker exec lingoraenglish-postgres psql -U lingora -d restore_check \
#        -c "select count(*) from profiles;" -c "select count(*) from subscriptions;"
#      -> compare against production; if the numbers match, this backup is good.
#   5. docker exec lingoraenglish-postgres psql -U lingora -d postgres \
#        -c "drop database restore_check;"
#   Only after that check should a real restore replace the live database.
set -e

CONTAINER=lingoraenglish-postgres
DB_USER=lingora
DB_NAME=lingoraenglish
BACKUP_DIR=/root/backups
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%F)
TARGET="$BACKUP_DIR/lingoraenglish-$STAMP.sql.gz"

echo "[$(date -Is)] backing up $DB_NAME -> $TARGET"

# --clean --if-exists so the dump can be replayed onto a database that already
# has objects. Written to a .part file first and moved only on success, so an
# interrupted run can never leave a truncated file looking like a good backup.
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
  | gzip -9 > "$TARGET.part"
mv "$TARGET.part" "$TARGET"

SIZE=$(du -h "$TARGET" | cut -f1)

# A dump that cannot be read back is not a backup. Cheap integrity check: the
# gzip stream must decompress cleanly and end with pg_dump's completion marker.
if ! gunzip -t "$TARGET" 2>/dev/null; then
  echo "[$(date -Is)] FAILED: $TARGET is not a valid gzip stream"
  exit 1
fi
if ! gunzip -c "$TARGET" | tail -5 | grep -q "PostgreSQL database dump complete"; then
  echo "[$(date -Is)] FAILED: $TARGET is truncated (no completion marker)"
  exit 1
fi

echo "[$(date -Is)] ok: $TARGET ($SIZE), verified readable"

find "$BACKUP_DIR" -name 'lingoraenglish-*.sql.gz' -mtime +$KEEP_DAYS -delete
echo "[$(date -Is)] pruned backups older than $KEEP_DAYS days"
