// Elegibilidade operacional dos quadros (domain/panelStatus.js): indicadores
// e listagens só com quadros "ativo" e "manutencao", sem apagar, alterar nem
// tornar inacessível o histórico dos inativos. Serviços reais do app contra o
// banco em memória, com o corte de 1000 linhas do PostgREST ligado. Rodar:
//   node scripts/unit-scope-tests/run.mjs
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDb, selects, table, writes } from "./fakeSupabase.js";
import { configureUnitScope } from "@/lib/unitScope";
import { SUPABASE_MAX_ROWS as MAX } from "@/repositories/pagination";
import {
  OPERATIONAL_PANEL_STATUSES, OPERATIONAL_FILTER, isOperationalPanel, nonOperationalPanelIds, excludeRowsOfPanels,
  onlyRowsOfPanels, matchesPanelStatusFilter, actionPanelIdWithNc,
} from "@/domain/panelStatus";
import { ElectricalPanel, Inspection } from "@/services/panelService";
import {
  listNonconformities, listNonconformitiesForPanel, getNonconformity, ncSummaryForPanel, createNonconformity, updateNonconformity,
} from "@/services/ncService";
import {
  listActions, listActionsForNC, listInExecutionActions, listMyActionsOfInactivePanels, listTreatableActionsForPanel, updateAction,
} from "@/services/actionService";
import { getInspectionFull } from "@/services/inspectionService";
import { fetchDashboardRaw, computeDashboardData, fetchDashboardData } from "@/services/dashboardService";
import { fetchIntelligentAnalysisRaw, computeIntelligentAnalysis } from "@/services/intelligentAnalysisService";
import { fetchInterdictionReport } from "@/services/interdictionReportService";
import { fetchSpatialData, setPanelCoordinates } from "@/services/mapService";
import { fetchChecklistCoverageData } from "@/services/checklistCoverageService";
import { buildPanelsWithoutChecklistReport } from "@/domain/panelsWithoutChecklistReport";
import { planInspectionRoute } from "@/domain/inspectionRoute";
import { isOpenNonconformity, isCorrectedNonconformity } from "@/domain/nonconformityRules";
import { isOpenAction } from "@/domain/actionRules";
import { healthBandKey } from "@/domain/healthIndex";

const SLZ = { id: "u-slz", codigo: "SLZ", nome: "São Luís", ativo: true, permite_escrita: true, usa_site: true };
const EFC = { id: "u-efc", codigo: "EFC", nome: "EFC", ativo: true, permite_escrita: false, usa_site: false };
const units = [SLZ, EFC];
const asSLZ = () => configureUnitScope({ units, activeUnit: SLZ, defaultUnit: SLZ });
const asEFC = () => configureUnitScope({ units, activeUnit: EFC, defaultUnit: SLZ });
const ids = (rows) => rows.map((r) => r.id).sort();
const pad = (n) => String(n).padStart(5, "0");
const assertNoDuplicates = (rows) => assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, "há registros repetidos");

const panel = (id, unit, status, extra = {}) => ({
  id, tag: id.toUpperCase(), name: `${id.toUpperCase()} / X`, unidade_operacional_id: unit.id, status,
  localidade_id: unit === SLZ ? "l-porto" : "l-acd", criticality: "B", health_index: null, next_inspection_date: null,
  latitude: -2.5, longitude: -44.3, ...extra,
});
const nc = (id, unit, panelId, extra = {}) => ({
  id, panel_id: panelId, unidade_operacional_id: unit.id, status: "aberta", severidade: "media", categoria: "Proteções",
  descricao: id, inspection_id: null, template_item_id: null, created_at: "2026-10-01T10:00:00Z", concluida_em: null, ...extra,
});
const action = (id, ncId, panelId, extra = {}) => ({
  id, nonconformity_id: ncId, panel_id: panelId, status: "aberta", prazo: "2026-10-30", atrasada: true, origem: "automatica", ...extra,
});
const insp = (id, unit, panelId, extra = {}) => ({
  id, panel_ref_id: panelId, panel_id: panelId, unidade_operacional_id: unit.id, inspection_date: "2026-10-01",
  status: "executada", overall_result: "reprovado", health_index_resultado: 90, ...extra,
});

/**
 * Dados fictícios. São Luís: ativo, manutenção e dois inativos — "p-0000" é o
 * caso de quadro inativo com inspeção, NC aberta e ação. EFC: um quadro de
 * cada status.
 */
