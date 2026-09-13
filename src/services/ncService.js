import { supabase } from "@/lib/supabaseClient";
import * as ncRepository from "@/repositories/ncRepository";

export async function listNonconformities() {
  return ncRepository.list();
}

export async function getNonconformity(id) {
  return ncRepository.getById(id);
}

export async function createNonconformity(values) {
  const { data: user } = await supabase.auth.getUser();
  const clean = { ...values };
  for (const k of Object.keys(clean)) if (clean[k] === "") clean[k] = null;
  return ncRepository.create({ ...clean, origem: clean.origem || "manual", created_by: user?.user?.id ?? null });
}

export async function updateNonconformity(id, values) {
  return ncRepository.update(id, { ...values, updated_at: new Date().toISOString() });
}

export async function deleteNonconformity(id) {
  return ncRepository.remove(id);
}

export async function ncSummaryForPanel(panelId) {
  const data = await ncRepository.getStatusSeverityForPanel(panelId);
  const abertas = data.filter((n) => n.status === "aberta" || n.status === "em_tratamento");
  return {
    total: data.length,
    abertas: abertas.length,
    criticas: abertas.filter((n) => n.severidade === "critica").length,
    altas: abertas.filter((n) => n.severidade === "alta").length,
  };
}
