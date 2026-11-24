import { supabase } from "@/lib/supabaseClient";
import { fetchAllPages, fetchAllPagesByIds } from "@/repositories/pagination";

// Paginada (ver repositories/pagination.js): a tabela passou de 1000 linhas
// com a importação da EFC e o recorte por unidade é feito no cliente
// (scopeRowsToActiveUnit) — sem paginar, o administrador geral recebia só as
// 1000 NCs mais recentes de todas as unidades antes do filtro. O desempate
// por id mantém a ordenação estável entre as páginas.
export async function list() {
  return fetchAllPages(() =>
    supabase
      .from("nonconformities")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
  );
}

/** Todas as NCs de um quadro (histórico do quadro, qualquer status), na ordem de list(). */
export async function listForPanel(panelId) {
  return fetchAllPages(() =>
    supabase
      .from("nonconformities")
      .select("*")
      .eq("panel_id", panelId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
  );
}

/** Quadro das NCs informadas (para ações sem quadro próprio). */
export async function listPanelIdsByIds(ncIds) {
  return fetchAllPagesByIds(ncIds, (ids) =>
    supabase
      .from("nonconformities")
      .select("id, panel_id")
      .in("id", ids)
      .order("id", { ascending: true })
  );
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

/** Insere as NCs e retorna as linhas gravadas (com id). */
export async function bulkCreate(rows) {
  if (!rows.length) return [];
  const { data, error } = await supabase.from("nonconformities").insert(rows).select();
  if (error) throw error;
  return data;
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
      .select("id, panel_id, status, severidade, categoria, created_at, concluida_em, inspection_id, template_item_id")
      .order("id", { ascending: true })
  );
}

export async function listStatusSeverityForMap() {
  return fetchAllPages(() =>
    supabase
      .from("nonconformities")
      .select("id, panel_id, status, severidade")
      .order("id", { ascending: true })
  );
}

/**
 * TODAS as NCs (qualquer status, inclusive canceladas) de itens do
 * checklist — base do relatório de risco de interdição (PRO-01/ATR-01).
 */
export async function listByTemplateItems(itemIds) {
  if (!itemIds.length) return [];
  return fetchAllPages(() =>
    supabase
      .from("nonconformities")
      .select("id, panel_id, inspection_id, template_item_id, status, created_at, concluida_em, updated_at")
      .in("template_item_id", itemIds)
      .order("id", { ascending: true })
  );
}
