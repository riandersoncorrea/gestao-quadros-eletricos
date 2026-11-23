// node --test src/domain/inspectionDraft.test.mjs
//
// P3 (diagnóstico 22/11/2026): rascunho do checklist separado por usuário e
// unidade — aparelho compartilhado não mostra o rascunho de outra pessoa.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INSPECTION_DRAFT_TTL_MS, LEGACY_INSPECTION_DRAFT_KEY, inspectionDraftKey, saveInspectionDraft,
  loadInspectionDraft, clearInspectionDraft, discardLegacyInspectionDraft,
} from "./inspectionDraft.js";

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
}

const ANA_SLZ = { userId: "u-ana", unitId: "u-slz" };
const ANA_EFC = { userId: "u-ana", unitId: "u-efc" };
const BRUNO_SLZ = { userId: "u-bruno", unitId: "u-slz" };
const rascunho = (painel) => ({ template_id: "tpl-1", header: { panel_id: painel }, responses: { i1: { resposta: "conforme" } } });

test("troca de usuário no mesmo aparelho: o outro não vê o rascunho (e o do dono continua lá)", () => {
  const st = memoryStorage();
  assert.equal(saveInspectionDraft(st, ANA_SLZ, rascunho("p-1"), 1000), true);
  assert.equal(loadInspectionDraft(st, BRUNO_SLZ, { now: 2000, templateId: "tpl-1" }), null);
  const daAna = loadInspectionDraft(st, ANA_SLZ, { now: 2000, templateId: "tpl-1" });
  assert.equal(daAna.header.panel_id, "p-1");
  assert.deepEqual(daAna.owner, ANA_SLZ);
});

test("troca de unidade: rascunho de São Luís não aparece na EFC e volta ao voltar para São Luís", () => {
  const st = memoryStorage();
  saveInspectionDraft(st, ANA_SLZ, rascunho("p-slz"), 1000);
  assert.equal(loadInspectionDraft(st, ANA_EFC, { now: 2000 }), null);
  saveInspectionDraft(st, ANA_EFC, rascunho("p-efc"), 1500);
  assert.equal(loadInspectionDraft(st, ANA_EFC, { now: 2000 }).header.panel_id, "p-efc");
  assert.equal(loadInspectionDraft(st, ANA_SLZ, { now: 2000 }).header.panel_id, "p-slz");
});

test("usuários diferentes na mesma unidade têm rascunhos independentes", () => {
  const st = memoryStorage();
  saveInspectionDraft(st, ANA_SLZ, rascunho("p-ana"), 1000);
  saveInspectionDraft(st, BRUNO_SLZ, rascunho("p-bruno"), 1000);
  clearInspectionDraft(st, BRUNO_SLZ);
  assert.equal(loadInspectionDraft(st, BRUNO_SLZ, { now: 2000 }), null);
  assert.equal(loadInspectionDraft(st, ANA_SLZ, { now: 2000 }).header.panel_id, "p-ana");
});

test("rascunho copiado para a chave de outra pessoa é recusado (dono gravado não confere)", () => {
  const st = memoryStorage();
  saveInspectionDraft(st, ANA_SLZ, rascunho("p-1"), 1000);
  st.setItem(inspectionDraftKey(BRUNO_SLZ), st.getItem(inspectionDraftKey(ANA_SLZ)));
  assert.equal(loadInspectionDraft(st, BRUNO_SLZ, { now: 2000 }), null);
  assert.equal(st.getItem(inspectionDraftKey(BRUNO_SLZ)), null, "entrada adulterada removida");
});

test("chave antiga (sem dono) é descartada e nunca restaurada", () => {
  const st = memoryStorage();
  st.setItem(LEGACY_INSPECTION_DRAFT_KEY, JSON.stringify({ ...rascunho("p-antigo"), savedAt: 1000 }));
  assert.equal(loadInspectionDraft(st, ANA_SLZ, { now: 2000 }), null);
  discardLegacyInspectionDraft(st);
  assert.deepEqual(st.keys(), []);
});

test("sem usuário ou sem unidade: não grava nem lê", () => {
  const st = memoryStorage();
  assert.equal(inspectionDraftKey({ userId: "u-ana" }), null);
  assert.equal(inspectionDraftKey({ unitId: "u-slz" }), null);
  assert.equal(saveInspectionDraft(st, { userId: "u-ana" }, rascunho("p-1")), false);
  assert.deepEqual(st.keys(), []);
  assert.equal(loadInspectionDraft(st, null), null);
});

test("expirado (24 h) ou de outro checklist: descartado, como antes", () => {
  const st = memoryStorage();
  saveInspectionDraft(st, ANA_SLZ, rascunho("p-1"), 1000);
  assert.equal(loadInspectionDraft(st, ANA_SLZ, { now: 1000 + INSPECTION_DRAFT_TTL_MS + 1 }), null);
  assert.equal(st.getItem(inspectionDraftKey(ANA_SLZ)), null);
  saveInspectionDraft(st, ANA_SLZ, rascunho("p-1"), 1000);
  assert.equal(loadInspectionDraft(st, ANA_SLZ, { now: 2000, templateId: "tpl-2" }), null);
  assert.equal(st.getItem(inspectionDraftKey(ANA_SLZ)), null);
});

test("armazenamento indisponível ou com erro não quebra o formulário", () => {
  const quebrado = { getItem() { throw new Error("x"); }, setItem() { throw new Error("cota"); }, removeItem() { throw new Error("x"); } };
  assert.equal(saveInspectionDraft(quebrado, ANA_SLZ, rascunho("p-1")), false);
  assert.equal(loadInspectionDraft(quebrado, ANA_SLZ), null);
  assert.doesNotThrow(() => clearInspectionDraft(quebrado, ANA_SLZ));
  assert.doesNotThrow(() => discardLegacyInspectionDraft(quebrado));
  assert.equal(saveInspectionDraft(null, ANA_SLZ, rascunho("p-1")), false);
  const lixo = memoryStorage();
  lixo.setItem(inspectionDraftKey(ANA_SLZ), "{não é json");
  assert.equal(loadInspectionDraft(lixo, ANA_SLZ), null);
});