function fixture() {
  const actions = [
    action("a-ativo", "n-ativo", "p-ativo"),
    action("a-manut", "n-manut", "p-manut", { status: "em_andamento" }),
    action("a-0000", "n-0000", "p-0000", { status: "em_andamento" }),
    action("a-0000-semquadro", "n-0000", null), // segue o quadro da NC
    action("a-ativo-semquadro", "n-ativo", null),
    action("a-orfa", "n-orfa", null), // ação e NC sem quadro: como sempre
    action("a-efc", "n-efc", "p-efc"),
    action("a-efc-inativo", "n-efc-inativo", "p-efc-inativo"),
  ];
  return {
    unidades_operacionais: units,
    localidades: [
      { id: "l-porto", nome: "Porto", unidade_operacional_id: SLZ.id, sigla: null },
      { id: "l-acd", nome: "AÇAILÂNDIA", unidade_operacional_id: EFC.id, sigla: "ACD" },
    ],
    locais: [], sublocais: [],
    electrical_panels: [
      panel("p-ativo", SLZ, "ativo", { health_index: 80, next_inspection_date: "2020-01-01" }),
      panel("p-manut", SLZ, "manutencao", { health_index: 60 }),
      panel("p-0000", SLZ, "inativo", { tag: "TST_QD_0000", health_index: 20, next_inspection_date: "2020-01-01" }),
      panel("p-inativo2", SLZ, "inativo"),
      panel("p-efc", EFC, "ativo"), panel("p-efc-manut", EFC, "manutencao"), panel("p-efc-inativo", EFC, "inativo"),
    ],
    inspections: [insp("i-ativo", SLZ, "p-ativo"), insp("i-0000", SLZ, "p-0000"), insp("i-efc", EFC, "p-efc"), insp("i-efc-inativo", EFC, "p-efc-inativo")],
    inspection_templates: [{ id: "t1", ativo: true, versao: 1 }],
    inspection_template_items: [
      { id: "ti-pro01", template_id: "t1", codigo: "PRO-01", titulo: "PRO-01", ativo: true, modulo: 4, ordem: 1 },
      { id: "ti-atr01", template_id: "t1", codigo: "ATR-01", titulo: "ATR-01", ativo: true, modulo: 7, ordem: 2 },
    ],
    inspection_responses: [
      { id: "r-ativo", inspection_id: "i-ativo", template_item_id: "ti-atr01", modulo: 7, resposta: "nao_conforme" },
      { id: "r-0000", inspection_id: "i-0000", template_item_id: "ti-atr01", modulo: 7, resposta: "nao_conforme" },
    ],
    measurements: [], thermography_points: [], panel_attachments: [],
    nonconformities: [
      nc("n-ativo", SLZ, "p-ativo", { inspection_id: "i-ativo", template_item_id: "ti-atr01", severidade: "critica" }),
      nc("n-manut", SLZ, "p-manut", { status: "em_tratamento" }),
      nc("n-0000", SLZ, "p-0000", { inspection_id: "i-0000", template_item_id: "ti-atr01", severidade: "critica" }),
      nc("n-corr-ativo", SLZ, "p-ativo", { status: "concluida", concluida_em: "2026-10-20T10:00:00Z" }),
      nc("n-corr-0000", SLZ, "p-0000", { status: "concluida", concluida_em: "2026-10-20T10:00:00Z" }),
      nc("n-corr-inativo2", SLZ, "p-inativo2", { status: "concluida", concluida_em: "2026-10-20T10:00:00Z" }),
      nc("n-orfa", SLZ, null),
      nc("n-efc", EFC, "p-efc"), nc("n-efc-inativo", EFC, "p-efc-inativo"),
    ],
    actions,
    v_actions: actions.map((a) => ({ ...a })),
    sap_orders: [], analysis_flags: [],
  };
}

function load(db = fixture()) {
  resetDb(db, { maxRows: MAX });
}
const snapshot = () => JSON.stringify(["electrical_panels", "nonconformities", "actions", "v_actions", "inspections", "inspection_responses"].map(table));
// Mesma base com todos os quadros ativos: referência de "sem efeito do filtro".
function allActive() {
  const db = fixture();
  for (const p of db.electrical_panels) p.status = "ativo";
  return db;
}

beforeEach(() => { load(); asSLZ(); });

// --- Regra --------------------------------------------------------------------

test("Regra: elegíveis = 'ativo' e 'manutencao' (valores reais do banco); qualquer outro valor fica fora", () => {
  assert.deepEqual(OPERATIONAL_PANEL_STATUSES, ["ativo", "manutencao"]);
  assert.ok(isOperationalPanel({ status: "ativo" }) && isOperationalPanel({ status: "manutencao" }));
  for (const status of ["inativo", "em_manutencao", "", null, undefined]) assert.equal(isOperationalPanel({ status }), false);
  assert.equal(isOperationalPanel(undefined), false);
  const excluded = nonOperationalPanelIds([{ id: 1, status: "ativo" }, { id: 2, status: "inativo" }]);
  assert.deepEqual([...excluded], ["2"]);
  // Sem quadro fica; quadro desconhecido fica (a regra só tira o não elegível).
  assert.deepEqual(ids(excludeRowsOfPanels([{ id: "a", panel_id: 1 }, { id: "b", panel_id: 2 }, { id: "c", panel_id: null }, { id: "d", panel_id: 9 }], excluded)), ["a", "c", "d"]);
  assert.equal(actionPanelIdWithNc({ panel_id: "x", nonconformity_id: "n" }, new Map([["n", "y"]])), "x");
  assert.equal(actionPanelIdWithNc({ panel_id: null, nonconformity_id: "n" }, new Map([["n", "y"]])), "y");
  assert.equal(actionPanelIdWithNc({ panel_id: null, nonconformity_id: null }, new Map()), null);
});

