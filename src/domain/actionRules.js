/** Status de ação corretiva considerados "em aberto" (regra de negócio). */
export const OPEN_ACTION_STATUSES = ["aberta", "em_andamento"];

export function isOpenAction(status) {
  return OPEN_ACTION_STATUSES.includes(status);
}

/**
 * Status que o Inspetor pode escolher para uma ação em aberto: tratar e
 * concluir, mas não cancelar nem reabrir — mesma regra imposta no banco
 * (trigger check_inspetor_action_update, migration 0020).
 */
export const INSPETOR_ACTION_STATUSES = ["aberta", "em_andamento", "concluida"];

/** Status disponíveis no seletor da ação para o perfil (Inspetor tem a lista reduzida). */
export function actionStatusOptions(allStatuses, isInspetor) {
  return isInspetor ? allStatuses.filter(([v]) => INSPETOR_ACTION_STATUSES.includes(v)) : allStatuses;
}

/** Ação gerada automaticamente a partir do checklist (migration 0022). */
export function isAutomaticAction(action) {
  return action?.origem === "automatica";
}

/**
 * Ação em aberto sem responsável — ex.: ação automática de quadro cujo site
 * não tem responsável mapeado (domain/siteResponsibles.js).
 */
export function isPendingAssignment(action) {
  return isOpenAction(action?.status) && !action?.responsavel_id && !String(action?.responsavel || "").trim();
}
