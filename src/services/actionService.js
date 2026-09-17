import { getCurrentUserId } from "@/auth/authService";
import * as actionRepository from "@/repositories/actionRepository";
import { updateNonconformity } from "@/services/ncService";

export async function listActionsForNC(ncId) {
  return actionRepository.listForNC(ncId);
}

export async function listActions() {
  return actionRepository.listAll();
}

/**
 * `currentNcStatus` (opcional): status da NC no momento da criação. Se ela
 * ainda estiver "aberta", a primeira ação registrada já a move para
 * "em_tratamento" — reflete que a NC passou a ter um tratamento em curso.
 * Não força nada além disso (concluir/cancelar continua manual).
 */
export async function createAction(values, options) {
  const { currentNcStatus } = options || {};
  const uid = await getCurrentUserId();
  const clean = { ...values };
  for (const k of Object.keys(clean)) if (clean[k] === "") clean[k] = null;
  const created = await actionRepository.create({ ...clean, created_by: uid });
  if (currentNcStatus === "aberta" && values.nonconformity_id) {
    await updateNonconformity(values.nonconformity_id, { status: "em_tratamento" });
  }
  return created;
}

export async function updateAction(id, values) {
  const patch = { ...values, updated_at: new Date().toISOString() };
  if (values.status === "concluida" && !values.concluida_em) {
    patch.concluida_em = new Date().toISOString().slice(0, 10);
  }
  return actionRepository.update(id, patch);
}

export async function deleteAction(id) {
  return actionRepository.remove(id);
}
