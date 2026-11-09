// Testes de isolamento por unidade operacional contra os serviços reais do
// app (banco em memória — fakeSupabase.js). Rodar com:
//   node scripts/unit-scope-tests/run.mjs
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDb, writes } from "./fakeSupabase.js";
import { configureUnitScope, clearUnitScope } from "@/lib/unitScope";
import { ElectricalPanel, Inspection, fetchHierarchy } from "@/services/panelService";
import { listNonconformities, getNonconformity, createNonconformity, updateNonconformity, deleteNonconformity } from "@/services/ncService";
import { listActions, listInExecutionActions, updateAction, deleteAction, createAction } from "@/services/actionService";
import { getInspectionFull, createInspection } from "@/services/inspectionService";
import { fetchDashboardRaw, computeDashboardData } from "@/services/dashboardService";
import { fetchIntelligentAnalysisRaw } from "@/services/intelligentAnalysisService";
import { fetchInterdictionReport } from "@/services/interdictionReportService";
import { fetchSpatialData, setPanelCoordinates } from "@/services/mapService";
import { fetchChecklistCoverageData } from "@/services/checklistCoverageService";
import { attachDiagrams } from "@/services/panelAttachmentService";
import { exportInspectedPanelsPdf } from "@/services/inspectedPanelsPdfService";
import { exportSafetyFormExcel } from "@/services/safetyFormExportService";
import { pdfLog, resetPdfLog } from "./fakeJsPdf.js";
import { getPublicPanelInfo } from "@/services/panelService";

const SLZ = { id: "u-slz", codigo: "SLZ", nome: "São Luís", ativo: true };
const EFC = { id: "u-efc", codigo: "EFC", nome: "EFC", ativo: true };
const units = [SLZ, EFC];

const asSLZ = () => configureUnitScope({ units, activeUnit: SLZ, defaultUnit: SLZ });
const asEFC = () => configureUnitScope({ units, activeUnit: EFC, defaultUnit: SLZ });
const ids = (rows) => rows.map((r) => r.id).sort();

