import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import { Link } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "leaflet.heat";
import { format, parseISO } from "date-fns";
import MarkerClusterGroup from "./MarkerClusterGroup";
import "./spatial-map.css";

const GREEN = "#2E9E6B";
const AMBER = "#E5A100";
const RED = "#DC2626";
const ORANGE = "#EA580C";
const BLUE = "#0369A1";
const GRAY = "#9CA3AF";

const CRIT_LABEL = { A: "A – Crítico", B: "B – Alto", C: "C – Médio", D: "D – Baixo" };

export const COLOR_BY = [
  { value: "health", label: "Índice de Saúde" },
  { value: "status", label: "Status" },
  { value: "criticality", label: "Criticidade" },
  { value: "nc", label: "NCs abertas" },
  { value: "inspection", label: "Inspeção" },
];

export function colorFor(panel, mode) {
  switch (mode) {
    case "status":
      return panel.status === "ativo" ? GREEN : panel.status === "manutencao" ? AMBER : GRAY;
    case "criticality":
      return { A: RED, B: ORANGE, C: BLUE, D: GRAY }[panel.criticality] || GRAY;
    case "nc":
      return panel.nc.abertas === 0 ? GREEN : panel.nc.abertas <= 2 ? AMBER : RED;
    case "inspection":
      return panel.next_inspection_date ? (panel.inspecao_vencida ? RED : GREEN) : GRAY;
    case "health":
    default:
      if (panel.health_index == null) return GRAY;
      return panel.health_index >= 80 ? GREEN : panel.health_index >= 50 ? AMBER : RED;
  }
}

export function legendFor(mode, panels) {
  const count = (fn) => panels.filter(fn).length;
  switch (mode) {
    case "status":
      return [
        { color: GREEN, label: "Ativo", n: count((p) => p.status === "ativo") },
        { color: AMBER, label: "Manutenção", n: count((p) => p.status === "manutencao") },
        { color: GRAY, label: "Inativo", n: count((p) => p.status === "inativo") },
      ];
    case "criticality":
      return [
        { color: RED, label: "A – Crítico", n: count((p) => p.criticality === "A") },
        { color: ORANGE, label: "B – Alto", n: count((p) => p.criticality === "B") },
        { color: BLUE, label: "C – Médio", n: count((p) => p.criticality === "C") },
        { color: GRAY, label: "D / sem", n: count((p) => !["A", "B", "C"].includes(p.criticality)) },
      ];
    case "nc":
      return [
        { color: GREEN, label: "Sem NC aberta", n: count((p) => p.nc.abertas === 0) },
        { color: AMBER, label: "1–2 NCs", n: count((p) => p.nc.abertas >= 1 && p.nc.abertas <= 2) },
        { color: RED, label: "3+ NCs", n: count((p) => p.nc.abertas >= 3) },
      ];
    case "inspection":
      return [
        { color: GREEN, label: "Inspeção em dia", n: count((p) => p.next_inspection_date && !p.inspecao_vencida) },
        { color: RED, label: "Inspeção vencida", n: count((p) => p.inspecao_vencida) },
        { color: GRAY, label: "Sem data", n: count((p) => !p.next_inspection_date) },
      ];
    case "health":
    default:
      return [
        { color: GREEN, label: "IS ≥ 80", n: count((p) => p.health_index >= 80) },
        { color: AMBER, label: "IS 50–79", n: count((p) => p.health_index >= 50 && p.health_index < 80) },
        { color: RED, label: "IS < 50", n: count((p) => p.health_index != null && p.health_index < 50) },
        { color: GRAY, label: "Sem avaliação", n: count((p) => p.health_index == null) },
      ];
  }
}

const MAX_ZOOM = 20;      // OSM entrega tiles até 19; o 20 é ampliação do 19
const NATIVE_MAX_ZOOM = 19;

// Diâmetro do marcador em px (cresce com NCs abertas, como antes)
function sizeFor(panel) {
  return 14 + Math.min(panel.nc.abertas, 5) * 4;
}

