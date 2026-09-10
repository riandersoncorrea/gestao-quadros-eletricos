import React, { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, useMapEvents } from "react-leaflet";
import { Link } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "leaflet.heat";
import { format, parseISO } from "date-fns";

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

function radiusFor(panel) {
  return 7 + Math.min(panel.nc.abertas, 5) * 2;
}

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

function HeatLayer({ points }) {
  const map = useMap();
  const layerRef = useRef(null);
  useEffect(() => {
    layerRef.current = L.heatLayer(points, { radius: 35, blur: 25, maxZoom: 17,
      gradient: { 0.2: "#2E9E6B", 0.5: "#E5A100", 0.8: "#DC2626" } }).addTo(map);
    return () => { if (layerRef.current) map.removeLayer(layerRef.current); };
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

export default function SpatialMap({
  panels, colorBy = "health", showHeat = false, placing = false,
  onPlace, focusBounds, hierarchyNames, height = "h-[70vh]",
}) {
  const placed = useMemo(() => panels.filter((p) => p.latitude && p.longitude), [panels]);

  const heatPoints = useMemo(
    () => placed.map((p) => {
      const hi = p.health_index == null ? 60 : p.health_index;
      const intensity = Math.max(0.15, (100 - hi) / 100);
      return [p.latitude, p.longitude, intensity];
    }),
    [placed]
  );

  const center = placed.length ? [placed[0].latitude, placed[0].longitude] : [-2.53, -44.28];

  return (
    <div className={`${height} w-full rounded-xl overflow-hidden border border-border shadow-sm relative`}>
      {placing && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-full shadow">
          Clique no mapa para posicionar o quadro
        </div>
      )}
      <MapContainer center={center} zoom={14} className="h-full w-full" style={{ zIndex: 1, cursor: placing ? "crosshair" : "" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds panels={placed} focusBounds={focusBounds} />
        {showHeat && heatPoints.length > 0 && <HeatLayer points={heatPoints} />}
        {placing && <ClickToPlace onPlace={onPlace} />}
        {!showHeat && placed.map((panel) => (
          <CircleMarker
            key={panel.id}
            center={[panel.latitude, panel.longitude]}
            radius={radiusFor(panel)}
            pathOptions={{
              color: "#fff", weight: 2,
              fillColor: colorFor(panel, colorBy), fillOpacity: 0.9,
            }}
          >
            <Popup>
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
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