// --- Listagens operacionais -----------------------------------------------------

test("NCs: entram as de quadros ativos, em manutenção e sem quadro; saem as de inativos (abertas e corrigidas)", async () => {
  assert.deepEqual(ids(await listNonconformities()), ["n-ativo", "n-corr-ativo", "n-manut", "n-orfa"]);
  asEFC();
  assert.deepEqual(ids(await listNonconformities()), ["n-efc"]);
});

test("Ações: saem as de quadro inativo, inclusive a sem quadro próprio cuja NC é de quadro inativo", async () => {
  assert.deepEqual(ids(await listActions()), ["a-ativo", "a-ativo-semquadro", "a-manut", "a-orfa"]);
  asEFC();
  assert.deepEqual(ids(await listActions()), ["a-efc"]);
});

test("Ações: sem nenhuma ação sem quadro, não há consulta extra de NCs", async () => {
  const db = fixture();
  db.v_actions = db.v_actions.filter((a) => a.panel_id);
  load(db);
  await listActions();
  assert.equal(selects.filter((s) => s.table === "nonconformities").length, 0);
});

// --- Dashboard --------------------------------------------------------------------

test("Dashboard: quadros, saúde, vencidas, ranking, NCs e ações só de elegíveis; inspeções (histórico) de todos", async () => {
  const raw = await fetchDashboardRaw();
  assert.deepEqual(ids(raw.P), ["p-ativo", "p-manut"]);
  const d = computeDashboardData(raw);
  assert.equal(d.totalQuadros, 2);
  assert.equal(d.isMedio, 70); // 80 e 60 — sem o 20 do inativo
  assert.deepEqual(d.healthBands, { bom: 1, atencao: 1, critico: 0, semAvaliacao: 0 });
  assert.equal(d.inspecoesVencidas, 1);
  assert.deepEqual(d.ranking.map((r) => r.id).sort(), ["p-ativo", "p-manut"]);
  assert.equal(d.ncAbertas, 3);
  assert.equal(d.ncCriticas, 1);
  assert.equal(d.ncCorrigidas, 1);
  assert.equal(d.inspecoesTotais, 2, "inspeção do quadro inativo continua no histórico");
  // Filtro de localidade: a inspeção do quadro inativo continua na localidade dele.
  assert.equal(computeDashboardData(raw, { localidadeId: "l-porto" }).inspecoesTotais, 2);
  assert.equal(computeDashboardData(raw, { localidadeId: "l-porto" }).totalQuadros, 2);
  assert.equal(computeDashboardData(raw, { localidadeId: "l-acd" }).totalQuadros, 0);
  // Filtro de período continua valendo sobre o conjunto elegível.
  const nov = { start: new Date("2026-11-01"), end: new Date("2026-11-30") };
  assert.equal(computeDashboardData(raw, { dateRange: nov }).ncAbertas, 0);
  assert.equal(computeDashboardData(raw, { dateRange: nov }).ncCorrigidas, 0);
  // Relatório Executivo: os mesmos números.
  assert.equal((await fetchDashboardData()).totalQuadros, 2);
});

test("Dashboard × listas: abertas, corrigidas, pendentes e atrasadas iguais nas duas unidades", async () => {
  for (const asUnit of [asSLZ, asEFC]) {
    asUnit();
    const d = computeDashboardData(await fetchDashboardRaw());
    const ncs = await listNonconformities();
    const acts = await listActions();
    assert.equal(d.ncAbertas, ncs.filter((n) => isOpenNonconformity(n.status)).length);
    assert.equal(d.ncCorrigidas, ncs.filter((n) => isCorrectedNonconformity(n.status)).length);
    assert.equal(d.acoesPendentes, acts.filter((a) => isOpenAction(a.status) && (a.panel_id || asUnit === asSLZ)).length);
    assert.equal(d.acoesAtrasadas, acts.filter((a) => a.atrasada).length);
  }
});

// --- Mapa, rota e cobertura ---------------------------------------------------------

test("Mapa: só elegíveis; rota de inspeções não sugere inativo", async () => {
  const panels = await fetchSpatialData();
  assert.deepEqual(ids(panels), ["p-ativo", "p-manut"]);
  assert.equal(panels.reduce((s, p) => s + p.nc.abertas, 0), 2);
  const plan = planInspectionRoute({
    start: { lat: -2.5, lng: -44.3 }, panels, inspectionLinks: [],
    options: { onlyWithoutChecklist: false, criticalities: ["A", "B", "C", "D", "sem"], radiusKm: 20, maxStops: 50 },
  });
  assert.deepEqual(plan.stops.map((s) => s.panel.id).sort(), ["p-ativo", "p-manut"]);
  asEFC();
  assert.deepEqual(ids(await fetchSpatialData()), ["p-efc", "p-efc-manut"]);
});

