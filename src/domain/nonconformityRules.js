/** Status de não-conformidade considerados "em aberto" (regra de negócio). */
export const OPEN_NC_STATUSES = ["aberta", "em_tratamento"];

export function isOpenNonconformity(status) {
  return OPEN_NC_STATUSES.includes(status);
}

/**
 * NC corrigida = NC com status "concluida" — o mesmo status que a tela da
 * NC já usa para encerrá-la (marcado pelo usuário, com sugestão quando
 * todas as ações foram encerradas; ver allActionsResolved). É uma
 * propriedade da própria NC, então uma NC com várias ações concluídas
 * conta uma vez só. "cancelada" não é correção.
 */
export const CORRECTED_NC_STATUS = "concluida";

export function isCorrectedNonconformity(status) {
  return status === CORRECTED_NC_STATUS;
}

/**
 * true quando existe ao menos uma ação e nenhuma delas está mais em aberto
 * (todas concluídas ou canceladas) — usado para sugerir, sem forçar, que a
 * NC seja marcada como concluída.
 */
export function allActionsResolved(actions) {
  return actions.length > 0 && actions.every((a) => a.status === "concluida" || a.status === "cancelada");
}
