import React, { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getNonconformity, updateNonconformity } from "@/services/ncService";
import { listActionsForNC, createAction, updateAction, deleteAction } from "@/services/actionService";
import { listAssignableUsers } from "@/services/userService";
import { ElectricalPanel } from "@/services/panelService";
import { isOpenAction, actionStatusOptions, isAutomaticAction, isPendingAssignment } from "@/domain/actionRules";
import { isOpenNonconformity, allActionsResolved } from "@/domain/nonconformityRules";
import ActionTreatmentDialog from "@/components/actions/ActionTreatmentDialog";
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
import { ArrowLeft, Zap, ClipboardCheck, Plus, Trash2, CheckCircle2, Clock, AlertTriangle, FileText, Wrench, Pencil } from "lucide-react";

const ACT_STATUS = {
  aberta: { label: "Aberta", cls: "bg-muted text-muted-foreground border-border" },
  em_andamento: { label: "Em andamento", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  concluida: { label: "Concluída", cls: "bg-secondary/15 text-secondary border-secondary/20" },
  cancelada: { label: "Cancelada", cls: "bg-muted text-muted-foreground border-border" },
};
const emptyAction = () => ({ descricao: "", responsavel_id: "", prazo: "", status: "aberta" });
const NO_RESPONSAVEL = "__none__";

/**
 * Campos editáveis da ação (nova ou existente) → valores gravados. O
 * responsável é escolhido pelo perfil (responsavel_id) e o nome vai para
 * `responsavel` (texto exibido e impresso no PDF). Sem responsável = null
 * nos dois (pendente de atribuição).
 */
function actionValues(form, users) {
  const u = users.find((x) => x.id === form.responsavel_id);
  return {
    descricao: form.descricao.trim(),
    responsavel_id: u ? u.id : null,
    responsavel: u ? (u.full_name || u.email) : null,
    prazo: form.prazo || null,
  };
}

/** Formulário de ação — usado para abrir uma ação manual e para editar uma existente. */
function ActionFields({ form, setForm, users, onCancel, onSubmit, submitLabel, pending }) {
  // Ação existente cujo responsável não está na lista (ex.: atribuída a um
  // nome antigo sem vínculo de perfil): mantém o texto visível no seletor.
  const keepsLegacy = !form.responsavel_id && form.responsavel_legacy;
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <Textarea rows={2} placeholder="O que precisa ser feito" value={form.descricao}
        onChange={(e) => setForm((s) => ({ ...s, descricao: e.target.value }))} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Select
          value={form.responsavel_id || NO_RESPONSAVEL}
          onValueChange={(v) => setForm((s) => ({ ...s, responsavel_id: v === NO_RESPONSAVEL ? "" : v, responsavel_legacy: null }))}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_RESPONSAVEL}>{keepsLegacy ? `${form.responsavel_legacy} (manter)` : "Sem responsável"}</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}{u.role === "inspetor" ? " (inspetor)" : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={form.prazo || ""}
          onChange={(e) => setForm((s) => ({ ...s, prazo: e.target.value }))} />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" disabled={!form.descricao.trim() || pending} onClick={onSubmit}>{submitLabel}</Button>
      </div>
    </div>
  );
}
const fmt = (d) => { try { return d ? format(parseISO(d), "dd/MM/yyyy") : "—"; } catch { return d; } };

