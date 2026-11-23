#!/usr/bin/env bash
# =============================================================================
# Reconstrói o banco a partir das migrations do repositório num Postgres
# LOCAL e DESCARTÁVEL e roda os testes SQL (RLS por unidade, QR, importação).
#
# NUNCA aponte para o Supabase: o script recria o banco $PGDATABASE do zero.
#
# Uso (com um Postgres local rodando, ex. PostgreSQL 18 do instalador):
#   PGHOST=127.0.0.1 PGPORT=55432 PGUSER=postgres \
#   bash scripts/db-local/run.sh
#
# A 0027 (status da NC segue as ações) entra em produção DEPOIS da 0030/0031,
# por isso é aplicada aqui no fim, nessa mesma ordem.
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

echo "== 0027 (status da NC segue as ações), na ordem de produção: depois da 0030/0031"
apply supabase/migrations/0027_nc_status_segue_acoes.sql
apply supabase/tests/0027_nc_status_segue_acoes.test.sql
echo "   reexecução (idempotência):"
apply supabase/migrations/0027_nc_status_segue_acoes.sql
apply supabase/tests/0027_nc_status_segue_acoes.test.sql
echo "   backfill (termina em rollback, como no arquivo):"
apply supabase/backfill/0027_nc_status_segue_acoes_backfill.sql
echo "   segurança por unidade continua valendo com a 0027:"
for t in supabase/tests/0029_*.test.sql supabase/tests/0030_*.test.sql; do apply "$t"; done
echo "== 0032 (Storage: só aprovados enviam/alteram/apagam)"
apply supabase/migrations/0032_storage_upload_so_aprovados.sql
apply supabase/tests/0032_storage_upload_so_aprovados.test.sql
apply supabase/migrations/0032_storage_upload_so_aprovados.sql
echo "== 0033 (responsáveis atribuíveis por unidade)"
apply supabase/migrations/0033_responsaveis_por_unidade.sql
apply supabase/tests/0033_responsaveis_por_unidade.test.sql
apply supabase/migrations/0033_responsaveis_por_unidade.sql
echo "== 0034 (administrador local: contas novas ou da própria unidade)"
apply supabase/migrations/0034_admin_local_gerencia_propria_unidade.sql
apply supabase/tests/0034_admin_local_gerencia_propria_unidade.test.sql
apply supabase/migrations/0034_admin_local_gerencia_propria_unidade.sql
for t in supabase/tests/0029_*.test.sql supabase/tests/0033_*.test.sql; do apply "$t"; done
echo "== 0035 (foto interna do quadro)"
apply supabase/migrations/0035_quadro_foto_interna.sql
apply supabase/tests/0035_quadro_foto_interna.test.sql
apply supabase/migrations/0035_quadro_foto_interna.sql

echo "== 0036 (unidade dos registros filhos pela cadeia de vínculos — sem forja)"
fp_todas() {
  psql_db -tA -c "select md5(string_agg(t || ':' || h, '|' order by t)) from (
    select 'electrical_panels' t, md5(coalesce(string_agg(x::text, '|' order by x.id), '')) h from public.electrical_panels x union all
    select 'inspections', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.inspections x union all
    select 'inspection_responses', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.inspection_responses x union all
    select 'nonconformities', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.nonconformities x union all
    select 'actions', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.actions x union all
    select 'analysis_flags', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.analysis_flags x union all
    select 'sap_orders', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.sap_orders x union all
    select 'localidades', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.localidades x union all
    select 'profiles', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.profiles x) s;"
}
psql_db -tA -f supabase/tests/0036_vinculos_entre_unidades.check.sql | awk -F'|' '$3 != 0 && $1 != "herdar_unidade" && $2 !~ /^INFO/ { bad=1; print "  divergência: " $0 } END { exit bad }' \
  || { echo "  FALHA conferência pré-0036"; exit 1; }
