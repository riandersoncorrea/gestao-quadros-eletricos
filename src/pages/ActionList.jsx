import React, { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listActions, updateAction } from "@/api/nc";
import { ElectricalPanel } from "@/api/entities";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Search, ListChecks, Clock, AlertTriangle, CheckCircle2, Zap } from "lucide-react";

const ACT_STATUS = {
  aberta: { label: "Aberta", cls: "bg-muted text-muted-foreground border-border" },
  em_andamento: { label: "Em andamento", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  concluida: { label: "Concluída", cls: "bg-secondary/15 text-secondary border-secondary/20" },
  cancelada: { label: "Cancelada", cls: "bg-muted text-muted-foreground border-border" },
};
const fmt = (d) => { try { return d ? format(parseISO(d), "dd/MM/yyyy") : "—"; } catch { return d; } };

export default function ActionList() {
  const { canEdit } = useUserRole();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(
    ["pendentes", "atrasadas", "all", "concluida", "cancelada"].includes(searchParams.get("f"))
      ? searchParams.get("f") : "pendentes"
  );

  const { data: actions = [], isLoading } = useQuery({ queryKey: ["actions"], queryFn: listActions });
  const { data: panels = [] } = useQuery({ queryKey: ["panels"], queryFn: () => ElectricalPanel.list("tag") });
  const panelName = useMemo(() => new Map(panels.map((p) => [p.id, p.tag || p.name])), [panels]);

  const patch = useMutation({
    mutationFn: ({ id, status }) => updateAction(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success("Ação atualizada");
    },
    onError: (e) => toast.error(`Falha: ${e.message}`),
  });

  const atrasadasCount = actions.filter((a) => a.atrasada).length;
  const pendentesCount = actions.filter((a) => ["aberta", "em_andamento"].includes(a.status)).length;

  const filtered = actions.filter((a) => {
    const s = search.toLowerCase();
    const hay = [a.descricao, a.responsavel, panelName.get(a.panel_id)].filter(Boolean).join(" ").toLowerCase();
    const matchSearch = !s || hay.includes(s);
    const matchFilter =
      filter === "all" ? true :
      filter === "pendentes" ? ["aberta", "em_andamento"].includes(a.status) :
      filter === "atrasadas" ? a.atrasada :
      a.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {pendentesCount} pendente(s)
          {atrasadasCount > 0 && <span className="text-destructive"> · {atrasadasCount} atrasada(s)</span>}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por descrição, responsável, quadro..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pendentes">Pendentes</SelectItem>
            <SelectItem value="atrasadas">Atrasadas</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="concluida">Concluídas</SelectItem>
            <SelectItem value="cancelada">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <ListChecks className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">Nenhuma ação para o filtro atual</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const st = ACT_STATUS[a.status] || ACT_STATUS.aberta;
            return (
              <Card key={a.id} className="border-border/60">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge variant="outline" className={`text-xs ${st.cls}`}>{st.label}</Badge>
                    {a.atrasada && <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/20"><AlertTriangle className="h-3 w-3 mr-0.5" />Atrasada</Badge>}
                    {a.prazo && <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{fmt(a.prazo)}</span>}
                    {a.concluida_em && <span className="text-xs text-secondary flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{fmt(a.concluida_em)}</span>}
                  </div>
                  <p className="text-sm font-medium">{a.descricao}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                    {a.responsavel && <span>Responsável: {a.responsavel}</span>}
                    {a.panel_id && <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{panelName.get(a.panel_id) || "quadro"}</span>}
                    {a.nonconformity_id && <Link to={`/nao-conformidades/${a.nonconformity_id}`} className="text-primary hover:underline">ver NC</Link>}
                  </div>
                  {canEdit && (
                    <div className="mt-2">
                      <Select value={a.status} onValueChange={(v) => patch.mutate({ id: a.id, status: v })}>
                        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(ACT_STATUS).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
