#!/usr/bin/env bash
# Proves a backup restores: loads the newest dump into a scratch database, compares rows and the Quran hash.
set -euo pipefail
file="${1:-$(ls -t backups/*.sql.gz | head -1)}"
q() { docker compose exec -T postgres sh -c "psql -v ON_ERROR_STOP=1 -q -tA -U \"\$POSTGRES_USER\" -d $1 -c \"$2\""; }
q postgres "DROP DATABASE IF EXISTS dar_restore_test"
q postgres "CREATE DATABASE dar_restore_test"
trap 'q postgres "DROP DATABASE IF EXISTS dar_restore_test"' EXIT
gunzip -c "$file" | docker compose exec -T postgres sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d dar_restore_test' >/dev/null
sum="SELECT md5(string_agg(sha256, '' ORDER BY id)) || ':' || count(*) FROM quran_ayahs"
a=$(q dar_restore_test "$sum"); b=$(q "\$POSTGRES_DB" "$sum")
users=$(q dar_restore_test "SELECT count(*) FROM users")
echo "restored ayah hash $a; source $b; users $users"
[ "$a" = "$b" ] && echo "RESTORE OK" || { echo "RESTORE MISMATCH"; exit 1; }
