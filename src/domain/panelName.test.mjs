// node --test src/domain/panelName.test.mjs
//
// P1 (diagnóstico 22/11/2026): editar um quadro sem mexer no prédio/sublocal
// reescrevia o nome descritivo como `TAG / Prédio_Sublocal`, apagando nomes
// importados com grafia própria (7 quadros da EFC; casos equivalentes em São
// Luís). Os casos abaixo reproduzem CADA padrão encontrado na base, com
// textos inventados (o repositório é público — os nomes reais ficam fora).
// A conferência com a base real roda em
// scripts/inventory-import/panelNamePreservation.test.mjs (com a planilha).
import { test } from "node:test";
import assert from "node:assert/strict";
import { composePanelName, panelLocationChanged, panelNameForEdit, panelNameEditPreview } from "./panelName.js";

// Quadro como vem do banco + nomes de prédio/sublocal atuais na hierarquia.
const quadro = (tag, name, predio, sublocal) => ({
  original: { id: `id-${tag}`, tag, name, local_id: `lc-${predio}`, sublocal_id: sublocal ? `s-${sublocal}` : null },
  predio,
  sublocal,
});

// Padrões dos 7 quadros da EFC (textos fictícios, mesma "forma").
const EFC = [
  quadro("AAA_QD_0101", "AAA_QD_0101 / GUARITA _PAINEL PRINCIPAL", "GUARITA", "PAINEL PRINCIPAL"),       // espaço antes do "_"
  quadro("AAA_QD_0102", "AAA_QD_0102 / REFEITORIO_PATIO/COPA", "REFEITORO", "PATIO/COPA"),               // prédio com outra grafia no nome
  quadro("BBB_QD_0103", "BBB_QD_0103 / SALA AMPLAQ_DLX CIRCUITO", "SALA AMPLA", "QDLX CIRCUITO"),        // "_" deslocado
  quadro("BBB_QD_0104", "BBB_QD_0104 / OFICINA DE TRILHOS_ALA XP", "OFICINA DE TRILHO", "SALA XP"),      // letra trocada de lado
  quadro("BBB_QD_0105", "BBB_QD_0105 / TERCEIRIZADASPAINEL FUNDOS", "TERCEIRIZADAS", "PAINEL FUNDOS"),   // sem "_"
  quadro("CCCC_QD_0106", "CCCC_QD_0106/ BLOCO GESTAO_SALA CENTRAL", "BLOCO GESTAO", "SALA CENTRAL"),     // "TAG/" sem espaço
  quadro("DDD_QD_0107", "DDD_QD_0107 / FORCA_LINHAPAINEL LATERAL", "FORCALINHA", "PAINEL LATERAL"),      // "_" no lugar errado
];
// Padrões equivalentes de São Luís.
const SLZ = [
  quadro("PRT_QD_9001", "PRT_QD_9001 / GERENCIA DE CAMPO", "GERENCIA DE CAMPO", null),     // sem sublocal
  quadro("OFC_QD_9002", "OFC_QD_9002 / BANCADA DE ENSAIO_", "BANCADA DE ENSAIO", null),    // "_" final sem sublocal
  quadro("OFC_QD_9003", "OFC_QD_9003 / RODEIROS _PATIO", "RODEIROS", "PATIO"),             // espaço antes do "_"
  quadro("OFC_QD_9004", "OFC_QD_9004 / LAVADOR_BOX 1", "LAVADOR", "BOX 1"),                // nome que segue a regra
];

test("os 7 padrões da EFC: editar sem mudar prédio/sublocal preserva o nome exatamente (não envia `name`)", () => {
  for (const q of EFC) {
    const next = { local_id: q.original.local_id, sublocal_id: q.original.sublocal_id };
    assert.equal(panelNameForEdit({ original: q.original, next, localName: q.predio, sublocalName: q.sublocal }), undefined, q.original.tag);
    assert.equal(panelNameEditPreview({ original: q.original, next, localName: q.predio, sublocalName: q.sublocal }), q.original.name);
    // A regra antiga produziria outro nome — é exatamente o que não pode acontecer.
    assert.notEqual(composePanelName(q.original.tag, q.predio, q.sublocal), q.original.name, `${q.original.tag}: caso precisa divergir da regra`);
  }
});

test("São Luís (sem sublocal, '_' final, espaço antes do '_', nome padrão): também preservados", () => {
  for (const q of SLZ) {
    const next = { local_id: q.original.local_id, sublocal_id: q.original.sublocal_id };
    assert.equal(panelNameForEdit({ original: q.original, next, localName: q.predio, sublocalName: q.sublocal }), undefined, q.original.tag);
  }
});

test("'' e null contam como a mesma localização (formulário x banco)", () => {
  const q = SLZ[0];
  assert.equal(panelLocationChanged(q.original, { local_id: q.original.local_id, sublocal_id: "" }), false);
  assert.equal(panelLocationChanged({ local_id: null, sublocal_id: null }, { local_id: "", sublocal_id: undefined }), false);
});

test("mudou o sublocal ou o prédio: nome recalculado pela regra", () => {
  const q = EFC[0];
  assert.equal(
    panelNameForEdit({ original: q.original, next: { local_id: q.original.local_id, sublocal_id: "s-NOVA SALA" }, localName: "GUARITA", sublocalName: "NOVA SALA" }),
    "AAA_QD_0101 / GUARITA_NOVA SALA",
  );
  assert.equal(
    panelNameForEdit({ original: q.original, next: { local_id: "lc-PORTARIA 2", sublocal_id: "s-QG" }, localName: "PORTARIA 2", sublocalName: "QG" }),
    "AAA_QD_0101 / PORTARIA 2_QG",
  );
});

test("prédio novo sem sublocal: `TAG / Prédio` (nunca 'TAG / ' nem '_' solto)", () => {
  const q = SLZ[0];
  const name = panelNameForEdit({ original: q.original, next: { local_id: "lc-OUTRO", sublocal_id: "" }, localName: "OUTRO PREDIO", sublocalName: "" });
  assert.equal(name, "PRT_QD_9001 / OUTRO PREDIO");
});

test("localização apagada: nome atual mantido (sem prédio não há como compor)", () => {
  const q = EFC[3];
  assert.equal(panelNameForEdit({ original: q.original, next: { local_id: "", sublocal_id: "" }, localName: "", sublocalName: "" }), undefined);
});

test("cadastro (regra existente) inalterado: TAG / Prédio_Sublocal", () => {
  assert.equal(composePanelName("PRT_QD_0001", "ARMAZEM", "SALA 1"), "PRT_QD_0001 / ARMAZEM_SALA 1");
  assert.equal(composePanelName(null, "ARMAZEM", "SALA 1"), null);
});
