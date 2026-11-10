// Testes das regras de importação dos checklists do ValeForms (sem dados reais).
//   CHECKLIST_IMPORT_ENTRY=scripts/checklist-import/checklistRules.test.js \
//     node scripts/checklist-import/generate-checklist-sql.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAnswer, inferFromComment, stripCpf, normalizeInspector, parseDateBR, parseDateTimeBR,
  mapColumns, parseRecords, buildPlan, TEMPLATE_ITEMS, HEADER_ROW, BLANK_MOTIVO,
} from "./checklistRules.js";

test("parseAnswer: resposta + comentário; só comentário; vazio", () => {
  assert.deepEqual(parseAnswer("Não conforme\r\nComentários: Diagrama desatualizado"), { resposta: "nao_conforme", comentario: "Diagrama desatualizado" });
  assert.deepEqual(parseAnswer("Conforme"), { resposta: "conforme", comentario: null });
  assert.deepEqual(parseAnswer("\r\nComentários: Ok"), { resposta: null, comentario: "Ok" });
  assert.equal(parseAnswer(""), null);
  assert.throws(() => parseAnswer("Talvez"));
});

test("inferFromComment: só quando inequívoco", () => {
  assert.equal(inferFromComment("Conforme."), "conforme");
  assert.equal(inferFromComment("Cores conforme "), "conforme");
  assert.equal(inferFromComment("Ok"), "conforme");
  assert.equal(inferFromComment("Cores fora do padrao"), "nao_conforme");
  assert.equal(inferFromComment("Nao conforme- Cabo no aterramento."), "nao_conforme");
  assert.equal(inferFromComment("Verificar depois"), null);
});

test("CPF nunca fica no nome; variações unificadas; valor que não é nome", () => {
  assert.equal(stripCpf("Fulano Tal - 123.456.789-00 "), "Fulano Tal");
  assert.equal(stripCpf("FULANO TAL - 12345678900"), "FULANO TAL");
  const aliases = { "fulano tal": "Fulano de Tal" };
  assert.equal(normalizeInspector("Fulano Tal - 123.456.789-00", aliases), "Fulano de Tal");
  assert.equal(normalizeInspector("123.456.789-00"), "Não informado");
  assert.equal(normalizeInspector("QDE-380V-054"), "Não informado");
  assert.equal(normalizeInspector("Beltrano "), "Beltrano");
});

test("datas do ValeForms", () => {
  assert.equal(parseDateBR("09/10/2026"), "2026-10-09");
  assert.equal(parseDateTimeBR("16/10/2026 9:58"), "2026-10-16T09:58:00-03:00");
});

function sheet(answerFor) {
  const header = ["Date / Time", "Completed By", "Id", "Latitude", "Longitude", "Form", "Dia da inspeção", "Regional", "Pátio",
    "TAG do quadro", "Responsável pelo preenchimento do checklist", "OM preventiva (número da OM caso tenha)",
    "Registros da parte externa do quadro", "Registro da parte interna do quadro", "Diagrama unifilar",
    "Selecione os itens realizados", "Foi encontrado alguma não conformidade? Se sim, sinalizar.",
    // ordem diferente da do modelo e espaços extras: casa pelo texto
    ...[...TEMPLATE_ITEMS].reverse().map((i) => ` ${i.titulo.replace("verde-amarelo", "verde- amarelo")} `)];
  const row = ["16/10/2026 10:47", "PublicUrl", "abc", "0", "0", null, "15/10/2026", "Regional 2", "Cidade X\r\nComentários: TAG provisório",
    "XXX_QD_0001", "Fulano Tal - 123.456.789-00", "2026000", "ext.jpg", "int.jpg", "dia.jpg", "Limpeza,Reaperto,", "Obs geral",
    ...[...TEMPLATE_ITEMS].reverse().map((i) => answerFor(i.codigo))];
  const rows = [[], [], [], [], header, row];
  while (rows.length - 1 < HEADER_ROW) rows.unshift([]);
  return rows;
}

test("registro → plano: NCs, ação por NC, evidências, em branco = Não verificado", () => {
  const rows = sheet((c) => (c === "PRO-01" ? "Não conforme\r\nComentários: DR desconectado" : c === "CAB-07" ? "" : c === "ID-01" ? "Não conforme" : "Conforme"));
  assert.ok(mapColumns(rows[HEADER_ROW]).items["CAB-07"] >= 0);
  const recs = parseRecords(rows, () => "https://x/link");
  assert.equal(recs.length, 1);
  assert.equal(recs[0].inspector, "Fulano Tal");
  assert.equal(recs[0].patio, "Cidade X");
  assert.equal(recs[0].patioNota, "TAG provisório");
  assert.deepEqual(recs[0].answers["CAB-07"], { resposta: "nao_verificado", comentario: null, motivo: BLANK_MOTIVO });

  let n = 0;
  const plan = buildPlan(recs, { uuid: () => `id-${++n}`, photoUrl: (t, k) => `https://s/${t}_${k}.jpg`, prazoBase: () => new Date(2026, 10, 10) });
  assert.equal(plan.responses.length, TEMPLATE_ITEMS.length);
  assert.equal(plan.ncs.length, 2);
  assert.equal(plan.actions.length, 2);
  const pro = plan.ncs.find((x) => x.codigo === "PRO-01");
  assert.equal(pro.severidade, "critica");
  assert.equal(pro.descricao, "DR desconectado");
  const id01 = plan.ncs.find((x) => x.codigo === "ID-01");
  assert.match(id01.descricao, /^ID-01 — /);
  assert.equal(id01.evidencia_url, "https://s/XXX_QD_0001_interna.jpg");
  assert.equal(plan.actions.find((a) => a.nonconformity_id === pro.id).prazo, "2026-11-11");
  assert.equal(plan.responses.find((r) => r.codigo === "DOC-01").evidencia_url, "https://s/XXX_QD_0001_diagrama.jpg");
  assert.equal(plan.responses.find((r) => r.codigo === "CAB-07").motivo, BLANK_MOTIVO);
  assert.match(plan.inspections[0].observacoes, /OM preventiva: 2026000/);
  assert.doesNotMatch(plan.inspections[0].observacoes, /123\.456/);
  assert.equal(plan.panels[0].photo_interna_url, "https://s/XXX_QD_0001_interna.jpg");
});

test("TAG repetida e pergunta sem coluna interrompem", () => {
  const rows = sheet(() => "Conforme");
  rows.push([...rows[HEADER_ROW + 1]]);
  assert.throws(() => parseRecords(rows, () => null), /TAG repetida/);
  const h = [...rows[HEADER_ROW]].filter((x) => !String(x).includes("Torque"));
  assert.throws(() => mapColumns(h), /BAR-03/);
});
