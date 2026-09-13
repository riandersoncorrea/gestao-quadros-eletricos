import { supabase } from "@/lib/supabaseClient";

export const AUDIT_PAGE_SIZE = 50;

/** Tabelas auditadas (para o filtro). Rótulo -> nome da tabela. */
export const AUDITED_TABLES = [
  { value: "electrical_panels", label: "Quadros" },
  { value: "inspections", label: "Inspeções" },
  { value: "inspection_responses", label: "Respostas de inspeção" },
  { value: "nonconformities", label: "Não conformidades" },
  { value: "actions", label: "Ações" },
  { value: "localidades", label: "Localidades" },
  { value: "locais", label: "Locais" },
  { value: "sublocais", label: "Sublocais" },
  { value: "sap_import_batches", label: "Lotes SAP" },
  { value: "sap_orders", label: "Ordens SAP" },
  { value: "health_index_config", label: "Config. Índice de Saúde" },
  { value: "profiles", label: "Usuários" },
];

/**
 * Log de auditoria paginado no servidor (RLS: só admin).
 * filtros: { tabela, acao, q } — q busca em usuário/campo.
 */
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

/** Histórico de auditoria de um registro específico. */
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
