import { supabase } from "@/lib/supabaseClient";
import { fetchAllPages } from "@/repositories/pagination";

export async function list() {
  const { data, error } = await supabase
    .from("nonconformities")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getById(id) {
  const { data, error } = await supabase.from("nonconformities").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function create(values) {
  const { data, error } = await supabase.from("nonconformities").insert(values).select().single();
  if (error) throw error;
  return data;
}

export async function update(id, values) {
  const { data, error } = await supabase
    .from("nonconformities")
    .update(values)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function remove(id) {
  const { error } = await supabase.from("nonconformities").delete().eq("id", id);
  if (error) throw error;
}

export async function bulkCreate(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from("nonconformities").insert(rows);
  if (error) throw error;
}

export async function getStatusSeverityForPanel(panelId) {
  const { data, error } = await supabase
    .from("nonconformities")
    .select("id, status, severidade")
    .eq("panel_id", panelId);
  if (error) throw error;
  return data;
}

// inspection_id e template_item_id foram somados aqui (a consulta em lote
// já usada pelo Dashboard) para a Análise Inteligente conseguir cruzar
// cada NC com o requisito do checklist (código) e a inspeção de origem —
// sem criar uma segunda consulta/definição de "NC aberta". O Dashboard
// ignora essas duas colunas extras, sem nenhuma mudança de comportamento.
// Paginada (ver repositories/pagination.js) para não perder NCs quando a
// tabela passar de 1000 linhas.
export async function listStatusSeverityForDashboard() {
  return fetchAllPages(() =>
    supabase
      .from("nonconformities")
      .select("id, panel_id, status, severidade, categoria, created_at, inspection_id, template_item_id")
      .order("id", { ascending: true })
  );
}

export async function listStatusSeverityForMap() {
  const { data, error } = await supabase.from("nonconformities").select("panel_id, status, severidade");
  if (error) throw error;
  return data;
}
