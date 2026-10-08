import { supabase } from "@/lib/supabaseClient";
import { fetchAllPages } from "@/repositories/pagination";

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

// Paginada (ver repositories/pagination.js): com uma ação automática por
// NC de checklist a tabela passa de 1000 linhas e o PostgREST cortaria o
// excedente sem erro. `id` desempata o prazo para as páginas serem estáveis.
export async function listAll() {
  return fetchAllPages(() =>
    supabase
      .from("v_actions")
      .select("*")
      .order("prazo", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
  );
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

// Paginada pelo mesmo motivo de listAll: sem isso o Dashboard contava só as
// primeiras 1000 ações (em ordem arbitrária), e uma ação concluída podia
// ficar de fora da amostra — "Ações atrasadas"/"pendentes" não mudavam.
export async function listAllForDashboard() {
  return fetchAllPages(() =>
    supabase
      .from("v_actions")
      .select("id, panel_id, status, atrasada, prazo")
      .order("id", { ascending: true })
  );
}

/**
 * Ações "Em execução" (status em_andamento) com o quadro e a descrição da
 * NC embutidos — base do filtro "Com ações em execução" e do "Tratar ação"
 * da página Checklists. Uma consulta para todos os quadros.
 */
export async function listByStatusWithNC(status) {
  const { data, error } = await supabase
    .from("actions")
    .select("*, nonconformity:nonconformities(panel_id, descricao, tag)")
    .eq("status", status)
    .order("prazo", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}
