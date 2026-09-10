import React, { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listNonconformities, createNonconformity } from "@/api/nc";
import { ElectricalPanel } from "@/api/entities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Combobox } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Plus, Search, FileWarning, Calendar, Zap } from "lucide-react";

export const SEV = {
  baixa: { label: "Baixa", cls: "bg-muted text-muted-foreground border-border" },
  media: { label: "Média", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  alta: { label: "Alta", cls: "bg-orange-100 text-orange-800 border-orange-200" },
  critica: { label: "Crítica", cls: "bg-destructive/10 text-destructive border-destructive/20" },
};
export const NC_STATUS = {
  aberta: { label: "Aberta", cls: "bg-destructive/10 text-destructive border-destructive/20" },
  em_tratamento: { label: "Em tratamento", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  concluida: { label: "Concluída", cls: "bg-secondary/15 text-secondary border-secondary/20" },
  cancelada: { label: "Cancelada", cls: "bg-muted text-muted-foreground border-border" },
};
export const ORIGEM = { inspecao: "Inspeção", termografia: "Termografia", medicao: "Medição", manual: "Manual" };

const EMPTY = { panel_id: "", descricao: "", severidade: "media", recomendacao: "", categoria: "" };

export default function NonconformityList() {
  const { canEdit } = useUserRole();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const panelParam = searchParams.get("panel");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("abertas");
  const [sevFilter, setSevFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const { data: ncs = [], isLoading } = useQuery({ queryKey: ["nonconformities"], queryFn: listNonconformities });
  const { data: panels = [] } = useQuery({ queryKey: ["panels"], queryFn: () => ElectricalPanel.list("tag") });

  const panelName = useMemo(() => new Map(panels.map((p) => [p.id, p.tag || p.name])), [panels]);
  const panelOptions = useMemo(
    () => panels.map((p) => ({ value: p.id, label: p.tag ? `${p.tag} — ${p.name}` : p.name })),
    [panels]
  );

  const create = useMutation({
    mutationFn: () => {
      const p = panels.find((x) => x.id === form.panel_id);
      return createNonconformity({ ...form, tag: p?.tag || null, status: "aberta", origem: "manual" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nonconformities"] });
      setDialogOpen(false);
      setForm(EMPTY);
      toast.success("Não-conformidade registrada");
    },
    onError: (e) => toast.error(`Falha: ${e.message}`),
  });

  const filtered = ncs.filter((n) => {
    if (panelParam && n.panel_id !== panelParam) return false;
    const s = search.toLowerCase();
    const hay = [n.descricao, n.tag, n.categoria, n.recomendacao, panelName.get(n.panel_id)].filter(Boolean).join(" ").toLowerCase();
    const matchSearch = !s || hay.includes(s);
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "abertas" ? ["aberta", "em_tratamento"].includes(n.status) : n.status === statusFilter);
    const matchSev = sevFilter === "all" || n.severidade === sevFilter;
    return matchSearch && matchStatus && matchSev;
  });

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Não Conformidades</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {panelParam
              ? <>Filtrado por quadro <span className="font-mono">{panelName.get(panelParam) || panelParam}</span> · <Link to="/nao-conformidades" className="text-primary hover:underline">limpar</Link></>
              : <>{ncs.filter((n) => ["aberta", "em_tratamento"].includes(n.status)).length} aberta(s) de {ncs.length} no total</>}
          </p>
        </div>
        {canEdit && (
          <Button size="sm" className="gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />Nova NC
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por descrição, quadro, categoria..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="abertas">Abertas + em tratamento</SelectItem>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="aberta">Aberta</SelectItem>
            <SelectItem value="em_tratamento">Em tratamento</SelectItem>
            <SelectItem value="concluida">Concluída</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sevFilter} onValueChange={setSevFilter}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Severidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda severidade</SelectItem>
            {Object.entries(SEV).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <FileWarning className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">Nenhuma não-conformidade para o filtro atual</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => {
            const sev = SEV[n.severidade] || SEV.media;
            const st = NC_STATUS[n.status] || NC_STATUS.aberta;
            return (
              <Link key={n.id} to={`/nao-conformidades/${n.id}`}>
                <Card className="hover:shadow-md transition-shadow border-border/60 hover:border-primary/20">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant="outline" className={`text-xs ${sev.cls}`}>{sev.label}</Badge>
                      <Badge variant="outline" className={`text-xs ${st.cls}`}>{st.label}</Badge>
                      {n.categoria && <span className="text-xs text-muted-foreground">{n.categoria}</span>}
                      <span className="text-[11px] text-muted-foreground">· {ORIGEM[n.origem] || n.origem}</span>
                    </div>
                    <p className="text-sm font-medium">{n.descricao}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                      {n.panel_id && <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{panelName.get(n.panel_id) || n.tag || "quadro"}</span>}
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(parseISO(n.created_at), "dd/MM/yyyy")}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova não-conformidade</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Quadro *</Label>
              <Combobox options={panelOptions} value={form.panel_id}
                onChange={(v) => setForm((s) => ({ ...s, panel_id: v }))}
                placeholder="Selecione o quadro" searchPlaceholder="Buscar..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição *</Label>
              <Textarea rows={3} value={form.descricao} onChange={(e) => setForm((s) => ({ ...s, descricao: e.target.value }))}
                placeholder="O que foi encontrado" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Severidade</Label>
                <Select value={form.severidade} onValueChange={(v) => setForm((s) => ({ ...s, severidade: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(SEV).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Categoria</Label>
                <Input value={form.categoria} onChange={(e) => setForm((s) => ({ ...s, categoria: e.target.value }))} placeholder="Ex: Aterramento" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Recomendação</Label>
              <Input value={form.recomendacao} onChange={(e) => setForm((s) => ({ ...s, recomendacao: e.target.value }))} placeholder="Ação sugerida" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button disabled={!form.panel_id || !form.descricao.trim() || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
