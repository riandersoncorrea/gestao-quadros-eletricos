// Exportação "Base RAC" da tela de Não Conformidades (domain/racExport.js,
// services/racExportService.js e racExcelService.js), contra os serviços
// reais e o banco em memória (fakeSupabase.js) com o corte de 1000 linhas do
// PostgREST ligado. Dados fictícios. Rodar: node scripts/unit-scope-tests/run.mjs
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { resetDb, writes, selects, table } from "./fakeSupabase.js";
import { configureUnitScope, clearUnitScope } from "@/lib/unitScope";
import {
  RAC_COLUMNS, buildRacRows, canExportRac, isExcludedCategory, lastInspectionByPanel, toExcelDate, ncCategoryAndDescription,
} from "@/domain/racExport";
import { fetchRacRows } from "@/services/racExportService";
import { buildRacWorkbook, exportRacExcel } from "@/services/racExcelService";
import { fetchInterdictionReport } from "@/services/interdictionReportService";
import { listForRacExport as listPanelsForRac } from "@/repositories/panelRepository";

const SLZ = { id: "u-slz", codigo: "SLZ", nome: "São Luís", ativo: true, permite_escrita: true, usa_site: true };
const EFC = { id: "u-efc", codigo: "EFC", nome: "EFC", ativo: true, permite_escrita: false, usa_site: false };
const units = [SLZ, EFC];
const asSLZ = () => configureUnitScope({ units, activeUnit: SLZ, defaultUnit: SLZ });
const asEFC = () => configureUnitScope({ units, activeUnit: EFC, defaultUnit: SLZ });
const pad = (n) => String(n).padStart(5, "0");
const byId = (rows) => new Map(rows.map((r) => [r["ID da NC"], r]));
const dia = (d) => (d ? d.toISOString().slice(0, 10) : null);

// Catálogo: dois templates (versões), com Identificação, Proteções etc.
const ITEMS = [
  { id: "ti-id03", template_id: "t1", codigo: "ID-03", titulo: "Etiqueta de circuitos afixada", modulo: 1, modulo_nome: "Identificação", ativo: true, ordem: 3 },
  { id: "ti-pro01", template_id: "t1", codigo: "PRO-01", titulo: "DR — teste funcional", modulo: 4, modulo_nome: "Proteções", ativo: true, ordem: 1 },
  { id: "ti-atr01", template_id: "t1", codigo: "ATR-01", titulo: "Aterramento do quadro", modulo: 7, modulo_nome: "Aterramento", ativo: true, ordem: 1 },
  { id: "ti-bar03", template_id: "t1", codigo: "BAR-03", titulo: "Torque das conexões", modulo: 5, modulo_nome: "Barramentos e conexões", ativo: true, ordem: 3 },
  { id: "ti-doc01-v2", template_id: "t2", codigo: "DOC-01", titulo: "Diagrama unifilar presente", modulo: 10, modulo_nome: "Documentação", ativo: true, ordem: 1 },
];

const panel = (id, unit, status, extra = {}) => ({
  id, tag: id.toUpperCase(), status, unidade_operacional_id: unit.id, site: unit === SLZ ? "porto" : null,
  localidade_id: unit === SLZ ? "l-porto" : "l-acd", local_id: null, sublocal_id: null, next_inspection_date: null, ...extra,
});
const nc = (id, panelId, item, extra = {}) => ({
  id, panel_id: panelId, template_item_id: item?.id ?? null, categoria: item?.modulo_nome ?? null,
  descricao: item ? `${item.codigo} — ${item.titulo}` : "NC manual", status: "aberta", severidade: "media",
  inspection_id: null, created_at: "2026-10-10T10:00:00Z", concluida_em: null, updated_at: "2026-10-10T10:00:00Z", ...extra,
});
const [ID03, PRO01, ATR01, BAR03, DOC01] = ITEMS;

