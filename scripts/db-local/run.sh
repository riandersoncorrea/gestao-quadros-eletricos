#!/usr/bin/env bash
# =============================================================================
# Reconstrói o banco a partir das migrations do repositório num Postgres
# LOCAL e DESCARTÁVEL e roda os testes SQL (RLS por unidade, QR, importação).
#
# NUNCA aponte para o Supabase: o script recria o banco $PGDATABASE do zero.
#
# Uso (com um Postgres local rodando, ex. PostgreSQL 18 do instalador):
#   PGHOST=127.0.0.1 PGPORT=55432 PGUSER=postgres \
#   MIGRATION_0027=/caminho/0027_nc_status_segue_acoes.sql \
#   bash scripts/db-local/run.sh
#
# MIGRATION_0027 (opcional): a 0027 vive em outra branch; informe o arquivo
# para testar a compatibilidade (ele só é lido).
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/../.."
PGBIN="${PGBIN:-/Library/PostgreSQL/18/bin}"
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-55432}" PGUSER="${PGUSER:-postgres}"
DB="${PGDATABASE_LOCAL:-efc_local}"

case "$PGHOST" in
  127.0.0.1|localhost|::1) ;;
  *) echo "Recusado: PGHOST=$PGHOST não é local. Este script recria o banco do zero." >&2; exit 2 ;;
esac

psql_db() { "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

"$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB;" -c "create database $DB;"

apply() {
  local f="$1"
  if out=$(psql_db -f "$f" 2>&1); then
    echo "  ok   $(basename "$f")"
  else
    echo "  FALHA $(basename "$f")"; echo "$out" | tail -8; exit 1
  fi
}

echo "== Esqueleto Supabase + schema base"
apply scripts/db-local/00_supabase_stub.sql
apply supabase/schema.sql

echo "== Migrations existentes (0021 não existe no repositório)"
# (sem expansão {01..26}: o bash 3.2 do macOS não preenche zeros)
for f in supabase/migrations/0*.sql; do
  n=$((10#$(basename "$f" | cut -c1-4)))
  if [ "$n" -le 26 ]; then apply "$f"; fi
done
if [ -n "${MIGRATION_0027:-}" ]; then apply "$MIGRATION_0027"; fi

echo "== Dados sintéticos de São Luís (estado 'produção atual')"
apply scripts/db-local/10_seed_slz.sql

echo "== Impressão digital de São Luís ANTES"
FP_DIR=$(mktemp -d)
psql_db -tA -f supabase/tests/slz_fingerprint.sql > "$FP_DIR/antes"

echo "== Novas migrations, na ordem de execução"
for f in supabase/migrations/0028_*.sql supabase/migrations/0029_*.sql supabase/migrations/0030_*.sql; do
  apply "$f"
done

echo "== Testes de estrutura, segurança e QR (BEGIN/ROLLBACK)"
for t in supabase/tests/0028_*.test.sql supabase/tests/0029_*.test.sql supabase/tests/0030_*.test.sql; do
  [ -e "$t" ] && apply "$t"
done

# A 0031 contém o inventário real da EFC e não fica no repositório público
# (supabase/private/, ignorado pelo git). Sem o arquivo, essa etapa é pulada.
IMPORT_0031="${IMPORT_0031:-supabase/private/0031_efc_inventario.sql}"
if [ -f "$IMPORT_0031" ]; then
  echo "== Importação da EFC (0031) + conferência"
  apply "$IMPORT_0031"
  apply supabase/tests/0031_efc_inventario.check.sql
  echo "   reexecução (idempotência):"
  apply "$IMPORT_0031"
  apply supabase/tests/0031_efc_inventario.check.sql

  echo "== Testes pós-importação (isolamento com dados reais da EFC)"
  for t in supabase/tests/0031_*.test.sql; do [ -e "$t" ] && apply "$t"; done
else
  echo "== Importação da EFC (0031): arquivo ausente ($IMPORT_0031) — etapa pulada"
fi

echo "== Impressão digital de São Luís DEPOIS (deve ser idêntica)"
psql_db -tA -f supabase/tests/slz_fingerprint.sql > "$FP_DIR/depois"
if diff -q "$FP_DIR/antes" "$FP_DIR/depois" >/dev/null; then
  echo "  ok   impressão digital de São Luís idêntica"
else
  echo "  FALHA impressão digital de São Luís mudou"; diff "$FP_DIR/antes" "$FP_DIR/depois" | head; exit 1
fi
rm -rf "$FP_DIR"
echo "== TUDO OK"