// Ícones cacheados por cor+tamanho: milhares de quadros reaproveitam poucos objetos.
// A área clicável tem no mínimo 28px (toque no celular), mesmo com ponto menor.
const iconCache = new Map();
function iconFor(color, size) {
  const key = `${color}|${size}`;
  let icon = iconCache.get(key);
  if (!icon) {
    const hit = Math.max(size, 28);
    icon = L.divIcon({
      className: "qm-marker",
      html: `<span class="qm-dot" style="width:${size}px;height:${size}px;background:${color}"></span>`,
      iconSize: [hit, hit],
      iconAnchor: [hit / 2, hit / 2],
      popupAnchor: [0, -size / 2],
      qColor: color,
    });
    iconCache.set(key, icon);
  }
  return icon;
}

// Ícone do cluster: contagem no centro e anel com a proporção das cores dos quadros agrupados.
function clusterIcon(cluster) {
  const markers = cluster.getAllChildMarkers();
  const counts = new Map();
  for (const m of markers) {
    const c = m.options.icon?.options?.qColor || GRAY;
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  const total = markers.length;
  let acc = 0;
  const stops = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => {
      const from = (acc / total) * 360;
      acc += n;
      return `${c} ${from}deg ${(acc / total) * 360}deg`;
    })
    .join(", ");
  const size = total < 10 ? 36 : total < 50 ? 42 : 50;
  return L.divIcon({
    className: "qm-cluster",
    html: `<span class="qm-cluster-ring" style="background:conic-gradient(${stops})"><span class="qm-cluster-count">${total}</span></span>`,
    iconSize: [size, size],
  });
}

const CLUSTER_OPTIONS = {
  // Pontos idênticos/coincidentes: o clique no cluster abre o spiderfy direto, em qualquer zoom.
  spiderfyOnMaxZoom: true,
  zoomToBoundsOnClick: true,
  showCoverageOnHover: false,
  spiderfyDistanceMultiplier: 2,
  spiderLegPolylineOptions: { weight: 1.5, color: "#334155", opacity: 0.6 },
  // Raio menor nos zooms altos para separar quadros vizinhos assim que houver espaço
  maxClusterRadius: (zoom) => (zoom >= 18 ? 24 : 45),
  chunkedLoading: true,
  iconCreateFunction: clusterIcon,
};

function FitBounds({ panels, focusBounds }) {
  const map = useMap();
  useEffect(() => {
    if (focusBounds) {
      map.fitBounds(focusBounds, { padding: [40, 40], maxZoom: 17 });
      return;
    }
    const pts = panels.filter((p) => p.latitude && p.longitude).map((p) => [p.latitude, p.longitude]);
    if (pts.length) map.fitBounds(pts, { padding: [50, 50], maxZoom: 16 });
  }, [panels, focusBounds, map]);
  return null;
}

// Escala do mapa de calor (sem verde, para não confundir com o "saudável" dos marcadores)
export const HEAT_GRADIENT = {
  0.15: "#2563EB",
  0.35: "#06B6D4",
  0.55: "#FACC15",
  0.75: "#F97316",
  1.0: "#B91C1C",
};
const HEAT_RADIUS = 28;
const HEAT_BLUR = 18;

// leaflet.heat soma os pesos numa grade de (radius+blur)/2 px e corta em `max`.
// Recalcula `max` a cada zoom pelo percentil 97 das células (mín. 1.5), para que a
// escala use toda a faixa de cores tanto afastado (muita soma) quanto aproximado,
// e um quadro isolado não fique com a mesma cor de uma concentração.
function heatMaxFor(map, points) {
  const cell = (HEAT_RADIUS + HEAT_BLUR) / 2;
  const zoom = map.getZoom();
  const grid = new Map();
  for (const [lat, lng, w] of points) {
    const p = map.project([lat, lng], zoom);
    const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
    grid.set(key, (grid.get(key) || 0) + w);
  }
  const sums = [...grid.values()].sort((a, b) => a - b);
  if (!sums.length) return 1.5;
  return Math.max(1.5, sums[Math.floor((sums.length - 1) * 0.97)]);
}

