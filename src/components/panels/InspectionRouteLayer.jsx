import React, { useEffect, useMemo, useRef } from "react";
import { Marker, Polyline, Popup, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import PanelPopup from "./PanelPopup";
import { CRITICALITY_COLOR, GRAY } from "./mapColors";

// Rota de inspeções no mapa: ponto de partida, linha na ordem calculada e um
// marcador numerado por quadro (cor = criticidade). A linha é tracejada
// porque liga os pontos em linha reta — não é o traçado por vias.

const STOP_SIZE = 30; // área de toque ≥ 28px

function stopIcon(order, color, selected, offsetX) {
  return L.divIcon({
    className: "qm-route-stop",
    html: `<span class="qm-route-num${selected ? " is-selected" : ""}" style="background:${color}">${order}</span>`,
    iconSize: [STOP_SIZE, STOP_SIZE],
    // Quadros com a MESMA coordenada (mesmo prédio) ficam lado a lado em vez de empilhados.
    iconAnchor: [STOP_SIZE / 2 - offsetX, STOP_SIZE / 2],
    popupAnchor: [offsetX, -STOP_SIZE / 2],
  });
}

const startIcon = L.divIcon({
  className: "qm-route-start",
  html: '<span class="qm-route-start-dot"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export function RouteStartMarker({ point }) {
  return (
    <Marker position={[point.lat, point.lng]} icon={startIcon} zIndexOffset={1000} title="Ponto de partida">
      <Tooltip direction="top" offset={[0, -12]}>Ponto de partida</Tooltip>
    </Marker>
  );
}

/**
 * `route`: resultado de domain/inspectionRoute.js#planInspectionRoute.
 * `selected`: { id, from: "list" | "map" } — vindo da lista, centraliza e
 * abre o popup do quadro; clique no marcador chama onSelect(id).
 */
export default function InspectionRouteLayer({ route, selected, onSelect, hierarchyNames }) {
  const map = useMap();
  const markerRefs = useRef(new Map());

  const offsets = useMemo(() => {
    const seen = new Map();
    return route.stops.map((s) => {
      const key = `${Number(s.panel.latitude).toFixed(6)}|${Number(s.panel.longitude).toFixed(6)}`;
      const k = seen.get(key) || 0;
      seen.set(key, k + 1);
      return k * (STOP_SIZE - 4);
    });
  }, [route]);

  const line = useMemo(
    () => [[route.start.lat, route.start.lng], ...route.stops.map((s) => [Number(s.panel.latitude), Number(s.panel.longitude)])],
    [route]
  );

  useEffect(() => {
    if (!selected) return;
    const marker = markerRefs.current.get(selected.id);
    if (!marker) return;
    if (selected.from === "list") map.setView(marker.getLatLng(), Math.max(map.getZoom(), 17));
    marker.openPopup();
  }, [selected, map]);

  return (
    <>
      <Polyline positions={line} pathOptions={{ color: "#0f172a", weight: 3, opacity: 0.7, dashArray: "6 6" }} />
      {route.stops.map((s, i) => (
        <Marker
          key={s.panel.id}
          ref={(m) => { if (m) markerRefs.current.set(s.panel.id, m); else markerRefs.current.delete(s.panel.id); }}
          position={[Number(s.panel.latitude), Number(s.panel.longitude)]}
          icon={stopIcon(s.order, CRITICALITY_COLOR[s.criticality] || GRAY, selected?.id === s.panel.id, offsets[i])}
          zIndexOffset={selected?.id === s.panel.id ? 900 : 500 - s.order}
          title={`${s.order}. ${s.panel.tag || s.panel.name}`}
          alt={`${s.order}. ${s.panel.tag || s.panel.name}`}
          eventHandlers={{ click: () => onSelect?.(s.panel.id) }}
        >
          <Popup maxWidth={280} autoPanPadding={[24, 24]}>
            <p className="text-[11px] font-semibold text-gray-500 pb-0.5">Parada {s.order} da rota</p>
            <PanelPopup panel={s.panel} hierarchyNames={hierarchyNames} />
          </Popup>
        </Marker>
      ))}
    </>
  );
}
