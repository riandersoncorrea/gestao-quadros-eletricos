import { supabase } from "@/lib/supabaseClient";
import { fetchHierarchy, listForDashboard as listPanelsForDashboard } from "@/repositories/panelRepository";
import { listStatusSeverityForDashboard } from "@/repositories/ncRepository";
import { listAllForDashboard as listActionsForDashboard } from "@/repositories/actionRepository";
import { listForDashboard as listInspectionsForDashboard, getForAdherence } from "@/repositories/inspectionRepository";
import { panelAdherence } from "@/domain/adherence";
import { isOpenNonconformity } from "@/domain/nonconformityRules";
import { isOpenAction } from "@/domain/actionRules";
import { healthBandKey } from "@/domain/healthIndex";
import { LOCALIDADE_ALL, isWithinRange, matchesLocalidade } from "@/domain/dashboardFilters";
import { format, subMonths, startOfMonth } from "date-fns";

// sap_orders é legado (Importação SAP) e não tem repository próprio —
// mantido como leitura direta aqui e em getPanelAdherence, como já estava.
async function getSapOrdersRaw() {
  const { data, error } = await supabase.from("sap_orders").select("panel_id, data_planejada");
  if (error) throw error;
  return data;
}

/**
 * Busca os dados brutos usados pelo Dashboard, uma consulta por domínio
 * (via repository). Cacheável: os filtros de localidade/período do Dashboard
 * recortam esse mesmo resultado no cliente, sem refazer as consultas.
 */
export async function fetchDashboardRaw() {
  const [P, N, A, I, sapOrders, hierarchy] = await Promise.all([
    listPanelsForDashboard(),
    listStatusSeverityForDashboard(),
    listActionsForDashboard(),
    listInspectionsForDashboard(),
    getSapOrdersRaw(),
    fetchHierarchy(),
  ]);
  return { P, N, A, I, sapOrders, hierarchy };
}

/**
 * Agregados do Dashboard a partir dos dados brutos.
 * filters: { localidadeId = "all", dateRange = null } — dateRange já resolvido
 * ({ start, end } ou null para "todo o período").
 */
