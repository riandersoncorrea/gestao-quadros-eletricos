// node --test scripts/inventory-import/
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeText, parseRows, splitByExcludedAreas, validate, sqlText } from "./inventoryRules.mjs";

const HEADER = ["Área", "Prédio", "Local detalhado", "TAG", "Descrição do Ativo", "Classificação do Ativo", "Nº SAP do ativo"];
const row = (area, tag, extra = {}) => ({
  linha: extra.linha ?? 2, area, predio: "P", sublocal: "S", tag, descricao: `${tag} / P_S`,
  classe: "B", sapLocal: null, sapEquipamento: null, ...extra,
});

test("normalizeText: só espaços — grafia, acento e caixa preservados", () => {
  assert.equal(normalizeText("  RDV  BOQUEIRAO "), "RDV BOQUEIRAO");
  assert.equal(normalizeText("RESTAUTANTE"), "RESTAUTANTE");
  assert.equal(normalizeText("PORTARIA _QUADRO"), "PORTARIA _QUADRO");
  assert.equal(normalizeText("Açailândia"), "Açailândia");
  assert.equal(normalizeText("   "), null);
  assert.equal(normalizeText(null), null);
});

test("parseRows: base EFC sem a coluna de Local SAP vira null", () => {
  const rows = parseRows([HEADER, ["ARARI", "PONTO", "SALA", "ARR_QD_0001", "ARR_QD_0001 / PONTO_SALA", "B", null], [null, null, null, null, null, null, null]]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].linha, 2);
  assert.equal(rows[0].sapLocal, null);
  assert.equal(rows[0].sapEquipamento, null);
});

test("parseRows: coluna desconhecida é erro (não descarta em silêncio)", () => {
  assert.throws(() => parseRows([[...HEADER, "Tensão"], []]), /Colunas não reconhecidas: Tensão/);
});

test("splitByExcludedAreas: exclui só as áreas pedidas", () => {
  const { kept, excluded } = splitByExcludedAreas(
    [row("Porto", "PRT_QD_0001"), row("Oficina", "OFC_QD_0001"), row("PORTO", "PRT_QD_0002"), row("ARARI", "ARR_QD_0001")],
    ["Porto", "Oficina"]
  );
  assert.equal(excluded.Porto.length, 2);
  assert.equal(excluded.Oficina.length, 1);
  assert.deepEqual(kept.map((r) => r.tag), ["ARR_QD_0001"]);
});

test("validate: cidade e sigla derivadas da TAG, sem tamanho fixo de sigla", () => {
  const { errors, warnings, cidades } = validate([
    row("SÃO PEDRO DA AGUA BRANCA", "SPAB_QD_0001", { linha: 2 }),
    row("SANTA INÊS", "SIS_QD_0001", { linha: 3 }),
    row("SANTA INÊS", "SIS_QD_0003", { linha: 4 }),
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(cidades.map((c) => [c.cidade, c.sigla, c.quadros]), [["SANTA INÊS", "SIS", 2], ["SÃO PEDRO DA AGUA BRANCA", "SPAB", 1]]);
  assert.match(warnings.join(), /SIS_QD_0002/);
});

test("validate: divergência cidade × sigla, TAG fora do padrão, duplicada e obrigatório vazio são erros", () => {
  const { errors } = validate([
    row("ARARI", "ARR_QD_0001", { linha: 2 }),
    row("ARARI", "XYZ_QD_0002", { linha: 3 }),
    row("MARABÁ", "ARR_QD_0003", { linha: 4 }),
    row("ARARI", "ARR-QD-4", { linha: 5 }),
    row("ARARI", "ARR_QD_0001", { linha: 6 }),
    row("ARARI", "ARR_QD_0007", { linha: 7, predio: null }),
  ]);
  const all = errors.join("\n");
  assert.match(all, /Cidade ARARI com mais de uma sigla/);
  assert.match(all, /Sigla ARR usada em mais de uma cidade/);
  assert.match(all, /Linha 5: TAG fora do padrão/);
  assert.match(all, /TAG duplicada: ARR_QD_0001/);
  assert.match(all, /Linha 7: campo obrigatório vazio \(predio\)/);
});

test("sqlText escapa aspas", () => {
  assert.equal(sqlText("D'ÁGUA"), "'D''ÁGUA'");
  assert.equal(sqlText(null), "null");
});
