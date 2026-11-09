/** Status de não-conformidade considerados "em aberto" (regra de negócio). */
export const OPEN_NC_STATUSES = ["aberta", "em_tratamento"];

export function isOpenNonconformity(status) {
  return OPEN_NC_STATUSES.includes(status);
}

/**
 * NC corrigida = NC com status "concluida". A NC chega a esse status de
 * forma automática, no banco, quando todas as suas ações estão concluídas
 * ou canceladas e ao menos uma foi concluída (ncStatusFromActions abaixo —
 * trigger trg_nc_status_segue_acoes, migration 0027, que vale também para
 * Editor e Inspetor). É uma propriedade da própria NC, então uma NC com
 * várias ações concluídas conta uma vez só. "cancelada" não é correção.
 */
export const CORRECTED_NC_STATUS = "concluida";

export function isCorrectedNonconformity(status) {
  return status === CORRECTED_NC_STATUS;
}

/**
 * Status que a NC deve ter a partir das suas ações — espelho da função do
 * banco public.nc_status_by_actions (migration 0027), que é quem de fato
 * grava o status (trigger em actions). Aqui serve só para a tela da NC
 * mostrar para onde uma NC cancelada volta ao ser reativada.
 *   alguma ação em andamento                    → em_tratamento
 *   ações abertas e alguma concluída (parcial)  → em_tratamento
 *   só ações abertas                            → aberta
 *   todas concluídas/canceladas, ≥1 concluída   → concluida
 *   todas canceladas                            → aberta
 *   sem ações: não muda (em_tratamento → aberta)
 */
export function ncStatusFromActions(actions, currentStatus) {
  const conta = (s) => actions.filter((a) => a.status === s).length;
  if (!actions.length) return currentStatus === "em_tratamento" ? "aberta" : currentStatus;
  if (conta("em_andamento")) return "em_tratamento";
  if (conta("aberta") && conta("concluida")) return "em_tratamento";
  if (conta("aberta")) return "aberta";
  if (conta("concluida")) return "concluida";
  return "aberta";
}