function fixture() {
  return {
    unidades_operacionais: units,
    localidades: [
      { id: "l-porto", nome: "Porto", unidade_operacional_id: SLZ.id, sigla: null },
      { id: "l-ofc", nome: "Oficina", unidade_operacional_id: SLZ.id, sigla: null },
      { id: "l-acd", nome: "AÇAILÂNDIA", unidade_operacional_id: EFC.id, sigla: "ACD" },
    ],
    locais: [
      { id: "lc-gepeg", localidade_id: "l-porto", nome: "GEPEG" },
      { id: "lc-armazem", localidade_id: "l-ofc", nome: "ARMAZEM F1" },
      { id: "lc-patio", localidade_id: "l-acd", nome: "PATIO" },
    ],
    sublocais: [
      { id: "s-ext", local_id: "lc-gepeg", nome: "AREA EXTERNA" },
      { id: "s-galpao", local_id: "lc-armazem", nome: "GALPAO" },
      { id: "s-geral", local_id: "lc-patio", nome: "QUADRO GERAL" },
    ],
    electrical_panels: [
      // Porto, com local e sublocal, duas inspeções (a mais recente vale) e risco histórico.
      panel("p-porto", SLZ, "ativo", { tag: "TST_QD_0001", local_id: "lc-gepeg", sublocal_id: "s-ext", next_inspection_date: "2027-02-20" }),
      // Oficina, em manutenção: site pelo cadastro do quadro (site), não pela localidade.
      panel("p-ofc", SLZ, "manutencao", { tag: "TST_QD_0002", site: "oficina", localidade_id: "l-ofc", local_id: "lc-armazem", sublocal_id: "s-galpao" }),
      // Site diferente da localidade: a coluna Site segue electrical_panels.site.
      panel("p-pel", SLZ, "ativo", { tag: "TST_QD_0003", site: "pelotizacao", localidade_id: "l-ofc" }),
      panel("p-inativo", SLZ, "inativo", { tag: "TST_QD_0004" }),
      panel("p-semnc", SLZ, "ativo", { tag: "TST_QD_0005" }),
      // EFC: cidade pela localidade do quadro.
      panel("p-efc", EFC, "ativo", { tag: "ACD_QD_0001", local_id: "lc-patio", sublocal_id: "s-geral", next_inspection_date: "2027-01-01" }),
      panel("p-efc-inativo", EFC, "inativo", { tag: "ACD_QD_0002" }),
    ],
    inspections: [
      { id: "i-porto-1", panel_ref_id: "p-porto", panel_id: "p-porto", inspection_date: "2026-09-01", status: "executada", created_at: "2026-09-01" },
      { id: "i-porto-2", panel_ref_id: "p-porto", panel_id: "p-porto", inspection_date: "2026-11-20", status: "executada", created_at: "2026-11-20" },
      { id: "i-porto-canc", panel_ref_id: "p-porto", panel_id: "p-porto", inspection_date: "2026-11-25", status: "cancelada", created_at: "2026-11-25" },
      // Inspeção legada: só panel_id (texto), sem panel_ref_id.
      { id: "i-ofc-legado", panel_ref_id: null, panel_id: "p-ofc", inspection_date: "2026-08-15", status: "executada", created_at: "2026-08-15" },
      { id: "i-efc", panel_ref_id: "p-efc", panel_id: "p-efc", inspection_date: "2026-10-05", status: "executada", created_at: "2026-10-05" },
      { id: "i-efc-inativo", panel_ref_id: "p-efc-inativo", panel_id: "p-efc-inativo", inspection_date: "2026-10-06", status: "executada", created_at: "2026-10-06" },
    ],
    inspection_templates: [{ id: "t2", ativo: true, versao: 2 }, { id: "t1", ativo: false, versao: 1 }],
    inspection_template_items: ITEMS,
    inspection_responses: [
      { id: "r-atr", inspection_id: "i-porto-1", template_item_id: "ti-atr01", resposta: "nao_conforme", area_molhada: null },
      { id: "r-efc-pro", inspection_id: "i-efc", template_item_id: "ti-pro01", resposta: "nao_conforme", area_molhada: false },
    ],
    nonconformities: [
      // Porto: risco histórico por ATR-01 já corrigida (concluída).
      nc("n-atr", "p-porto", ATR01, { inspection_id: "i-porto-1", status: "concluida", concluida_em: "2026-10-01T00:00:00Z", created_at: "2026-10-01T10:00:00Z" }),
      nc("n-bar", "p-porto", BAR03, { inspection_id: "i-porto-2", status: "em_tratamento" }),
      nc("n-id-porto", "p-porto", ID03, { inspection_id: "i-porto-2" }),
      // Texto antigo gravado na NC: a descrição vem do item de origem.
      nc("n-doc", "p-porto", DOC01, { descricao: "DOC-01 — texto antigo da pergunta", categoria: "Documentacao", status: "cancelada" }),
      nc("n-ofc", "p-ofc", BAR03),
      nc("n-ofc-manual", "p-ofc", null, { categoria: "Aterramento", descricao: "Haste exposta no piso", origem: "manual" }),
      nc("n-ofc-manual-id", "p-ofc", null, { categoria: " IDENTIFICACAO ", descricao: "Placa caída", origem: "manual" }),
      nc("n-pel", "p-pel", PRO01, { inspection_id: null, created_at: "2026-11-01T10:00:00Z" }),
      nc("n-inativo", "p-inativo", BAR03),
      nc("n-inativo-atr", "p-inativo", ATR01, { created_at: "2026-09-01T10:00:00Z" }),
      nc("n-orfa", null, BAR03),
      // EFC: PRO-01 com área molhada = Não, na regra atual → não é risco.
      nc("n-efc", "p-efc", PRO01, { inspection_id: "i-efc", created_at: "2026-10-05T10:00:00Z" }),
      nc("n-efc-inativo", "p-efc-inativo", BAR03, { inspection_id: "i-efc-inativo" }),
    ],
    actions: [], v_actions: [], sap_orders: [], analysis_flags: [],
  };
}

