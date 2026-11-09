#!/usr/bin/env node
// Gera a migration SQL de importação de inventário de quadros para uma
// unidade operacional, a partir da planilha "Planos Quadros Elétricos"
// (mesmo layout da base de São Luís — ver inventoryRules.mjs).
//
// Uso:
//   node scripts/inventory-import/generate-inventory-sql.mjs \
//     --file "<planilha.xlsx>" --unit EFC \
//     --exclude-area Porto --exclude-area Oficina \
//     --out supabase/private/0031_efc_inventario.sql
//
// O arquivo gerado contém o inventário real e fica em supabase/private/
// (ignorado pelo git): o repositório é público.
//
// Só lê a planilha (nunca a altera) e só escreve o arquivo --out. Erros de
// validação (campo obrigatório vazio, TAG fora do padrão/duplicada, cidade
// com mais de uma sigla) interrompem a geração sem escrever nada.

import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseRows, splitByExcludedAreas, validate, sqlText } from "./inventoryRules.mjs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

function parseArgs(argv) {
  const args = { excludeAreas: [], sheet: "Plano de Manutenção", frequency: "trimestral" };
  for (let i = 0; i < argv.length; i++) {
    const [k, v] = [argv[i], argv[i + 1]];
    if (k === "--file") (args.file = v), i++;
    else if (k === "--unit") (args.unit = v), i++;
    else if (k === "--exclude-area") args.excludeAreas.push(v), i++;
    else if (k === "--out") (args.out = v), i++;
    else if (k === "--sheet") (args.sheet = v), i++;
    else if (k === "--frequency") (args.frequency = v), i++;
    else throw new Error(`Argumento desconhecido: ${k}`);
  }
  if (!args.file || !args.unit || !args.out) throw new Error("Obrigatórios: --file, --unit, --out");
  if (!/^[A-Z0-9_]{2,20}$/.test(args.unit)) throw new Error(`Código de unidade inválido: ${args.unit}`);
  return args;
}

