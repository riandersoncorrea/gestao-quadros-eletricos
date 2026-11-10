// Entrada do gerador (empacotada por generate-checklist-sql.mjs). Ver o
// cabeçalho daquele arquivo para o uso.

import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { parseRecords, buildPlan, TEMPLATE_ITEMS } from "./checklistRules.js";

// `require` (para o xlsx) vem do banner do empacotamento em generate-checklist-sql.mjs.

function parseArgs(argv) {
  const a = { unit: "EFC", prazoBase: "importacao" };
  for (let i = 0; i < argv.length; i++) {
    const [k, v] = [argv[i], argv[i + 1]];
    if (k === "--file") (a.file = v), i++;
    else if (k === "--photos") (a.photos = v), i++;
    else if (k === "--storage-url") (a.storageUrl = v), i++;
    else if (k === "--storage-folder") (a.folder = v), i++;
    else if (k === "--aliases") (a.aliases = v), i++;
    else if (k === "--prazo-base") (a.prazoBase = v), i++;
    else if (k === "--import-date") (a.importDate = v), i++;
    else if (k === "--out") (a.out = v), i++;
    else if (k === "--split-by-city") a.split = true;
    else throw new Error(`Argumento desconhecido: ${k}`);
  }
  for (const k of ["file", "photos", "storageUrl", "folder", "out"]) if (!a[k]) throw new Error(`Obrigatório: --${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}`);
  if (!["importacao", "inspecao"].includes(a.prazoBase)) throw new Error("--prazo-base: importacao | inspecao");
  if (!/^[a-z0-9-]+$/.test(a.folder)) throw new Error("--storage-folder inválido");
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(a.storageUrl)) throw new Error("--storage-url: https://<projeto>.supabase.co");
  return a;
}

const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const values = (rows, cols) => rows.map((r) => `  (${cols.map((c) => q(r[c])).join(", ")})`).join(",\n");

function localDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const XLSX = require("xlsx");
  const wb = XLSX.readFile(args.file, { cellDates: false });
  const ws = wb.Sheets.Forms;
  if (!ws) throw new Error('Aba "Forms" não encontrada');
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
  const links = (r, c) => ws[XLSX.utils.encode_cell({ r, c })]?.l?.Target || null;
  const aliases = args.aliases ? JSON.parse(readFileSync(args.aliases, "utf8")) : {};

  const records = parseRecords(rows, links, aliases);
  const photoMap = JSON.parse(readFileSync(args.photos, "utf8")); // { TAG: { externa, interna, diagrama } }
  const importDate = args.importDate ? localDate(args.importDate) : new Date();
  const pathsByTag = {};
  const plan = buildPlan(records, {
    uuid: randomUUID,
    photoUrl: (tag, k) => {
      const f = photoMap[tag]?.[k];
      if (!f) return null;
      (pathsByTag[tag] ??= []).push(`${args.folder}/${f}`);
      return `${args.storageUrl}/storage/v1/object/public/uploads/${args.folder}/${f}`;
    },
    prazoBase: (rec) => (args.prazoBase === "inspecao" ? localDate(rec.inspectionDate) : importDate),
  });

  // Uma parte = um arquivo/transação. Com --split-by-city: uma por sigla da
  // TAG (= cidade), para caber no limite de tamanho do SQL Editor.
  const cityOf = (tag) => tag.split("_")[0];
  const patioBySigla = {};
  for (const r of records) patioBySigla[cityOf(r.tag)] ??= r.patio;
  const groups = args.split ? [...new Set(records.map((r) => cityOf(r.tag)))].sort() : [null];
  const outFor = (g) => (g ? args.out.replace(/\.sql$/, "") + `_${g}.sql` : args.out);
  let total = 0;
  for (const g of groups) {
    const inspIds = new Set(plan.inspections.filter((i) => !g || cityOf(i.tag) === g).map((i) => i.id));
    // respostas não têm tag: vão com a inspeção
    const inPart = (row) => !g || (row.tag ? cityOf(row.tag) === g : inspIds.has(row.inspection_id));
    const part = Object.fromEntries(Object.entries(plan).map(([k, rows]) => [k, rows.filter(inPart)]));
    const paths = Object.entries(pathsByTag).filter(([tag]) => !g || cityOf(tag) === g).flatMap(([, v]) => v);
    const label = g ? ` — ${patioBySigla[g]} (${g})` : "";
    const sql = renderSql(part, paths, label);
    writeFileSync(outFor(g), sql);
    total += part.inspections.length;
    console.log(`${outFor(g)}: ${part.inspections.length} inspeções, ${part.ncs.length} NCs, ${paths.length} fotos (${(sql.length / 1048576).toFixed(2)} MB)`);
  }
  if (total !== records.length) throw new Error(`Partes somam ${total}, esperado ${records.length}`);
  const sevAll = {};
  for (const n of plan.ncs) sevAll[n.severidade] = (sevAll[n.severidade] || 0) + 1;
  console.log(`Registros: ${records.length} | respostas ${plan.responses.length} | NCs ${plan.ncs.length} | ações ${plan.actions.length} | flags ${plan.flags.length}`);
  console.log("NCs por severidade:", sevAll);

  function renderSql(plan, storagePaths, label) {
  const inspectors = {};
  for (const i of plan.inspections) inspectors[i.inspector_name] = (inspectors[i.inspector_name] || 0) + 1;
  const sev = {};
  for (const n of plan.ncs) sev[n.severidade] = (sev[n.severidade] || 0) + 1;
  const dates = plan.inspections.map((i) => i.inspection_date).sort();

  const sql = `-- ============================================================================
-- Importação de checklists históricos (ValeForms) — unidade ${args.unit}${label}
-- ============================================================================
-- Gerado por scripts/checklist-import/generate-checklist-sql.mjs a partir de
-- ${basename(args.file)} em ${new Date().toISOString().slice(0, 10)}.
-- CONTÉM DADOS REAIS: fica em supabase/private/ (fora do repositório público).
--
-- Pré-requisitos (o próprio script confere e aborta sem gravar nada):
--   - migration 0035 aplicada (electrical_panels.photo_interna_url);
--   - as ${storagePaths.length} fotos já enviadas ao bucket "uploads", pasta ${args.folder}/;
--   - os ${plan.inspections.length} quadros existem na unidade ${args.unit} (por TAG) e NÃO têm
--     inspeção importada do ValeForms (reexecução recusada);
--   - os ${TEMPLATE_ITEMS.length} itens existem no modelo de checklist ativo, com o mesmo módulo.
--
-- Conteúdo:
--   inspeções ${plan.inspections.length} (${dates[0]} a ${dates[dates.length - 1]}), respostas ${plan.responses.length},
--   NCs ${plan.ncs.length} (${Object.entries(sev).map(([k, v]) => `${k} ${v}`).join(", ")}), ações automáticas ${plan.actions.length}
--   (sem responsável — atribuição manual; prazo pela severidade a partir da
--   ${args.prazoBase === "inspecao" ? "data da inspeção" : `data da importação, ${importDate.toISOString().slice(0, 10)}`}), flags de análise ${plan.flags.length}.
--   Quadro: foto externa e interna (só se vazias), diagrama unifilar como
--   anexo, última/próxima inspeção, Índice de Saúde (pesos do banco).
--   Inspetores: ${Object.entries(inspectors).map(([k, v]) => `${k} (${v})`).join("; ")}.
--
-- Uma transação: qualquer erro desfaz tudo. Rodar inteiro no SQL Editor.
-- ============================================================================

begin;

create temp table _imp_insp (id uuid primary key, tag text not null unique, inspection_date date not null,
  inspector_name text not null, observacoes text, photo_url text, created_at timestamptz not null) on commit drop;
insert into _imp_insp (id, tag, inspection_date, inspector_name, observacoes, photo_url, created_at) values
${values(plan.inspections, ["id", "tag", "inspection_date", "inspector_name", "observacoes", "photo_url", "created_at"])};

create temp table _imp_resp (inspection_id uuid not null, codigo text not null, modulo int not null, resposta text not null,
  observacao text, justificativa text, motivo text, evidencia_url text, created_at timestamptz not null) on commit drop;
insert into _imp_resp (inspection_id, codigo, modulo, resposta, observacao, justificativa, motivo, evidencia_url, created_at) values
${values(plan.responses, ["inspection_id", "codigo", "modulo", "resposta", "observacao", "justificativa", "motivo", "evidencia_url", "created_at"])};

create temp table _imp_nc (id uuid primary key, inspection_id uuid not null, tag text not null, codigo text not null,
  categoria text, descricao text not null, evidencia_url text, severidade text not null, created_at timestamptz not null) on commit drop;
insert into _imp_nc (id, inspection_id, tag, codigo, categoria, descricao, evidencia_url, severidade, created_at) values
${values(plan.ncs, ["id", "inspection_id", "tag", "codigo", "categoria", "descricao", "evidencia_url", "severidade", "created_at"])};

create temp table _imp_acao (nonconformity_id uuid not null unique, tag text not null, descricao text not null,
  prazo date not null, created_at timestamptz not null) on commit drop;
insert into _imp_acao (nonconformity_id, tag, descricao, prazo, created_at) values
${values(plan.actions, ["nonconformity_id", "tag", "descricao", "prazo", "created_at"])};

create temp table _imp_flag (inspection_id uuid not null, tag text not null, tipo text not null, categoria text,
  severidade text, mensagem text, created_at timestamptz not null) on commit drop;
insert into _imp_flag (inspection_id, tag, tipo, categoria, severidade, mensagem, created_at) values
${values(plan.flags, ["inspection_id", "tag", "tipo", "categoria", "severidade", "mensagem", "created_at"])};

create temp table _imp_quadro (tag text primary key, inspection_id uuid not null, photo_url text, photo_interna_url text,
  diagrama_url text, inspection_date date not null) on commit drop;
insert into _imp_quadro (tag, inspection_id, photo_url, photo_interna_url, diagrama_url, inspection_date) values
${values(plan.panels, ["tag", "inspection_id", "photo_url", "photo_interna_url", "diagrama_url", "inspection_date"])};

create temp table _imp_foto (name text primary key) on commit drop;
insert into _imp_foto (name) values
${storagePaths.map((p) => `  (${q(p)})`).join(",\n")};

-- Quadros da unidade, por TAG.
create temp table _imp_panel on commit drop as
select q.tag, p.id as panel_id, p.name as panel_name, p.inspection_frequency, p.unidade_operacional_id
  from _imp_quadro q
  join public.electrical_panels p on p.tag = q.tag
  join public.unidades_operacionais u on u.id = p.unidade_operacional_id and u.codigo = ${q(args.unit)};

-- Itens do modelo ativo, por código.
create temp table _imp_item on commit drop as
select i.id, i.codigo, i.modulo, i.modulo_nome, i.titulo, i.obrigatorio, t.id as template_id
  from public.inspection_template_items i
  join public.inspection_templates t on t.id = i.template_id
 where t.ativo and i.ativo;

-- ---------------------------------------------------------------------------
-- Conferências: qualquer falha aborta antes de gravar.
-- ---------------------------------------------------------------------------
do $$
declare v_n int; v_lista text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'electrical_panels' and column_name = 'photo_interna_url') then
    raise exception 'ABORTADO: migration 0035 (photo_interna_url) não aplicada';
  end if;

  select count(*), string_agg(q.tag, ', ') into v_n, v_lista from _imp_quadro q
   where not exists (select 1 from _imp_panel p where p.tag = q.tag);
  if v_n > 0 then raise exception 'ABORTADO: % TAG(s) fora da unidade ${args.unit}: %', v_n, v_lista; end if;

  if (select count(distinct template_id) from _imp_item) <> 1 then
    raise exception 'ABORTADO: esperado exatamente 1 modelo de checklist ativo';
  end if;
  select count(*), string_agg(r.codigo, ', ') into v_n, v_lista
    from (select distinct codigo, modulo from _imp_resp) r
   where not exists (select 1 from _imp_item i where i.codigo = r.codigo and i.modulo = r.modulo);
  if v_n > 0 then raise exception 'ABORTADO: itens ausentes/diferentes no modelo ativo: %', v_lista; end if;

  select count(*) into v_n from public.inspections i join _imp_panel p on p.panel_id = coalesce(i.panel_ref_id, i.panel_id)
   where i.observacoes like 'Checklist importado do ValeForms%';
  if v_n > 0 then raise exception 'ABORTADO: já existem % inspeção(ões) importada(s) do ValeForms nesses quadros', v_n; end if;

  select count(*) into v_n from _imp_foto f
   where not exists (select 1 from storage.objects o where o.bucket_id = 'uploads' and o.name = f.name);
  if v_n > 0 then raise exception 'ABORTADO: % foto(s) ainda não enviada(s) ao Storage (uploads/${args.folder}/)', v_n; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Gravação (a unidade de cada linha é herdada do quadro/inspeção pelo trigger).
-- ---------------------------------------------------------------------------
insert into public.inspections (id, panel_id, panel_ref_id, panel_name, inspection_date, inspector_name, frequency,
  next_inspection, overall_result, observacoes, photo_url, template_id, status, created_at, updated_at)
select s.id, p.panel_id, p.panel_id, p.panel_name, s.inspection_date, s.inspector_name, p.inspection_frequency,
       case p.inspection_frequency when 'mensal' then s.inspection_date + interval '1 month'
                                   when 'trimestral' then s.inspection_date + interval '3 months'
                                   when 'semestral' then s.inspection_date + interval '6 months'
                                   when 'anual' then s.inspection_date + interval '12 months' end::date,
       'aprovado', s.observacoes, s.photo_url, (select distinct template_id from _imp_item), 'executada', s.created_at, s.created_at
  from _imp_insp s join _imp_panel p on p.tag = s.tag;

insert into public.inspection_responses (inspection_id, template_item_id, modulo, titulo, resposta, justificativa,
  motivo, observacao, evidencia_url, created_at, updated_at)
select r.inspection_id, i.id, i.modulo, i.titulo, r.resposta, r.justificativa, r.motivo, r.observacao, r.evidencia_url, r.created_at, r.created_at
  from _imp_resp r join _imp_item i on i.codigo = r.codigo;

-- Resultado geral (computeOverall): reprovado se NC em item obrigatório; com ressalvas se só em opcional.
update public.inspections ins
   set overall_result = case when exists (select 1 from _imp_resp r join _imp_item i on i.codigo = r.codigo
                                           where r.inspection_id = ins.id and r.resposta = 'nao_conforme' and i.obrigatorio) then 'reprovado'
                             when exists (select 1 from _imp_resp r where r.inspection_id = ins.id and r.resposta = 'nao_conforme') then 'aprovado_ressalvas'
                             else 'aprovado' end
 where ins.id in (select id from _imp_insp);

insert into public.nonconformities (id, panel_id, tag, inspection_id, template_item_id, categoria, descricao,
  evidencia_url, severidade, status, origem, created_at, updated_at)
select n.id, p.panel_id, n.tag, n.inspection_id, i.id, coalesce(i.modulo_nome, n.categoria), n.descricao,
       n.evidencia_url, n.severidade, 'aberta', 'inspecao', n.created_at, n.created_at
  from _imp_nc n join _imp_panel p on p.tag = n.tag join _imp_item i on i.codigo = n.codigo;

insert into public.actions (nonconformity_id, panel_id, descricao, responsavel, responsavel_id, prazo, status, origem, created_at, updated_at)
select a.nonconformity_id, p.panel_id, a.descricao, null, null, a.prazo, 'aberta', 'automatica', a.created_at, a.created_at
  from _imp_acao a join _imp_panel p on p.tag = a.tag;

insert into public.analysis_flags (inspection_id, panel_id, tipo, categoria, severidade, mensagem, created_at)
select f.inspection_id, p.panel_id, f.tipo, f.categoria, f.severidade, f.mensagem, f.created_at
  from _imp_flag f join _imp_panel p on p.tag = f.tag;

-- Índice de Saúde (domain/healthIndex.js): nota por dimensão = % conforme;
-- média ponderada pelos pesos ativos de health_index_config. Sem medições/termografia.
with dim as (
  select r.inspection_id,
         case r.modulo when 1 then 'documentacao' when 10 then 'documentacao' when 2 then 'seguranca'
                       when 3 then 'integridade_fisica' when 4 then 'protecoes' when 5 then 'conexoes_barramentos'
                       when 6 then 'conexoes_barramentos' when 7 then 'aterramento' end as dimensao,
         round(100.0 * count(*) filter (where r.resposta = 'conforme') / count(*)) as score
    from _imp_resp r where r.resposta in ('conforme', 'nao_conforme')
   group by 1, 2
), idx as (
  select d.inspection_id, round(sum(c.peso * d.score) / nullif(sum(c.peso), 0)) as indice
    from dim d join public.health_index_config c on c.dimensao = d.dimensao and c.ativo is not false and c.peso > 0
   group by 1
)
update public.inspections ins set health_index_resultado = idx.indice from idx where idx.inspection_id = ins.id;

-- Quadro: fotos só se vazias; datas de inspeção; Índice de Saúde da inspeção mais recente.
update public.electrical_panels e
   set photo_url = coalesce(nullif(e.photo_url, ''), q.photo_url),
       photo_interna_url = coalesce(nullif(e.photo_interna_url, ''), q.photo_interna_url),
       last_inspection_date = greatest(e.last_inspection_date, q.inspection_date),
       next_inspection_date = case when e.last_inspection_date is null or q.inspection_date >= e.last_inspection_date
                                   then coalesce(ins.next_inspection, e.next_inspection_date) else e.next_inspection_date end,
       health_index = case when e.last_inspection_date is null or q.inspection_date >= e.last_inspection_date
                           then ins.health_index_resultado else e.health_index end,
       health_index_updated_at = case when e.last_inspection_date is null or q.inspection_date >= e.last_inspection_date
                                      then now() else e.health_index_updated_at end
  from _imp_quadro q join _imp_panel p on p.tag = q.tag join public.inspections ins on ins.id = q.inspection_id
 where e.id = p.panel_id;

insert into public.panel_attachments (panel_id, tipo, file_url, file_name, created_at)
select p.panel_id, 'diagrama_unifilar', q.diagrama_url,
       'Diagrama unifilar — checklist ValeForms ' || to_char(q.inspection_date, 'DD/MM/YYYY') || '.jpg', now()
  from _imp_quadro q join _imp_panel p on p.tag = q.tag
 where q.diagrama_url is not null
   and not exists (select 1 from public.panel_attachments a where a.panel_id = p.panel_id and a.file_url = q.diagrama_url);

insert into public.panel_condition_history (panel_id, snapshot_at, health_index, status, criticality, nc_abertas,
  nc_criticas, nc_altas, acoes_abertas, acoes_atrasadas, latitude, longitude, localidade_id, source)
select e.id, now(), e.health_index, e.status, e.criticality,
       (select count(*) from public.nonconformities n where n.panel_id = e.id and n.status not in ('concluida', 'cancelada')),
       (select count(*) from public.nonconformities n where n.panel_id = e.id and n.status not in ('concluida', 'cancelada') and n.severidade = 'critica'),
       (select count(*) from public.nonconformities n where n.panel_id = e.id and n.status not in ('concluida', 'cancelada') and n.severidade = 'alta'),
       (select count(*) from public.actions a where a.panel_id = e.id and a.status not in ('concluida', 'cancelada')),
       (select count(*) from public.actions a where a.panel_id = e.id and a.status not in ('concluida', 'cancelada') and a.prazo < current_date),
       e.latitude, e.longitude, e.localidade_id, 'importacao'
  from public.electrical_panels e join _imp_panel p on p.panel_id = e.id;

-- Conferência final (dentro da transação).
do $$
declare v_i int; v_r int; v_n int; v_a int;
begin
  select count(*) into v_i from public.inspections where id in (select id from _imp_insp);
  select count(*) into v_r from public.inspection_responses where inspection_id in (select id from _imp_insp);
  select count(*) into v_n from public.nonconformities where inspection_id in (select id from _imp_insp);
  select count(*) into v_a from public.actions where nonconformity_id in (select id from _imp_nc);
  if v_i <> ${plan.inspections.length} or v_r <> ${plan.responses.length} or v_n <> ${plan.ncs.length} or v_a <> ${plan.actions.length} then
    raise exception 'ABORTADO: contagem final divergente (inspeções %, respostas %, NCs %, ações %)', v_i, v_r, v_n, v_a;
  end if;
  if exists (select 1 from public.inspections i join _imp_panel p on p.panel_id = i.panel_id
              where i.id in (select id from _imp_insp) and i.unidade_operacional_id is distinct from p.unidade_operacional_id) then
    raise exception 'ABORTADO: inspeção com unidade diferente da do quadro';
  end if;
end $$;

commit;

select 'OK' as resultado,
       (select count(*) from public.inspections where observacoes like 'Checklist importado do ValeForms%') as inspecoes_importadas,
       ${plan.responses.length} as respostas, ${plan.ncs.length} as ncs, ${plan.actions.length} as acoes;
`;
  return sql;
  }
}

try {
  main();
} catch (e) {
  console.error("ERRO:", e.message);
  process.exit(1);
}
