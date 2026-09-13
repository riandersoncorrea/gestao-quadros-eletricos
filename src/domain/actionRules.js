/** Status de ação corretiva considerados "em aberto" (regra de negócio). */
export const OPEN_ACTION_STATUSES = ["aberta", "em_andamento"];

export function isOpenAction(status) {
  return OPEN_ACTION_STATUSES.includes(status);
}
