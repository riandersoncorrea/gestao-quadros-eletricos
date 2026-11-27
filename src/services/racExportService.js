import * as panelRepository from "@/repositories/panelRepository";
import * as ncRepository from "@/repositories/ncRepository";
import * as inspectionRepository from "@/repositories/inspectionRepository";
import { buildRacRows } from "@/domain/racExport";
import { classifyRiskNc, INTERDICTION_RISK_CODES } from "@/domain/interdictionReport";
import { getActiveUnit } from "@/lib/unitScope";
import { unitUsesSite } from "@/domain/unitScope";

/**
 * Quadros (ids, texto) que já caracterizaram risco de interdição — aberto
 * ou já corrigido — pela MESMA regra do relatório Risco de Interdição
 * (domain/interdictionReport.js#classifyRiskNc), sobre as NCs de
 * PRO-01/ATR-01 dos quadros informados. Só leitura; o relatório não muda.
 */
async function riskPanelIds(panelIds) {
  const items = await inspectionRepository.listTemplateItemsByCodes(INTERDICTION_RISK_CODES);
  const codigoByItemId = new Map(items.map((i) => [i.id, i.codigo]));
  const itemIds = items.map((i) => i.id);
  const ids = new Set(panelIds.map(String));
  const ncs = (await ncRepository.listByTemplateItems(itemIds))
    .filter((nc) => nc.panel_id && ids.has(String(nc.panel_id)))
    .map((nc) => ({ ...nc, codigo: codigoByItemId.get(nc.template_item_id) || null }));
  const inspectionIds = ncs.map((nc) => nc.inspection_id).filter(Boolean);
  const [inspections, responses] = await Promise.all([
    inspectionRepository.listDatesAndStatusByIds(inspectionIds),
    inspectionRepository.listResponsesForItems(inspectionIds, itemIds),
  ]);
  const inspectionById = new Map(inspections.map((i) => [i.id, i]));
  const responsesByInspection = new Map();
  for (const r of responses) {
    const codigo = codigoByItemId.get(r.template_item_id);
    if (!codigo) continue;
    if (!responsesByInspection.has(r.inspection_id)) responsesByInspection.set(r.inspection_id, {});
    responsesByInspection.get(r.inspection_id)[codigo] = r;
  }
  const risk = new Set();
  for (const nc of ncs) {
    const cls = classifyRiskNc(nc, nc.inspection_id ? inspectionById.get(nc.inspection_id) : null,
      responsesByInspection.get(nc.inspection_id) || {});
    if (cls.regra) risk.add(String(nc.panel_id));
  }
  return risk;
}

/**
 * Linhas da base RAC da unidade ativa (uma por NC — regras em
 * domain/racExport.js). Só leitura e paginado: quadros elegíveis da
 * unidade, NCs deles (todos os status), itens de origem, inspeções e risco.
 * Independe dos filtros e da paginação da tela.
 */
export async function fetchRacRows() {
  const unit = getActiveUnit();
  const [panels, hierarchy] = await Promise.all([
    panelRepository.listForRacExport(),
    panelRepository.fetchHierarchy(),
  ]);
  const panelIds = panels.map((p) => p.id);
  if (!panelIds.length) return [];
  const [ncs, inspections, risk] = await Promise.all([
    ncRepository.listForRacExport(panelIds),
    inspectionRepository.listForDashboard(),
    riskPanelIds(panelIds),
  ]);
  const templateItems = await inspectionRepository.listTemplateItemsByIds(ncs.map((n) => n.template_item_id).filter(Boolean));
  return buildRacRows({ panels, ncs, templateItems, inspections, hierarchy, usesSite: unitUsesSite(unit), riskPanelIds: risk });
}
