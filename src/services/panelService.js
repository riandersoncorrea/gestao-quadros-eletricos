import * as panelRepository from "@/repositories/panelRepository";
import { assertUnitIsActive, getActiveUnitId } from "@/lib/unitScope";
import { panelIdOf } from "@/domain/unitScope";
import {
  scopeRowsToActiveUnit,
  assertRecordInActiveUnit,
  assertRecordWritable,
  assertPanelWritable,
  assertActiveUnitWritable,
} from "@/services/unitScopeService";

export {
  Localidade,
  Local,
  Sublocal,
  fetchHierarchy,
  listUnidadesOperacionais,
  getPublicPanelInfo,
} from "@/repositories/panelRepository";

/**
 * Quadros, recortados pela unidade operacional ativa (src/lib/unitScope.js):
 *  - list: só quadros da unidade ativa (filtro no banco, no repositório);
 *  - filter (leitura por id, ex. /quadro/:id): registro de outra unidade
 *    não é devolvido — lança UnitMismatchError (UnitMismatchNotice na tela);
 *  - create/update/delete: só em unidade que aceita gravação (a EFC é
 *    somente leitura nesta etapa — ReadOnlyUnitError).
 */
export const ElectricalPanel = {
  list: (orderBy) => panelRepository.ElectricalPanel.list(orderBy),
  async filter(criteria) {
    const rows = await panelRepository.ElectricalPanel.filter(criteria);
    for (const row of rows) assertUnitIsActive(row.unidade_operacional_id);
    return rows;
  },
  async create(values) {
    assertActiveUnitWritable();
    // Unidade explícita (a ativa), sem depender do default SLZ do banco.
    return panelRepository.ElectricalPanel.create({ unidade_operacional_id: getActiveUnitId(), ...values });
  },
  async update(id, values) {
    await assertPanelWritable(id);
    return panelRepository.ElectricalPanel.update(id, values);
  },
  async delete(id) {
    await assertPanelWritable(id);
    return panelRepository.ElectricalPanel.delete(id);
  },
};

/** Inspeções (checklists), recortadas pela unidade do quadro de cada uma. */
export const Inspection = {
  async list(orderBy) {
    return scopeRowsToActiveUnit(await panelRepository.Inspection.list(orderBy));
  },
  async filter(criteria) {
    const rows = await panelRepository.Inspection.filter(criteria);
    for (const row of rows) await assertRecordInActiveUnit(row);
    return rows;
  },
  async create(values) {
    await assertPanelWritable(panelIdOf(values));
    return panelRepository.Inspection.create(values);
  },
  async update(id, values) {
    const [row] = await panelRepository.Inspection.filter({ id });
    await assertRecordWritable(row);
    return panelRepository.Inspection.update(id, values);
  },
  async delete(id) {
    const [row] = await panelRepository.Inspection.filter({ id });
    await assertRecordWritable(row);
    return panelRepository.Inspection.delete(id);
  },
};
