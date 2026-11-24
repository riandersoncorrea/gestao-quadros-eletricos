// Regra ÚNICA de elegibilidade operacional dos quadros: indicadores e
// listagens operacionais consideram só quadros "ativo" e "manutencao"
// (valores de electrical_panels.status). O filtro é só de EXIBIÇÃO e
// contagem: nenhum registro é alterado, e o histórico (inspeções, telas por
// id, página do quadro, /nao-conformidades?panel=<id>) continua acessível.
import { panelIdOf } from "./unitScope.js";

export const OPERATIONAL_PANEL_STATUSES = ["ativo", "manutencao"];

export function isOperationalPanel(panel) {
  return OPERATIONAL_PANEL_STATUSES.includes(panel?.status);
}

/** Ids (texto) dos quadros que ficam fora das consultas operacionais. */
export function nonOperationalPanelIds(panels) {
  return new Set((panels || []).filter((p) => !isOperationalPanel(p)).map((p) => String(p.id)));
}

/**
 * Tira as linhas (NCs, ações, ...) ligadas a um quadro de `excludedIds`.
 * Linha sem quadro continua: a regra só exclui o que está vinculado a um
 * quadro não elegível.
 */
export function excludeRowsOfPanels(rows, excludedIds, getPanelId = panelIdOf) {
  return (rows || []).filter((r) => {
    const panelId = getPanelId(r);
    return !panelId || !excludedIds.has(String(panelId));
  });
}

/** O complemento: só as linhas ligadas a um quadro de `panelIds`. */
export function onlyRowsOfPanels(rows, panelIds, getPanelId = panelIdOf) {
  return (rows || []).filter((r) => {
    const panelId = getPanelId(r);
    return !!panelId && panelIds.has(String(panelId));
  });
}

/** Valor do filtro de status do Inventário para "só os elegíveis" (ativo + manutenção). */
export const OPERATIONAL_FILTER = "operacionais";

/** Filtro de status do Inventário: "all", OPERATIONAL_FILTER ou um status. */
export function matchesPanelStatusFilter(panel, filter) {
  if (filter === "all") return true;
  if (filter === OPERATIONAL_FILTER) return isOperationalPanel(panel);
  return panel?.status === filter;
}

/** Registro novo em quadro fora da operação (a NC não apareceria na listagem). */
export class InactivePanelError extends Error {
  constructor() {
    super("O quadro selecionado está inativo: não é possível registrar uma nova não conformidade nele.");
    this.name = "InactivePanelError";
  }
}

/**
 * Quadro de uma ação: o próprio (actions.panel_id) ou, na falta dele, o da
 * sua NC. `panelIdByNc`: Map id da NC → id do quadro.
 */
export function actionPanelIdWithNc(action, panelIdByNc) {
  return action?.panel_id || panelIdByNc?.get(action?.nonconformity_id) || null;
}
