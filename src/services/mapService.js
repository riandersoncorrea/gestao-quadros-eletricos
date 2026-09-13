import { listForMap, updateCoordinates } from "@/repositories/panelRepository";
import { listStatusSeverityForMap } from "@/repositories/ncRepository";
import { listAllUnresolvedFlags } from "@/repositories/healthIndexRepository";

/**
 * Dados para o mapa: quadros + contagem de NCs abertas e flags de análise
 * por quadro. Uma consulta por tabela (domínio); agregação no cliente.
 */
export async function fetchSpatialData() {
  const [panels, ncs, flags] = await Promise.all([
    listForMap(),
    listStatusSeverityForMap(),
    listAllUnresolvedFlags(),
  ]);

  const ncByPanel = new Map();
  for (const n of ncs) {
    if (!["aberta", "em_tratamento"].includes(n.status)) continue;
    const e = ncByPanel.get(n.panel_id) || { abertas: 0, criticas: 0 };
    e.abertas += 1;
    if (n.severidade === "critica") e.criticas += 1;
    ncByPanel.set(n.panel_id, e);
  }
  const flagByPanel = new Map();
  for (const f of flags) {
    const e = flagByPanel.get(f.panel_id) || { total: 0, criticas: 0 };
    e.total += 1;
    if (f.severidade === "critica") e.criticas += 1;
    flagByPanel.set(f.panel_id, e);
  }

  const today = new Date().toISOString().slice(0, 10);
  const enriched = panels.map((p) => ({
    ...p,
    nc: ncByPanel.get(p.id) || { abertas: 0, criticas: 0 },
    flags: flagByPanel.get(p.id) || { total: 0, criticas: 0 },
    inspecao_vencida: !!p.next_inspection_date && p.next_inspection_date < today,
  }));

  return enriched;
}

export async function setPanelCoordinates(panelId, latitude, longitude) {
  return updateCoordinates(panelId, latitude, longitude);
}
