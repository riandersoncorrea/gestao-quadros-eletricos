// node --test src/domain/unitScope.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_UNIT_CODE, panelIdOf, makeUnitMembership, filterByMembership, localidadeInUnit,
  scopeHierarchy, getAllowedUnits, resolveActiveUnit, isWritableUnit,
} from "./unitScope.js";

const SLZ = { id: "slz", codigo: "SLZ", nome: "São Luís", ativo: true };
const EFC = { id: "efc", codigo: "EFC", nome: "EFC", ativo: true };
const NOVA = { id: "nova", codigo: "NOVA", nome: "Nova", ativo: false };

test("unidade padrão é São Luís", () => {
  assert.equal(DEFAULT_UNIT_CODE, "SLZ");
});

test("panelIdOf: inspeção (panel_ref_id, legado panel_id), NC/ação (panel_id), sem quadro", () => {
  assert.equal(panelIdOf({ panel_ref_id: "a", panel_id: "b" }), "a");
  assert.equal(panelIdOf({ panel_id: "b" }), "b");
  assert.equal(panelIdOf({ panel_id: null }), null);
});

test("membership: registro sem quadro só na unidade padrão; ids comparados como texto", () => {
  const slz = makeUnitMembership(["p1"], { isDefaultUnit: true });
  const efc = makeUnitMembership(["p2"], { isDefaultUnit: false });
  assert.equal(slz.has("p1"), true);
  assert.equal(slz.has("p2"), false);
  assert.equal(slz.has(null), true);
  assert.equal(efc.has(null), false);
  const rows = [{ id: 1, panel_id: "p1" }, { id: 2, panel_id: "p2" }, { id: 3, panel_id: null }];
  assert.deepEqual(filterByMembership(rows, slz).map((r) => r.id), [1, 3]);
  assert.deepEqual(filterByMembership(rows, efc).map((r) => r.id), [2]);
});

test("localidadeInUnit: antes da 0028 (sem coluna) = São Luís; depois vale a coluna", () => {
  assert.equal(localidadeInUnit({ id: "l" }, "slz", "slz"), true);
  assert.equal(localidadeInUnit({ id: "l" }, "efc", "slz"), false);
  assert.equal(localidadeInUnit({ id: "l", unidade_operacional_id: "efc" }, "efc", "slz"), true);
  assert.equal(localidadeInUnit({ id: "l", unidade_operacional_id: "efc" }, "slz", "slz"), false);
});

test("scopeHierarchy: prédios e sublocais seguem a localidade", () => {
  const h = {
    localidades: [{ id: "L1", unidade_operacional_id: "slz" }, { id: "L2", unidade_operacional_id: "efc" }],
    locais: [{ id: "P1", localidade_id: "L1" }, { id: "P2", localidade_id: "L2" }],
    sublocais: [{ id: "S1", local_id: "P1" }, { id: "S2", local_id: "P2" }],
  };
  const efc = scopeHierarchy(h, "efc", "slz");
  assert.deepEqual([efc.localidades, efc.locais, efc.sublocais].map((l) => l.map((x) => x.id)), [["L2"], ["P2"], ["S2"]]);
});

test("getAllowedUnits: admin troca entre unidades ativas; demais perfis só São Luís", () => {
  const all = [SLZ, EFC, NOVA];
  assert.deepEqual(getAllowedUnits(all, { role: "admin" }).map((u) => u.codigo), ["SLZ", "EFC"]);
  for (const role of ["editor", "viewer", "inspetor", undefined]) {
    assert.deepEqual(getAllowedUnits(all, { role }).map((u) => u.codigo), ["SLZ"]);
  }
});

test("resolveActiveUnit: escolha salva só se permitida; senão a padrão", () => {
  assert.equal(resolveActiveUnit([SLZ, EFC], "efc"), EFC);
  assert.equal(resolveActiveUnit([SLZ], "efc"), SLZ);
  assert.equal(resolveActiveUnit([SLZ, EFC], null), SLZ);
  assert.equal(resolveActiveUnit([], "efc"), null);
});

