#!/bin/sh
# Runs on the VPS (called by deploy.bat over ssh). Applies every .sql file
# under migrations/ that hasn't been applied yet, in filename order, and
# remembers what it already ran in migrations/.applied so re-running this
# script (e.g. on the next deploy with no new migration) is a no-op.
set -e
cd "$(dirname "$0")/migrations"
touch .applied

applied_any=0
for f in $(ls *.sql 2>/dev/null | sort); do
  if grep -qxF "$f" .applied 2>/dev/null; then
    echo "skip (already applied): $f"
    continue
  fi
  echo "applying: $f"
  docker exec -i lingoraenglish-postgres psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$f"
  echo "$f" >> .applied
  applied_any=1
done

if [ "$applied_any" = "0" ]; then
  echo "no new migrations"
else
  echo "migrations applied"
fi
