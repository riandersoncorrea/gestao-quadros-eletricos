import { supabase } from "@/lib/supabaseClient";
import { getInspectionFull } from "@/api/inspections";
import { dimensionScores, healthIndex, analysisFlags } from "@/lib/healthIndex";

export async function getHealthConfig() {
  const { data, error } = await supabase
    .from("health_index_config")
    .select("*")
    .order("ordem", { ascending: true });
  if (error) throw error;
  return data;
}

export async function saveHealthConfig(rows) {
  const { data: user } = await supabase.auth.getUser();
  const uid = user?.user?.id ?? null;
  for (const r of rows) {
    const { error } = await supabase
      .from("health_index_config")
      .update({ peso: Number(r.peso), ativo: r.ativo !== false, updated_by: uid })
      .eq("id", r.id);
    if (error) throw error;
  }
}

async function templateItems(templateId) {
  if (!templateId) return [];
  const { data, error } = await supabase
    .from("inspection_template_items")
    .select("id, codigo, titulo, modulo, obrigatorio")
    .eq("template_id", templateId);
  if (error) throw error;
  return data;
}

/**
 * Recalcula o Índice de Saúde e as flags de análise de uma inspeção.
 * - grava inspections.health_index_resultado
 * - substitui as analysis_flags dessa inspeção
 * - se for a inspeção mais recente do quadro, atualiza
 *   electrical_panels.health_index + health_index_updated_at
 */
export async function recomputeInspectionAnalysis(inspectionId) {
  const full = await getInspectionFull(inspectionId);
  const { inspection, responses, measurements, thermography } = full;
  const [config, items] = await Promise.all([
    getHealthConfig(),
    templateItems(inspection.template_id),
  ]);

  const scores = dimensionScores({ responses, measurements, thermography });
  const { index } = healthIndex(scores, config);
  const flags = analysisFlags({ responses, measurements, thermography, items });

  await supabase
    .from("inspections")
    .update({ health_index_resultado: index })
    .eq("id", inspectionId);

  await supabase.from("analysis_flags").delete().eq("inspection_id", inspectionId);
  if (flags.length) {
    const panelId = inspection.panel_ref_id || inspection.panel_id;
    const { error } = await supabase.from("analysis_flags").insert(
      flags.map((f) => ({
        inspection_id: inspectionId,
        panel_id: panelId,
        tipo: f.tipo,
        categoria: f.categoria,
        severidade: f.severidade,
        mensagem: f.mensagem,
      }))
    );
    if (error) throw error;
  }

  const panelId = inspection.panel_ref_id || inspection.panel_id;
  if (panelId) {
    const { data: latest } = await supabase
      .from("inspections")
      .select("id, inspection_date")
      .or(`panel_ref_id.eq.${panelId},panel_id.eq.${panelId}`)
      .neq("status", "cancelada")
      .order("inspection_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.id === inspectionId) {
      await supabase
        .from("electrical_panels")
        .update({ health_index: index, health_index_updated_at: new Date().toISOString() })
        .eq("id", panelId);
    }
  }

  return { index, flags, scores };
}

export async function getPanelFlags(panelId) {
  const { data, error } = await supabase
    .from("analysis_flags")
    .select("*")
    .eq("panel_id", panelId)
    .eq("resolvido", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
