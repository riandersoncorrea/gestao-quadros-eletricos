import { createLayerComponent, createElementObject, extendContext } from "@react-leaflet/core";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";

/**
 * Wrapper react-leaflet (v4) para L.markerClusterGroup.
 * Os <Marker> filhos são adicionados ao grupo (layerContainer) em vez do mapa;
 * o plugin cuida do agrupamento por zoom e do spiderfy de pontos coincidentes.
 * `refreshKey`: ao mudar, re-renderiza os ícones dos clusters (ex.: troca do modo de cor).
 */
const MarkerClusterGroup = createLayerComponent(
  ({ children: _c, refreshKey: _k, ...options }, ctx) => {
    const group = L.markerClusterGroup(options);
    return createElementObject(group, extendContext(ctx, { layerContainer: group }));
  },
  (group, props, prevProps) => {
    if (props.refreshKey !== prevProps.refreshKey) group.refreshClusters();
  }
);

export default MarkerClusterGroup;
