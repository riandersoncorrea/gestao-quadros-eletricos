import React, { useState, useMemo, useEffect } from "react";
import { Inspection, ElectricalPanel, fetchHierarchy } from "@/services/panelService";
import { useQuery } from "@tanstack/react-query";
import {
  PERIOD_OPTIONS, resolvePeriodRange, validateCustomRange, isWithinRange,
} from "@/domain/dashboardFilters";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRole } from "@/hooks/useUserRole";
import { computeVigentesByPanel } from "@/domain/inspectionRules";
import { buildInspectedPanelsReport } from "@/domain/inspectedPanelsReport";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Plus, Search, ClipboardCheck, Calendar, User, Eye, CheckCircle2, AlertTriangle, XCircle, ShieldCheck, Clock, FileDown } from "lucide-react";

const RESULT_CONFIG = {
  aprovado: { label: "Aprovado", className: "bg-secondary/15 text-secondary border-secondary/20", icon: CheckCircle2 },
  aprovado_ressalvas: { label: "Aprovado c/ Ressalvas", className: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertTriangle },
  reprovado: { label: "Reprovado", className: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
};

export default function InspectionList() {
  const { canEdit } = useUserRole();
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("all");
  const [localidadeFilter, setLocalidadeFilter] = useState("all");
  const [period, setPeriod] = useState("todo");
  const [customDraft, setCustomDraft] = useState({ from: "", to: "" });
  const [customApplied, setCustomApplied] = useState(null);
  const [customError, setCustomError] = useState(null);

  const { data: inspections = [], isLoading } = useQuery({
    queryKey: ["inspections"],
    queryFn: () => Inspection.list("-inspection_date"),
  });

  // Mesmas queries (e mesmas queryKeys, portanto cache compartilhado) já
  // usadas em Inventário/Painel — só para resolver panel → localidade,
  // já que inspections não tem localidade_id direto.
  const { data: panels = [] } = useQuery({
    queryKey: ["panels"],
    queryFn: () => ElectricalPanel.list("tag"),
  });
  const { data: hierarchy } = useQuery({
    queryKey: ["hierarchy"],
    queryFn: fetchHierarchy,
  });

  const { localidades, panelLocMap } = useMemo(() => ({
    localidades: hierarchy?.localidades || [],
    panelLocMap: new Map(panels.map((p) => [p.id, p.localidade_id])),
  }), [hierarchy, panels]);

  // Indicador de "inspeção vigente": só na inspeção mais recente de cada
  // quadro (calculado sobre a lista completa, não a filtrada, para não
  // marcar por engano uma inspeção antiga que só aparece por causa dos
  // filtros). Mesma regra de vigência usada ao criar uma nova inspeção e
  // pelo relatório em PDF de quadros inspecionados (ver
  // domain/inspectionRules.js#computeVigentesByPanel).
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const vigentesByPanel = useMemo(() => computeVigentesByPanel(inspections, today), [inspections, today]);
  const [exportingPdf, setExportingPdf] = useState(false);

  const dateRange = useMemo(() => resolvePeriodRange(period, customApplied), [period, customApplied]);

  const filtered = inspections.filter(i => {
    const s = search.toLowerCase();
    const matchSearch = !s || i.panel_name?.toLowerCase().includes(s) || i.inspector_name?.toLowerCase().includes(s);
    const matchResult = resultFilter === "all" || i.overall_result === resultFilter;
    const matchLocalidade = localidadeFilter === "all"
      || panelLocMap.get(i.panel_ref_id || i.panel_id) === localidadeFilter;
    const matchPeriod = isWithinRange(i.inspection_date, dateRange);
    return matchSearch && matchResult && matchLocalidade && matchPeriod;
  });

  const PAGE_SIZE = 40;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = page * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  useEffect(() => { setPage(0); }, [search, resultFilter, localidadeFilter, dateRange]);

  function handlePeriodChange(value) {
    setPeriod(value);
    setCustomError(null);
    if (value !== "personalizado") setCustomApplied(null);
  }

  function applyCustomRange() {
    const err = validateCustomRange(customDraft);
    if (err) {
      setCustomError(err);
      return;
    }
    setCustomError(null);
    setCustomApplied(customDraft);
  }

  // Relatório em PDF de quadros já inspecionados (apoio ao planejamento das
  // inspeções): reaproveita a mesma regra de vigência (vigentesByPanel,
  // acima) e os mesmos filtros já aplicados nesta página — o relatório só
  // inclui um quadro se a inspeção que define sua vigência também estiver
  // no conjunto `filtered` (não a paginação visual, o recorte completo).
  async function handleExportInspectedPanelsPdf() {
    setExportingPdf(true);
    try {
      const filteredIds = new Set(filtered.map((i) => i.id));
      const report = buildInspectedPanelsReport({
        inspections, panels, hierarchy, filteredInspectionIds: filteredIds, referenceDateStr: today,
      });
      const localidadeLabel = localidadeFilter === "all"
        ? "Todas as localidades"
        : (localidades.find((l) => l.id === localidadeFilter)?.nome || "—");
      const periodLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label || "Todo o período";
      // jsPDF é pesado e usado só por este botão — carregado sob demanda
      // no clique, não no carregamento da listagem de Checklists.
      const { exportInspectedPanelsPdf } = await import("@/services/inspectedPanelsPdfService");
      await exportInspectedPanelsPdf(report, { filtrosLabel: `Localidade: ${localidadeLabel} · Período: ${periodLabel}` });
      toast.success("Relatório gerado!");
    } catch {
      toast.error("Não foi possível gerar o relatório. Tente novamente.");
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Checklists de Inspeção</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inspeções baseadas nas normas NR-10 e NBR 5410
          </p>
        </div>
        {canEdit && (
          <Link to="/inspecoes/nova">
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Nova Inspeção</Button>
          </Link>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por quadro ou inspetor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={localidadeFilter} onValueChange={setLocalidadeFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Localidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as localidades</SelectItem>
            {localidades.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={handlePeriodChange}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={resultFilter} onValueChange={setResultFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Resultado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Resultados</SelectItem>
            <SelectItem value="aprovado">Aprovado</SelectItem>
            <SelectItem value="aprovado_ressalvas">Aprovado c/ Ressalvas</SelectItem>
            <SelectItem value="reprovado">Reprovado</SelectItem>
          </SelectContent>
        </Select>

        {period === "personalizado" && (
          <div className="flex flex-wrap items-start gap-2">
            <div className="flex items-center gap-2">
              <Input
                type="date"
                aria-label="Data inicial"
                className="w-[150px]"
                value={customDraft.from}
                onChange={(e) => setCustomDraft((s) => ({ ...s, from: e.target.value }))}
              />
              <span className="text-sm text-muted-foreground">até</span>
              <Input
                type="date"
                aria-label="Data final"
                className="w-[150px]"
                value={customDraft.to}
                onChange={(e) => setCustomDraft((s) => ({ ...s, to: e.target.value }))}
              />
            </div>
            <Button size="sm" variant="outline" onClick={applyCustomRange}>Aplicar</Button>
          </div>
        )}
        {customError && <p className="text-xs text-destructive basis-full">{customError}</p>}
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline" size="sm" className="gap-2"
          onClick={handleExportInspectedPanelsPdf} disabled={isLoading || exportingPdf}
        >
          <FileDown className="h-4 w-4" />
          {exportingPdf ? "Gerando relatório..." : "Gerar relatório de quadros inspecionados"}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <ClipboardCheck className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">
              {search || resultFilter !== "all" || localidadeFilter !== "all" || period !== "todo" ? "Nenhuma inspeção encontrada" : "Nenhuma inspeção registrada"}
            </p>
            {canEdit && !search && resultFilter === "all" && localidadeFilter === "all" && period === "todo" && (
              <Link to="/inspecoes/nova"><Button size="sm" className="gap-2 mt-1"><Plus className="h-4 w-4" />Registrar primeira inspeção</Button></Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Mostrando {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} de {filtered.length}
          </p>
          {pageItems.map(insp => {
            const r = RESULT_CONFIG[insp.overall_result] || RESULT_CONFIG.aprovado;
            const ResultIcon = r.icon;
            const pid = insp.panel_ref_id || insp.panel_id;
            const vigenteEntry = vigentesByPanel.get(pid);
            const vigencia = vigenteEntry?.inspection.id === insp.id ? vigenteEntry.conflict : null;
            return (
              <Card key={insp.id} className="hover:shadow-md transition-shadow border-border/60 hover:border-primary/20">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <ClipboardCheck className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{insp.panel_name || "Quadro não identificado"}</span>
                          <Badge variant="outline" className={`text-xs flex items-center gap-1 ${r.className}`}>
                            <ResultIcon className="h-3 w-3" />{r.label}
                          </Badge>
                          {insp.frequency && (
                            <Badge variant="outline" className="text-xs capitalize">{insp.frequency}</Badge>
                          )}
                          {vigencia && (
                            <Badge variant="outline" className="text-xs flex items-center gap-1 bg-secondary/15 text-secondary border-secondary/20">
                              {vigencia.emAndamento
                                ? <><Clock className="h-3 w-3" />Em andamento</>
                                : <><ShieldCheck className="h-3 w-3" />Inspeção vigente</>}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(parseISO(insp.inspection_date), "dd/MM/yyyy")}</span>
                          <span className="flex items-center gap-1"><User className="h-3 w-3" />{insp.inspector_name}</span>
                          {insp.next_inspection && (
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Próxima: {format(parseISO(insp.next_inspection), "dd/MM/yyyy")}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Link to={`/inspecoes/${insp.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver detalhes">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {pageCount > 1 && (
            <div className="flex items-center justify-between pt-2 text-sm">
              <span className="text-muted-foreground">Página {page + 1} de {pageCount}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => { setPage(p => p - 1); window.scrollTo(0, 0); }}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => { setPage(p => p + 1); window.scrollTo(0, 0); }}>Próxima</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}