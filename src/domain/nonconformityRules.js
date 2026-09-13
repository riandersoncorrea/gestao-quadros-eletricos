/** Status de não-conformidade considerados "em aberto" (regra de negócio). */
export const OPEN_NC_STATUSES = ["aberta", "em_tratamento"];

export function isOpenNonconformity(status) {
  return OPEN_NC_STATUSES.includes(status);
}
