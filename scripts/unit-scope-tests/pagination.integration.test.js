// Paginação das consultas de NC acima do limite de 1000 linhas do PostgREST
// (max_rows do Supabase, que corta o excedente SEM erro). O banco falso
// imita esse corte com `maxRows`, então uma consulta sem .range() volta a
// devolver só 1000 linhas e estes testes falham. Rodar com:
//   node scripts/unit-scope-tests/run.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resetDb, selects, supabase } from "./fakeSupabase.js";
import { configureUnitScope } from "@/lib/unitScope";
import { fetchAllPages, SUPABASE_MAX_ROWS } from "@/repositories/pagination";
import { listNonconformities } from "@/services/ncService";
import { fetchDashboardRaw, computeDashboardData } from "@/services/dashboardService";
import { fetchSpatialData } from "@/services/mapService";
import { isOpenNonconformity } from "@/domain/nonconformityRules";

const SLZ = { id: "u-slz", codigo: "SLZ", nome: "São Luís", ativo: true };
const EFC = { id: "u-efc", codigo: "EFC", nome: "EFC", ativo: true };
const units = [SLZ, EFC];
const asSLZ = () => configureUnitScope({ units, activeUnit: SLZ, defaultUnit: SLZ });
const asEFC = () => configureUnitScope({ units, activeUnit: EFC, defaultUnit: SLZ });

const pad = (n) => String(n).padStart(5, "0");
const MAX = SUPABASE_MAX_ROWS;
const pagesFor = (n) => Math.floor(n / MAX) + 1; // a última leitura vem com < MAX linhas (ou vazia)
const ncReads = () => selects.filter((s) => s.table === "nonconformities");

function assertNoDuplicates(rows) {
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, "há NCs repetidas");
}

const panels = [
  { id: "p-s1", tag: "PRT_QD_0001", unidade_operacional_id: SLZ.id, localidade_id: "l-porto", status: "ativo" },
  { id: "p-s2", tag: "OFC_QD_0001", unidade_operacional_id: SLZ.id, localidade_id: "l-ofc", status: "ativo" },
  { id: "p-e1", tag: "ACD_QD_0001", unidade_operacional_id: EFC.id, localidade_id: "l-acd", status: "ativo" },
  { id: "p-e2", tag: "SIS_QD_0001", unidade_operacional_id: EFC.id, localidade_id: "l-acd", status: "ativo" },
  { id: "p-e3", tag: "VTM_QD_0001", unidade_operacional_id: EFC.id, localidade_id: "l-acd", status: "ativo" },
];

function nc(id, unit, panelId, extra = {}) {
  return {
    id, panel_id: panelId, unidade_operacional_id: unit.id, status: "aberta", severidade: "media",
    descricao: "BAR-03 — Torque das conexões", categoria: "Barramentos", inspection_id: null, template_item_id: null,
    created_at: "2026-10-01T10:00:00Z", concluida_em: null, ...extra,
  };
}

/**
 * Cenário parecido com a produção em 22/11/2026: 1930 NCs da EFC gravadas
 * pela importação (mesmo created_at — empate resolvido pelo id), 78 delas de
 * PRO-01; 827 NCs de São Luís, 8 delas mais novas que a importação, com
 * corrigidas e canceladas.
 */
