import React, { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getNonconformity, updateNonconformity, listActionsForNC,
  createAction, updateAction, deleteAction,
} from "@/api/nc";
import { ElectricalPanel } from "@/api/entities";
import { SEV, NC_STATUS, ORIGEM } from "@/pages/NonconformityList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Zap, ClipboardCheck, Plus, Trash2, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

const ACT_STATUS = {
  aberta: { label: "Aberta", cls: "bg-muted text-muted-foreground border-border" },
  em_andamento: { label: "Em andamento", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  concluida: { label: "Concluída", cls: "bg-secondary/15 text-secondary border-secondary/20" },
  cancelada: { label: "Cancelada", cls: "bg-muted text-muted-foreground border-border" },
};
const emptyAction = () => ({ descricao: "", responsavel: "", prazo: "", status: "aberta" });
const fmt = (d) => { try { return d ? format(parseISO(d), "dd/MM/yyyy") : "—"; } catch { return d; } };

export default function NonconformityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canEdit } = useUserRole();
  const [newAction, setNewAction] = useState(null);

  const { data: nc, isLoading } = useQuery({ queryKey: ["nc", id], queryFn: () => getNonconformity(id) });
  const { data: actions = [] } = useQuery({ queryKey: ["nc-actions", id], queryFn: () => listActionsForNC(id) });
  const { data: panels = [] } = useQuery({ queryKey: ["panels"], queryFn: () => ElectricalPanel.list("tag") });
  const panel = panels.find((p) => p.id === nc?.panel_id);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["nc", id] });
    queryClient.invalidateQueries({ queryKey: ["nc-actions", id] });
    queryClient.invalidateQueries({ queryKey: ["nonconformities"] });
    queryClient.invalidateQueries({ queryKey: ["actions"] });
  };

  const patchNC = useMutation({
    mutationFn: (values) => updateNonconformity(id, values),
    onSuccess: () => { invalidate(); toast.success("Não-conformidade atualizada"); },
    onError: (e) => toast.error(`Falha: ${e.message}`),
  });
  const addAction = useMutation({
    mutationFn: () => createAction({ ...newAction, nonconformity_id: id, panel_id: nc.panel_id, prazo: newAction.prazo || null }),
    onSuccess: () => { invalidate(); setNewAction(null); toast.success("Ação criada"); },
    onError: (e) => toast.error(`Falha: ${e.message}`),
  });
  const patchAction = useMutation({
    mutationFn: ({ actionId, values }) => updateAction(actionId, values),
    onSuccess: invalidate,
    onError: (e) => toast.error(`Falha: ${e.message}`),
  });
  const removeAction = useMutation({
    mutationFn: (actionId) => deleteAction(actionId),
    onSuccess: () => { invalidate(); toast.success("Ação removida"); },
  });

  if (isLoading) return <div className="p-8 max-w-3xl mx-auto"><Skeleton className="h-8 w-64 mb-4" /><Skeleton className="h-64 w-full" /></div>;
  if (!nc) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Não-conformidade não encontrada</p>
        <Link to="/nao-conformidades"><Button variant="outline" className="mt-4">Voltar</Button></Link>
      </div>
    );
  }

  const sev = SEV[nc.severidade] || SEV.media;
  const st = NC_STATUS[nc.status] || NC_STATUS.aberta;
  const abertas = actions.filter((a) => ["aberta", "em_andamento"].includes(a.status));
  const atrasadas = actions.filter((a) => a.atrasada);

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/nao-conformidades")}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Não-conformidade</h1>
            <Badge variant="outline" className={`text-xs ${sev.cls}`}>{sev.label}</Badge>
            <Badge variant="outline" className={`text-xs ${st.cls}`}>{st.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {ORIGEM[nc.origem] || nc.origem} · aberta em {fmt(nc.created_at)}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Descrição</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm whitespace-pre-wrap">{nc.descricao}</p>
          {nc.categoria && <p className="text-xs text-muted-foreground">Categoria: {nc.categoria}</p>}
          {(panel || nc.tag) && (
            <p className="text-xs flex items-center gap-1">
              <Zap className="h-3 w-3 text-primary/60" />
              {nc.panel_id
                ? <Link to={`/quadro/${nc.panel_id}`} className="text-primary hover:underline font-mono">{panel?.tag || nc.tag}</Link>
                : <span className="font-mono">{nc.tag}</span>}
            </p>
          )}
          {nc.inspection_id && (
            <p className="text-xs">
              <Link to={`/inspecoes/${nc.inspection_id}`} className="text-primary hover:underline flex items-center gap-1">
                <ClipboardCheck className="h-3 w-3" />ver inspeção de origem
              </Link>
            </p>
          )}
          {nc.evidencia_url && (
            <a href={nc.evidencia_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">ver evidência</a>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Tratativa</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={nc.status} onValueChange={(v) => patchNC.mutate({ status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(NC_STATUS).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Severidade</Label>
              <Select value={nc.severidade} onValueChange={(v) => patchNC.mutate({ severidade: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(SEV).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Recomendação</Label>
              <Textarea rows={2} defaultValue={nc.recomendacao || ""}
                onBlur={(e) => { if (e.target.value !== (nc.recomendacao || "")) patchNC.mutate({ recomendacao: e.target.value || null }); }}
                placeholder="Ação recomendada" />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            Ações
            {abertas.length > 0 && <Badge variant="outline" className="text-[10px]">{abertas.length} aberta(s)</Badge>}
            {atrasadas.length > 0 && <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">{atrasadas.length} atrasada(s)</Badge>}
          </CardTitle>
          {canEdit && !newAction && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setNewAction(emptyAction())}>
              <Plus className="h-3.5 w-3.5" />Nova ação
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {actions.length === 0 && !newAction && <p className="text-sm text-muted-foreground">Nenhuma ação registrada.</p>}

          {actions.map((a) => {
            const ast = ACT_STATUS[a.status] || ACT_STATUS.aberta;
            return (
              <div key={a.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] ${ast.cls}`}>{ast.label}</Badge>
                  {a.atrasada && <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20"><AlertTriangle className="h-3 w-3 mr-0.5" />Atrasada</Badge>}
                  {a.prazo && <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{fmt(a.prazo)}</span>}
                  {a.concluida_em && <span className="text-xs text-secondary flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{fmt(a.concluida_em)}</span>}
                </div>
                <p className="text-sm">{a.descricao}</p>
                {a.responsavel && <p className="text-xs text-muted-foreground">Responsável: {a.responsavel}</p>}
                {canEdit && (
                  <div className="flex items-center gap-2 pt-1">
                    <Select value={a.status} onValueChange={(v) => patchAction.mutate({ actionId: a.id, values: { status: v } })}>
                      <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(ACT_STATUS).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeAction.mutate(a.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {newAction && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <Textarea rows={2} placeholder="O que precisa ser feito" value={newAction.descricao}
                onChange={(e) => setNewAction((s) => ({ ...s, descricao: e.target.value }))} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Responsável" value={newAction.responsavel}
                  onChange={(e) => setNewAction((s) => ({ ...s, responsavel: e.target.value }))} />
                <Input type="date" value={newAction.prazo}
                  onChange={(e) => setNewAction((s) => ({ ...s, prazo: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setNewAction(null)}>Cancelar</Button>
                <Button size="sm" disabled={!newAction.descricao.trim() || addAction.isPending} onClick={() => addAction.mutate()}>
                  Adicionar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
