import { supabase } from "@/lib/supabaseClient";

export const AUDIT_PAGE_SIZE = 50;

export async function fetchAuditLog({ page = 0, tabela = "", acao = "", q = "" } = {}) {
  let query = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE + AUDIT_PAGE_SIZE - 1);

  if (tabela) query = query.eq("tabela", tabela);
  if (acao) query = query.eq("acao", acao);
  if (q) query = query.or(`usuario_email.ilike.%${q}%,campo.ilike.%${q}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

export async function fetchRecordAudit(tabela, registroId) {
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .eq("tabela", tabela)
    .eq("registro_id", registroId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function panelLocationHistory(panelId) {
  const { data, error } = await supabase
    .from("panel_location_history")
    .select("*")
    .eq("panel_id", panelId)
    .order("changed_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function panelConditionHistory(panelId) {
  const { data, error } = await supabase
    .from("panel_condition_history")
    .select("*")
    .eq("panel_id", panelId)
    .order("snapshot_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function insertConditionSnapshot(row) {
  const { error } = await supabase.from("panel_condition_history").insert(row);
  if (error) throw error;
}
