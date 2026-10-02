import { supabase } from "@/lib/supabaseClient";

/** Ações de uma NC, já com o campo derivado `atrasada` da view v_actions. */
export async function listForNC(ncId) {
  const { data, error } = await supabase
    .from("v_actions")
    .select("*")
    .eq("nonconformity_id", ncId)
    .order("prazo", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function getById(id) {
  const { data, error } = await supabase.from("actions").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function listAll() {
  const { data, error } = await supabase
    .from("v_actions")
    .select("*")
    .order("prazo", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function create(values) {
  const { data, error } = await supabase.from("actions").insert(values).select().single();
  if (error) throw error;
  return data;
}

export async function bulkCreate(rows) {
  if (!rows.length) return [];
  const { data, error } = await supabase.from("actions").insert(rows).select();
  if (error) throw error;
  return data;
}

/**
 * Ações dos perfis informados, para equilibrar a atribuição automática
 * (ações em aberto por responsável e última ação automática recebida).
 */
export async function listForResponsibles(profileIds) {
  if (!profileIds.length) return [];
  const { data, error } = await supabase
    .from("actions")
    .select("responsavel_id, status, origem, created_at")
    .in("responsavel_id", profileIds);
  if (error) throw error;
  return data;
}

export async function update(id, patch) {
  const { data, error } = await supabase.from("actions").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function remove(id) {
  const { error } = await supabase.from("actions").delete().eq("id", id);
  if (error) throw error;
}

export async function getStatusForPanel(panelId) {
  const { data, error } = await supabase.from("v_actions").select("status, atrasada").eq("panel_id", panelId);
  if (error) throw error;
  return data;
}

export async function listAllForDashboard() {
  const { data, error } = await supabase.from("v_actions").select("id, panel_id, status, atrasada, prazo");
  if (error) throw error;
  return data;
}