// Banco "depois da 0029": localidades com unidade_operacional_id e sigla.
function fixture({ pre0028 = false } = {}) {
  const loc = (id, nome, unidade, sigla) => (pre0028 ? { id, nome } : { id, nome, unidade_operacional_id: unidade, sigla });
  return {
    unidades_operacionais: units,
    localidades: pre0028
      ? [loc("l-porto", "Porto"), loc("l-ofc", "Oficina")]
      : [loc("l-porto", "Porto", SLZ.id, null), loc("l-ofc", "Oficina", SLZ.id, null), loc("l-acd", "AÇAILÂNDIA", EFC.id, "ACD")],
    locais: [
      { id: "lc-porto", localidade_id: "l-porto", nome: "CCO" },
      ...(pre0028 ? [] : [{ id: "lc-acd", localidade_id: "l-acd", nome: "PORTARIA" }]),
    ],
    sublocais: [
      { id: "s-porto", local_id: "lc-porto", nome: "SALA" },
      ...(pre0028 ? [] : [{ id: "s-acd", local_id: "lc-acd", nome: "QUADRO GERAL" }]),
    ],
    electrical_panels: [
      { id: "p-s1", tag: "PRT_QD_0001", name: "PRT_QD_0001 / CCO_SALA", site: "porto", unidade_operacional_id: SLZ.id, localidade_id: "l-porto", local_id: "lc-porto", sublocal_id: "s-porto", status: "ativo", criticality: "A", health_index: 70 },
      { id: "p-s2", tag: "OFC_QD_0001", name: "OFC_QD_0001 / X_Y", site: "oficina", unidade_operacional_id: SLZ.id, localidade_id: "l-ofc", status: "ativo", criticality: "B", health_index: null },
      ...(pre0028 ? [] : [
        { id: "p-e1", tag: "ACD_QD_0001", name: "ACD_QD_0001 / PORTARIA_QUADRO GERAL", site: null, unidade_operacional_id: EFC.id, localidade_id: "l-acd", local_id: "lc-acd", sublocal_id: "s-acd", status: "ativo", criticality: "A", health_index: null, sap_functional_location: null, sap_equipment_number: null },
      ]),
    ],
    inspections: [
      { id: "i-s1", panel_ref_id: "p-s1", panel_id: "p-s1", inspection_date: "2026-10-01", status: "concluida", overall_result: "conforme", health_index_resultado: 70 },
      ...(pre0028 ? [] : [{ id: "i-e1", panel_ref_id: "p-e1", panel_id: "p-e1", inspection_date: "2026-10-02", status: "concluida", overall_result: "nao_conforme" }]),
    ],
    inspection_templates: [{ id: "t1", ativo: true, versao: 1 }],
    inspection_template_items: [
      { id: "ti-pro01", template_id: "t1", codigo: "PRO-01", titulo: "PRO-01", ativo: true, modulo: "x", ordem: 1 },
      { id: "ti-atr01", template_id: "t1", codigo: "ATR-01", titulo: "ATR-01", ativo: true, modulo: "x", ordem: 2 },
    ],
    inspection_responses: [
      { id: "r-s1", inspection_id: "i-s1", template_item_id: "ti-pro01", resposta: "nao_conforme" },
      ...(pre0028 ? [] : [{ id: "r-e1", inspection_id: "i-e1", template_item_id: "ti-pro01", resposta: "nao_conforme" }]),
    ],
    measurements: [], thermography_points: [], panel_attachments: [],
    nonconformities: [
      { id: "n-s1", panel_id: "p-s1", inspection_id: "i-s1", template_item_id: "ti-pro01", status: "aberta", severidade: "critica", descricao: "SLZ", created_at: "2026-10-01" },
      { id: "n-orfa", panel_id: null, inspection_id: null, template_item_id: null, status: "aberta", severidade: "baixa", descricao: "manual sem quadro", created_at: "2026-10-03" },
      ...(pre0028 ? [] : [{ id: "n-e1", panel_id: "p-e1", inspection_id: "i-e1", template_item_id: "ti-pro01", status: "aberta", severidade: "critica", descricao: "EFC", created_at: "2026-10-02" }]),
    ],
    actions: [
      { id: "a-s1", nonconformity_id: "n-s1", panel_id: "p-s1", status: "em_andamento", prazo: "2026-12-01" },
      { id: "a-s2", nonconformity_id: "n-s1", panel_id: null, status: "em_andamento", prazo: "2026-12-02" },
      ...(pre0028 ? [] : [{ id: "a-e1", nonconformity_id: "n-e1", panel_id: "p-e1", status: "em_andamento", prazo: "2026-12-03" }]),
    ],
    v_actions: null, // preenchida abaixo (view = actions + atrasada)
    sap_orders: [
      { id: "o-s1", panel_id: "p-s1", data_planejada: "2026-10-01" },
      { id: "o-livre", panel_id: null, data_planejada: "2026-10-05" },
    ],
    analysis_flags: [
      { id: "f-s1", panel_id: "p-s1", severidade: "critica", resolvido: false },
      ...(pre0028 ? [] : [{ id: "f-e1", panel_id: "p-e1", severidade: "critica", resolvido: false }]),
    ],
  };
}

function load(opts) {
  const db = fixture(opts);
  db.v_actions = db.actions.map((a) => ({ ...a, atrasada: false }));
  resetDb(db);
}

beforeEach(() => {
  load();
  asSLZ();
});

// --- Listas -----------------------------------------------------------------

test("sem unidade configurada nenhuma leitura recortada roda (não devolve todas as unidades)", async () => {
  clearUnitScope();
  await assert.rejects(() => ElectricalPanel.list(), /Unidade operacional ativa não definida/);
  await assert.rejects(() => listNonconformities(), /Unidade operacional ativa não definida/);
});

test("Inventário/Quadros/QR: cada unidade só vê os seus quadros", async () => {
  assert.deepEqual(ids(await ElectricalPanel.list("tag")), ["p-s1", "p-s2"]);
  asEFC();
  assert.deepEqual(ids(await ElectricalPanel.list("tag")), ["p-e1"]);
});

test("Hierarquia: localidades/prédios/sublocais por unidade (cidade da EFC só na EFC)", async () => {
  const slz = await fetchHierarchy();
  assert.deepEqual(slz.localidades.map((l) => l.nome).sort(), ["Oficina", "Porto"]);
  assert.deepEqual(ids(slz.locais), ["lc-porto"]);
  assert.deepEqual(ids(slz.sublocais), ["s-porto"]);
  asEFC();
  const efc = await fetchHierarchy();
  assert.deepEqual(efc.localidades, [{ id: "l-acd", nome: "AÇAILÂNDIA", sigla: "ACD" }]);
  assert.deepEqual(ids(efc.locais), ["lc-acd"]);
  assert.deepEqual(ids(efc.sublocais), ["s-acd"]);
});