export default function NonconformityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canEdit, canTreatActions, isInspetor } = useUserRole();
  const [newAction, setNewAction] = useState(null);
  // Edição de ação existente (descrição, responsável, prazo) — admin/editor.
  const [editing, setEditing] = useState(null);
  // Ação em tratamento/conclusão (Nota, OM, fotos → PDF de evidência).
  const [treatingId, setTreatingId] = useState(null);

  const { data: nc, isLoading } = useQuery({ queryKey: ["nc", id], queryFn: () => getNonconformity(id) });
  const { data: actions = [] } = useQuery({ queryKey: ["nc-actions", id], queryFn: () => listActionsForNC(id) });
  const { data: panels = [] } = useQuery({ queryKey: ["panels"], queryFn: () => ElectricalPanel.list("tag") });
  const { data: users = [] } = useQuery({ queryKey: ["assignable-users"], queryFn: listAssignableUsers, enabled: canEdit });
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
    mutationFn: () => createAction(
      { ...actionValues(newAction, users), status: newAction.status, nonconformity_id: id, panel_id: nc.panel_id },
      { currentNcStatus: nc.status }
    ),
    onSuccess: () => { invalidate(); setNewAction(null); toast.success("Ação criada"); },
    onError: (e) => toast.error(`Falha: ${e.message}`),
  });
  const patchAction = useMutation({
    mutationFn: ({ actionId, values }) => updateAction(actionId, values),
    onSuccess: invalidate,
    onError: (e) => toast.error(`Falha: ${e.message}`),
  });
  const editAction = useMutation({
    mutationFn: () => {
      const values = actionValues(editing, users);
      // Responsável antigo só em texto, não trocado: preserva o texto.
      if (!values.responsavel_id && editing.responsavel_legacy) values.responsavel = editing.responsavel_legacy;
      return updateAction(editing.id, values);
    },
    onSuccess: () => { invalidate(); setEditing(null); toast.success("Ação atualizada"); },
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
  const abertas = actions.filter((a) => isOpenAction(a.status));
  const atrasadas = actions.filter((a) => a.atrasada);
  const treating = actions.find((a) => a.id === treatingId) || null;
  const suggestComplete = isOpenNonconformity(nc.status) && allActionsResolved(actions);

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/nao-conformidades")}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-primary">Não-conformidade</h1>
            <Badge variant="outline" className={`text-xs ${sev.cls}`}>{sev.label}</Badge>
            <Badge variant="outline" className={`text-xs ${st.cls}`}>{st.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {ORIGEM[nc.origem] || nc.origem} · aberta em {fmt(nc.created_at)}
            {nc.concluida_em && <> · concluída em {fmt(nc.concluida_em)}</>}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Detalhes</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm whitespace-pre-wrap">{nc.descricao}</p>
          {nc.categoria && <p className="text-xs text-muted-foreground">Categoria: {nc.categoria}</p>}
          {(panel || nc.tag) && (
            <p className="text-xs flex items-center gap-1">
              <Zap className="h-3 w-3 text-primary/60" />
              {/* Inspetor não acessa o detalhe do quadro: só o texto. */}
              {nc.panel_id && !isInspetor
                ? <Link to={`/quadro/${nc.panel_id}`} className="text-primary hover:underline font-mono">{panel?.tag || nc.tag}</Link>
                : <span className="font-mono">{panel?.tag || nc.tag}</span>}
            </p>
          )}
          {nc.inspection_id && !isInspetor && (
            <p className="text-xs">
              <Link to={`/inspecoes/${nc.inspection_id}`} className="text-primary hover:underline flex items-center gap-1">
                <ClipboardCheck className="h-3 w-3" />ver inspeção de origem
              </Link>
            </p>
          )}
          {nc.evidencia_url && (
            <a href={nc.evidencia_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">ver evidência</a>
          )}

          {canEdit && (
            <div className="grid gap-3 sm:grid-cols-2 pt-3 mt-1 border-t border-border">
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
            </div>
          )}
        </CardContent>
      </Card>

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
          {suggestComplete && canEdit && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-secondary/30 bg-secondary/10 px-3 py-2">
              <p className="text-xs text-secondary flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-secondary shrink-0" />
                Todas as ações foram encerradas.
              </p>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => patchNC.mutate({ status: "concluida" })}>
                Marcar NC como concluída
              </Button>
            </div>
          )}

          {actions.length === 0 && !newAction && <p className="text-sm text-muted-foreground">Nenhuma ação registrada.</p>}

          {actions.map((a) => {
            const ast = ACT_STATUS[a.status] || ACT_STATUS.aberta;
            if (editing?.id === a.id) {
              return (
                <ActionFields key={a.id} form={editing} setForm={setEditing} users={users}
                  onCancel={() => setEditing(null)} onSubmit={() => editAction.mutate()}
                  submitLabel="Salvar" pending={editAction.isPending} />
              );
            }
            return (
              <div key={a.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] ${ast.cls}`}>{ast.label}</Badge>
                  {a.atrasada && <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20"><AlertTriangle className="h-3 w-3 mr-0.5" />Atrasada</Badge>}
                  {a.prazo && <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{fmt(a.prazo)}</span>}
                  {a.concluida_em && <span className="text-xs text-secondary flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{fmt(a.concluida_em)}</span>}
                  {isAutomaticAction(a) && <Badge variant="outline" className="text-[10px]">Automática</Badge>}
                  {isPendingAssignment(a) && <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-200">Pendente de atribuição</Badge>}
                </div>
                <p className="text-sm">{a.descricao}</p>
                {a.responsavel && <p className="text-xs text-muted-foreground">Responsável: {a.responsavel}</p>}
                {(a.numero_nota || a.om || a.fotos_corretiva?.length > 0) && (
                  <p className="text-xs text-muted-foreground">
                    {[a.numero_nota && `Nota: ${a.numero_nota}`, a.om && `OM: ${a.om}`, a.fotos_corretiva?.length > 0 && `${a.fotos_corretiva.length} foto(s) da corretiva`].filter(Boolean).join(" · ")}
                  </p>
                )}
                {a.evidencia_pdf_url && (
                  <a href={a.evidencia_pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                    <FileText className="h-3 w-3" />PDF de evidência da correção
                  </a>
                )}
                {canTreatActions && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {/* "Concluída" não muda o status direto: abre o tratamento, que exige Nota, OM e fotos e gera o PDF.
                        Inspetor só muda o status de ações em aberto (não cancela nem reabre). */}
                    {(canEdit || isOpenAction(a.status)) && (
                      <Select value={a.status} onValueChange={(v) => {
                        if (v === "concluida") setTreatingId(a.id);
                        else patchAction.mutate({ actionId: a.id, values: { status: v } });
                      }}>
                        <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{actionStatusOptions(Object.entries(ACT_STATUS), isInspetor).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                    {isOpenAction(a.status) && (
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setTreatingId(a.id)}>
                        <Wrench className="h-3.5 w-3.5" />Tratar / concluir
                      </Button>
                    )}
                    {a.status === "concluida" && (
                      <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => setTreatingId(a.id)}>
                        <FileText className="h-3.5 w-3.5" />Evidência
                      </Button>
                    )}
                    {canEdit && isOpenAction(a.status) && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Editar ação"
                        onClick={() => setEditing({
                          id: a.id, descricao: a.descricao || "", prazo: a.prazo || "",
                          responsavel_id: a.responsavel_id || "",
                          responsavel_legacy: !a.responsavel_id && a.responsavel ? a.responsavel : null,
                        })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canEdit && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeAction.mutate(a.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {newAction && (
            <ActionFields form={newAction} setForm={setNewAction} users={users}
              onCancel={() => setNewAction(null)} onSubmit={() => addAction.mutate()}
              submitLabel="Adicionar" pending={addAction.isPending} />
          )}
        </CardContent>
      </Card>

      <ActionTreatmentDialog
        action={treating}
        open={!!treating}
        onOpenChange={(v) => { if (!v) setTreatingId(null); }}
        onChanged={invalidate}
      />
    </div>
  );
}
