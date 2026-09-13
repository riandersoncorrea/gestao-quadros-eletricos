import { supabase } from "@/lib/supabaseClient";
import * as actionRepository from "@/repositories/actionRepository";

export async function listActionsForNC(ncId) {
  return actionRepository.listForNC(ncId);
}

export async function listActions() {
  return actionRepository.listAll();
}

export async function createAction(values) {
  const { data: user } = await supabase.auth.getUser();
  const clean = { ...values };
  for (const k of Object.keys(clean)) if (clean[k] === "") clean[k] = null;
  return actionRepository.create({ ...clean, created_by: user?.user?.id ?? null });
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