test("Antes da migration 0028 (sem localidades.unidade_operacional_id): São Luís igual a hoje, EFC vazia", async () => {
  load({ pre0028: true });
  asSLZ();
  const slz = await fetchHierarchy();
  assert.deepEqual(slz.localidades.map((l) => l.nome).sort(), ["Oficina", "Porto"]);
  assert.deepEqual(ids(await ElectricalPanel.list()), ["p-s1", "p-s2"]);
  assert.deepEqual(ids(await listNonconformities()), ["n-orfa", "n-s1"]);
  asEFC();
  assert.deepEqual((await fetchHierarchy()).localidades, []);
  assert.deepEqual(await ElectricalPanel.list(), []);
  assert.deepEqual(await listNonconformities(), []);
});

test("Checklists/Inspeções: lista recortada pelo quadro", async () => {
  assert.deepEqual(ids(await Inspection.list("-inspection_date")), ["i-s1"]);
  asEFC();
  assert.deepEqual(ids(await Inspection.list("-inspection_date")), ["i-e1"]);
});

test("NCs: recortadas pelo quadro; NC sem quadro mantém o comportamento atual (só na unidade padrão)", async () => {
  assert.deepEqual(ids(await listNonconformities()), ["n-orfa", "n-s1"]);
  asEFC();
  assert.deepEqual(ids(await listNonconformities()), ["n-e1"]);
});

test("Ações: lista geral e 'em execução' recortadas (ação sem panel_id segue o quadro da NC)", async () => {
  assert.deepEqual(ids(await listActions()), ["a-s1", "a-s2"]);
  assert.deepEqual(ids(await listInExecutionActions()), ["a-s1", "a-s2"]);
  asEFC();
  assert.deepEqual(ids(await listActions()), ["a-e1"]);
  assert.deepEqual(ids(await listInExecutionActions()), ["a-e1"]);
});

test("Dashboard: quadros, NCs, ações, inspeções e ordens SAP só da unidade ativa", async () => {
  const slz = await fetchDashboardRaw();
  assert.deepEqual(ids(slz.P), ["p-s1", "p-s2"]);
  assert.deepEqual(ids(slz.N), ["n-orfa", "n-s1"]);
  assert.deepEqual(ids(slz.A), ["a-s1", "a-s2"].filter((id) => slz.A.some((a) => a.id === id)));
  assert.ok(!slz.A.some((a) => a.id === "a-e1"));
  assert.deepEqual(ids(slz.I), ["i-s1"]);
  assert.deepEqual(ids(slz.sapOrders), ["o-livre", "o-s1"]);
  computeDashboardData(slz); // agregação continua funcionando
  asEFC();
  const efc = await fetchDashboardRaw();
  assert.deepEqual(ids(efc.P), ["p-e1"]);
  assert.deepEqual(ids(efc.N), ["n-e1"]);
  assert.deepEqual(ids(efc.I), ["i-e1"]);
  assert.deepEqual(efc.sapOrders, []);
  assert.ok(!efc.A.some((a) => a.panel_id !== "p-e1"));
  computeDashboardData(efc);
});

test("Análise Inteligente: quadros, inspeções, respostas e NCs só da unidade ativa", async () => {
  const slz = await fetchIntelligentAnalysisRaw();
  assert.deepEqual(ids(slz.panels), ["p-s1", "p-s2"]);
  assert.deepEqual(ids(slz.inspections), ["i-s1"]);
  assert.deepEqual(ids(slz.responses), ["r-s1"]);
  assert.deepEqual(ids(slz.nonconformities), ["n-orfa", "n-s1"]);
  asEFC();
  const efc = await fetchIntelligentAnalysisRaw();
  assert.deepEqual(ids(efc.panels), ["p-e1"]);
  assert.deepEqual(ids(efc.inspections), ["i-e1"]);
  assert.deepEqual(ids(efc.responses), ["r-e1"]);
  assert.deepEqual(ids(efc.nonconformities), ["n-e1"]);
});

test("Risco de interdição: nenhum dado da outra unidade no relatório", async () => {
  const slz = JSON.stringify(await fetchInterdictionReport());
  assert.ok(slz.includes("PRT_QD_0001"), "relatório SLZ deveria conter o quadro de São Luís");
  assert.ok(!slz.includes("ACD_QD_0001") && !slz.includes("n-e1"), "relatório SLZ com dado da EFC");
  asEFC();
  const efc = JSON.stringify(await fetchInterdictionReport());
  assert.ok(efc.includes("ACD_QD_0001"), "relatório EFC deveria conter o quadro da EFC");
  assert.ok(!efc.includes("PRT_QD_0001") && !efc.includes("n-s1"), "relatório EFC com dado de SLZ");
});