const load = (db = fixture()) => resetDb(db, { maxRows: 1000 });
const snapshot = () => JSON.stringify(["electrical_panels", "nonconformities", "inspections", "inspection_responses", "inspection_template_items"].map(table));

beforeEach(() => { load(); asSLZ(); });

// --- Linhas -------------------------------------------------------------------------

test("RAC: uma linha por NC, sem duplicidade, colunas na ordem pedida (+ Status da NC)", async () => {
  const rows = await fetchRacRows();
  const ids = rows.map((r) => r["ID da NC"]);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), ["n-atr", "n-bar", "n-doc", "n-ofc", "n-ofc-manual", "n-pel"]);
  assert.deepEqual(Object.keys(rows[0]), RAC_COLUMNS);
  assert.deepEqual(RAC_COLUMNS.slice(0, 10), [
    "TAG", "Site", "Local", "Sublocal", "Categoria da NC", "ID da NC", "Descrição da NC",
    "Data da última inspeção", "Data da próxima inspeção", "Risco de interdição?",
  ]);
  for (const r of rows) for (const v of Object.values(r)) assert.ok(!String(v ?? "").includes("\n"), "várias NCs numa célula");
});

test("RAC: dados do quadro repetidos em cada NC dele; categoria em coluna comum", async () => {
  const porto = (await fetchRacRows()).filter((r) => r["TAG"] === "TST_QD_0001");
  assert.equal(porto.length, 3);
  const fixos = ["TAG", "Site", "Local", "Sublocal", "Data da última inspeção", "Data da próxima inspeção", "Risco de interdição?"];
  for (const r of porto) for (const c of fixos) assert.deepEqual(r[c], porto[0][c], c);
  assert.deepEqual(porto.map((r) => r["Categoria da NC"]).sort(), ["Aterramento", "Barramentos e conexões", "Documentação"]);
});

