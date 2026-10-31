#!/usr/bin/env bash
# Writes a compressed database dump to backups/. Copy it off-site; storage objects need their own backup.
set -euo pipefail
mkdir -p backups
file="backups/dar-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" --no-owner "$POSTGRES_DB"' | gzip > "$file"
[ -s "$file" ] && echo "$file"