test("Quadros sem checklist: só elegíveis (inativo não infla o relatório)", async () => {
  const data = await fetchChecklistCoverageData();
  assert.deepEqual(ids(data.panels), ["p-ativo", "p-manut"]);
  const rep = buildPanelsWithoutChecklistReport({ ...data, hierarchy: {}, unidades: units, filters: {} });
  assert.deepEqual(rep.rows.map((r) => r.id), ["p-manut"]);
});

// --- Análise Inteligente --------------------------------------------------------------

test("Análise Inteligente: NCs (abertas, corrigidas, risco, ranking) só de elegíveis; inspeções e conformidade completas", async () => {
  const raw = await fetchIntelligentAnalysisRaw();
  assert.deepEqual(ids(raw.nonconformities), ["n-ativo", "n-corr-ativo", "n-manut", "n-orfa"]);
  assert.deepEqual(ids(raw.inspections), ["i-0000", "i-ativo"]);
  assert.deepEqual(ids(raw.responses), ["r-0000", "r-ativo"]);
  const filters = { localidadeId: "all", panelId: "all", status: "all", period: "todo", dateRange: null };
  const a = computeIntelligentAnalysis(raw, filters);
  const dash = computeDashboardData(await fetchDashboardRaw());
  assert.equal(a.base.filteredNCs.length, dash.ncAbertas, "mesma contagem de NCs abertas do Dashboard");
  assert.equal(a.base.filteredCorrectedNCs.length, dash.ncCorrigidas);
  assert.equal(a.kpis.inspecoesRealizadas, 2);
  assert.ok(!JSON.stringify(a.rankingQuadros).includes("p-0000"));
  assert.ok(!JSON.stringify(a.interdictionRisk).includes("p-0000"));
});

// --- Risco de Interdição: intocado -----------------------------------------------------

test("Risco de Interdição: idêntico com o quadro inativo ou ativo (não usa o filtro)", async () => {
  const comInativo = JSON.stringify(await fetchInterdictionReport());
  assert.ok(comInativo.includes("TST_QD_0000"));
  load(allActive());
  assert.equal(comInativo, JSON.stringify(await fetchInterdictionReport()));
});

// --- TST_QD_0000: histórico preservado e acessível ----------------------------------------

test("TST_QD_0000: fora das listas, mas NC, ações e inspeção continuam acessíveis por quadro e por id", async () => {
  assert.ok(!(await listNonconformities()).some((n) => n.panel_id === "p-0000"));
  // Página do quadro (link direto) e resumo de NCs.
  assert.equal((await ElectricalPanel.filter({ id: "p-0000" }))[0].tag, "TST_QD_0000");
  assert.deepEqual(await ncSummaryForPanel("p-0000"), { total: 2, abertas: 1, criticas: 1, altas: 0 });
  // /nao-conformidades?panel=<id>: abertas e corrigidas do quadro, não vazia.
  assert.deepEqual(ids(await listNonconformitiesForPanel("p-0000")), ["n-0000", "n-corr-0000"]);
  // Quadro inativo só com NC corrigida: o histórico também abre.
  assert.deepEqual(ids(await listNonconformitiesForPanel("p-inativo2")), ["n-corr-inativo2"]);
  // NC por link direto, com as ações dela; inspeção de origem com a NC.
  assert.equal((await getNonconformity("n-0000")).id, "n-0000");
  assert.deepEqual(ids(await listActionsForNC("n-0000")), ["a-0000", "a-0000-semquadro"]);
  assert.deepEqual(ids((await getInspectionFull("i-0000")).nonconformities), ["n-0000"]);
  assert.deepEqual(ids(await Inspection.list("-inspection_date")), ["i-0000", "i-ativo"]);
  // Tratamento pelo Checklist do quadro: sem mudança.
  assert.deepEqual(ids(await listTreatableActionsForPanel("p-0000")), ["a-0000"]);
  assert.deepEqual(ids(await listInExecutionActions()), ["a-0000", "a-manut"]);
});

test("Histórico por quadro respeita a unidade: quadro da EFC não é listado em São Luís (e vice-versa)", async () => {
  assert.deepEqual(await listNonconformitiesForPanel("p-efc-inativo"), []);
  asEFC();
  assert.deepEqual(ids(await listNonconformitiesForPanel("p-efc-inativo")), ["n-efc-inativo"]);
  assert.deepEqual(await listNonconformitiesForPanel("p-0000"), []);
});

test("Inventário, QR e Nova Inspeção: continuam recebendo todos os quadros da unidade (inclusive inativos)", async () => {
  assert.deepEqual(ids(await ElectricalPanel.list("tag")), ["p-0000", "p-ativo", "p-inativo2", "p-manut"]);
  asEFC();
  assert.deepEqual(ids(await ElectricalPanel.list("tag")), ["p-efc", "p-efc-inativo", "p-efc-manut"]);
});

