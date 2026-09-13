import { supabase } from "@/lib/supabaseClient";

/**
 * Dados para o mapa: quadros + contagem de NCs abertas e flags de análise
 * por quadro. Uma consulta por tabela; agregação no cliente.
 */
export async function fetchSpatialData() {
  const [panels, ncs, flags] = await Promise.all([
    supabase
      .from("electrical_panels")
      .select(
        "id, tag, name, nomenclatura_oficial, status, criticality, health_index, health_index_updated_at, " +
        "latitude, longitude, localidade_id, local_id, sublocal_id, last_inspection_date, next_inspection_date"
      ),
    supabase.from("nonconformities").select("panel_id, status, severidade"),
    supabase.from("analysis_flags").select("panel_id, severidade").eq("resolvido", false),
  ]);
  const err = panels.error || ncs.error || flags.error;
  if (err) throw err;

  const ncByPanel = new Map();
  for (const n of ncs.data) {
    if (!["aberta", "em_tratamento"].includes(n.status)) continue;
    const e = ncByPanel.get(n.panel_id) || { abertas: 0, criticas: 0 };
    e.abertas += 1;
    if (n.severidade === "critica") e.criticas += 1;
    ncByPanel.set(n.panel_id, e);
  }
  const flagByPanel = new Map();
  for (const f of flags.data) {
    const e = flagByPanel.get(f.panel_id) || { total: 0, criticas: 0 };
    e.total += 1;
    if (f.severidade === "critica") e.criticas += 1;
    flagByPanel.set(f.panel_id, e);
  }

  const today = new Date().toISOString().slice(0, 10);
  const enriched = panels.data.map((p) => ({
    ...p,
    nc: ncByPanel.get(p.id) || { abertas: 0, criticas: 0 },
    flags: flagByPanel.get(p.id) || { total: 0, criticas: 0 },
    inspecao_vencida: !!p.next_inspection_date && p.next_inspection_date < today,
  }));

  return enriched;
}

export async function setPanelCoordinates(panelId, latitude, longitude) {
  const { error } = await supabase
    .from("electrical_panels")
    .update({ latitude, longitude })
    .eq("id", panelId);
  if (error) throw error;
}
