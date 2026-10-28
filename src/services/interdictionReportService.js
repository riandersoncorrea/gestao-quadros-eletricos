import * as inspectionRepository from "@/repositories/inspectionRepository";
import * as ncRepository from "@/repositories/ncRepository";
import * as actionRepository from "@/repositories/actionRepository";
import * as panelRepository from "@/repositories/panelRepository";
import { buildInterdictionReport, localDate, INTERDICTION_RISK_CODES } from "@/domain/interdictionReport";

/**
 * Relatório "Evolução das corretivas nos quadros com risco de interdição":
 * busca todas as NCs de PRO-01/ATR-01 (inclusive canceladas), suas
 * inspeções, respostas de PRO-01/ATR-01 (área molhada) e ações, e monta o
 * relatório em domain/interdictionReport.js. Só leitura — mesmas tabelas e
 * permissões (RLS) das demais telas.
 */
export async function fetchInterdictionReport() {
  const items = await inspectionRepository.listTemplateItemsByCodes(INTERDICTION_RISK_CODES);
  const codigoByItemId = new Map(items.map((i) => [i.id, i.codigo]));
  const itemIds = items.map((i) => i.id);

  const ncRows = await ncRepository.listByTemplateItems(itemIds);
  const ncs = ncRows.map((nc) => ({ ...nc, codigo: codigoByItemId.get(nc.template_item_id) || null }));
  const inspectionIds = ncs.map((nc) => nc.inspection_id).filter(Boolean);

  const [inspections, responses, actions, panels, hierarchy] = await Promise.all([
    inspectionRepository.listDatesAndStatusByIds(inspectionIds),
    inspectionRepository.listResponsesForItems(inspectionIds, itemIds),
    actionRepository.listForNCs(ncs.map((nc) => nc.id)),
    panelRepository.listForDashboard(),
    panelRepository.fetchHierarchy(),
  ]);

  const responsesByInspection = new Map();
  for (const r of responses) {
    const codigo = codigoByItemId.get(r.template_item_id);
    if (!codigo) continue;
    if (!responsesByInspection.has(r.inspection_id)) responsesByInspection.set(r.inspection_id, {});
    responsesByInspection.get(r.inspection_id)[codigo] = r;
  }
  const actionsByNc = new Map();
  for (const a of actions) {
    if (!actionsByNc.has(a.nonconformity_id)) actionsByNc.set(a.nonconformity_id, []);
    actionsByNc.get(a.nonconformity_id).push(a);
  }

  return buildInterdictionReport({
    ncs,
    inspectionById: new Map(inspections.map((i) => [i.id, i])),
    responsesByInspection,
    actionsByNc,
    panelById: new Map(panels.map((p) => [p.id, p])),
    locName: new Map((hierarchy.localidades || []).map((l) => [l.id, l.nome])),
    today: localDate(new Date().toISOString()),
  });
}
