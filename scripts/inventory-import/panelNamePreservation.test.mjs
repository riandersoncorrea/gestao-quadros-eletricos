// Conferência do P1 com a BASE REAL do inventário (planilha de origem da
// importação). O repositório é público: a planilha não fica nele e este teste
// não imprime nomes — só contagens e, em caso de falha, a TAG.
//
//   INVENTARIO_XLSX="/caminho/planilha-inventario.xlsx" node --test scripts/inventory-import/panelNamePreservation.test.mjs
//
// Sem a variável, o teste é pulado (CI / outras máquinas).
// Verifica, para TODOS os quadros da planilha (São Luís e EFC):
//   * editar sem mudar prédio/sublocal NÃO envia nome (o atual fica idêntico);
//   * na EFC, os quadros cujo nome não segue a regra são os 7 conhecidos
//     (auditoria de 11/11); os de São Luís são contados e informados.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { parseRows } from "./inventoryRules.mjs";
import { composePanelName, panelNameForEdit } from "../../src/domain/panelName.js";

const file = process.env.INVENTARIO_XLSX;
const skip = !file ? "INVENTARIO_XLSX não definido (planilha fora do repositório)" : !existsSync(file) ? `arquivo ausente: ${file}` : false;
const SLZ_AREAS = new Set(["Porto", "Oficina", "Pelotização"]);

test("P1 com a base real: nenhum nome muda na edição sem troca de localização", { skip }, () => {
  const XLSX = createRequire(import.meta.url)("xlsx");
  const ws = XLSX.readFile(file).Sheets["Plano de Manutenção"];
  const rows = parseRows(XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }));
  assert.ok(rows.length > 0, "planilha sem linhas");

  const divergentes = { efc: 0, slz: 0 };
  for (const r of rows) {
    const original = { tag: r.tag, name: r.descricao, local_id: `lc:${r.area}:${r.predio}`, sublocal_id: r.sublocal ? `s:${r.predio}:${r.sublocal}` : null };
    const next = { local_id: original.local_id, sublocal_id: original.sublocal_id };
    assert.equal(panelNameForEdit({ original, next, localName: r.predio, sublocalName: r.sublocal }), undefined, `${r.tag}: nome seria reescrito`);
    if (composePanelName(r.tag, r.predio, r.sublocal) !== r.descricao && r.descricao !== `${r.tag} / ${r.predio}`) {
      divergentes[SLZ_AREAS.has(r.area) ? "slz" : "efc"] += 1;
    }
  }
  // "TAG / Prédio" sem sublocal já é a regra nova para quadro sem sublocal.
  console.log(`  quadros: ${rows.length} · nomes fora da regra preservados — EFC: ${divergentes.efc}, São Luís: ${divergentes.slz}`);
  assert.equal(divergentes.efc, 7, "quadros da EFC com nome fora da regra (auditoria 11/11: 7)");
});