test("RAC: ID real e descrição/categoria do item de origem (não o texto antigo da NC); manual usa os dados da NC", async () => {
  const m = byId(await fetchRacRows());
  assert.equal(m.get("n-bar")["Descrição da NC"], "BAR-03 — Torque das conexões");
  assert.equal(m.get("n-doc")["Descrição da NC"], "DOC-01 — Diagrama unifilar presente");
  assert.equal(m.get("n-doc")["Categoria da NC"], "Documentação");
  assert.equal(m.get("n-ofc-manual")["Categoria da NC"], "Aterramento");
  assert.equal(m.get("n-ofc-manual")["Descrição da NC"], "Haste exposta no piso");
  assert.deepEqual(ncCategoryAndDescription({ categoria: "X", descricao: "Y" }, null), { categoria: "X", descricao: "Y" });
});

test("RAC: categoria Identificação fora (item e manual, sem acento/caixa); demais categorias preservadas", async () => {
  const rows = await fetchRacRows();
  assert.ok(!rows.some((r) => isExcludedCategory(r["Categoria da NC"])));
  assert.ok(!rows.some((r) => ["n-id-porto", "n-ofc-manual-id"].includes(r["ID da NC"])));
  assert.deepEqual([...new Set(rows.map((r) => r["Categoria da NC"]))].sort(),
    ["Aterramento", "Barramentos e conexões", "Documentação", "Proteções"]);
  for (const v of ["Identificação", "identificacao", " IDENTIFICAÇÃO "]) assert.ok(isExcludedCategory(v), v);
  for (const v of ["Documentação", "Identificação do circuito", "", null]) assert.ok(!isExcludedCategory(v), String(v));
  // Nada foi apagado: as NCs de Identificação continuam no banco.
  assert.ok(table("nonconformities").some((n) => n.id === "n-id-porto"));
});

test("RAC: todos os status de NC, com o status na última coluna", async () => {
  const m = byId(await fetchRacRows());
  assert.equal(m.get("n-atr")["Status da NC"], "Concluída");
  assert.equal(m.get("n-bar")["Status da NC"], "Em tratamento");
  assert.equal(m.get("n-doc")["Status da NC"], "Cancelada");
  assert.equal(m.get("n-ofc")["Status da NC"], "Aberta");
});

// --- Status do quadro --------------------------------------------------------------------

test("RAC: quadros inativos fora (mesmo com NC aberta, corrigida ou de risco); ativo e manutenção dentro; sem NC não aparece", async () => {
  const tags = new Set((await fetchRacRows()).map((r) => r["TAG"]));
  assert.ok(tags.has("TST_QD_0001") && tags.has("TST_QD_0003"), "ativo");
  assert.ok(tags.has("TST_QD_0002"), "manutencao");
  assert.ok(!tags.has("TST_QD_0004"), "inativo");
  assert.ok(!tags.has("TST_QD_0005"), "quadro sem NC");
  // O filtro é pelo status do QUADRO: o da NC não interfere.
  const db = fixture();
  db.electrical_panels.find((p) => p.id === "p-inativo").status = "manutencao";
  load(db);
  assert.ok((await fetchRacRows()).some((r) => r["ID da NC"] === "n-inativo"));
});

test("RAC: filtro de inativos em duas camadas — a consulta não traz o quadro e a regra também o descarta", async () => {
  // Consulta: só ativo/manutenção da unidade ativa.
  assert.deepEqual((await listPanelsForRac()).map((p) => p.id).sort(), ["p-ofc", "p-pel", "p-porto", "p-semnc"]);
  // Regra pura: mesmo recebendo um quadro inativo, nenhuma NC dele vira linha.
  const rows = buildRacRows({
    panels: [{ id: "x", tag: "X", status: "inativo", site: "porto" }, { id: "y", tag: "Y", status: "manutencao", site: "porto" }],
    ncs: [nc("nx", "x", BAR03), nc("ny", "y", BAR03)], templateItems: ITEMS, inspections: [], hierarchy: {}, usesSite: true,
  });
  assert.deepEqual(rows.map((r) => r["ID da NC"]), ["ny"]);
});

test("RAC: NC sem quadro não entra", async () => {
  assert.ok(!(await fetchRacRows()).some((r) => r["ID da NC"] === "n-orfa"));
});

// --- Site, Local, Sublocal ------------------------------------------------------------------