// --- Responsável: ações próprias em quadros inativos --------------------------------------------
// O fake devolve "user-teste" como usuário logado (supabase.auth.getUser).

const EU = "user-teste";
const OUTRO = "outro-inspetor";

/** Ações de vários responsáveis, em quadros de todo status, nas duas unidades. */
function comResponsaveis() {
  const db = fixture();
  const minha = { responsavel_id: EU, responsavel: "Inspetor Teste" };
  const dele = { responsavel_id: OUTRO, responsavel: "Outro Inspetor" };
  db.v_actions = [
    action("m-0000", "n-0000", "p-0000", minha),
    action("m-0000-concluida", "n-0000", "p-0000", { ...minha, status: "concluida", atrasada: false }),
    action("m-0000-semquadro", "n-0000", null, minha), // quadro vem da NC
    action("m-ativo", "n-ativo", "p-ativo", minha),
    action("m-manut", "n-manut", "p-manut", minha),
    action("m-orfa", "n-orfa", null, minha),
    action("m-efc-inativo", "n-efc-inativo", "p-efc-inativo", minha),
    action("o-0000", "n-0000", "p-0000", dele),
    action("o-inativo2", "n-corr-inativo2", "p-inativo2", dele),
    // Homônimo: mesmo nome em texto, sem vínculo de perfil — não é do usuário.
    action("h-0000", "n-0000", "p-0000", { responsavel_id: null, responsavel: "Inspetor Teste" }),
    action("s-0000", "n-0000", "p-0000", { responsavel_id: null, responsavel: null }),
  ].map((a) => ({ ...a, unidade_operacional_id: a.id.startsWith("m-efc") ? EFC.id : SLZ.id }));
  db.actions = db.v_actions.map((a) => ({ ...a }));
  return db;
}

test("Responsável: vê as PRÓPRIAS ações em quadros inativos (abertas e concluídas, e a que segue a NC)", async () => {
  load(comResponsaveis());
  assert.deepEqual(ids(await listMyActionsOfInactivePanels()), ["m-0000", "m-0000-concluida", "m-0000-semquadro"]);
  // Dali chega à NC e às ações dela pelos links que já existem.
  assert.equal((await getNonconformity("n-0000")).id, "n-0000");
  assert.ok((await listActionsForNC("n-0000")).some((a) => a.id === "m-0000"));
});

test("Responsável: não vê ações de outro responsável, de homônimo, sem responsável, nem de quadro elegível", async () => {
  load(comResponsaveis());
  const minhas = ids(await listMyActionsOfInactivePanels());
  for (const id of ["o-0000", "o-inativo2", "h-0000", "s-0000", "m-ativo", "m-manut", "m-orfa"]) {
    assert.ok(!minhas.includes(id), id);
  }
});

test("Responsável: a consulta já pede só as ações dele (as de outros nem são lidas)", async () => {
  const db = comResponsaveis();
  db.v_actions = db.v_actions.filter((a) => a.responsavel_id !== EU);
  load(db);
  assert.deepEqual(await listMyActionsOfInactivePanels(), []);
  // Sem ações próprias, nada além da consulta de ações é lido (nem NCs, nem quadros).
  assert.deepEqual(selects.map((s) => s.table), ["v_actions"]);
});

test("Responsável: isolamento por unidade — cada unidade só mostra as ações próprias dela", async () => {
  load(comResponsaveis());
  assert.ok(!ids(await listMyActionsOfInactivePanels()).includes("m-efc-inativo"));
  asEFC();
  assert.deepEqual(ids(await listMyActionsOfInactivePanels()), ["m-efc-inativo"]);
  // Na EFC o caminho é só de leitura.
  await assert.rejects(() => updateAction("m-efc-inativo", { status: "em_andamento" }), { name: "ReadOnlyUnitError" });
  // E a NC da outra unidade continua recusada por link direto.
  await assert.rejects(() => getNonconformity("n-0000"), { name: "UnitMismatchError" });
  assert.deepEqual(writes, []);
});

test("Responsável: isolamento também sem a coluna de unidade na v_actions (pelo quadro, inclusive o da NC)", async () => {
  const db = comResponsaveis();
  db.v_actions = [
    ...db.v_actions,
    action("m-efc-semquadro", "n-efc-inativo", null, { responsavel_id: EU }),
  ].map(({ unidade_operacional_id, ...a }) => a);
  load(db);
  assert.deepEqual(ids(await listMyActionsOfInactivePanels()), ["m-0000", "m-0000-concluida", "m-0000-semquadro"]);
  asEFC();
  assert.deepEqual(ids(await listMyActionsOfInactivePanels()), ["m-efc-inativo"]);
});

