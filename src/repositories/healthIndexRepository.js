import { supabase } from "@/lib/supabaseClient";

export async function getConfig() {
  const { data, error } = await supabase
    .from("health_index_config")
    .select("*")
    .order("ordem", { ascending: true });
  if (error) throw error;
  return data;
}

export async function updateConfigRow(id, values) {
  const { error } = await supabase.from("health_index_config").update(values).eq("id", id);
  if (error) throw error;
}

export async function getTemplateItemsSummary(templateId) {
  if (!templateId) return [];
  const { data, error } = await supabase
    .from("inspection_template_items")
    .select("id, codigo, titulo, modulo, obrigatorio")
    .eq("template_id", templateId);
  if (error) throw error;
  return data;
}

export async function replaceInspectionFlags(inspectionId, flagRows) {
  await supabase.from("analysis_flags").delete().eq("inspection_id", inspectionId);
  if (!flagRows.length) return;
  const { error } = await supabase.from("analysis_flags").insert(flagRows);
  if (error) throw error;
}

export async function getUnresolvedFlagsForPanel(panelId) {
  const { data, error } = await supabase
    .from("analysis_flags")
    .select("*")
    .eq("panel_id", panelId)
    .eq("resolvido", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listAllUnresolvedFlags() {
  const { data, error } = await supabase
    .from("analysis_flags")
    .select("panel_id, severidade")
    .eq("resolvido", false);
  if (error) throw error;
  return data;
}
