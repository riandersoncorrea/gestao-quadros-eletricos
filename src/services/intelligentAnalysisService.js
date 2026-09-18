import * as panelRepository from "@/repositories/panelRepository";
import * as inspectionRepository from "@/repositories/inspectionRepository";
import { getActiveTemplate } from "@/services/inspectionService";
import {
  filterAnalysisData,
  computeExecutiveKpis,
  computeDescriptive,
  computeConformityByDimension,
  computeParetoNaoConformidades,
  computeByLocalidade,
  computeTemporalEvolution,
  computeRecurrence,
  computeHealthVsConformity,
  computeDiagnostics,
  computeDimensionTemporalSeries,
  countApplicableForRequisito,
  buildManagerialInsights,
} from "@/domain/intelligentAnalysis";
import {
  MIN_INSPECTIONS_FOR_TREND,
  projectConformity,
  projectNaoConformidades,
  predictDimensionTrends,
  estimateRecurrenceRate,
} from "@/domain/intelligentAnalysisPredictive";

/**
 * Busca os dados brutos da Análise Inteligente dos Dados uma única vez
 * (mesmo padrão do Dashboard — src/services/dashboardService.js): os
 * filtros da página recortam esse mesmo resultado no cliente, sem refazer
 * as consultas a cada mudança de filtro.
 */
export async function fetchIntelligentAnalysisRaw() {
  const [panels, hierarchy, inspections, responses, tpl] = await Promise.all([
    panelRepository.listForDashboard(),
    panelRepository.fetchHierarchy(),
    inspectionRepository.listForAnalysis(),
    inspectionRepository.listAllResponses(),
    getActiveTemplate(),
  ]);
  return { panels, hierarchy, inspections, responses, templateItems: tpl.items };
}

/**
 * Recalcula toda a Análise Inteligente dos Dados a partir dos dados brutos
 * e dos filtros ativos. filters: { localidadeId, dateRange, panelId, status, period }.
 * `period` só é usado para escolher o grão da evolução temporal
 * (ver pickBucketGranularity) — o recorte de datas em si já vem em dateRange.
 */
export function computeIntelligentAnalysis(raw, filters) {
  const base = filterAnalysisData(raw, filters);

  if (base.filteredInspections.length === 0) {
    return { hasData: false };
  }

  const kpis = computeExecutiveKpis(base);
  const descriptive = computeDescriptive(base, kpis);
  const dimensions = computeConformityByDimension(base);
  const pareto = computeParetoNaoConformidades(base);
  const byLocalidade = computeByLocalidade(base);
  const temporal = computeTemporalEvolution(base, filters.period);
  const recurrence = computeRecurrence(base);
  const healthVsConformity = computeHealthVsConformity(base);
  const diagnostics = computeDiagnostics({ dimensions, pareto, byLocalidade, recurrence, temporal });

  const enoughForTrend = base.filteredInspections.length >= MIN_INSPECTIONS_FOR_TREND;
  const conformityProjection = enoughForTrend
    ? projectConformity(temporal.pontos)
    : { insuficiente: true, motivo: "Dados históricos insuficientes para gerar projeção confiável." };
  const ncTrend = enoughForTrend
    ? projectNaoConformidades(temporal.pontos)
    : { insuficiente: true, motivo: "Dados históricos insuficientes para identificar tendência de não conformidades." };
  const dimensionTrends = enoughForTrend
    ? predictDimensionTrends(computeDimensionTemporalSeries(base, filters.period))
    : {};

  const recurrenceComTaxa = recurrence.casos.map((c) => {
    const aplicaveis = countApplicableForRequisito(base, c.panelId, c.codigo);
    return { ...c, taxa: estimateRecurrenceRate(c.ocorrencias, aplicaveis) };
  });

  const predictive = { enoughForTrend, conformityProjection, ncTrend, dimensionTrends };
  const insights = buildManagerialInsights({ kpis, diagnostics, dimensions, pareto, byLocalidade, recurrence, predictive: { conformityProjection } });

  return {
    hasData: true,
    kpis,
    descriptive,
    dimensions,
    pareto,
    byLocalidade,
    temporal,
    recurrence: { ...recurrence, casos: recurrenceComTaxa },
    healthVsConformity,
    diagnostics,
    predictive,
    insights,
  };
}