function HeatLayer({ points }) {
  const map = useMap();
  useEffect(() => {
    const layer = L.heatLayer(points, {
      radius: HEAT_RADIUS,
      blur: HEAT_BLUR,
      // maxZoom 0 desliga o atenuador por zoom do plugin (1/2^(maxZoom-zoom)),
      // que deixava o calor quase invisível nos zooms de trabalho.
      maxZoom: 0,
      minOpacity: 0.3,
      max: heatMaxFor(map, points),
      gradient: HEAT_GRADIENT,
    }).addTo(map);
    const onZoom = () => layer.setOptions({ max: heatMaxFor(map, points) });
    map.on("zoomend", onZoom);
    return () => {
      map.off("zoomend", onZoom);
      map.removeLayer(layer);
    };
  }, [points, map]);
  return null;
}

function ClickToPlace({ onPlace }) {
  useMapEvents({
    click(e) { onPlace(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

const fmt = (d) => { try { return d ? format(parseISO(d), "dd/MM/yyyy") : "—"; } catch { return d; } };

function PanelPopup({ panel, hierarchyNames }) {
  return (
    <div className="p-1 min-w-[200px] space-y-1">
      <p className="font-mono text-xs font-bold text-primary">{panel.tag}</p>
      <p className="font-semibold text-sm">{panel.name}</p>
      {hierarchyNames && (
        <p className="text-xs text-gray-600">
          {[hierarchyNames.loc.get(panel.localidade_id), hierarchyNames.local.get(panel.local_id), hierarchyNames.sub.get(panel.sublocal_id)].filter(Boolean).join(" › ")}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5 text-[11px] pt-1">
        {panel.health_index != null && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100">IS {Math.round(panel.health_index)}</span>
        )}
        {panel.criticality && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100">Crit. {panel.criticality}</span>
        )}
        {panel.nc.abertas > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700">{panel.nc.abertas} NC</span>
        )}
        {panel.inspecao_vencida && (
          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700">Inspeção vencida</span>
        )}
      </div>
      <p className="text-[11px] text-gray-500">Última inspeção: {fmt(panel.last_inspection_date)}</p>
      <Link to={`/quadro/${panel.id}`} className="inline-block text-xs text-primary hover:underline font-medium pt-1">
        Ver detalhes →
      </Link>
    </div>
  );
}

export default function SpatialMap({
  panels, colorBy = "health", showHeat = false, placing = false,
  onPlace, focusBounds, hierarchyNames, height = "h-[70vh]",
}) {
  const placed = useMemo(() => panels.filter((p) => p.latitude && p.longitude), [panels]);

  const heatPoints = useMemo(
    () => placed.map((p) => {
      // Peso = concentração ponderada pelo risco: todo quadro conta (0.4) e o
      // IS baixo soma até +0.6. Sem avaliação = risco médio.
      const risk = p.health_index == null ? 0.5 : Math.min(1, Math.max(0, (100 - p.health_index) / 100));
      return [p.latitude, p.longitude, 0.4 + 0.6 * risk];
    }),
    [placed]
  );

  const center = placed.length ? [placed[0].latitude, placed[0].longitude] : [-2.53, -44.28];

  return (
    <div className={`${height} w-full rounded-xl overflow-hidden border border-border shadow-sm relative${showHeat ? " qm-heat-on" : ""}`}>
      {placing && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-full shadow">
          Clique no mapa para posicionar o quadro
        </div>
      )}
      <MapContainer
        center={center}
        zoom={14}
        minZoom={3}
        maxZoom={MAX_ZOOM}
        className="h-full w-full"
        style={{ zIndex: 1, cursor: placing ? "crosshair" : "" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={MAX_ZOOM}
          maxNativeZoom={NATIVE_MAX_ZOOM}
        />
        <FitBounds panels={placed} focusBounds={focusBounds} />
        {showHeat && heatPoints.length > 0 && <HeatLayer points={heatPoints} />}
        {placing && <ClickToPlace onPlace={onPlace} />}
        <MarkerClusterGroup {...CLUSTER_OPTIONS} refreshKey={colorBy}>
          {placed.map((panel) => (
            <Marker
              key={panel.id}
              position={[panel.latitude, panel.longitude]}
              icon={iconFor(colorFor(panel, colorBy), sizeFor(panel))}
              title={panel.tag || panel.name}
              alt={panel.tag || panel.name}
            >
              <Popup maxWidth={280} autoPanPadding={[24, 24]}>
                <PanelPopup panel={panel} hierarchyNames={hierarchyNames} />
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