export function computeDashboardData(raw, filters = {}) {
  const { P: P_all, N: N_all, A: A_all, I: I_all, sapOrders, hierarchy } = raw;
  const { localidadeId = LOCALIDADE_ALL, dateRange = null } = filters;

  const locName = new Map((hierarchy.localidades || []).map((l) => [l.id, l.nome]));
  const panelLocMap = new Map(P_all.map((p) => [p.id, p.localidade_id]));

  // --- Recorte por localidade (dimensão presente em todos os domínios via panel_id) ---
  const P = localidadeId === LOCALIDADE_ALL ? P_all : P_all.filter((p) => p.localidade_id === localidadeId);
  const N = N_all.filter((n) => matchesLocalidade(n.panel_id, localidadeId, panelLocMap));
  const A = A_all.filter((a) => matchesLocalidade(a.panel_id, localidadeId, panelLocMap));
  const I = I_all.filter((i) => matchesLocalidade(i.panel_ref_id || i.panel_id, localidadeId, panelLocMap));

  // --- Índice de Saúde da carteira ---
  const withHI = P.filter((p) => p.health_index != null);
  const isMedio = withHI.length ? Math.round(withHI.reduce((s, p) => s + p.health_index, 0) / withHI.length) : null;
  const healthBands = { bom: 0, atencao: 0, critico: 0, semAvaliacao: 0 };
  for (const p of P) healthBands[healthBandKey(p.health_index)] += 1;

  // --- NCs (status atual + data de abertura, quando um período está selecionado) ---
  const abertas = N.filter((n) => isOpenNonconformity(n.status) && isWithinRange(n.created_at, dateRange));
  const ncAbertas = abertas.length;
  const ncCriticas = abertas.filter((n) => n.severidade === "critica").length;
  const ncPorSeveridade = ["critica", "alta", "media", "baixa"].map((sev) => ({
    sev, label: { critica: "Crítica", alta: "Alta", media: "Média", baixa: "Baixa" }[sev],
    n: abertas.filter((n) => n.severidade === sev).length,
  }));
  const catMap = new Map();
  for (const n of abertas) {
    const c = n.categoria || "Sem categoria";
    catMap.set(c, (catMap.get(c) || 0) + 1);
  }
  const ncPorCategoria = [...catMap.entries()].map(([categoria, n]) => ({ categoria, n })).sort((a, b) => b.n - a.n).slice(0, 8);

  // --- Ações ---
  const acoesAtrasadas = A.filter((a) => a.atrasada).length;
  const acoesPendentes = A.filter((a) => isOpenAction(a.status)).length;

  // --- Aderência ao plano (geral e por localidade) ---
  // Cálculo legado, ainda usado pelo Relatório executivo: sempre a partir dos
  // dados completos (não recortados pelos filtros do Dashboard).
  const ordersByPanel = new Map();
  for (const o of sapOrders) {
    if (!ordersByPanel.has(o.panel_id)) ordersByPanel.set(o.panel_id, []);
    ordersByPanel.get(o.panel_id).push(o);
  }
  const inspByPanel = new Map();
  for (const ins of I_all) {
    const pid = ins.panel_ref_id || ins.panel_id;
    if (!inspByPanel.has(pid)) inspByPanel.set(pid, []);
    inspByPanel.get(pid).push(ins);
  }
  let cumpridas = 0, due = 0;
  const adhByLoc = new Map();
  for (const p of P_all) {
    const a = panelAdherence(ordersByPanel.get(p.id) || [], inspByPanel.get(p.id) || []);
    cumpridas += a.cumpridas; due += a.due;
    if (p.localidade_id && a.due > 0) {
      const e = adhByLoc.get(p.localidade_id) || { nome: locName.get(p.localidade_id) || "?", cumpridas: 0, due: 0 };
      e.cumpridas += a.cumpridas; e.due += a.due;
      adhByLoc.set(p.localidade_id, e);
    }
  }
  const aderenciaGeral = due ? Math.round((100 * cumpridas) / due) : null;
  const aderenciaPorLocalidade = [...adhByLoc.values()]
    .map((e) => ({ ...e, percent: Math.round((100 * e.cumpridas) / e.due) }))
    .sort((a, b) => a.percent - b.percent);

  // --- Inspeções ao longo do tempo (janela fixa de 6 meses; não afetada pelo
  // filtro de período, que teria semântica ambígua com essa janela própria) ---
  const months = Array.from({ length: 6 }, (_, i) => startOfMonth(subMonths(new Date(), 5 - i)));
  const inspPorMes = months.map((m) => {
    const key = format(m, "yyyy-MM");
    return {
      mes: format(m, "MM/yy"),
      total: I.filter((ins) => ins.inspection_date && ins.inspection_date.slice(0, 7) === key).length,
      reprovadas: I.filter((ins) => ins.inspection_date && ins.inspection_date.slice(0, 7) === key && ins.overall_result === "reprovado").length,
    };
  });
  // --- Inspeções realizadas no período selecionado (KPI "histórico") ---
  const inspecoesNoPeriodo = I.filter((ins) => isWithinRange(ins.inspection_date, dateRange));

  // --- Ranking de quadros prioritários ---
  const ncByPanel = new Map();
  for (const n of abertas) ncByPanel.set(n.panel_id, (ncByPanel.get(n.panel_id) || 0) + 1);
  const ranking = P
    .map((p) => ({
      id: p.id, tag: p.tag, name: p.name, health_index: p.health_index,
      criticality: p.criticality, ncAbertas: ncByPanel.get(p.id) || 0,
      score: (p.health_index != null ? 100 - p.health_index : 40) + (ncByPanel.get(p.id) || 0) * 15 + ({ A: 20, B: 10, C: 3, D: 0 }[p.criticality] || 0),
    }))
    .filter((p) => p.ncAbertas > 0 || (p.health_index != null && p.health_index < 70))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const hoje = new Date().toISOString().slice(0, 10);
  const inspecoesVencidas = P.filter((p) => p.next_inspection_date && p.next_inspection_date < hoje).length;

  return {
    totalQuadros: P.length,
    isMedio,
    healthBands,
    ncAbertas,
    ncCriticas,
    ncPorSeveridade,
    ncPorCategoria,
    acoesAtrasadas,
    acoesPendentes,
    aderenciaGeral,
    aderenciaPorLocalidade,
    inspPorMes,
    ranking,
    inspecoesVencidas,
    inspecoesTotais: inspecoesNoPeriodo.length,
  };
}

/**
 * Agregados do Dashboard sem filtros — usado pelo Relatório executivo.
 */
export async function fetchDashboardData() {
  const raw = await fetchDashboardRaw();
  return computeDashboardData(raw);
}

/**
 * Aderência ao plano de um único quadro (ordens SAP planejadas vs.
 * inspeções realizadas). Usada na tela de detalhe do quadro.
 */
export async function getPanelAdherence(panelId) {
  const { data: orders, error } = await supabase
    .from("sap_orders")
    .select("ordem, data_planejada")
    .eq("panel_id", panelId);
  if (error) throw error;
  const inspections = await getForAdherence(panelId);
  return panelAdherence(orders || [], inspections || []);
}
