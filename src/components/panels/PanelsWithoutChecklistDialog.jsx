import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, FileSpreadsheet, MapPin, RefreshCw } from "lucide-react";
import { fetchChecklistCoverageData } from "@/services/checklistCoverageService";
import { listUnidadesOperacionais } from "@/services/panelService";
import {
  FILTER_ALL, PANEL_STATUS_LABEL, buildPanelsWithoutChecklistReport, toExportRow,
} from "@/domain/panelsWithoutChecklistReport";

/**
 * Relatório "Quadros sem checklist" do Inventário. Lê o banco a cada
 * abertura (staleTime/gcTime 0) — um checklist novo tira o quadro da lista
 * na próxima geração. `initialFilters` vem dos filtros já aplicados na
 * página (Site/Status); a Unidade é escolhida aqui.
 */
export default function PanelsWithoutChecklistDialog({ open, onOpenChange, hierarchy, initialFilters }) {
  const [unidadeId, setUnidadeId] = useState(FILTER_ALL);
  const [localidadeId, setLocalidadeId] = useState(FILTER_ALL);
  const [status, setStatus] = useState(FILTER_ALL);

  useEffect(() => {
    if (!open) return;
    setLocalidadeId(initialFilters?.localidadeId ?? FILTER_ALL);
    setStatus(initialFilters?.status ?? FILTER_ALL);
  }, [open, initialFilters?.localidadeId, initialFilters?.status]);

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ["checklist-coverage"],
    queryFn: fetchChecklistCoverageData,
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });
  const { data: unidades = [] } = useQuery({
    queryKey: ["unidades-operacionais"],
    queryFn: listUnidadesOperacionais,
    staleTime: Infinity,
  });

  const report = useMemo(() => data && buildPanelsWithoutChecklistReport({
    panels: data.panels,
    inspectionLinks: data.inspectionLinks,
    hierarchy,
    unidades,
    filters: { unidadeId, localidadeId, status },
  }), [data, hierarchy, unidades, unidadeId, localidadeId, status]);

  const filtered = unidadeId !== FILTER_ALL || localidadeId !== FILTER_ALL || status !== FILTER_ALL;
  const localidades = hierarchy?.localidades || [];

  // Mesmo mecanismo do "Exportar Excel" do Inventário (lib xlsx, sob demanda).
  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(report.rows.map(toExportRow));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Quadros sem checklist");
    XLSX.writeFile(wb, "quadros-sem-checklist.xlsx");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quadros sem checklist</DialogTitle>
          <DialogDescription>
            Quadros cadastrados no Inventário que ainda não possuem nenhum checklist realizado.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={unidadeId} onValueChange={setUnidadeId}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Unidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>Todas as unidades</SelectItem>
              {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={localidadeId} onValueChange={setLocalidadeId}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Site" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>Todos os sites</SelectItem>
              {localidades.map((l) => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>Todos Status</SelectItem>
              {Object.entries(PANEL_STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isError ? (
          <p className="text-sm text-destructive">Não foi possível gerar o relatório. Tente novamente.</p>
        ) : !report ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm font-semibold">
                Total de quadros sem checklist: <span className="text-primary">{report.total}</span>
                {filtered && <span className="font-normal text-muted-foreground"> (de {report.totalNoRecorte} no recorte)</span>}
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
                  <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Atualizar
                </Button>
                <Button size="sm" variant="outline" className="gap-2" onClick={exportExcel} disabled={!report.total}>
                  <FileSpreadsheet className="h-4 w-4" />Exportar Excel
                </Button>
              </div>
            </div>

            {report.total === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center border border-dashed rounded-lg">
                <CheckCircle2 className="h-8 w-8 text-secondary" />
                <p className="text-sm font-medium">
                  {report.totalNoRecorte === 0
                    ? "Nenhum quadro cadastrado no recorte selecionado."
                    : "Todos os quadros cadastrados possuem pelo menos um checklist."}
                </p>
                {filtered && report.totalNoRecorte > 0 && (
                  <p className="text-xs text-muted-foreground">Considerando os filtros selecionados.</p>
                )}
              </div>
            ) : (
              <>
                {/* Mobile: cartões */}
                <div className="space-y-2 sm:hidden">
                  {report.rows.map((r) => (
                    <Link key={r.id} to={`/quadro/${r.id}`} className="block rounded-lg border p-3 hover:border-primary/30">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-primary">{r.tag || "—"}</span>
                        {r.status && <Badge variant="outline" className="text-xs">{r.status}</Badge>}
                        {r.tipo && <Badge variant="outline" className="text-xs">{r.tipo}</Badge>}
                      </div>
                      {r.nome && <p className="text-sm font-medium">{r.nome}</p>}
                      <p className="text-xs text-muted-foreground flex items-start gap-1 mt-1">
                        <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                        {[r.unidade, r.site, r.predio, r.sublocal].filter(Boolean).join(" › ") || "—"}
                      </p>
                      {(r.tensao || r.frequencia) && (
                        <p className="text-xs text-muted-foreground mt-0.5">{[r.tensao, r.frequencia].filter(Boolean).join(" · ")}</p>
                      )}
                    </Link>
                  ))}
                </div>

                {/* Desktop: tabela */}
                <div className="hidden sm:block overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium">Quadro</th>
                        <th className="px-3 py-2 font-medium">Localidade</th>
                        <th className="px-3 py-2 font-medium">Site</th>
                        <th className="px-3 py-2 font-medium">Prédio</th>
                        <th className="px-3 py-2 font-medium">Sublocal</th>
                        <th className="px-3 py-2 font-medium">Tipo</th>
                        <th className="px-3 py-2 font-medium">Tensão</th>
                        <th className="px-3 py-2 font-medium">Freq.</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((r) => (
                        <tr key={r.id} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <Link to={`/quadro/${r.id}`} className="font-mono text-xs font-bold text-primary hover:underline">{r.tag || "—"}</Link>
                            {r.nome && <div className="text-xs text-muted-foreground">{r.nome}</div>}
                          </td>
                          <td className="px-3 py-2">{r.unidade || "—"}</td>
                          <td className="px-3 py-2">{r.site || "—"}</td>
                          <td className="px-3 py-2">{r.predio || "—"}</td>
                          <td className="px-3 py-2">{r.sublocal || "—"}</td>
                          <td className="px-3 py-2">{r.tipo || "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{r.tensao || "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{r.frequencia || "—"}</td>
                          <td className="px-3 py-2">{r.status || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">Gerado em {format(new Date(), "dd/MM/yyyy HH:mm")}</p>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