test("RAC: São Luís usa o site do cadastro (Porto/Oficina/Pelotização), não a localidade", async () => {
  const m = byId(await fetchRacRows());
  assert.equal(m.get("n-bar")["Site"], "Porto");
  assert.equal(m.get("n-ofc")["Site"], "Oficina");
  assert.equal(m.get("n-pel")["Site"], "Pelotização", "localidade é Oficina, mas o site do quadro é Pelotização");
  assert.equal(m.get("n-bar")["Local"], "GEPEG");
  assert.equal(m.get("n-bar")["Sublocal"], "AREA EXTERNA");
  assert.equal(m.get("n-pel")["Local"], "");
});

test("RAC: EFC usa a cidade (localidade do quadro); nunca Porto/Oficina", async () => {
  asEFC();
  const rows = await fetchRacRows();
  assert.deepEqual(rows.map((r) => r["ID da NC"]), ["n-efc"]);
  assert.equal(rows[0]["Site"], "AÇAILÂNDIA");
  assert.equal(rows[0]["Local"], "PATIO");
  assert.equal(rows[0]["Sublocal"], "QUADRO GERAL");
});

// --- Datas ----------------------------------------------------------------------------------

test("RAC: última inspeção = a mais recente não cancelada (inclui vínculo legado); próxima = a do quadro", async () => {
  const m = byId(await fetchRacRows());
  assert.equal(dia(m.get("n-bar")["Data da última inspeção"]), "2026-11-20", "a cancelada de 25/11 não conta");
  assert.equal(dia(m.get("n-bar")["Data da próxima inspeção"]), "2027-02-20");
  assert.equal(dia(m.get("n-ofc")["Data da última inspeção"]), "2026-08-15", "inspeção só com panel_id legado");
  assert.equal(m.get("n-ofc")["Data da próxima inspeção"], null, "sem próxima data no quadro: vazio, sem cálculo");
  assert.equal(m.get("n-pel")["Data da última inspeção"], null, "quadro sem inspeção registrada");
  assert.ok(m.get("n-bar")["Data da última inspeção"] instanceof Date);
  assert.deepEqual([...lastInspectionByPanel([{ panel_id: "x", inspection_date: "2026-01-02", status: "cancelada" }])], []);
  assert.equal(toExcelDate("2026-11-20").toISOString(), "2026-11-20T00:00:00.000Z");
  assert.equal(toExcelDate(null), null);
});

// --- Risco de interdição ----------------------------------------------------------------------

test("RAC: risco de interdição pelo histórico (mesma regra do relatório), não por NC isolada", async () => {
  const m = byId(await fetchRacRows());
  // ATR-01 já concluída: foi risco → Sim em todas as NCs do quadro.
  for (const id of ["n-atr", "n-bar", "n-doc"]) assert.equal(m.get(id)["Risco de interdição?"], "Sim", id);
  // PRO-01 manual depois do início da regra atual: o relatório não conta → Não.
  assert.equal(m.get("n-pel")["Risco de interdição?"], "Não");
  assert.equal(m.get("n-ofc")["Risco de interdição?"], "Não");
  asEFC();
  // PRO-01 com área molhada = Não: não caracteriza risco.
  assert.equal((await fetchRacRows())[0]["Risco de interdição?"], "Não");
});

test("RAC: os quadros 'Sim' são exatamente os do relatório Risco de Interdição (com todos os quadros elegíveis)", async () => {
  const db = fixture();
  for (const p of db.electrical_panels) p.status = "ativo"; // sem inativos: os dois conjuntos são comparáveis
  // Todo quadro com NC de risco precisa de outra NC exportável para aparecer na base.
  db.nonconformities.push(nc("n-inativo-bar2", "p-inativo", BAR03));
  load(db);
  for (const asUnit of [asSLZ, asEFC]) {
    asUnit();
    const rel = await fetchInterdictionReport();
    const sim = new Set((await fetchRacRows()).filter((r) => r["Risco de interdição?"] === "Sim").map((r) => r["TAG"]));
    assert.equal(sim.size, rel.kpis.quadros);
  }
  asSLZ();
  assert.deepEqual([...new Set((await fetchRacRows()).filter((r) => r["Risco de interdição?"] === "Sim").map((r) => r["TAG"]))].sort(),
    ["TST_QD_0001", "TST_QD_0004"]);
  // NC de risco cancelada sai do relatório e o quadro passa a "Não".
  const db2 = fixture();
  db2.nonconformities.find((n) => n.id === "n-atr").status = "cancelada";
  load(db2);
  assert.equal(byId(await fetchRacRows()).get("n-bar")["Risco de interdição?"], "Não");
});