test("Responsável: o caminho à parte não volta para a listagem nem para os indicadores", async () => {
  load(comResponsaveis());
  const acts = await listActions();
  assert.deepEqual(ids(acts), ["m-ativo", "m-manut", "m-orfa"]);
  const d = computeDashboardData(await fetchDashboardRaw());
  assert.equal(d.acoesPendentes, 3);
  // As duas listas são disjuntas.
  const minhas = new Set(ids(await listMyActionsOfInactivePanels()));
  assert.ok(acts.every((a) => !minhas.has(a.id)));
});

test("Responsável: tratamento da própria ação em quadro inativo continua como hoje (São Luís)", async () => {
  load(comResponsaveis());
  await updateAction("m-0000", { status: "em_andamento" });
  assert.deepEqual(writes.map((w) => `${w.op}:${w.table}:${w.ids}`), ["update:actions:m-0000"]);
});

test("Responsável: quadro reclassificado sai sozinho do caminho à parte e volta à listagem", async () => {
  const db = comResponsaveis();
  db.electrical_panels.find((p) => p.id === "p-0000").status = "manutencao";
  load(db);
  assert.deepEqual(await listMyActionsOfInactivePanels(), []);
  assert.ok(ids(await listActions()).includes("m-0000"));
});

test("Responsável: 2500 ações próprias em quadro inativo — todas, sem repetir", async () => {
  const db = fixture();
  db.v_actions = Array.from({ length: 2500 }, (_, i) =>
    action(`m-${pad(i)}`, "n-0000", i % 2 ? null : "p-0000", { responsavel_id: EU }));
  load(db);
  const got = await listMyActionsOfInactivePanels();
  assertNoDuplicates(got);
  assert.equal(got.length, 2500);
});

// --- NC manual em quadro inativo ------------------------------------------------------------------

test("Nova NC: recusada em quadro inativo, com mensagem clara e sem gravar nada", async () => {
  await assert.rejects(
    () => createNonconformity({ panel_id: "p-0000", descricao: "x" }),
    (e) => e.name === "InactivePanelError" && /inativo/.test(e.message)
  );
  assert.deepEqual(writes, []);
});

test("Nova NC: aceita em quadro ativo, em manutenção e sem quadro — e aparece na listagem", async () => {
  const unidade = { unidade_operacional_id: SLZ.id };
  for (const values of [{ panel_id: "p-ativo" }, { panel_id: "p-manut" }, {}]) {
    const criada = await createNonconformity({ ...values, ...unidade, descricao: "nova" });
    assert.ok((await listNonconformities()).some((n) => n.id === criada.id));
  }
  assert.deepEqual(writes.map((w) => `${w.op}:${w.table}`), Array(3).fill("insert:nonconformities"));
});

test("Nova NC: o status é relido na hora (quadro inativado depois que a tela carregou)", async () => {
  await ElectricalPanel.list("tag"); // a tela carregou com p-ativo ativo
  table("electrical_panels").find((p) => p.id === "p-ativo").status = "inativo";
  await assert.rejects(() => createNonconformity({ panel_id: "p-ativo", descricao: "x" }), { name: "InactivePanelError" });
  assert.deepEqual(writes, []);
});

test("Nova NC: na EFC o bloqueio continua sendo o de somente leitura; São Luís não grava em quadro da EFC", async () => {
  for (const p of ["p-efc-inativo", "p-efc"]) {
    await assert.rejects(() => createNonconformity({ panel_id: p, descricao: "x" }), { name: "ReadOnlyUnitError" });
  }
  asEFC();
  for (const p of ["p-efc-inativo", "p-efc"]) {
    await assert.rejects(() => createNonconformity({ panel_id: p, descricao: "x" }), { name: "ReadOnlyUnitError" });
  }
  assert.deepEqual(writes, []);
});

test("NC existente de quadro inativo continua editável (só a criação é bloqueada)", async () => {
  await updateNonconformity("n-0000", { status: "cancelada" });
  assert.deepEqual(writes.map((w) => `${w.op}:${w.table}`), ["update:nonconformities"]);
});

// --- Validações complementares ----------------------------------------------------------------------

test("Checklists 'em execução': a exceção não altera nenhum indicador nem listagem operacional", async () => {
  const medir = async () => {
    const raw = await fetchDashboardRaw();
    const ia = await fetchIntelligentAnalysisRaw();
    return JSON.stringify({
      dash: computeDashboardData(raw),
      porLocalidade: computeDashboardData(raw, { localidadeId: "l-porto" }),
      ia: computeIntelligentAnalysis(ia, { localidadeId: "all", panelId: "all", status: "all", period: "todo", dateRange: null }).kpis,
      ncs: ids(await listNonconformities()), acoes: ids(await listActions()),
      mapa: (await fetchSpatialData()).map((p) => [p.id, p.nc]),
      cobertura: ids((await fetchChecklistCoverageData()).panels),
    });
  };
  const emExecucaoNoInativo = async () => (await listInExecutionActions()).filter((a) => (a.panel_id || a.nonconformity?.panel_id) === "p-0000").length;

  assert.equal(await emExecucaoNoInativo(), 1);
  const com = await medir();
  // As mesmas ações do quadro inativo fora de execução (concluídas)...
  const semExec = fixture();
  for (const t of ["actions", "v_actions"]) for (const a of semExec[t]) if (a.id.startsWith("a-0000")) a.status = "concluida";
  load(semExec);
  assert.equal(await emExecucaoNoInativo(), 0);
  assert.equal(await medir(), com);
  // ... ou inexistentes: os indicadores são os mesmos.
  const semAcoes = fixture();
  for (const t of ["actions", "v_actions"]) semAcoes[t] = semAcoes[t].filter((a) => !a.id.startsWith("a-0000"));
  load(semAcoes);
  assert.equal(await medir(), com);
});

