import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { Link } from "react-router-dom";
import { StatusBadge, PanelTypeLabel } from "./StatusBadge";
import { ExternalLink, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const statusColors = {
  ativo: "#2E9E6B",
  inativo: "#9CA3AF",
  manutencao: "#E5A100",
};

function createIcon(status) {
  const color = statusColors[status] || statusColors.ativo;
  return L.divIcon({
    html: `<div style="background:${color};width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m13 2-2 9h6l-7 11 2-9H6l7-11"/></svg>
    </div>`,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function FitBounds({ panels }) {
  const map = useMap();
  useEffect(() => {
    if (panels.length === 0) return;
    const bounds = panels
      .filter((p) => p.latitude && p.longitude)
      .map((p) => [p.latitude, p.longitude]);
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [panels, map]);
  return null;
}

export default function PanelMapView({ panels, height = "h-[500px]" }) {
  const defaultCenter = [-2.5, -44.28];
  const validPanels = panels.filter((p) => p.latitude && p.longitude);

  return (
    <div className={`${height} w-full rounded-xl overflow-hidden border border-border shadow-sm`}>
      <MapContainer
        center={validPanels.length ? [validPanels[0].latitude, validPanels[0].longitude] : defaultCenter}
        zoom={13}
        className="h-full w-full"
        style={{ zIndex: 1 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds panels={validPanels} />
        {validPanels.map((panel) => (
          <Marker
            key={panel.id}
            position={[panel.latitude, panel.longitude]}
            icon={createIcon(panel.status)}
          >
            <Popup>
              <div className="p-1 min-w-[180px]">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-sm">{panel.name}</h3>
                </div>
                <p className="text-xs text-gray-500 font-mono mb-1">{panel.code}</p>
                {panel.location_name && (
                  <p className="text-xs text-gray-600 mb-1">{panel.location_name}</p>
                )}
                {panel.panel_type && (
                  <p className="text-xs text-gray-600 mb-2">
                    <PanelTypeLabel type={panel.panel_type} />
                    {panel.voltage ? ` • ${panel.voltage}V` : ""}
                  </p>
                )}
                <Link
                  to={`/quadro/${panel.id}`}
                  className="inline-flex items-center gap-1 text-xs text-[#0097A7] hover:underline font-medium"
                >
                  Ver detalhes <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}