echo "  ok   conferência pré-0036: nenhum registro com unidade diferente do vínculo"
FP36_ANTES=$(fp_todas)
apply supabase/migrations/0036_unidade_pela_cadeia_de_vinculos.sql
[ "$(fp_todas)" = "$FP36_ANTES" ] || { echo "  FALHA a 0036 alterou dados existentes"; exit 1; }
echo "  ok   a 0036 não alterou nenhuma linha existente"
apply supabase/tests/0036_unidade_pela_cadeia_de_vinculos.test.sql
apply supabase/tests/0036_exclusoes_e_cidade_do_quadro.test.sql
apply supabase/migrations/0036_unidade_pela_cadeia_de_vinculos.sql
apply supabase/tests/0036_exclusoes_e_cidade_do_quadro.test.sql
echo "   compatibilidade 0027–0035 com a 0036:"
for t in supabase/tests/0027_*.test.sql supabase/tests/0028_*.test.sql supabase/tests/0029_*.test.sql supabase/tests/0030_*.test.sql \
         supabase/tests/0032_*.test.sql supabase/tests/0033_*.test.sql supabase/tests/0034_*.test.sql supabase/tests/0035_*.test.sql; do
  apply "$t"
done
echo "   rollback da 0036 e reaplicação:"
apply supabase/rollback/0036_unidade_pela_cadeia_de_vinculos.rollback.sql
[ "$(psql_db -tAc "select prosecdef from pg_proc where proname = 'herdar_unidade'")" = "f" ] \
  || { echo "  FALHA rollback não restaurou herdar_unidade da 0029"; exit 1; }
[ "$(psql_db -tAc "select md5(prosrc) from pg_proc where proname = 'audit_trigger'")" = "0cfd82d7cbf45327bbd05fea9999185e" ] \
  || { echo "  FALHA rollback não restaurou audit_trigger da 0001"; exit 1; }
[ "$(psql_db -tAc "select count(*) from pg_policies where policyname in ('ação: exclusão só admin', 'checklist: exclusão só admin', 'nc: exclusão só admin')")" = "0" ] \
  || { echo "  FALHA rollback deixou policies de exclusão da 0036"; exit 1; }
apply supabase/tests/0029_seguranca_por_unidade.test.sql
apply supabase/migrations/0036_unidade_pela_cadeia_de_vinculos.sql
apply supabase/tests/0036_unidade_pela_cadeia_de_vinculos.test.sql
apply supabase/tests/0036_exclusoes_e_cidade_do_quadro.test.sql
[ "$(fp_todas)" = "$FP36_ANTES" ] || { echo "  FALHA dados mudaram com rollback/reaplicação"; exit 1; }
echo "  ok   rollback + reaplicação sem alterar dados"

echo "== 0037 (área molhada registrada pelo administrador, com auditoria)"
# Impressão digital sem as colunas novas da 0037 (o ALTER acrescenta colunas nulas).
fp_sem_0037() {
  psql_db -tA -c "select md5(string_agg(t || ':' || h, '|' order by t)) from (
    select 'inspection_responses' t, md5(coalesce(string_agg((to_jsonb(x) - array['area_molhada_registrada_por','area_molhada_registrada_em','area_molhada_justificativa'])::text, '|' order by x.id), '')) h
      from public.inspection_responses x union all
    select 'inspections', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) from public.inspections x union all
    select 'nonconformities', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) from public.nonconformities x union all
    select 'actions', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) from public.actions x) s;"
}
FP37_ANTES=$(fp_sem_0037)
apply supabase/migrations/0037_area_molhada_registro_admin.sql
[ "$(fp_sem_0037)" = "$FP37_ANTES" ] || { echo "  FALHA a 0037 alterou dados existentes"; exit 1; }
echo "  ok   a 0037 não alterou nenhuma linha existente"
apply supabase/tests/0037_area_molhada_registro_admin.test.sql
apply supabase/migrations/0037_area_molhada_registro_admin.sql
apply supabase/tests/0037_area_molhada_registro_admin.test.sql
echo "   compatibilidade 0027–0036 com a 0037:"
for t in supabase/tests/0027_*.test.sql supabase/tests/0029_*.test.sql supabase/tests/0033_*.test.sql \
         supabase/tests/0035_*.test.sql supabase/tests/0036_*.test.sql; do
  apply "$t"
done
echo "   rollback da 0037 e reaplicação:"
apply supabase/rollback/0037_area_molhada_registro_admin.rollback.sql
[ "$(psql_db -tAc "select count(*) from pg_proc where proname in ('registrar_area_molhada', 'check_area_molhada_registro')")" = "0" ] \
  || { echo "  FALHA rollback da 0037 incompleto"; exit 1; }
