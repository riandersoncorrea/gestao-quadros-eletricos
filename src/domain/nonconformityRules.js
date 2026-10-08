/** Status de não-conformidade considerados "em aberto" (regra de negócio). */
export const OPEN_NC_STATUSES = ["aberta", "em_tratamento"];

export function isOpenNonconformity(status) {
  return OPEN_NC_STATUSES.includes(status);
}

/**
 * NC corrigida = NC com status "concluida". A NC chega a esse status de
 * duas formas: automaticamente, no banco, quando a última ação em aberto é
 * concluída/cancelada e ao menos uma foi concluída (mesma regra de
 * allActionsResolved — trigger trg_nc_concluida_por_acoes, migration 0026,
 * que vale também para Editor e Inspetor), ou marcada pelo usuário na tela
 * da NC. É uma propriedade da própria NC, então uma NC com várias ações
 * concluídas conta uma vez só. "cancelada" não é correção.
 */
export const CORRECTED_NC_STATUS = "concluida";

export function isCorrectedNonconformity(status) {
  return status === CORRECTED_NC_STATUS;
}

/**
 * true quando existe ao menos uma ação e nenhuma delas está mais em aberto
 * (todas concluídas ou canceladas) — usado para sugerir, sem forçar, que a
 * NC seja marcada como concluída (caso que o trigger da migration 0026 não
 * fecha sozinho: todas as ações canceladas).
 */
export function allActionsResolved(actions) {
  return actions.length > 0 && actions.every((a) => a.status === "concluida" || a.status === "cancelada");
}
