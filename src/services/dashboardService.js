import { supabase } from "@/lib/supabaseClient";
import { fetchHierarchy, listForDashboard as listPanelsForDashboard } from "@/repositories/panelRepository";
import { listStatusSeverityForDashboard } from "@/repositories/ncRepository";
import { listAllForDashboard as listActionsForDashboard } from "@/repositories/actionRepository";
import { listForDashboard as listInspectionsForDashboard, getForAdherence } from "@/repositories/inspectionRepository";
import { panelAdherence } from "@/lib/adherence";
import { format, subMonths, startOfMonth } from "date-fns";

// sap_orders é legado (Importação SAP) e não tem repository próprio —
// mantido como leitura direta aqui e em getPanelAdherence, como já estava.
async function getSapOrdersRaw() {
  const { data, error } = await supabase.from("sap_orders").select("panel_id, data_planejada");
  if (error) throw error;
  return data;
}

/**
 * Agregados da Torre de Controle. Uma consulta por domínio (via repository);
 * o resto é computado no cliente.
 */
export async function fetchDashboardData() {
  const [P, N, A, I, sapOrders, hierarchy] = await Promise.all([
    listPanelsForDashboard(),
    listStatusSeverityForDashboard(),
    listActionsForDashboard(),
    listInspectionsForDashboard(),
    getSapOrdersRaw(),
    fetchHierarchy(),
  ]);

  const locName = new Map((hierarchy.localidades || []).map((l) => [l.id, l.nome]));

  // --- Índice de Saúde da carteira ---
  const withHI = P.filter((p) => p.health_index != null);
  const isMedio = withHI.length ? Math.round(withHI.reduce((s, p) => s + p.health_index, 0) / withHI.length) : null;
  const healthBands = {
    bom: withHI.filter((p) => p.health_index >= 80).length,
    atencao: withHI.filter((p) => p.health_index >= 50 && p.health_index < 80).length,
    critico: withHI.filter((p) => p.health_index < 50).length,
    semAvaliacao: P.length - withHI.length,
  };

  // --- NCs ---
  const abertas = N.filter((n) => ["aberta", "em_tratamento"].includes(n.status));
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
  const acoesPendentes = A.filter((a) => ["aberta", "em_andamento"].includes(a.status)).length;

  // --- Aderência ao plano (geral e por localidade) ---
  const ordersByPanel = new Map();
  for (const o of sapOrders) {
    if (!ordersByPanel.has(o.panel_id)) ordersByPanel.set(o.panel_id, []);
    ordersByPanel.get(o.panel_id).push(o);
  }
  const inspByPanel = new Map();
  for (const ins of I) {
    const pid = ins.panel_ref_id || ins.panel_id;
    if (!inspByPanel.has(pid)) inspByPanel.set(pid, []);
    inspByPanel.get(pid).push(ins);
  }
  let cumpridas = 0, due = 0;
  const adhByLoc = new Map();
  for (const p of P) {
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

  // --- Inspeções ao longo do tempo (6 meses) ---
  const months = Array.from({ length: 6 }, (_, i) => startOfMonth(subMonths(new Date(), 5 - i)));
  const inspPorMes = months.map((m) => {
    const key = format(m, "yyyy-MM");
    return {
      mes: format(m, "MM/yy"),
      total: I.filter((ins) => ins.inspection_date && ins.inspection_date.slice(0, 7) === key).length,
      reprovadas: I.filter((ins) => ins.inspection_date && ins.inspection_date.slice(0, 7) === key && ins.overall_result === "reprovado").length,
    };
  });

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
    inspecoesTotais: I.length,
  };
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