test("Mapa: quadros da unidade e contagem de NC/flags só deles", async () => {
  const slz = await fetchSpatialData();
  assert.deepEqual(ids(slz), ["p-s1", "p-s2"]);
  assert.equal(slz.find((p) => p.id === "p-s1").nc.abertas, 1);
  asEFC();
  const efc = await fetchSpatialData();
  assert.deepEqual(ids(efc), ["p-e1"]);
  assert.equal(efc[0].nc.abertas, 1);
  assert.equal(efc[0].flags.total, 1);
});

test("Quadros sem checklist: só quadros da unidade ativa", async () => {
  assert.deepEqual(ids((await fetchChecklistCoverageData()).panels), ["p-s1", "p-s2"]);
  asEFC();
  assert.deepEqual(ids((await fetchChecklistCoverageData()).panels), ["p-e1"]);
});

test("Alternância SLZ -> EFC -> SLZ: nenhum id aparece nas duas unidades", async () => {
  const collect = async () => [
    ...ids(await ElectricalPanel.list()), ...ids(await Inspection.list()),
    ...ids(await listNonconformities()), ...ids(await listActions()),
  ];
  const slz1 = await collect();
  asEFC();
  const efc = await collect();
  asSLZ();
  const slz2 = await collect();
  assert.deepEqual(slz1, slz2);
  assert.deepEqual(slz1.filter((id) => efc.includes(id)), []);
});

// --- Acesso por ID ------------------------------------------------------------

test("Por ID: quadro/inspeção/NC de outra unidade -> UnitMismatchError (nada é devolvido)", async () => {
  await assert.rejects(() => ElectricalPanel.filter({ id: "p-e1" }), { name: "UnitMismatchError" });
  await assert.rejects(() => getInspectionFull("i-e1"), { name: "UnitMismatchError" });
  await assert.rejects(() => getNonconformity("n-e1"), { name: "UnitMismatchError" });
  asEFC();
  await assert.rejects(() => ElectricalPanel.filter({ id: "p-s1" }), (e) => e.name === "UnitMismatchError" && e.recordUnit.codigo === "SLZ");
  await assert.rejects(() => getInspectionFull("i-s1"), { name: "UnitMismatchError" });
  await assert.rejects(() => getNonconformity("n-s1"), { name: "UnitMismatchError" });
});

test("Por ID: registro da própria unidade abre normalmente", async () => {
  assert.equal((await ElectricalPanel.filter({ id: "p-s1" }))[0].tag, "PRT_QD_0001");
  assert.equal((await getInspectionFull("i-s1")).inspection.id, "i-s1");
  assert.equal((await getNonconformity("n-s1")).id, "n-s1");
  asEFC();
  assert.equal((await ElectricalPanel.filter({ id: "p-e1" }))[0].tag, "ACD_QD_0001");
  assert.equal((await getInspectionFull("i-e1")).inspection.id, "i-e1");
});

test("Por ID: NC sem quadro abre na unidade padrão e não na EFC (sem atribuir unidade)", async () => {
  assert.equal((await getNonconformity("n-orfa")).id, "n-orfa");
  asEFC();
  await assert.rejects(() => getNonconformity("n-orfa"), { name: "UnitMismatchError" });
  assert.equal(writes.length, 0);
});

// --- EFC somente leitura ----------------------------------------------------

test("EFC somente leitura: nenhuma gravação chega ao banco", async () => {
  asEFC();
  const ro = { name: "ReadOnlyUnitError" };
  await assert.rejects(() => ElectricalPanel.create({ name: "novo" }), ro);
  await assert.rejects(() => ElectricalPanel.update("p-e1", { name: "x" }), ro);
  await assert.rejects(() => ElectricalPanel.delete("p-e1"), ro);
  await assert.rejects(() => setPanelCoordinates("p-e1", 1, 2), ro);
  await assert.rejects(() => attachDiagrams("p-e1", [{ file_url: "u", file_name: "f" }]), ro);
  await assert.rejects(() => createInspection({ header: { panel_id: "p-e1" }, responses: [], measurements: [], thermography: [], template: {}, items: [] }), ro);
  await assert.rejects(() => Inspection.delete("i-e1"), ro);
  await assert.rejects(() => createNonconformity({ descricao: "x", panel_id: "p-e1" }), ro);
  await assert.rejects(() => createNonconformity({ descricao: "sem quadro" }), ro);
  await assert.rejects(() => updateNonconformity("n-e1", { status: "concluida" }), ro);
  await assert.rejects(() => deleteNonconformity("n-e1"), ro);
  await assert.rejects(() => createAction({ nonconformity_id: "n-e1", descricao: "x" }), ro);
  await assert.rejects(() => updateAction("a-e1", { status: "aberta" }), ro);
  await assert.rejects(() => deleteAction("a-e1"), ro);
  assert.deepEqual(writes, []);
});

