import { supabase } from "@/lib/supabaseClient";
import * as healthIndexRepository from "@/repositories/healthIndexRepository";
import * as inspectionRepository from "@/repositories/inspectionRepository";
import { getSnapshotFields, updateHealthIndex } from "@/repositories/panelRepository";
import { getStatusSeverityForPanel } from "@/repositories/ncRepository";
import { getStatusForPanel } from "@/repositories/actionRepository";
import { insertConditionSnapshot } from "@/repositories/auditRepository";
import { getInspectionFull } from "@/services/inspectionService";
import { dimensionScores, healthIndex, analysisFlags } from "@/lib/healthIndex";

export async function getHealthConfig() {
  return healthIndexRepository.getConfig();
}

export async function saveHealthConfig(rows) {
  const { data: user } = await supabase.auth.getUser();
  const uid = user?.user?.id ?? null;
  for (const r of rows) {
    await healthIndexRepository.updateConfigRow(r.id, {
      peso: Number(r.peso),
      ativo: r.ativo !== false,
      updated_by: uid,
    });
  }
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
    healthIndexRepository.getConfig(),
    healthIndexRepository.getTemplateItemsSummary(inspection.template_id),
  ]);

  const scores = dimensionScores({ responses, measurements, thermography });
  const { index } = healthIndex(scores, config);
  const flags = analysisFlags({ responses, measurements, thermography, items });

  await inspectionRepository.setHealthIndexResult(inspectionId, index);

  const panelId = inspection.panel_ref_id || inspection.panel_id;
  await healthIndexRepository.replaceInspectionFlags(
    inspectionId,
    flags.map((f) => ({
      inspection_id: inspectionId,
      panel_id: panelId,
      tipo: f.tipo,
      categoria: f.categoria,
      severidade: f.severidade,
      mensagem: f.mensagem,
    }))
  );

  if (panelId) {
    const [latest, panel, ncs, acts] = await Promise.all([
      inspectionRepository.getMostRecentForPanel(panelId),
      getSnapshotFields(panelId),
      getStatusSeverityForPanel(panelId),
      getStatusForPanel(panelId),
    ]);

    if (latest?.id === inspectionId) {
      await updateHealthIndex(panelId, index);
    }

    const ncAbertas = (ncs || []).filter((n) => ["aberta", "em_tratamento"].includes(n.status));
    await insertConditionSnapshot({
      panel_id: panelId,
      health_index: index,
      status: panel?.status ?? null,
      criticality: panel?.criticality ?? null,
      nc_abertas: ncAbertas.length,
      nc_criticas: ncAbertas.filter((n) => n.severidade === "critica").length,
      nc_altas: ncAbertas.filter((n) => n.severidade === "alta").length,
      acoes_abertas: (acts || []).filter((a) => ["aberta", "em_andamento"].includes(a.status)).length,
      acoes_atrasadas: (acts || []).filter((a) => a.atrasada).length,
      latitude: panel?.latitude ?? null,
      longitude: panel?.longitude ?? null,
      localidade_id: panel?.localidade_id ?? null,
      source: "inspecao_validada",
    });
  }

  return { index, flags, scores };
}

export async function getPanelFlags(panelId) {
  return healthIndexRepository.getUnresolvedFlagsForPanel(panelId);
}