test("RAC: o relatório Risco de Interdição continua idêntico (não é alterado pela exportação)", async () => {
  const antes = JSON.stringify(await fetchInterdictionReport());
  await fetchRacRows();
  assert.equal(JSON.stringify(await fetchInterdictionReport()), antes);
});

// --- Unidades, perfis e escrita -------------------------------------------------------------------

test("RAC: isolamento — cada unidade só exporta os seus quadros e NCs", async () => {
  const slz = await fetchRacRows();
  assert.ok(slz.every((r) => r["TAG"].startsWith("TST_")));
  asEFC();
  const efc = await fetchRacRows();
  assert.ok(efc.every((r) => r["TAG"].startsWith("ACD_")));
  const comum = slz.filter((r) => efc.some((e) => e["ID da NC"] === r["ID da NC"]));
  assert.deepEqual(comum, []);
});

test("RAC: sem unidade ativa definida, nada é lido", async () => {
  clearUnitScope();
  await assert.rejects(() => fetchRacRows(), /Unidade operacional ativa não definida/);
});

test("RAC: botão só para administrador (visualizador, inspetor e editor não exportam)", () => {
  assert.equal(canExportRac("admin"), true);
  for (const r of ["viewer", "inspetor", "editor", undefined, null]) assert.equal(canExportRac(r), false, String(r));
});

test("RAC: só leitura — nada é gravado e o banco fica idêntico (inclusive na EFC)", async () => {
  const antes = snapshot();
  await fetchRacRows();
  asEFC();
  await fetchRacRows();
  assert.deepEqual(writes, []);
  assert.equal(snapshot(), antes);
});

// --- Paginação ---------------------------------------------------------------------------------------

for (const n of [1000, 1001, 2500]) {
  test(`RAC: ${n} NCs elegíveis + inativas — todas exportadas, sem repetir nem omitir`, async () => {
    const db = fixture();
    const donos = ["p-porto", "p-ofc", "p-inativo"];
    db.nonconformities = Array.from({ length: n }, (_, i) => nc(`n-${pad(i)}`, donos[i % 3], [BAR03, ID03, PRO01, DOC01][i % 4]));
    load(db);
    const rows = await fetchRacRows();
    const esperado = db.nonconformities.filter((x, i) => i % 3 !== 2 && x.template_item_id !== "ti-id03").map((x) => x.id);
    assert.equal(new Set(rows.map((r) => r["ID da NC"])).size, rows.length);
    assert.deepEqual(rows.map((r) => r["ID da NC"]).sort(), esperado.sort());
    assert.ok(selects.some((s) => s.table === "nonconformities" && s.range), "leitura paginada");
  });
}

test("RAC: 1500 quadros elegíveis e 2500 inspeções — datas e quadros completos", async () => {
  const db = fixture();
  db.electrical_panels = Array.from({ length: 1500 }, (_, i) => panel(`q-${pad(i)}`, SLZ, i % 2 ? "ativo" : "manutencao", { tag: `TST_QD_${pad(i)}` }));
  db.nonconformities = db.electrical_panels.map((p, i) => nc(`n-${pad(i)}`, p.id, BAR03));
  db.inspections = Array.from({ length: 2500 }, (_, i) => ({ id: `i-${pad(i)}`, panel_ref_id: `q-${pad(i % 1500)}`, panel_id: `q-${pad(i % 1500)}`, inspection_date: i < 1500 ? "2026-09-01" : "2026-10-01", status: "executada" }));
  load(db);
  const rows = await fetchRacRows();
  assert.equal(rows.length, 1500);
  assert.equal(rows.filter((r) => dia(r["Data da última inspeção"]) === "2026-10-01").length, 1000);
  assert.equal(rows.filter((r) => dia(r["Data da última inspeção"]) === "2026-09-01").length, 500);
});

