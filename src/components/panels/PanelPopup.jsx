import React from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";

const fmt = (d) => { try { return d ? format(parseISO(d), "dd/MM/yyyy") : "—"; } catch { return d; } };

/** Conteúdo do popup de um quadro no Mapa (marcadores e rota de inspeções). */
export default function PanelPopup({ panel, hierarchyNames }) {
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