function buildSql({ args, rows, cidades, warnings, total, excluded }) {
  const unit = sqlText(args.unit);
  const siglaByCidade = new Map(cidades.map((c) => [c.cidade, c.sigla]));
  const values = rows
    .map((r) =>
      `  (${[r.linha, sqlText(r.area), sqlText(siglaByCidade.get(r.area)), sqlText(r.predio), sqlText(r.sublocal),
        sqlText(r.tag), sqlText(r.descricao), sqlText(r.classe), sqlText(r.sapLocal), sqlText(r.sapEquipamento)].join(", ")})`
    )
    .join(",\n");

  const excludedLines = Object.entries(excluded).map(([a, list]) => `--   Área = ${a}: ${list.length} registros excluídos`).join("\n");
  const cidadeLines = cidades.map((c) => `--   ${c.cidade.padEnd(28)} ${c.sigla.padEnd(5)} ${String(c.quadros).padStart(3)} quadros`).join("\n");
  const warnLines = warnings.length ? warnings.map((w) => `--   - ${w}`).join("\n") : "--   (nenhum)";

  return `-- ============================================================================
-- Importação do inventário de quadros — unidade ${args.unit}
-- ============================================================================
-- GERADO por scripts/inventory-import/generate-inventory-sql.mjs — não editar
-- à mão; ajuste a planilha/gerador e gere de novo.
-- Fonte: ${basename(args.file)} (aba "${args.sheet}")
--
-- Filtro da base: ${total} registros na planilha
${excludedLines}
--   Restantes (unidade ${args.unit}): ${rows.length}
--
-- Cidades (coluna Área) e siglas (prefixo da TAG, conferido 1:1 com a Área):
${cidadeLines}
--
-- Avisos (não bloqueiam):
${warnLines}
--
-- Mapeamento (o mesmo da importação de São Luís, 0002):
--   Área -> localidades (cidade, com sigla e unidade ${args.unit})
--   Prédio -> locais + installation_location | Local detalhado -> sublocais + location_room
--   TAG -> tag + nomenclatura_oficial (sem alteração) | Descrição -> name
--   Classificação -> criticality | Local SAP / Nº SAP -> sap_* (null se vazio)
--   site = null (exclusivo de São Luís) | inspection_frequency = '${args.frequency}' | status = 'ativo'
--   Textos: só espaços das pontas removidos e espaços repetidos reduzidos
--   (mesma regra da 0002); grafia preservada.
--
-- Ordem: 0028 (estrutura) -> 0029 (segurança por unidade / RLS) -> 0030 (QR
-- público) -> deploy do frontend -> VALIDAÇÃO da segurança no banco -> esta.
-- Esta importação se recusa a rodar se a 0029/0030 não estiverem aplicadas.
-- Os dados entram com o dono das tabelas (SQL Editor), por isso a unidade
-- somente leitura (permite_escrita = false) não impede a carga inicial.
--
-- Aditiva e idempotente: só INSERT; nada existente é alterado. Reexecutar
-- não duplica (cidade por nome, prédio por cidade+nome, sublocal por
-- prédio+nome, quadro por TAG). Qualquer linha que não resulte em um quadro
-- da unidade ${args.unit} aborta TUDO (rollback) listando as TAGs.
-- O último SELECT mostra o resumo: importados nesta execução, já existentes
-- e rejeitados por cidade.
-- ============================================================================

begin;

do $$
begin
  if not exists (select 1 from public.unidades_operacionais where codigo = ${unit}) then
    raise exception 'Unidade operacional % não encontrada (migration 0016)', ${unit};
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'localidades' and column_name = 'sigla'
  ) then
    raise exception 'Aplique a migration 0028 antes desta importação';
  end if;
  -- Trava de segurança: sem RLS por unidade (0029) e sem o fechamento da
  -- view pública (0030), os quadros importados ficariam visíveis a qualquer
  -- conta autenticada e enumeráveis sem login.
  if to_regprocedure('public.minhas_unidades()') is null
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'electrical_panels'
                      and policyname = 'unidade: leitura' and permissive = 'RESTRICTIVE')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nonconformities'
                      and policyname = 'unidade: leitura' and permissive = 'RESTRICTIVE') then
    raise exception 'Segurança por unidade (migration 0029) não aplicada: importação bloqueada';
  end if;
  if to_regprocedure('public.get_public_panel(uuid)') is null
     or has_table_privilege('anon', 'public.panel_public_info', 'select') then
    raise exception 'QR público ainda enumerável (migration 0030 não aplicada): importação bloqueada';
  end if;
end $$;

create temp table _import_quadros (
  linha int primary key,
  cidade text not null,
  sigla text not null,
  predio text not null,
  sublocal text not null,
  tag text not null unique,
  descricao text not null,
  classe text not null,
  sap_local text,
  sap_equipamento text
) on commit drop;

create temp table _importados (tag text primary key) on commit drop;

insert into _import_quadros
  (linha, cidade, sigla, predio, sublocal, tag, descricao, classe, sap_local, sap_equipamento)
values
${values};

-- --- 1. Cidades (localidades da unidade) -------------------------------------
insert into public.localidades (nome, sigla, unidade_operacional_id)
select distinct q.cidade, q.sigla, u.id
  from _import_quadros q
 cross join public.unidades_operacionais u
 where u.codigo = ${unit}
on conflict (nome) do nothing;

-- Uma localidade com o mesmo nome já existente em OUTRA unidade (ou com outra
-- sigla) não pode ser reaproveitada: aborta em vez de misturar unidades.
do $$
declare v_conflitos text;
begin
  select string_agg(distinct q.cidade || coalesce(' [' || u.codigo || '/' || l.sigla || ']', ''), ', ')
    into v_conflitos
    from _import_quadros q
    join public.localidades l on l.nome = q.cidade
    join public.unidades_operacionais u on u.id = l.unidade_operacional_id
   where u.codigo <> ${unit} or l.sigla is distinct from q.sigla;
  if v_conflitos is not null then
    raise exception 'Localidades já existentes em outra unidade ou com outra sigla: %', v_conflitos;
  end if;
end $$;

-- --- 2. Prédios (locais) --------------------------------------------------------
insert into public.locais (localidade_id, nome)
select distinct l.id, q.predio
  from _import_quadros q
  join public.localidades l on l.nome = q.cidade
on conflict (localidade_id, nome) do nothing;

-- --- 3. Locais detalhados (sublocais) ------------------------------------------
insert into public.sublocais (local_id, nome)
select distinct lc.id, q.sublocal
  from _import_quadros q
  join public.localidades l on l.nome = q.cidade
  join public.locais lc on lc.localidade_id = l.id and lc.nome = q.predio
on conflict (local_id, nome) do nothing;

-- --- 4. Quadros ------------------------------------------------------------------
with ins as (
  insert into public.electrical_panels
    (tag, nomenclatura_oficial, name, site, criticality, sap_functional_location,
     sap_equipment_number, inspection_frequency, status, installation_location,
     location_room, localidade_id, local_id, sublocal_id, unidade_operacional_id)
  select q.tag, q.tag, q.descricao, null, q.classe, q.sap_local,
         q.sap_equipamento, '${args.frequency}', 'ativo', q.predio,
         q.sublocal, l.id, lc.id, sl.id, u.id
    from _import_quadros q
    join public.unidades_operacionais u on u.codigo = ${unit}
    join public.localidades l on l.nome = q.cidade and l.unidade_operacional_id = u.id
    join public.locais lc on lc.localidade_id = l.id and lc.nome = q.predio
    join public.sublocais sl on sl.local_id = lc.id and sl.nome = q.sublocal
   where not exists (select 1 from public.electrical_panels ep where ep.tag = q.tag)
  returning tag
)
insert into _importados (tag) select tag from ins;

-- --- 5. Conferência: toda linha precisa ter seu quadro na unidade -------------
do $$
declare v_rejeitados text;
begin
  select string_agg(q.tag, ', ' order by q.linha)
    into v_rejeitados
    from _import_quadros q
    left join public.electrical_panels ep on ep.tag = q.tag
    left join public.unidades_operacionais u on u.id = ep.unidade_operacional_id
   where ep.id is null or u.codigo <> ${unit};
  if v_rejeitados is not null then
    raise exception 'Registros rejeitados (sem quadro ou TAG já usada por outra unidade): %', v_rejeitados;
  end if;
end $$;

-- --- 6. Resumo (último resultado exibido no SQL Editor) ------------------------
select coalesce(q.cidade, 'TOTAL') as cidade,
       coalesce(q.sigla, '') as sigla,
       count(*) as linhas_planilha,
       count(i.tag) as importados_nesta_execucao,
       count(*) - count(i.tag) as ja_existentes,
       0 as rejeitados
  from _import_quadros q
  left join _importados i on i.tag = q.tag
 group by rollup ((q.cidade, q.sigla))
 order by grouping(q.cidade), count(*) desc, q.cidade;

commit;
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const wb = XLSX.readFile(args.file);
  const ws = wb.Sheets[args.sheet];
  if (!ws) throw new Error(`Aba não encontrada: ${args.sheet}`);
  const rows = parseRows(XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }));
  const { kept, excluded } = splitByExcludedAreas(rows, args.excludeAreas);
  const { errors, warnings, cidades } = validate(kept);

  console.log(`Registros na planilha: ${rows.length}`);
  for (const [a, list] of Object.entries(excluded)) console.log(`Excluídos (Área = ${a}): ${list.length}`);
  console.log(`Restantes (${args.unit}): ${kept.length}`);
  console.table(cidades.map(({ cidade, sigla, quadros }) => ({ cidade, sigla, quadros })));
  for (const w of warnings) console.log(`AVISO: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`ERRO: ${e}`);
    console.error(`${errors.length} erro(s) — nenhum SQL gerado.`);
    process.exit(1);
  }

  writeFileSync(args.out, buildSql({ args, rows: kept, cidades, warnings, total: rows.length, excluded }));
  console.log(`SQL gerado: ${args.out}`);
}

main();
