import { supabase } from "@/lib/supabaseClient";

export async function getActiveTemplateRow() {
  const { data, error } = await supabase
    .from("inspection_templates")
    .select("*")
    .eq("ativo", true)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getTemplateItems(templateId) {
  const { data, error } = await supabase
    .from("inspection_template_items")
    .select("*")
    .eq("template_id", templateId)
    .eq("ativo", true)
    .order("modulo", { ascending: true })
    .order("ordem", { ascending: true });
  if (error) throw error;
  return data;
}

/** Ordens de manutenção planejadas (SAP, legado) relacionadas a um quadro. */
export async function getSapOrdersForPanel(panelId) {
  const { data, error } = await supabase
    .from("sap_orders")
    .select("id, ordem, plano, data_planejada, frequencia")
    .eq("panel_id", panelId)
    .order("data_planejada", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getInspectionAggregate(id) {
  const [insp, responses, measurements, thermo, ncs, flags] = await Promise.all([
    supabase.from("inspections").select("*").eq("id", id).single(),
    supabase.from("inspection_responses").select("*").eq("inspection_id", id),
    supabase.from("measurements").select("*").eq("inspection_id", id),
    supabase.from("thermography_points").select("*").eq("inspection_id", id),
    supabase.from("nonconformities").select("*").eq("inspection_id", id).order("created_at", { ascending: true }),
    supabase.from("analysis_flags").select("*").eq("inspection_id", id).order("severidade", { ascending: true }),
  ]);
  const err = insp.error || responses.error || measurements.error || thermo.error || ncs.error || flags.error;
  if (err) throw err;
  return {
    inspection: insp.data,
    responses: responses.data,
    measurements: measurements.data,
    thermography: thermo.data,
    nonconformities: ncs.data,
    flags: flags.data,
  };
}

export async function insertInspection(row) {
  const { data, error } = await supabase.from("inspections").insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function insertResponses(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from("inspection_responses").insert(rows);
  if (error) throw error;
}

export async function insertMeasurements(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from("measurements").insert(rows);
  if (error) throw error;
}

export async function insertThermography(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from("thermography_points").insert(rows);
  if (error) throw error;
}

/**
 * Inspeção mais recente (não cancelada) de um quadro. Usada tanto pelo
 * recálculo do Índice de Saúde quanto pela detecção de inspeção vigente
 * (ver findVigenciaConflict em domain/inspectionRules.js) — por isso inclui
 * `next_inspection`/`status` além do `id`/`inspection_date` originais.
 * Em caso de empate na data (duas inspeções no mesmo dia), desempata pela
 * mais recentemente criada.
 */
export async function getMostRecentForPanel(panelId) {
  const { data, error } = await supabase
    .from("inspections")
    .select("id, inspection_date, next_inspection, status")
    .or(`panel_ref_id.eq.${panelId},panel_id.eq.${panelId}`)
    .neq("status", "cancelada")
    .order("inspection_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setHealthIndexResult(inspectionId, index) {
  const { error } = await supabase
    .from("inspections")
    .update({ health_index_resultado: index })
    .eq("id", inspectionId);
  if (error) throw error;
}

export async function listForDashboard() {
  const { data, error } = await supabase
    .from("inspections")
    .select("id, inspection_date, overall_result, status, panel_ref_id, panel_id");
  if (error) throw error;
  return data;
}

/** Inspeções para a Análise Inteligente dos Dados: inclui o Índice de Saúde por inspeção (não usado no Dashboard). */
export async function listForAnalysis() {
  const { data, error } = await supabase
    .from("inspections")
    .select("id, inspection_date, overall_result, status, panel_ref_id, panel_id, health_index_resultado");
  if (error) throw error;
  return data;
}

/** Todas as respostas de checklist (todas as inspeções) — usado para agregações client-side na Análise Inteligente dos Dados. */
export async function listAllResponses() {
  const { data, error } = await supabase
    .from("inspection_responses")
    .select("id, inspection_id, template_item_id, modulo, titulo, resposta");
  if (error) throw error;
  return data;
}

export async function getForAdherence(panelId) {
  const { data, error } = await supabase
    .from("inspections")
    .select("inspection_date, status")
    .or(`panel_ref_id.eq.${panelId},panel_id.eq.${panelId}`);
  if (error) throw error;
  return data;
}