apply supabase/migrations/0037_area_molhada_registro_admin.sql
apply supabase/tests/0037_area_molhada_registro_admin.test.sql
[ "$(fp_sem_0037)" = "$FP37_ANTES" ] || { echo "  FALHA dados mudaram com rollback/reaplicação da 0037"; exit 1; }
echo "  ok   rollback + reaplicação da 0037 sem alterar dados"

echo "== Consultas só leitura (conferência pré-produção e relatórios B1/B2)"
for q in supabase/tests/0036_vinculos_entre_unidades.check.sql supabase/tests/efc_pendencias_b1_b2.sql \
         supabase/tests/efc_prazos_acoes.report.sql; do
  FPQ=$(fp_todas)
  psql_db -tA -f "$q" > /dev/null || { echo "  FALHA $(basename "$q")"; exit 1; }
  [ "$(fp_todas)" = "$FPQ" ] || { echo "  FALHA $(basename "$q") alterou dados"; exit 1; }
  echo "  ok   $(basename "$q") (executa e não altera dados)"
done

# Checklists históricos da EFC (ValeForms): SQL gerado por
# scripts/checklist-import/generate-checklist-sql.mjs, com dados reais — fica
# fora do repositório. As fotos não existem no Storage local: o ensaio cria as
# linhas de storage.objects que o SQL confere.
# Arquivo único ou um por cidade (--split-by-city: efc_checklists_valeforms_<SIGLA>.sql).
IMPORT_CHECKLISTS="${IMPORT_CHECKLISTS:-supabase/private/efc_checklists_valeforms}"
PARTS=()
for f in "$IMPORT_CHECKLISTS"_*.sql "$IMPORT_CHECKLISTS".sql; do [ -f "$f" ] && PARTS+=("$f"); done
if [ ${#PARTS[@]} -gt 0 ] && [ -f "$IMPORT_0031" ]; then
  echo "== Checklists históricos da EFC (${#PARTS[@]} arquivo(s))"
  echo "   sem as fotos no Storage (deve abortar sem gravar):"
  if psql_db -f "${PARTS[0]}" >/dev/null 2>&1; then echo "  FALHA importação aceitou sem fotos"; exit 1; fi
  [ "$(psql_db -tAc "select count(*) from public.inspections where observacoes like 'Checklist importado do ValeForms%'")" = "0" ] \
    || { echo "  FALHA gravou algo sem fotos"; exit 1; }
  echo "  ok   abortou sem gravar"
  for f in "${PARTS[@]}"; do
    psql_db -c "insert into storage.objects (bucket_id, name) select distinct 'uploads', m[1] from regexp_matches(pg_read_file('$(pwd)/$f'), '\(''(efc-checklists-[^'']+)''\)', 'g') as m on conflict do nothing;" >/dev/null
  done
  for f in "${PARTS[@]}"; do apply "$f"; done
  apply supabase/tests/efc_checklists_valeforms.check.sql
  echo "   reexecução (deve ser recusada):"
  if psql_db -f "${PARTS[0]}" >/dev/null 2>&1; then echo "  FALHA reexecução aceita"; exit 1; fi
  echo "  ok   reexecução recusada"
  apply supabase/tests/efc_checklists_valeforms.check.sql
  echo "   segurança por unidade com os checklists importados:"
  for t in supabase/tests/0029_*.test.sql supabase/tests/0030_*.test.sql supabase/tests/0036_*.test.sql; do apply "$t"; done
  psql_db -tA -f supabase/tests/0036_vinculos_entre_unidades.check.sql | awk -F'|' '$3 != 0 && $1 != "herdar_unidade" && $2 !~ /^INFO/ { bad=1; print "  divergência: " $0 } END { exit bad }' \
    || { echo "  FALHA vínculos entre unidades após a importação"; exit 1; }
  echo "  ok   nenhum vínculo entre unidades após a importação"
else
  echo "== Checklists históricos da EFC: arquivo ausente ($IMPORT_CHECKLISTS*) — etapa pulada"
fi
echo "== TUDO OK"