test("Card 'Quadros críticos': o número bate com a lista que ele abre no Inventário (só elegíveis)", async () => {
  const db = fixture(); // p-0000 (inativo) já tem IS 20
  db.electrical_panels.push(
    panel("p-crit", SLZ, "ativo", { health_index: 30 }), panel("p-crit-manut", SLZ, "manutencao", { health_index: 49.9 }),
    panel("p-limite", SLZ, "ativo", { health_index: 50 }), panel("p-efc-crit", EFC, "inativo", { health_index: 10 }),
  );
  load(db);
  for (const [asUnit, esperado] of [[asSLZ, ["p-crit", "p-crit-manut"]], [asEFC, []]]) {
    asUnit();
    const card = computeDashboardData(await fetchDashboardRaw()).healthBands.critico;
    const criticos = (await ElectricalPanel.list("-created_date")).filter((p) => healthBandKey(p.health_index) === "critico");
    const lista = criticos.filter((p) => matchesPanelStatusFilter(p, OPERATIONAL_FILTER));
    assert.deepEqual(ids(lista), esperado);
    assert.equal(card, lista.length);
    // Sem o filtro a lista traria o inativo crítico que o card não conta.
    assert.ok(criticos.length > lista.length);
  }
});

test("Inventário: filtro de status (todos, elegíveis e cada valor)", () => {
  const ps = ["ativo", "manutencao", "inativo"].map((status) => ({ id: status, status }));
  const f = (filter) => ps.filter((p) => matchesPanelStatusFilter(p, filter)).map((p) => p.id);
  assert.deepEqual(f("all"), ["ativo", "manutencao", "inativo"]);
  assert.deepEqual(f(OPERATIONAL_FILTER), ["ativo", "manutencao"]);
  for (const s of ["ativo", "manutencao", "inativo"]) assert.deepEqual(f(s), [s]);
  assert.deepEqual(ids(onlyRowsOfPanels([{ id: "a", panel_id: 1 }, { id: "b", panel_id: 2 }, { id: "c", panel_id: null }], new Set(["2"]))), ["b"]);
});

test("EFC sem presumir status: com todos ativos, mistos ou todos inativos a regra é a mesma e São Luís não muda", async () => {
  const slzAntes = JSON.stringify([ids(await listNonconformities()), ids(await listActions()), computeDashboardData(await fetchDashboardRaw())]);
  for (const [status, esperado] of [["ativo", 3], ["manutencao", 3], ["inativo", 0]]) {
    const db = fixture();
    for (const p of db.electrical_panels) if (p.unidade_operacional_id === EFC.id) p.status = status;
    load(db);
    asEFC();
    assert.equal(computeDashboardData(await fetchDashboardRaw()).totalQuadros, esperado);
    assert.equal((await listNonconformities()).length, esperado ? 2 : 0);
    assert.equal((await ElectricalPanel.list("tag")).length, 3, "cadastro completo em qualquer caso");
    asSLZ();
    assert.equal(JSON.stringify([ids(await listNonconformities()), ids(await listActions()), computeDashboardData(await fetchDashboardRaw())]), slzAntes);
  }
});

// --- Nada é gravado --------------------------------------------------------------------------

test("Nenhuma leitura grava ou altera registros (banco idêntico antes e depois, nas duas unidades)", async () => {
  const antes = snapshot();
  for (const asUnit of [asSLZ, asEFC]) {
    asUnit();
    await listNonconformities(); await listActions(); await fetchDashboardData(); await fetchSpatialData();
    await fetchIntelligentAnalysisRaw(); await fetchChecklistCoverageData(); await fetchInterdictionReport();
    await listNonconformitiesForPanel("p-0000"); await listMyActionsOfInactivePanels(); await Inspection.list("-inspection_date");
  }
  assert.deepEqual(writes, []);
  assert.equal(snapshot(), antes);
});

