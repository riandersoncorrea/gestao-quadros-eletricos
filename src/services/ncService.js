import { getCurrentUserId } from "@/auth/authService";
import * as ncRepository from "@/repositories/ncRepository";
import { isOpenNonconformity } from "@/domain/nonconformityRules";
import {
  scopeRowsToActiveUnit, assertRecordInActiveUnit, assertRecordWritable, assertPanelWritable, assertActiveUnitWritable,
} from "@/services/unitScopeService";
import { getActiveUnitId } from "@/lib/unitScope";
import { isSchemaMissing } from "@/repositories/unitAccessRepository";

/** NCs da unidade ativa (pela unidade do quadro de cada NC). */
export async function listNonconformities() {
  return scopeRowsToActiveUnit(await ncRepository.list());
}

/** NC por id — só se for da unidade ativa (link direto de outra unidade -> UnitMismatchError). */
export async function getNonconformity(id) {
  const nc = await ncRepository.getById(id);
  await assertRecordInActiveUnit(nc);
  return nc;
}

async function assertNcWritable(id) {
  await assertRecordWritable(await ncRepository.getById(id));
}

export async function createNonconformity(values) {
  if (values.panel_id) await assertPanelWritable(values.panel_id);
  else assertActiveUnitWritable();
  const uid = await getCurrentUserId();
  const clean = { ...values };
  for (const k of Object.keys(clean)) if (clean[k] === "") clean[k] = null;
  const row = { ...clean, origem: clean.origem || "manual", created_by: uid };
  // NC sem quadro: a unidade vai explícita (a ativa). Com quadro, o banco a
  // herda do quadro (0029). Antes da 0029 a coluna não existe: grava sem ela.
  if (!row.panel_id) {
    try {
      return await ncRepository.create({ ...row, unidade_operacional_id: getActiveUnitId() });
    } catch (e) {
      if (!isSchemaMissing(e)) throw e;
    }
  }
  return ncRepository.create(row);
}

export async function updateNonconformity(id, values) {
  await assertNcWritable(id);
  return ncRepository.update(id, { ...values, updated_at: new Date().toISOString() });
}

export async function deleteNonconformity(id) {
  await assertNcWritable(id);
  return ncRepository.remove(id);
}

export async function ncSummaryForPanel(panelId) {
  const data = await ncRepository.getStatusSeverityForPanel(panelId);
  const abertas = data.filter((n) => isOpenNonconformity(n.status));
  return {
    total: data.length,
    abertas: abertas.length,
    criticas: abertas.filter((n) => n.severidade === "critica").length,
    altas: abertas.filter((n) => n.severidade === "alta").length,
  };
}
