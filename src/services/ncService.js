import { supabase } from "@/lib/supabaseClient";

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