test("EFC continua somente leitura (gravação recusada em quadro ativo e inativo)", async () => {
  asEFC();
  const ro = { name: "ReadOnlyUnitError" };
  for (const [p, n, a] of [["p-efc", "n-efc", "a-efc"], ["p-efc-inativo", "n-efc-inativo", "a-efc-inativo"]]) {
    await assert.rejects(() => ElectricalPanel.update(p, { status: "ativo" }), ro);
    await assert.rejects(() => setPanelCoordinates(p, 1, 2), ro);
    await assert.rejects(() => updateNonconformity(n, { status: "concluida" }), ro);
    await assert.rejects(() => updateAction(a, { status: "em_andamento" }), ro);
  }
  assert.deepEqual(writes, []);
});

// --- Sem quadro inativo, nada muda --------------------------------------------------------------

test("Regressão: com todos os quadros ativos nenhuma linha é excluída", async () => {
  load(allActive());
  assert.deepEqual(ids(await listNonconformities()), ids(fixture().nonconformities.filter((n) => n.unidade_operacional_id === SLZ.id)));
  assert.deepEqual(ids(await listActions()), ids(fixture().actions.filter((a) => !a.id.startsWith("a-efc"))));
  const d = computeDashboardData(await fetchDashboardRaw());
  assert.equal(d.totalQuadros, 4);
  assert.equal(d.ncCorrigidas, 3);
  assert.equal((await fetchSpatialData()).length, 4);
});

// --- Paginação -------------------------------------------------------------------------------------

/** `n` linhas por tabela, alternando quadro ativo/manutenção/inativo. */
function big(n) {
  const db = fixture();
  const donos = ["p-ativo", "p-manut", "p-0000"];
  db.nonconformities = Array.from({ length: n }, (_, i) => nc(`n-${pad(i)}`, SLZ, donos[i % 3]));
  db.actions = [];
  db.v_actions = Array.from({ length: n }, (_, i) => action(`a-${pad(i)}`, `n-${pad(i)}`, i % 2 ? null : donos[i % 3]));
  db.inspections = Array.from({ length: n }, (_, i) => insp(`i-${pad(i)}`, SLZ, donos[i % 3], { inspection_date: i % 2 ? "2026-10-01" : "2026-09-01" }));
  return db;
}
const naoTerceiro = (n) => Array.from({ length: n }, (_, i) => i).filter((i) => i % 3 !== 2);

for (const n of [1000, 1001, 2500]) {
  test(`Paginação com ${n} linhas: NCs e ações trazem todos os elegíveis, sem repetir nem omitir`, async () => {
    load(big(n));
    const ncs = await listNonconformities();
    assertNoDuplicates(ncs);
    assert.deepEqual(ids(ncs), naoTerceiro(n).map((i) => `n-${pad(i)}`));
    const acts = await listActions();
    assertNoDuplicates(acts);
    assert.deepEqual(ids(acts), naoTerceiro(n).map((i) => `a-${pad(i)}`));
    const d = computeDashboardData(await fetchDashboardRaw());
    assert.equal(d.ncAbertas, ncs.length);
    assert.equal(d.acoesPendentes, acts.length);
    assert.equal((await fetchSpatialData()).reduce((s, p) => s + p.nc.abertas, 0), ncs.length);
    assert.equal((await listNonconformitiesForPanel("p-0000")).length, n - ncs.length);
  });

  test(`Paginação com ${n} inspeções: Checklists, Dashboard e Análise recebem todas, sem repetir`, async () => {
    load(big(n));
    const lista = await Inspection.list("-inspection_date");
    assertNoDuplicates(lista);
    assert.equal(lista.length, n);
    const datas = lista.map((i) => i.inspection_date);
    assert.deepEqual(datas, [...datas].sort().reverse(), "ordem por data decrescente mantida");
    assert.equal(computeDashboardData(await fetchDashboardRaw()).inspecoesTotais, n);
    const raw = await fetchIntelligentAnalysisRaw();
    assertNoDuplicates(raw.inspections);
    assert.equal(raw.inspections.length, n);
  });
}

test("Paginação com 2500 quadros elegíveis + 700 inativos: Mapa, cobertura e listas completos", async () => {
  const db = fixture();
  db.electrical_panels = [
    ...Array.from({ length: 2500 }, (_, i) => panel(`p-${pad(i)}`, SLZ, i % 2 ? "ativo" : "manutencao")),
    ...Array.from({ length: 700 }, (_, i) => panel(`p-x${pad(i)}`, SLZ, "inativo")),
  ];
  db.nonconformities = [
    ...Array.from({ length: 2500 }, (_, i) => nc(`n-${pad(i)}`, SLZ, `p-${pad(i)}`)),
    ...Array.from({ length: 700 }, (_, i) => nc(`n-x${pad(i)}`, SLZ, `p-x${pad(i)}`)),
  ];
  load(db);
  const mapa = await fetchSpatialData();
  assertNoDuplicates(mapa);
  assert.equal(mapa.length, 2500);
  assert.equal((await fetchChecklistCoverageData()).panels.length, 2500);
  const ncs = await listNonconformities();
  assertNoDuplicates(ncs);
  assert.equal(ncs.length, 2500);
  assert.ok(ncs.every((n) => !n.id.startsWith("n-x")));
});
