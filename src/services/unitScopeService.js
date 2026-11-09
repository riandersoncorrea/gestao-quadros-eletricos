// Serviço compartilhado de isolamento por unidade operacional.
//
//  * Listas de registros ligados a quadros (inspeções, NCs, ações, flags,
//    ordens SAP) passam por scopeRowsToActiveUnit / membershipForScopedPanels.
//  * Leituras por ID (telas de detalhe, links diretos) passam por
//    assertPanelInActiveUnit: registro de outra unidade não é exibido
//    (UnitMismatchError -> UnitMismatchNotice na tela).
//  * Gravações passam por assertPanelWritable: a EFC é somente leitura nesta
//    etapa (ReadOnlyUnitError).
//
// Estas checagens são a camada de INTERFACE; as permissões efetivas são as
// do banco (RLS).

import { listPanelIdsForActiveUnit, getPanelUnitId } from "@/repositories/panelRepository";
import {
  isActiveDefaultUnit, getActiveUnitId, assertUnitIsActive, assertUnitWritable, assertOwnUnitIsActive,
} from "@/lib/unitScope";
import { makeUnitMembership, membershipFromPanels, filterByMembership, panelIdOf } from "@/domain/unitScope";

/** Pertinência à unidade ativa a partir de TODOS os quadros dela (1 consulta leve). */
export async function getActiveUnitMembership() {
  const ids = await listPanelIdsForActiveUnit();
  return makeUnitMembership(ids, { isDefaultUnit: isActiveDefaultUnit(), unitId: getActiveUnitId() });
}

/** Pertinência a partir de quadros já recortados pela unidade (sem nova consulta). */
export function membershipForScopedPanels(panels) {
  return membershipFromPanels(panels, { isDefaultUnit: isActiveDefaultUnit(), unitId: getActiveUnitId() });
}

export async function scopeRowsToActiveUnit(rows, getPanelId = panelIdOf) {
  const membership = await getActiveUnitMembership();
  return filterByMembership(rows, membership, getPanelId);
}

/**
 * Valida a unidade de um registro pelo seu quadro antes de exibi-lo.
 * Sem quadro = comportamento atual (unidade padrão). Quadro inexistente:
 * não bloqueia — a tela trata "não encontrado" como já fazia.
 */
export async function assertPanelInActiveUnit(panelId) {
  if (!panelId) return assertUnitIsActive(null);
  const unitId = await getPanelUnitId(panelId);
  if (unitId === undefined) return;
  assertUnitIsActive(unitId);
}

const hasOwnUnit = (row) => !!row && Object.prototype.hasOwnProperty.call(row, "unidade_operacional_id");

/**
 * Valida a unidade de um registro filho (NC, inspeção, ação) antes de
 * exibi-lo: pela unidade gravada nele (0029) ou, antes disso, pelo quadro.
 */
export async function assertRecordInActiveUnit(row, getPanelId = panelIdOf) {
  if (!row) return;
  if (hasOwnUnit(row)) return assertOwnUnitIsActive(row.unidade_operacional_id);
  return assertPanelInActiveUnit(getPanelId(row));
}

/** Bloqueia gravação em registro filho de outra unidade, sem unidade ou de unidade somente leitura. */
export async function assertRecordWritable(row, getPanelId = panelIdOf) {
  if (!row) return assertUnitWritable(null);
  if (hasOwnUnit(row)) {
    if (row.unidade_operacional_id == null) return assertOwnUnitIsActive(null); // sem unidade: não grava
    return assertUnitWritable(row.unidade_operacional_id);
  }
  return assertPanelWritable(getPanelId(row));
}

/** Bloqueia gravação em registro (pelo quadro) de unidade somente leitura. */
export async function assertPanelWritable(panelId) {
  const unitId = panelId ? await getPanelUnitId(panelId) : undefined;
  assertUnitWritable(unitId ?? null);
}

/** Bloqueia criação de registro novo quando a unidade ativa é somente leitura. */
export function assertActiveUnitWritable() {
  assertUnitWritable(null);
}
