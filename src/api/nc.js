import { supabase } from "@/lib/supabaseClient";

// ---- Não-conformidades ----------------------------------------------------

export async function listNonconformities() {
  const { data, error } = await supabase
    .from("nonconformities")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getNonconformity(id) {
  const { data, error } = await supabase.from("nonconformities").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createNonconformity(values) {
  const { data: user } = await supabase.auth.getUser();
  const clean = { ...values };
  for (const k of Object.keys(clean)) if (clean[k] === "") clean[k] = null;
  const { data, error } = await supabase
    .from("nonconformities")
    .insert({ ...clean, origem: clean.origem || "manual", created_by: user?.user?.id ?? null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateNonconformity(id, values) {
  const { data, error } = await supabase
    .from("nonconformities")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteNonconformity(id) {
  const { error } = await supabase.from("nonconformities").delete().eq("id", id);
  if (error) throw error;
}

// ---- Ações --------------------------------------------------------------

/** Ações de uma NC, já com o campo derivado `atrasada` da view v_actions. */
export async function listActionsForNC(ncId) {
  const { data, error } = await supabase
    .from("v_actions")
    .select("*")
    .eq("nonconformity_id", ncId)
    .order("prazo", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function listActions() {
  const { data, error } = await supabase
    .from("v_actions")
    .select("*")
    .order("prazo", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function createAction(values) {
  const { data: user } = await supabase.auth.getUser();
  const clean = { ...values };
  for (const k of Object.keys(clean)) if (clean[k] === "") clean[k] = null;
  const { data, error } = await supabase
    .from("actions")
    .insert({ ...clean, created_by: user?.user?.id ?? null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAction(id, values) {
  const patch = { ...values, updated_at: new Date().toISOString() };
  if (values.status === "concluida" && !values.concluida_em) {
    patch.concluida_em = new Date().toISOString().slice(0, 10);
  }
  const { data, error } = await supabase.from("actions").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteAction(id) {
  const { error } = await supabase.from("actions").delete().eq("id", id);
  if (error) throw error;
}

// ---- Resumo por quadro ------------------------------------------------

export async function ncSummaryForPanel(panelId) {
  const { data, error } = await supabase
    .from("nonconformities")
    .select("id, status, severidade")
    .eq("panel_id", panelId);
  if (error) throw error;
  const abertas = data.filter((n) => n.status === "aberta" || n.status === "em_tratamento");
  return {
    total: data.length,
    abertas: abertas.length,
    criticas: abertas.filter((n) => n.severidade === "critica").length,
    altas: abertas.filter((n) => n.severidade === "alta").length,
  };
}
