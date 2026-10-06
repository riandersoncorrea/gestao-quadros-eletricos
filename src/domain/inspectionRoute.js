// Planejamento de rota de inspeções (página Mapa). Função pura — sem rede,
// sem Leaflet. Recebe os quadros do contexto atual do mapa (já filtrados
// por unidade/site/status/criticidade na tela) e os vínculos inspeção →
// quadro, e devolve a sequência de visita sugerida.
//
// - "Sem checklist": regra única de domain/checklistCoverage.js (a mesma do
//   relatório do Inventário).
// - Criticidade: o campo existente electrical_panels.criticality (A–D, do
//   cadastro/SAP) — só é consumida aqui, nunca recalculada. Quadro sem
//   criticidade cadastrada fica como "Sem criticidade" (não recebe nível).
// - Distância: linha reta (haversine) por padrão. `distance` é injetável
//   para, no futuro, usar distância real por vias (matriz de um serviço de
//   roteamento) sem mudar o algoritmo.
//
// Algoritmo (heurística "vizinho mais próximo ponderado"): a partir do ponto
// atual, o próximo quadro é o de menor custo = distância × fator da
// criticidade (A 1 · B 1,5 · C 2,25 · D/sem 3,4). Assim criticidade e
// proximidade pesam juntas: um quadro A a 1 km empata com um D a ~300 m, e
// quadros vizinhos entre si são visitados em sequência (custo ~0) em vez de
// gerar idas e voltas. Custo O(n²) — adequado para centenas de quadros.
//
// "Próximo quadro"/conclusão (futuro): o plano é função só de (partida,
// candidatos); basta recalcular a partir da posição atual — os quadros que
// ganharem checklist saem sozinhos dos candidatos.
import { panelsWithoutChecklist } from "./checklistCoverage";

export const NO_CRITICALITY = "sem";

export const CRITICALITY_OPTIONS = [
  { value: "A", label: "A – Crítico" },
  { value: "B", label: "B – Alto" },
  { value: "C", label: "C – Médio" },
  { value: "D", label: "D – Baixo" },
  { value: NO_CRITICALITY, label: "Sem criticidade" },
];

const PRIORITY_FACTOR = { A: 1, B: 1.5, C: 2.25, D: 3.4, [NO_CRITICALITY]: 3.4 };

export const RADIUS_OPTIONS_KM = [1, 2, 5, 10, 20];
export const MAX_STOPS_OPTIONS = [10, 20, 30, 50];

export function criticalityKey(panel) {
  return ["A", "B", "C", "D"].includes(panel.criticality) ? panel.criticality : NO_CRITICALITY;
}

export function hasValidCoordinates(p) {
  const lat = Number(p?.latitude);
  const lng = Number(p?.longitude);
  return p?.latitude != null && p?.longitude != null
    && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    && !(lat === 0 && lng === 0);
}

const EARTH_RADIUS_M = 6371008.8;
const toRad = (d) => (d * Math.PI) / 180;

/** Distância em linha reta (metros) entre { lat, lng }. */
export function haversineMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const pointOf = (p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) });

/**
 * `start`: { lat, lng }. `panels`: quadros do contexto do mapa.
 * `options`: { onlyWithoutChecklist, criticalities (array de valores de
 * CRITICALITY_OPTIONS), radiusKm (null = sem limite), maxStops (null = todos) }.
 *
 * Retorna { start, stops, totalMeters, counts } — `stops`: [{ order, panel,
 * criticality, legMeters }] (legMeters = do ponto anterior até este);
 * `counts`: quantos quadros ficaram de fora em cada etapa, para a tela
 * informar (nada é descartado em silêncio).
 */
export function planInspectionRoute({ start, panels, inspectionLinks, options, distance = haversineMeters }) {
  const {
    onlyWithoutChecklist = true,
    criticalities = CRITICALITY_OPTIONS.map((c) => c.value),
    radiusKm = null,
    maxStops = null,
  } = options || {};

  const contexto = panels || [];
  const pendentes = onlyWithoutChecklist ? panelsWithoutChecklist(contexto, inspectionLinks) : contexto;
  const critSet = new Set(criticalities);
  const naCriticidade = pendentes.filter((p) => critSet.has(criticalityKey(p)));
  const comCoordenada = naCriticidade.filter(hasValidCoordinates);
  const radiusM = radiusKm != null ? radiusKm * 1000 : null;
  const noRaio = radiusM == null
    ? comCoordenada
    : comCoordenada.filter((p) => distance(start, pointOf(p)) <= radiusM);

  const remaining = noRaio.map((p) => ({ panel: p, point: pointOf(p), factor: PRIORITY_FACTOR[criticalityKey(p)] }));
  const limit = maxStops != null ? Math.min(maxStops, remaining.length) : remaining.length;
  const stops = [];
  let current = start;
  let totalMeters = 0;
  while (stops.length < limit) {
    let best = -1;
    let bestCost = Infinity;
    let bestDist = 0;
    for (let i = 0; i < remaining.length; i += 1) {
      const d = distance(current, remaining[i].point);
      const cost = d * remaining[i].factor;
      if (cost < bestCost) { best = i; bestCost = cost; bestDist = d; }
    }
    const [next] = remaining.splice(best, 1);
    stops.push({ order: stops.length + 1, panel: next.panel, criticality: criticalityKey(next.panel), legMeters: bestDist });
    totalMeters += bestDist;
    current = next.point;
  }

  return {
    start,
    stops,
    totalMeters,
    counts: {
      contexto: contexto.length,
      comChecklist: contexto.length - pendentes.length,
      pendentes: pendentes.length,
      foraDaCriticidade: pendentes.length - naCriticidade.length,
      semCoordenada: naCriticidade.length - comCoordenada.length,
      foraDoRaio: comCoordenada.length - noRaio.length,
      alemDoLimite: noRaio.length - stops.length,
    },
  };
}

/** "300 m" / "1,2 km". */
export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}
