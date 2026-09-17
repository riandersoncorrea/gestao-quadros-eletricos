/** Status de não-conformidade considerados "em aberto" (regra de negócio). */
export const OPEN_NC_STATUSES = ["aberta", "em_tratamento"];

export function isOpenNonconformity(status) {
  return OPEN_NC_STATUSES.includes(status);
}

/**
 * true quando existe ao menos uma ação e nenhuma delas está mais em aberto
 * (todas concluídas ou canceladas) — usado para sugerir, sem forçar, que a
 * NC seja marcada como concluída.
 */
export function allActionsResolved(actions) {
  return actions.length > 0 && actions.every((a) => a.status === "concluida" || a.status === "cancelada");
}