test("São Luís ativo também não grava em registro da EFC (link direto)", async () => {
  await assert.rejects(() => ElectricalPanel.update("p-e1", { name: "x" }), { name: "ReadOnlyUnitError" });
  await assert.rejects(() => updateAction("a-e1", { status: "aberta" }), { name: "ReadOnlyUnitError" });
  assert.deepEqual(writes, []);
});

test("Regressão São Luís: gravações continuam funcionando como hoje", async () => {
  await ElectricalPanel.update("p-s1", { notes: "ok" });
  await setPanelCoordinates("p-s1", -2.5, -44.3);
  await updateNonconformity("n-s1", { status: "em_tratamento" });
  await updateAction("a-s1", { status: "aberta" });
  await updateAction("a-s2", { status: "aberta" }); // sem panel_id: segue a NC (SLZ)
  const created = await ElectricalPanel.create({ name: "novo SLZ", site: "porto" });
  await createNonconformity({ descricao: "manual sem quadro" });
  assert.equal(created.unidade_operacional_id, SLZ.id, "quadro novo vai com a unidade ativa explícita (não depende do default do banco)");
  assert.deepEqual(writes.map((w) => `${w.op}:${w.table}`), [
    "update:electrical_panels", "update:electrical_panels", "update:nonconformities",
    "update:actions", "update:actions", "insert:electrical_panels", "insert:nonconformities",
  ]);
});

// --- M1: unidade nos relatórios e exportações ---------------------------------

test("PDF Quadros inspecionados: unidade no cabeçalho, no corpo e no nome do arquivo", async () => {
  const report = { generatedAt: new Date("2026-11-08T12:00:00"), totalQuadros: 0, totalLocalidades: 0, groups: [] };
  resetPdfLog();
  await exportInspectedPanelsPdf(report, { filtrosLabel: "Localidade: Todas" });
  assert.ok(pdfLog.texts.filter((t) => t === "Unidade: São Luís").length >= 2, "cabeçalho + corpo com a unidade SLZ");
  assert.match(pdfLog.saved[0], /^quadros-inspecionados-SLZ-\d{4}-\d{2}-\d{2}\.pdf$/);
  asEFC();
  resetPdfLog();
  await exportInspectedPanelsPdf(report);
  assert.ok(pdfLog.texts.includes("Unidade: EFC"));
  assert.ok(!pdfLog.texts.some((t) => t.includes("Unidade: São Luís")));
  assert.match(pdfLog.saved[0], /^quadros-inspecionados-EFC-/);
});

test("Excel Form Segurança: unidade no nome do arquivo, colunas inalteradas", async () => {
  const anchors = [];
  const prevDoc = globalThis.document;
  const prevCreate = URL.createObjectURL;
  const prevRevoke = URL.revokeObjectURL;
  globalThis.document = {
    createElement: () => { const a = { click() {}, remove() {} }; anchors.push(a); return a; },
    body: { appendChild() {} },
  };
  URL.createObjectURL = () => "blob:teste";
  URL.revokeObjectURL = () => {};
  try {
    await exportSafetyFormExcel([{ TAG: "PRT_QD_0001", Resposta: "Conforme" }]);
    asEFC();
    await exportSafetyFormExcel([{ TAG: "ACD_QD_0001", Resposta: "Conforme" }]);
  } finally {
    globalThis.document = prevDoc;
    URL.createObjectURL = prevCreate;
    URL.revokeObjectURL = prevRevoke;
  }
  assert.match(anchors[0].download, /^base-form-seguranca_SLZ_\d{4}-\d{2}-\d{2}\.xlsx$/);
  assert.match(anchors[1].download, /^base-form-seguranca_EFC_/);
});