// --- Arquivo Excel ---------------------------------------------------------------------------------------

test("RAC: Excel válido — tabela com filtros, cabeçalho destacado, 1ª linha congelada, datas como data, TAG como texto", async () => {
  const rows = await fetchRacRows();
  rows.push({ ...rows[0], "TAG": "0001234", "ID da NC": "n-zeros" }); // zeros à esquerda preservados
  const buffer = await buildRacWorkbook(rows, SLZ).xlsx.writeBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet("Base RAC");
  assert.ok(ws, "aba Base RAC");
  assert.deepEqual(ws.getRow(1).values.slice(1), RAC_COLUMNS);
  assert.equal(ws.rowCount, rows.length + 1);
  assert.equal(ws.views[0].state, "frozen");
  assert.equal(ws.views[0].ySplit, 1);
  const tabela = ws.getTables()[0]?.table || Object.values(ws.tables || {})[0]?.table;
  assert.ok(tabela, "tabela estruturada do Excel");
  assert.ok(tabela.columns.every((c) => c.filterButton !== false), "filtros habilitados");
  assert.equal(ws.getRow(1).getCell(1).font.bold, true);
  assert.equal(ws.getRow(1).getCell(1).fill.fgColor.argb, "FF189183");
  const col = (name) => RAC_COLUMNS.indexOf(name) + 1;
  const linha = rows.findIndex((r) => r["Data da última inspeção"]) + 2;
  assert.ok(ws.getRow(linha).getCell(col("Data da última inspeção")).value instanceof Date, "data gravada como data");
  assert.equal(ws.getColumn(col("Data da última inspeção")).numFmt, "dd/mm/yyyy");
  const ultima = ws.getRow(rows.length + 1);
  assert.equal(ultima.getCell(col("TAG")).value, "0001234");
  assert.equal(typeof ultima.getCell(col("TAG")).value, "string");
  assert.equal(ws.getColumn(col("Descrição da NC")).alignment.wrapText, true);
  assert.ok(ws.getColumn(col("Descrição da NC")).width >= 40);
});

test("RAC: download com o código da unidade no nome do arquivo", async () => {
  const anchors = [];
  const prev = { doc: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  globalThis.document = { createElement: () => { const a = { click() {}, remove() {} }; anchors.push(a); return a; }, body: { appendChild() {} } };
  URL.createObjectURL = () => "blob:teste";
  URL.revokeObjectURL = () => {};
  try {
    await exportRacExcel(await fetchRacRows());
    asEFC();
    await exportRacExcel(await fetchRacRows());
  } finally {
    globalThis.document = prev.doc;
    URL.createObjectURL = prev.create;
    URL.revokeObjectURL = prev.revoke;
  }
  assert.match(anchors[0].download, /^Base_RAC_NCs_por_Quadro_SLZ_\d{4}-\d{2}-\d{2}\.xlsx$/);
  assert.match(anchors[1].download, /^Base_RAC_NCs_por_Quadro_EFC_\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test("RAC: regra pura — linhas na ordem TAG → categoria → descrição", () => {
  const rows = buildRacRows({
    panels: [{ id: "a", tag: "X_10", status: "ativo", site: "porto" }, { id: "b", tag: "X_2", status: "ativo", site: "oficina" }],
    ncs: [nc("1", "a", BAR03), nc("2", "b", PRO01), nc("3", "b", ATR01)],
    templateItems: ITEMS, inspections: [], hierarchy: {}, usesSite: true, riskPanelIds: new Set(["b"]),
  });
  assert.deepEqual(rows.map((r) => [r["TAG"], r["Categoria da NC"], r["Risco de interdição?"]]),
    [["X_2", "Aterramento", "Sim"], ["X_2", "Proteções", "Sim"], ["X_10", "Barramentos e conexões", "Não"]]);
});
