import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ElectricalPanel, fetchHierarchy, listUnidadesOperacionais } from "@/services/panelService";
import { buildPanelLocation } from "@/domain/panelLocation";

/**
 * Localização dos quadros por id (domain/panelLocation.js). Usa as mesmas
 * queryKeys/consultas já usadas nas telas (["panels"], ["hierarchy"]), então
 * o cache é compartilhado — sem busca extra por ação.
 */
export function usePanelLocations() {
  const { data: panels = [] } = useQuery({ queryKey: ["panels"], queryFn: () => ElectricalPanel.list("tag") });
  const { data: hierarchy } = useQuery({ queryKey: ["hierarchy"], queryFn: fetchHierarchy });
  const { data: unidades = [] } = useQuery({ queryKey: ["unidades-operacionais"], queryFn: listUnidadesOperacionais, staleTime: Infinity });

  const panelById = useMemo(() => new Map(panels.map((p) => [p.id, p])), [panels]);
  return useCallback(
    (panelId) => buildPanelLocation(panelById.get(panelId), hierarchy, unidades),
    [panelById, hierarchy, unidades]
  );
}