function prodLike({ efc = 1930, efcPro01 = 78, slzOld = 819, slzNew = 8 } = {}) {
  const efcPanels = ["p-e1", "p-e2", "p-e3"];
  const rows = [];
  for (let i = 0; i < efc; i++) {
    rows.push(nc(`n-e-${pad(i)}`, EFC, efcPanels[i % 3], {
      created_at: "2026-11-10T12:00:00Z",
      severidade: i % 11 === 0 ? "critica" : "alta",
      ...(i < efcPro01 ? { descricao: "PRO-01 — DR — teste funcional (botão de teste)", categoria: "Proteções" } : {}),
    }));
  }
  for (let i = 0; i < slzOld; i++) {
    const status = i % 10 === 0 ? "concluida" : i % 25 === 0 ? "cancelada" : i % 3 === 0 ? "em_tratamento" : "aberta";
    rows.push(nc(`n-s-${pad(i)}`, SLZ, i % 2 ? "p-s1" : "p-s2", {
      status, created_at: `2026-${String(1 + (i % 10)).padStart(2, "0")}-15T08:00:00Z`,
      concluida_em: status === "concluida" ? "2026-11-01T00:00:00Z" : null,
    }));
  }
  for (let i = 0; i < slzNew; i++) {
    rows.push(nc(`n-sn-${pad(i)}`, SLZ, "p-s1", { created_at: `2026-11-${String(14 + i).padStart(2, "0")}T09:00:00Z` }));
  }
  return rows;
}

function load(nonconformities) {
  resetDb({
    unidades_operacionais: units,
    localidades: [
      { id: "l-porto", nome: "Porto", unidade_operacional_id: SLZ.id, sigla: null },
      { id: "l-ofc", nome: "Oficina", unidade_operacional_id: SLZ.id, sigla: null },
      { id: "l-acd", nome: "AÇAILÂNDIA", unidade_operacional_id: EFC.id, sigla: "ACD" },
    ],
    locais: [], sublocais: [],
    electrical_panels: panels,
    nonconformities,
    v_actions: [], actions: [], inspections: [], sap_orders: [], analysis_flags: [],
  }, { maxRows: MAX });
}

// Ordem que a tela recebe: created_at decrescente, desempate por id.
function expectedOrder(rows) {
  return [...rows].sort((a, b) =>
    a.created_at === b.created_at ? (a.id < b.id ? -1 : 1) : a.created_at < b.created_at ? 1 : -1);
}

// --- fetchAllPages (helper) --------------------------------------------------

function stubQuery(total, { failAt = null } = {}) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: `r-${pad(i)}` }));
  const ranges = [];
  const build = () => ({
    range(from, to) {
      ranges.push([from, to]);
      if (failAt === from) return Promise.resolve({ data: null, error: new Error(`falha na página ${from}`) });
      return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + MAX)), error: null });
    },
  });
  return { rows, ranges, build };
}

for (const total of [0, 1, 999, 1000, 1001, 2000, 2500, 4687]) {
  test(`fetchAllPages: ${total} linhas — todas, na ordem, sem repetir, ${pagesFor(total)} página(s) contíguas`, async () => {
    const q = stubQuery(total);
    const got = await fetchAllPages(q.build);
    assert.deepEqual(got.map((r) => r.id), q.rows.map((r) => r.id));
    assertNoDuplicates(got);
    assert.equal(q.ranges.length, pagesFor(total));
    q.ranges.forEach(([from, to], i) => assert.deepEqual([from, to], [i * MAX, i * MAX + MAX - 1]));
  });
}

test("fetchAllPages: erro numa página seguinte é propagado (não devolve lista parcial)", async () => {
  const q = stubQuery(2500, { failAt: 1000 });
  await assert.rejects(() => fetchAllPages(q.build), /falha na página 1000/);
});

// --- O banco falso reproduz o corte (prova de que os testes pegam a regressão)

test("banco falso: consulta SEM .range() devolve só 1000 linhas — e reproduz os números vistos em produção", async () => {
  const rows = prodLike();
  load(rows);
  // A consulta antiga de ncRepository.list(): sem range, só created_at desc.
  const { data } = await supabase.from("nonconformities").select("*").order("created_at", { ascending: false });
  assert.equal(data.length, MAX);
  assert.equal(data.filter((n) => n.unidade_operacional_id === EFC.id).length, 992);
  assert.equal(data.filter((n) => n.unidade_operacional_id === SLZ.id).length, 8);
});