// --- Modelo da 0029: unidade gravada nos registros filhos ------------------------

function loadPost0029() {
  const db = fixture();
  const unitOf = (panelId) => db.electrical_panels.find((p) => p.id === panelId)?.unidade_operacional_id ?? null;
  for (const t of ["inspections", "nonconformities", "actions", "sap_orders", "analysis_flags"]) {
    db[t] = db[t].map((r) => ({ ...r, unidade_operacional_id: unitOf(r.panel_ref_id || r.panel_id) }));
  }
  // ação sem panel_id herda da NC; NC/ordem sem quadro ficam NULL (pendentes)
  db.actions = db.actions.map((a) => ({ ...a, unidade_operacional_id: a.unidade_operacional_id
    ?? db.nonconformities.find((n) => n.id === a.nonconformity_id)?.unidade_operacional_id ?? null }));
  db.unidades_operacionais = [{ ...SLZ, permite_escrita: true }, { ...EFC, permite_escrita: false }];
  db.v_actions = db.actions.map((a) => ({ ...a, atrasada: false }));
  resetDb(db);
  const units29 = db.unidades_operacionais;
  return {
    asSLZ: () => configureUnitScope({ units: units29, activeUnit: units29[0], defaultUnit: units29[0] }),
    asEFC: () => configureUnitScope({ units: units29, activeUnit: units29[1], defaultUnit: units29[0] }),
  };
}

test("0029: NC sem quadro e sem unidade (NULL) não aparece em São Luís nem na EFC", async () => {
  const u = loadPost0029();
  u.asSLZ();
  assert.deepEqual(ids(await listNonconformities()), ["n-s1"]);
  await assert.rejects(() => getNonconformity("n-orfa"), { name: "UnitMismatchError" });
  u.asEFC();
  assert.deepEqual(ids(await listNonconformities()), ["n-e1"]);
  await assert.rejects(() => getNonconformity("n-orfa"), { name: "UnitMismatchError" });
});

test("0029: listas usam a unidade gravada no registro (ordem SAP sem quadro fica de fora)", async () => {
  const u = loadPost0029();
  u.asSLZ();
  const raw = await fetchDashboardRaw();
  assert.deepEqual(ids(raw.sapOrders), ["o-s1"]);
  assert.deepEqual(ids(raw.A).sort(), ["a-s1", "a-s2"]);
  u.asEFC();
  assert.deepEqual(ids((await fetchDashboardRaw()).A), ["a-e1"]);
});

test("0029: escrita segue permite_escrita da unidade (dado), não o código SLZ", async () => {
  const u = loadPost0029();
  u.asEFC();
  await assert.rejects(() => updateNonconformity("n-e1", { status: "concluida" }), { name: "ReadOnlyUnitError" });
  u.asSLZ();
  await updateNonconformity("n-s1", { status: "em_tratamento" });
  await assert.rejects(() => updateNonconformity("n-orfa", { status: "em_tratamento" }), { name: "UnitMismatchError" });
});

test("NC manual sem quadro: envia a unidade ativa; antes da 0029 (coluna ausente) grava sem ela", async () => {
  await createNonconformity({ descricao: "manual" });
  const ins = writes.find((w) => w.op === "insert" && w.table === "nonconformities");
  assert.equal(ins.rows[0].unidade_operacional_id, SLZ.id);
  const db = fixture();
  db.v_actions = db.actions;
  resetDb(db, { missing: { nonconformities: ["unidade_operacional_id"] } });
  asSLZ();
  await createNonconformity({ descricao: "manual pré-0029" });
  const ins2 = writes.filter((w) => w.op === "insert" && w.table === "nonconformities");
  assert.equal(ins2.length, 1);
  assert.equal("unidade_operacional_id" in ins2[0].rows[0], false);
});

test("QR público: usa get_public_panel; antes da 0030 cai na view", async () => {
  const db = fixture();
  db.v_actions = db.actions;
  db.panel_public_info = [{ id: "p-s1", tag: "PRT_QD_0001" }];
  resetDb(db);
  assert.equal((await getPublicPanelInfo("p-s1")).tag, "PRT_QD_0001"); // função ausente -> view
  resetDb(db, { rpc: { get_public_panel: ({ p_id }) => ({ id: p_id, tag: "PRT_QD_0001", unidade_nome: "São Luís" }) } });
  const viaRpc = await getPublicPanelInfo("p-s1");
  assert.equal(viaRpc.unidade_nome, "São Luís");
});
