import React, { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBatch, listOrders, relinkOrder, cancelBatch } from "@/api/sap";
import { ElectricalPanel } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Combobox } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

const fmtD = (d, withTime) => { try { return d ? format(parseISO(d), withTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy") : "—"; } catch { return String(d); } };
import { ArrowLeft, Search, Link2, Link2Off, AlertTriangle, FileSpreadsheet, Ban } from "lucide-react";

const LINK = {
  auto: { label: "Automático", cls: "bg-secondary/15 text-secondary border-secondary/20" },
  manual: { label: "Manual", cls: "bg-primary/10 text-primary border-primary/20" },
  pendente: { label: "Pendente", cls: "bg-muted text-muted-foreground border-border" },
  sem_correspondencia: { label: "Sem quadro", cls: "bg-amber-100 text-amber-800 border-amber-200" },
};

export default function SapBatchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canEdit } = useUserRole();
  const [search, setSearch] = useState("");
  const [linkFilter, setLinkFilter] = useState("all");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const { data: batch, isLoading } = useQuery({ queryKey: ["sap-batch", id], queryFn: () => getBatch(id) });
  const { data: orders = [] } = useQuery({ queryKey: ["sap-orders", id], queryFn: () => listOrders(id) });
  const { data: panels = [] } = useQuery({ queryKey: ["panels"], queryFn: () => ElectricalPanel.list("tag") });

  const panelName = useMemo(() => new Map(panels.map((p) => [p.id, p.tag || p.name])), [panels]);
  const panelOptions = useMemo(
    () => panels.map((p) => ({ value: p.id, label: p.tag ? `${p.tag} — ${p.name}` : p.name })),
    [panels]
  );

  const relink = useMutation({
    mutationFn: ({ orderId, panelId }) => relinkOrder(orderId, panelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sap-orders", id] });
      toast.success("Vínculo atualizado");
    },
    onError: (e) => toast.error(`Falha: ${e.message}`),
  });

  const cancel = useMutation({
    mutationFn: () => cancelBatch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sap-batches"] });
      queryClient.invalidateQueries({ queryKey: ["sap-batch", id] });
      setCancelOpen(false);
      toast.success("Lote cancelado");
    },
  });

  const filtered = orders.filter((o) => {
    const s = search.toLowerCase();
    const hay = [o.ordem, o.nota, o.tag, o.equipamento, o.local_texto, panelName.get(o.panel_id)].filter(Boolean).join(" ").toLowerCase();
    const matchSearch = !s || hay.includes(s);
    const matchLink = linkFilter === "all" || o.link_status === linkFilter;
    return matchSearch && matchLink;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  React.useEffect(() => { setPage(0); }, [search, linkFilter]);

  if (isLoading) {
    return <div className="p-8 max-w-5xl mx-auto"><Skeleton className="h-8 w-64 mb-4" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (!batch) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Lote não encontrado</p>
        <Link to="/importacao-sap"><Button variant="outline" className="mt-4">Voltar</Button></Link>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/importacao-sap")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold tracking-tight">{batch.filename || "(sem nome)"}</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              {batch.total_rows} linhas
              {batch.imported_at && ` · importado em ${fmtD(batch.imported_at, true)}`}
              {batch.status === "cancelado" && " · CANCELADO"}
            </p>
            {batch.notes && <p className="text-xs text-muted-foreground mt-1">{batch.notes}</p>}
          </div>
        </div>
        {canEdit && batch.status !== "cancelado" && (
          <Button variant="outline" size="sm" className="gap-2 text-destructive hover:bg-destructive/10" onClick={() => setCancelOpen(true)}>
            <Ban className="h-3 w-3" />Cancelar lote
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Ordens" value={orders.length} />
        <Kpi label="Vinculadas" value={orders.filter((o) => o.panel_id).length} tone="ok" icon={Link2} />
        <Kpi label="Sem quadro" value={orders.filter((o) => !o.panel_id).length} tone="warn" icon={Link2Off} />
        <Kpi label="Linhas c/ erro (ignoradas)" value={batch.error_count} tone={batch.error_count ? "err" : undefined} icon={AlertTriangle} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por ordem, TAG, equipamento..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={linkFilter} onValueChange={setLinkFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os vínculos</SelectItem>
            <SelectItem value="auto">Automático</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="sem_correspondencia">Sem quadro</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Ordens ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                  <th>Ordem</th><th>TAG</th><th>Local</th><th>Data</th><th>Freq.</th><th>Vínculo</th><th>Quadro</th>
                </tr>
              </thead>
              <tbody className="[&>tr]:border-t [&>tr>td]:px-3 [&>tr>td]:py-2">
                {pageItems.map((o) => {
                  const lk = LINK[o.link_status] || LINK.pendente;
                  return (
                    <tr key={o.id}>
                      <td className="font-mono">{o.ordem || "—"}</td>
                      <td className="font-mono">{o.tag || "—"}</td>
                      <td className="max-w-[160px] truncate" title={o.local_texto}>{o.local_texto || "—"}</td>
                      <td>{fmtD(o.data_planejada)}</td>
                      <td>{o.frequencia || "—"}</td>
                      <td><Badge variant="outline" className={`text-[10px] ${lk.cls}`}>{lk.label}</Badge></td>
                      <td className="min-w-[220px]">
                        {canEdit && batch.status !== "cancelado" ? (
                          <Combobox
                            options={panelOptions}
                            value={o.panel_id || ""}
                            onChange={(pid) => relink.mutate({ orderId: o.id, panelId: pid || null })}
                            placeholder="Vincular a um quadro"
                            searchPlaceholder="Buscar quadro..."
                            className="h-8"
                          />
                        ) : o.panel_id ? (
                          <Link to={`/quadro/${o.panel_id}`} className="font-mono text-primary hover:underline">
                            {panelName.get(o.panel_id) || "quadro"}
                          </Link>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="text-sm text-muted-foreground p-6 text-center">Nenhuma ordem para o filtro atual.</p>}
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
              <span className="text-muted-foreground">Página {page + 1} de {pageCount}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar lote de importação</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            O lote fica marcado como cancelado e some dos indicadores. As ordens já gravadas não são apagadas.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Voltar</Button>
            <Button variant="destructive" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              {cancel.isPending ? "Cancelando..." : "Cancelar lote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value, tone, icon: Icon }) {
  const toneCls =
    tone === "ok" ? "text-secondary" : tone === "warn" ? "text-amber-700" : tone === "err" ? "text-destructive" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground flex items-center gap-1">{Icon && <Icon className="h-3 w-3" />}{label}</p>
        <p className={`text-xl font-bold ${toneCls}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