// --- Lista de Não Conformidades ----------------------------------------------

test("Lista de NCs: EFC recebe as 1930 NCs (todas abertas, 78 PRO-01) e SLZ as 827, sem repetir e na ordem", async () => {
  const rows = prodLike();
  load(rows);
  const efcRows = rows.filter((n) => n.unidade_operacional_id === EFC.id);
  const slzRows = rows.filter((n) => n.unidade_operacional_id === SLZ.id);

  asEFC();
  const efc = await listNonconformities();
  assert.equal(efc.length, 1930);
  assertNoDuplicates(efc);
  assert.equal(efc.filter((n) => isOpenNonconformity(n.status)).length, 1930);
  assert.equal(efc.filter((n) => n.descricao.toLowerCase().includes("pro-01")).length, 78);
  assert.deepEqual(efc.map((n) => n.id), expectedOrder(efcRows).map((n) => n.id));
  assert.ok(efc.every((n) => n.unidade_operacional_id === EFC.id), "NC de outra unidade na lista da EFC");
  assert.equal(ncReads().length, pagesFor(rows.length)); // 2757 linhas → 3 páginas

  asSLZ();
  const slz = await listNonconformities();
  assert.equal(slz.length, 827);
  assertNoDuplicates(slz);
  assert.equal(slz.filter((n) => isOpenNonconformity(n.status)).length, slzRows.filter((n) => isOpenNonconformity(n.status)).length);
  assert.deepEqual(slz.map((n) => n.id), expectedOrder(slzRows).map((n) => n.id));
  assert.ok(slz.every((n) => n.unidade_operacional_id === SLZ.id), "NC de outra unidade na lista de SLZ");
});

for (const total of [1000, 1001, 2500]) {
  test(`Lista de NCs: exatamente ${total} NCs na tabela — todas voltam, ${pagesFor(total)} leitura(s)`, async () => {
    const rows = prodLike({ efc: total, efcPro01: 0, slzOld: 0, slzNew: 0 });
    load(rows);
    asEFC();
    const got = await listNonconformities();
    assert.equal(got.length, total);
    assertNoDuplicates(got);
    assert.equal(ncReads().length, pagesFor(total));
  });
}

// --- Lista × Painel: mesma tabela, mesma regra de "aberta", mesma unidade ----

test("NCs abertas: a lista e o card do Painel dão o mesmo número em cada unidade", async () => {
  load(prodLike());
  for (const [asUnit, esperado] of [[asEFC, 1930], [asSLZ, null]]) {
    asUnit();
    const lista = (await listNonconformities()).filter((n) => isOpenNonconformity(n.status)).length;
    const painel = computeDashboardData(await fetchDashboardRaw()).ncAbertas;
    assert.equal(lista, painel);
    if (esperado != null) assert.equal(lista, esperado);
  }
});

// --- Mapa ----------------------------------------------------------------------

test("Mapa: contagem de NCs abertas/críticas por quadro usa todas as NCs (acima de 1000)", async () => {
  const rows = prodLike();
  load(rows);
  const esperado = (panelId) => {
    const abertas = rows.filter((n) => n.panel_id === panelId && isOpenNonconformity(n.status));
    return { abertas: abertas.length, criticas: abertas.filter((n) => n.severidade === "critica").length };
  };

  asEFC();
  const efc = await fetchSpatialData();
  assert.deepEqual(efc.map((p) => p.id).sort(), ["p-e1", "p-e2", "p-e3"]);
  for (const p of efc) assert.deepEqual(p.nc, esperado(p.id), p.id);
  assert.equal(efc.reduce((s, p) => s + p.nc.abertas, 0), 1930);

  asSLZ();
  const slz = await fetchSpatialData();
  assert.deepEqual(slz.map((p) => p.id).sort(), ["p-s1", "p-s2"]);
  for (const p of slz) assert.deepEqual(p.nc, esperado(p.id), p.id);
});
