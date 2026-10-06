import React, { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Crosshair, LocateFixed, Loader2, MapPin, Route, X } from "lucide-react";
import {
  CRITICALITY_OPTIONS, RADIUS_OPTIONS_KM, MAX_STOPS_OPTIONS, formatDistance,
} from "@/domain/inspectionRoute";
import { CRITICALITY_COLOR, GRAY } from "./mapColors";

const NO_LIMIT = "none";
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/**
 * Painel "Planejar inspeções" do Mapa: ponto de partida, critérios e a
 * lista da rota calculada. Sem estado próprio de dados — tudo vem de
 * MapPage (que calcula a rota com domain/inspectionRoute.js).
 */
export default function InspectionPlannerPanel({
  contextCount, start, locating, pickingStart, onUseMyLocation, onPickOnMap,
  options, onOptionsChange, onCalculate, calculating,
  route, selectedStop, onSelectStop, onClearRoute, onClose,
}) {
  const itemRefs = useRef(new Map());

  // Clique no marcador → destaca e traz o item para a vista na lista (só no
  // layout com coluna lateral; no celular a lista fica fora do mapa e rolar
  // a página tiraria o mapa da tela).
  useEffect(() => {
    if (selectedStop?.from !== "map") return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    itemRefs.current.get(selectedStop.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedStop]);

  const set = (patch) => onOptionsChange({ ...options, ...patch });
  const toggleCrit = (value, checked) => set({
    criticalities: checked
      ? [...options.criticalities, value]
      : options.criticalities.filter((c) => c !== value),
  });

  const c = route?.counts;
  const exclusions = c ? [
    c.semCoordenada > 0 && `${plural(c.semCoordenada, "quadro não foi incluído", "quadros não foram incluídos")} porque não ${c.semCoordenada === 1 ? "possui" : "possuem"} localização cadastrada.`,
    c.foraDoRaio > 0 && `${plural(c.foraDoRaio, "quadro fora", "quadros fora")} do raio de ${route.options.radiusKm} km.`,
    c.alemDoLimite > 0 && `${plural(c.alemDoLimite, "quadro além", "quadros além")} do limite de ${route.options.maxStops} quadros.`,
    c.foraDaCriticidade > 0 && `${plural(c.foraDaCriticidade, "quadro com criticidade", "quadros com criticidade")} não selecionada.`,
  ].filter(Boolean) : [];

  let emptyMessage = null;
  if (route && route.stops.length === 0) {
    if (c.contexto === 0) emptyMessage = "Nenhum quadro no contexto atual do mapa (verifique os filtros).";
    else if (route.options.onlyWithoutChecklist && c.pendentes === 0) emptyMessage = "Não existem inspeções pendentes: todos os quadros deste contexto possuem pelo menos um checklist.";
    else emptyMessage = "Nenhum quadro atende aos critérios selecionados.";
  }

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2"><Route className="h-4 w-4 text-primary" />Planejar inspeções</CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Fechar planejamento">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Usa os {contextCount} quadros do contexto atual do mapa (filtros de unidade, site, criticidade e status acima).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Ponto de partida */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Ponto de partida</Label>
          {/* 2 colunas no celular (largura cheia); 1 coluna na barra lateral estreita do desktop */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
            <Button size="sm" variant={start?.source === "gps" ? "default" : "outline"} className="h-9 gap-1.5 text-xs" onClick={onUseMyLocation} disabled={locating}>
              {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}Minha localização
            </Button>
            <Button size="sm" variant={pickingStart || start?.source === "mapa" ? "default" : "outline"} className="h-9 gap-1.5 text-xs" onClick={onPickOnMap}>
              <Crosshair className="h-3.5 w-3.5" />Escolher no mapa
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {pickingStart ? "Toque no mapa para definir o ponto de partida."
              : start?.source === "gps" ? `Sua localização${start.accuracy ? ` (precisão ±${formatDistance(start.accuracy)})` : ""}`
              : start?.source === "mapa" ? "Ponto escolhido no mapa"
              : "Defina o ponto de partida."}
          </p>
        </div>

        {/* Quadros */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold">Quadros</Label>
          <label className="flex items-center gap-2 text-xs min-h-[28px]">
            <Checkbox checked={options.onlyWithoutChecklist} onCheckedChange={(v) => set({ onlyWithoutChecklist: !!v })} />
            Somente sem checklist
          </label>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-semibold">Criticidade</Label>
          <div className="grid grid-cols-2 gap-x-2">
            {CRITICALITY_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-xs min-h-[28px]">
                <Checkbox checked={options.criticalities.includes(o.value)} onCheckedChange={(v) => toggleCrit(o.value, !!v)} />
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: CRITICALITY_COLOR[o.value] || GRAY }} />
                {o.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Raio de busca</Label>
            <Select value={options.radiusKm == null ? NO_LIMIT : String(options.radiusKm)} onValueChange={(v) => set({ radiusKm: v === NO_LIMIT ? null : Number(v) })}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RADIUS_OPTIONS_KM.map((km) => <SelectItem key={km} value={String(km)}>{km} km</SelectItem>)}
                <SelectItem value={NO_LIMIT}>Sem limite</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Máx. de quadros</Label>
            <Select value={options.maxStops == null ? NO_LIMIT : String(options.maxStops)} onValueChange={(v) => set({ maxStops: v === NO_LIMIT ? null : Number(v) })}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MAX_STOPS_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                <SelectItem value={NO_LIMIT}>Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button className="w-full gap-2" onClick={onCalculate} disabled={!start || calculating || !options.criticalities.length}>
          {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}Calcular rota
        </Button>

        {/* Resultado */}
        {route && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground">ROTA DE INSPEÇÃO</p>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearRoute}>Limpar rota</Button>
            </div>

            {emptyMessage ? (
              <p className="text-sm rounded-lg border border-dashed p-3 text-center">{emptyMessage}</p>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <span className="h-4 w-4 rounded-full bg-blue-600 ring-2 ring-white ring-offset-0 shrink-0" />
                  <span><span className="font-medium">Partida</span> · {route.start.source === "gps" ? "Sua localização" : "Ponto escolhido no mapa"}</span>
                </div>
                <ol className="space-y-1.5 lg:max-h-[45vh] lg:overflow-y-auto pr-0.5">
                  {route.stops.map((s) => {
                    const isSel = selectedStop?.id === s.panel.id;
                    return (
                      <li key={s.panel.id}>
                        <button
                          ref={(el) => { if (el) itemRefs.current.set(s.panel.id, el); else itemRefs.current.delete(s.panel.id); }}
                          onClick={() => onSelectStop(s.panel.id)}
                          className={`w-full text-left rounded-lg border p-2.5 flex items-start gap-2.5 transition-colors ${isSel ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
                        >
                          <span className="h-7 w-7 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0 ring-2 ring-white" style={{ background: CRITICALITY_COLOR[s.criticality] || GRAY }}>
                            {s.order}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-mono text-xs font-bold text-primary truncate">{s.panel.tag || "—"}</span>
                            {s.panel.name && <span className="block text-[11px] text-muted-foreground truncate">{s.panel.name}</span>}
                            <span className="block text-[11px] text-muted-foreground">
                              {CRITICALITY_OPTIONS.find((o) => o.value === s.criticality)?.label}
                            </span>
                          </span>
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap pt-0.5">{formatDistance(s.legMeters)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <div className="border-t pt-2 text-xs space-y-0.5">
                  <p className="font-semibold">{plural(route.stops.length, "quadro", "quadros")}</p>
                  <p>Distância estimada: <span className="font-semibold">{formatDistance(route.totalMeters)}</span></p>
                  <p className="text-[11px] text-muted-foreground">Em linha reta entre os pontos — não considera o traçado das vias.</p>
                </div>
              </>
            )}

            {exclusions.length > 0 && (
              <ul className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 space-y-0.5">
                {exclusions.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
