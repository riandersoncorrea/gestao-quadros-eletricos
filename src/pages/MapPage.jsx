import React, { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchSpatialData, setPanelCoordinates } from "@/services/mapService";
import { fetchHierarchy, listUnidadesOperacionais } from "@/services/panelService";
import { fetchInspectionLinks } from "@/services/checklistCoverageService";
import { planInspectionRoute, CRITICALITY_OPTIONS } from "@/domain/inspectionRoute";
import SpatialMap, { COLOR_BY, HEAT_GRADIENT, legendFor } from "@/components/panels/SpatialMap";
import InspectionPlannerPanel from "@/components/panels/InspectionPlannerPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { MapPin, Flame, Crosshair, X, Route } from "lucide-react";

const ALL = "all";

const DEFAULT_PLAN_OPTIONS = {
  onlyWithoutChecklist: true,
  criticalities: CRITICALITY_OPTIONS.map((c) => c.value),
  radiusKm: 5,
  maxStops: 20,
};

export default function MapPage() {
  const { canEdit } = useUserRole();
  const queryClient = useQueryClient();
  const [colorBy, setColorBy] = useState("health");
  const [showHeat, setShowHeat] = useState(false);
  const [unidadeFilter, setUnidadeFilter] = useState(ALL);
  const [localidadeFilter, setLocalidadeFilter] = useState(ALL);
  const [critFilter, setCritFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [onlyNC, setOnlyNC] = useState(false);
  const [placingId, setPlacingId] = useState("");
  const [focusBounds, setFocusBounds] = useState(null);

  // Planejamento de rota de inspeções
  const [planning, setPlanning] = useState(false);
  const [routeStart, setRouteStart] = useState(null); // { lat, lng, source: "gps" | "mapa", accuracy? }
  const [locating, setLocating] = useState(false);
  const [pickingStart, setPickingStart] = useState(false);
  const [planOptions, setPlanOptions] = useState(DEFAULT_PLAN_OPTIONS);
  const [route, setRoute] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [selectedStop, setSelectedStop] = useState(null); // { id, from: "list" | "map" }
  const mapBoxRef = useRef(null);

  const { data: panels = [], isLoading } = useQuery({ queryKey: ["spatial"], queryFn: fetchSpatialData });
  const { data: hierarchy } = useQuery({ queryKey: ["hierarchy"], queryFn: fetchHierarchy });
  const { data: unidades = [] } = useQuery({ queryKey: ["unidades-operacionais"], queryFn: listUnidadesOperacionais, staleTime: Infinity });

  const hierarchyNames = useMemo(() => ({
    loc: new Map((hierarchy?.localidades || []).map((l) => [l.id, l.nome])),
    local: new Map((hierarchy?.locais || []).map((l) => [l.id, l.nome])),
    sub: new Map((hierarchy?.sublocais || []).map((s) => [s.id, s.nome])),
  }), [hierarchy]);

  const place = useMutation({
    mutationFn: ({ id, lat, lng }) => setPanelCoordinates(id, lat, lng),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spatial"] });
      queryClient.invalidateQueries({ queryKey: ["panels"] });
      toast.success("Localização salva");
      setPlacingId("");
    },
    onError: (e) => toast.error(`Falha: ${e.message}`),
  });

  const filtered = useMemo(() => panels.filter((p) => {
    if (unidadeFilter !== ALL && p.unidade_operacional_id !== unidadeFilter) return false;
    if (localidadeFilter !== ALL && p.localidade_id !== localidadeFilter) return false;
    if (critFilter !== ALL && p.criticality !== critFilter) return false;
    if (statusFilter !== ALL && p.status !== statusFilter) return false;
    if (onlyNC && p.nc.abertas === 0) return false;
    return true;
  }), [panels, unidadeFilter, localidadeFilter, critFilter, statusFilter, onlyNC]);

  const placedCount = filtered.filter((p) => p.latitude && p.longitude).length;

  // Regiões prioritárias: por localidade, ordenadas por NC aberta ↓ e IS médio ↑
  const regions = useMemo(() => {
    const byLoc = new Map();
    for (const p of panels) {
      if (!p.localidade_id) continue;
      const e = byLoc.get(p.localidade_id) || { id: p.localidade_id, nome: hierarchyNames.loc.get(p.localidade_id) || "?", total: 0, nc: 0, hiSum: 0, hiN: 0, pts: [] };
      e.total += 1;
      e.nc += p.nc.abertas;
      if (p.health_index != null) { e.hiSum += p.health_index; e.hiN += 1; }
      if (p.latitude && p.longitude) e.pts.push([p.latitude, p.longitude]);
      byLoc.set(p.localidade_id, e);
    }
    return [...byLoc.values()]
      .map((e) => ({ ...e, hiMedio: e.hiN ? Math.round(e.hiSum / e.hiN) : null }))
      .sort((a, b) => b.nc - a.nc || (a.hiMedio ?? 101) - (b.hiMedio ?? 101));
  }, [panels, hierarchyNames]);

  const legend = legendFor(colorBy, filtered);
  const heatScale = `linear-gradient(to right, ${Object.entries(HEAT_GRADIENT).map(([s, c]) => `${c} ${s * 100}%`).join(", ")})`;
  const unplaced = panels.filter((p) => !(p.latitude && p.longitude));
  const placingPanel = panels.find((p) => p.id === placingId);

  const closePlanning = () => {
    setPlanning(false);
    setPickingStart(false);
    setRoute(null);
    setRouteStart(null);
    setSelectedStop(null);
    setFocusBounds(null);
  };

  const locateMe = () => {
    setPickingStart(false);
    const fallback = (msg) => {
      toast.error(`${msg} Escolha o ponto de partida no mapa.`);
      setPickingStart(true);
    };
    if (!navigator.geolocation) return fallback("Este dispositivo não oferece localização.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setRouteStart({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: "gps", accuracy: pos.coords.accuracy });
        setFocusBounds([[pos.coords.latitude, pos.coords.longitude]]);
      },
      (err) => {
        setLocating(false);
        fallback(err.code === err.PERMISSION_DENIED
          ? "Acesso à localização não permitido."
          : "Não foi possível obter sua localização.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  const pickStartOnMap = () => {
    setPlacingId("");
    setPickingStart(true);
    mapBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const onPickStart = (lat, lng) => {
    setRouteStart({ lat, lng, source: "mapa" });
    setPickingStart(false);
  };

  // A rota é calculada só quando pedida; o vínculo inspeção → quadro é
  // lido na hora (sem cache), então um checklist recém-feito já tira o
  // quadro da próxima rota.
  const calculateRoute = async () => {
    setCalculating(true);
    try {
      const inspectionLinks = planOptions.onlyWithoutChecklist ? await fetchInspectionLinks() : [];
      const plan = planInspectionRoute({ start: routeStart, panels: filtered, inspectionLinks, options: planOptions });
      setRoute({ ...plan, options: planOptions });
      setSelectedStop(null);
      setFocusBounds(plan.stops.length
        ? [[routeStart.lat, routeStart.lng], ...plan.stops.map((s) => [Number(s.panel.latitude), Number(s.panel.longitude)])]
        : null);
    } catch (e) {
      toast.error(`Falha ao calcular a rota: ${e.message}`);
    } finally {
      setCalculating(false);
    }
  };

  const selectFromList = (id) => {
    setSelectedStop({ id, from: "list" });
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      mapBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div className="p-4 lg:p-8 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Mapa</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {placedCount} de {filtered.length} quadros posicionados
            {unplaced.length > 0 && ` · ${unplaced.length} sem coordenada`}
          </p>
        </div>
        {!planning && (
          <Button size="sm" className="gap-2 self-start sm:self-auto" onClick={() => setPlanning(true)}>
            <Route className="h-4 w-4" />Planejar inspeções
          </Button>
        )}
      </div>

      {/* Controles */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Colorir por</Label>
            <Select value={colorBy} onValueChange={setColorBy}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{COLOR_BY.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Select value={unidadeFilter} onValueChange={setUnidadeFilter}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Unidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as unidades</SelectItem>
              {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={localidadeFilter} onValueChange={setLocalidadeFilter}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Localidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas localidades</SelectItem>
              {(hierarchy?.localidades || []).map((l) => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={critFilter} onValueChange={setCritFilter}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Criticidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Toda criticidade</SelectItem>
              {["A", "B", "C", "D"].map((c) => <SelectItem key={c} value={c}>Crit. {c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todo status</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="manutencao">Manutenção</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-xs">
            <Switch checked={onlyNC} onCheckedChange={setOnlyNC} />Só com NC aberta
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <Switch checked={showHeat} onCheckedChange={setShowHeat} /><Flame className="h-3.5 w-3.5" />Mapa de calor
          </label>
        </CardContent>
      </Card>

      {/* Posicionamento */}
      {canEdit && (
        <Card>
          <CardContent className="p-3 flex flex-wrap items-center gap-3">
            <Crosshair className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs text-muted-foreground">Posicionar quadro:</span>
            <div className="min-w-[240px] flex-1 max-w-sm">
              <Combobox
                options={unplaced.map((p) => ({ value: p.id, label: p.tag ? `${p.tag} — ${p.name}` : p.name }))}
                value={placingId}
                onChange={(id) => { setPlacingId(id); if (id) setPickingStart(false); }}
                placeholder={unplaced.length ? "Escolha um quadro sem coordenada" : "Todos os quadros já posicionados"}
                searchPlaceholder="Buscar..."
                disabled={!unplaced.length}
              />
            </div>
            {placingId && (
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => setPlacingId("")}>
                <X className="h-3.5 w-3.5" />Cancelar
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3" ref={mapBoxRef}>
          {isLoading ? (
            <div className="h-[70vh] rounded-xl bg-muted animate-pulse flex items-center justify-center">
              <p className="text-muted-foreground text-sm">Carregando mapa...</p>
            </div>
          ) : (
            <SpatialMap
              panels={filtered}
              colorBy={colorBy}
              showHeat={showHeat}
              placing={!!placingId}
              onPlace={(lat, lng) => place.mutate({ id: placingId, lat, lng })}
              focusBounds={focusBounds}
              hierarchyNames={hierarchyNames}
              route={route?.stops.length ? route : null}
              routeStart={planning ? routeStart : null}
              selectedStop={selectedStop}
              onSelectStop={(id) => setSelectedStop({ id, from: "map" })}
              pickingStart={planning && pickingStart}
              onPickStart={onPickStart}
            />
          )}

          {/* Legenda */}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {legend.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full border border-white ring-1 ring-slate-900/40" style={{ background: l.color }} />{l.label} ({l.n})
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-4 w-4 rounded-full bg-slate-400 ring-2 ring-white ring-offset-0 flex items-center justify-center text-[8px] font-bold text-white">n</span>
              Agrupamento — clique para aproximar ou abrir os quadros
            </span>
          </div>
          {showHeat && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Flame className="h-3.5 w-3.5 shrink-0" />
              <span>Menor</span>
              <span className="h-2.5 w-32 sm:w-48 rounded-full" style={{ background: heatScale }} />
              <span>Maior concentração de quadros (ponderada pelo risco do IS)</span>
            </div>
          )}
        </div>

        {planning ? (
          <div className="order-first lg:order-none">
            <InspectionPlannerPanel
              contextCount={filtered.length}
              start={routeStart}
              locating={locating}
              pickingStart={pickingStart}
              onUseMyLocation={locateMe}
              onPickOnMap={pickStartOnMap}
              options={planOptions}
              onOptionsChange={setPlanOptions}
              onCalculate={calculateRoute}
              calculating={calculating}
              route={route}
              selectedStop={selectedStop}
              onSelectStop={selectFromList}
              onClearRoute={() => { setRoute(null); setSelectedStop(null); setFocusBounds(null); }}
              onClose={closePlanning}
            />
          </div>
        ) : (
        /* Regiões prioritárias */
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />Regiões prioritárias</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {regions.length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
            {regions.map((r) => (
              <button
                key={r.id}
                onClick={() => r.pts.length && setFocusBounds(r.pts)}
                className="w-full text-left rounded-lg border border-border p-2.5 hover:border-primary/30 transition-colors disabled:opacity-50"
                disabled={!r.pts.length}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{r.nome}</span>
                  {r.nc > 0 && <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">{r.nc} NC</Badge>}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {r.total} quadros
                  {r.hiMedio != null && ` · IS médio ${r.hiMedio}`}
                  {!r.pts.length && " · sem coordenadas"}
                </p>
              </button>
            ))}
            {focusBounds && (
              <Button size="sm" variant="ghost" className="w-full h-8 text-xs" onClick={() => setFocusBounds(null)}>
                Ver todos
              </Button>
            )}
          </CardContent>
        </Card>
        )}
      </div>

      {placingPanel && (
        <p className="text-xs text-primary">Posicionando <span className="font-mono">{placingPanel.tag}</span> — clique no ponto do mapa.</p>
      )}
    </div>
  );
}
