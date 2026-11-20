#!/usr/bin/env bash
# Sobe um Postgres 16 temporário, cria o esquema auth mínimo, roda a migração, a carga e os testes.
set -euo pipefail
BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
DIR=$(mktemp -d)
PORT=${PG_PORT:-55432}
"$BIN/initdb" -D "$DIR" -U postgres -A trust >/dev/null
"$BIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR" -l "$DIR/log" start >/dev/null
trap '"$BIN/pg_ctl" -D "$DIR" stop -m fast >/dev/null; rm -rf "$DIR"' EXIT
PSQL="psql -h $DIR -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$PSQL <<'SQL'
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated;
create role anon;
create role service_role bypassrls;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
SQL
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -f "$f"; done
$PSQL -f "$ROOT/supabase/seed/servicos.sql"
$PSQL -t -f "$ROOT/supabase/tests/permissoes.sql" 2>&1 | sed "s/^psql:[^ ]* NOTICE:  //" | grep -E "^(ok|TODOS)|FALHOU|ERROR"
