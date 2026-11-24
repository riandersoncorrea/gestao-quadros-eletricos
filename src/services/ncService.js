import { getCurrentUserId } from "@/auth/authService";
import * as ncRepository from "@/repositories/ncRepository";
import { isOpenNonconformity } from "@/domain/nonconformityRules";
import {
  scopeRowsToActiveUnit, scopeRowsToOperationalPanels, assertRecordInActiveUnit, assertRecordWritable, assertPanelWritable, assertActiveUnitWritable,
} from "@/services/unitScopeService";
import { getActiveUnitId } from "@/lib/unitScope";
import { getPanelStatus } from "@/repositories/panelRepository";
import { isOperationalPanel, InactivePanelError } from "@/domain/panelStatus";
import { isSchemaMissing } from "@/repositories/unitAccessRepository";

/**
 * Listagem operacional: NCs da unidade ativa (pela unidade do quadro de cada
 * NC), só de quadros ativos ou em manutenção.
 */
export async function listNonconformities() {
  return scopeRowsToOperationalPanels(await ncRepository.list());
}

/**
 * Histórico de NCs de UM quadro (link da página do quadro), seja qual for o
 * status do quadro — as NCs de um quadro inativo continuam acessíveis aqui.
 * O recorte por unidade é o mesmo da listagem.
 */
export async function listNonconformitiesForPanel(panelId) {
  return scopeRowsToActiveUnit(await ncRepository.listForPanel(panelId));
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
  if (values.panel_id) {
    await assertPanelWritable(values.panel_id);
    // NC nova só em quadro elegível (a tela já não oferece os inativos): o
    // status é relido na hora, para valer mesmo com a lista desatualizada.
    const status = await getPanelStatus(values.panel_id);
    if (status !== undefined && !isOperationalPanel({ status })) throw new InactivePanelError();
  } else assertActiveUnitWritable();
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