test("isWritableUnit: só a unidade padrão grava nesta etapa", () => {
  assert.equal(isWritableUnit(SLZ), true);
  assert.equal(isWritableUnit(EFC), false);
  assert.equal(isWritableUnit(null), false);
});

test("unitReportLabel: identifica a unidade no cabeçalho", async () => {
  const { unitReportLabel } = await import("./unitScope.js");
  assert.equal(unitReportLabel(EFC), "Unidade: EFC");
  assert.equal(unitReportLabel(SLZ), "Unidade: São Luís");
  assert.equal(unitReportLabel(null), "Unidade: —");
});

test("unitFileName: código da unidade no nome, mantendo o separador de cada exportação", async () => {
  const { unitFileName } = await import("./unitScope.js");
  assert.equal(unitFileName("inventario_quadros", SLZ, "2026-11-08", "xlsx"), "inventario_quadros_SLZ_2026-11-08.xlsx");
  assert.equal(unitFileName("quadros-sem-checklist", EFC, null, "xlsx", "-"), "quadros-sem-checklist-EFC.xlsx");
  assert.equal(unitFileName("analise-inteligente", EFC, "2026-11-08", "pdf", "-"), "analise-inteligente-EFC-2026-11-08.pdf");
  assert.equal(unitFileName("x", { codigo: "A/B C" }, null, "pdf"), "x_ABC.pdf");
  assert.equal(unitFileName("x", null, "d", "pdf"), "x_SEM-UNIDADE_d.pdf");
});

test("0029: getAllowedUnits pelo acesso gravado (todas / vínculos), independente do perfil", async () => {
  const { getAllowedUnits, isGlobalAdmin } = await import("./unitScope.js");
  const all = [SLZ, EFC, NOVA];
  assert.deepEqual(getAllowedUnits(all, { role: "viewer" }, { todas: false, unidadeIds: ["efc"] }).map((u) => u.codigo), ["EFC"]);
  assert.deepEqual(getAllowedUnits(all, { role: "admin" }, { todas: false, unidadeIds: ["slz"] }).map((u) => u.codigo), ["SLZ"]);
  assert.deepEqual(getAllowedUnits(all, { role: "viewer" }, { todas: true, unidadeIds: [] }).map((u) => u.codigo), ["SLZ", "EFC"]);
  assert.deepEqual(getAllowedUnits(all, { role: "editor" }, { todas: false, unidadeIds: [] }), []);
  assert.equal(isGlobalAdmin({ role: "admin" }, { todas: true }), true);
  assert.equal(isGlobalAdmin({ role: "admin" }, { todas: false }), false);
  assert.equal(isGlobalAdmin({ role: "viewer" }, { todas: true }), false);
  assert.equal(isGlobalAdmin({ role: "admin" }, null), false);
});

test("0029: isWritableUnit segue permite_escrita quando a coluna existe (3ª unidade gravável)", async () => {
  const { isWritableUnit } = await import("./unitScope.js");
  assert.equal(isWritableUnit({ codigo: "EFC", permite_escrita: false }), false);
  assert.equal(isWritableUnit({ codigo: "TST3", permite_escrita: true, ativo: true }), true);
  assert.equal(isWritableUnit({ codigo: "SLZ", permite_escrita: true, ativo: false }), false);
});

test("0029: registro com unidade própria — vale ela; NULL não pertence a nenhuma unidade", async () => {
  const { makeUnitMembership, filterByMembership } = await import("./unitScope.js");
  const slz = makeUnitMembership(["p1"], { isDefaultUnit: true, unitId: "slz" });
  const rows = [
    { id: 1, panel_id: "p1", unidade_operacional_id: "slz" },
    { id: 2, panel_id: null, unidade_operacional_id: null },
    { id: 3, panel_id: null, unidade_operacional_id: "slz" },
    { id: 4, panel_id: null },
  ];
  assert.deepEqual(filterByMembership(rows, slz).map((r) => r.id), [1, 3, 4]);
});
