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

/**
 * Status "Em execução" do tratamento pelo Checklist: é o valor existente
 * `em_andamento` (rótulo "Em andamento" na página Ações) — não há outro.
 */
export const IN_EXECUTION_STATUS = "em_andamento";

/**
 * Quadro da ação: `actions.panel_id` (preenchido na criação, manual ou
 * automática) ou, na falta dele, o quadro da NC (`nonconformities.panel_id`,
 * embutido como `action.nonconformity`).
 */
export function actionPanelId(action) {
  return action?.panel_id || action?.nonconformity?.panel_id || null;
}

/**
 * O Editor trata pelo Checklist só a ação "Em execução" do MESMO quadro do
 * checklist. Mesma regra validada no service (actionService) e, no banco,
 * pelo trigger check_editor_action_update (migration 0025).
 */
export function isTreatableFromChecklist(action, panelId) {
  return action?.status === IN_EXECUTION_STATUS
    && !!panelId
    && String(actionPanelId(action)) === String(panelId);
}

/** Map quadro → ações "Em execução" daquele quadro. */
export function groupInExecutionByPanel(actions) {
  const byPanel = new Map();
  for (const a of actions || []) {
    if (a.status !== IN_EXECUTION_STATUS) continue;
    const pid = actionPanelId(a);
    if (!pid) continue;
    if (!byPanel.has(String(pid))) byPanel.set(String(pid), []);
    byPanel.get(String(pid)).push(a);
  }
  return byPanel;
}
