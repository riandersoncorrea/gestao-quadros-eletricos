import React, { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listActions, updateAction } from "@/services/actionService";
import { ElectricalPanel } from "@/services/panelService";
import { listAssignableUsers } from "@/services/userService";
import { isOpenAction, actionStatusOptions, isAutomaticAction, isPendingAssignment } from "@/domain/actionRules";
import ActionTreatmentDialog from "@/components/actions/ActionTreatmentDialog";
import {
  PERIOD_OPTIONS, resolvePeriodRange, validateCustomRange, isWithinRange,
} from "@/domain/dashboardFilters";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Search, ListChecks, Clock, AlertTriangle, CheckCircle2, Zap, FileText, Wrench } from "lucide-react";

const ACT_STATUS = {
  aberta: { label: "Aberta", cls: "bg-muted text-muted-foreground border-border" },
  em_andamento: { label: "Em andamento", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  concluida: { label: "Concluída", cls: "bg-secondary/15 text-secondary border-secondary/20" },
  cancelada: { label: "Cancelada", cls: "bg-muted text-muted-foreground border-border" },
};
const fmt = (d) => { try { return d ? format(parseISO(d), "dd/MM/yyyy") : "—"; } catch { return d; } };

export default function ActionList() {
  const { canEdit, canTreatActions, isInspetor, user } = useUserRole();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(
    ["pendentes", "atrasadas", "all", "concluida", "cancelada"].includes(searchParams.get("f"))
      ? searchParams.get("f") : "pendentes"
  );
  const [responsavelFilter, setResponsavelFilter] = useState("all");
  const [period, setPeriod] = useState("todo");
  const [customDraft, setCustomDraft] = useState({ from: "", to: "" });
  const [customApplied, setCustomApplied] = useState(null);
  const [customError, setCustomError] = useState(null);
  // Ação em tratamento/conclusão (Nota, OM, fotos → PDF de evidência).
  const [treatingId, setTreatingId] = useState(null);

  const { data: actions = [], isLoading } = useQuery({ queryKey: ["actions"], queryFn: listActions });
  const { data: panels = [] } = useQuery({ queryKey: ["panels"], queryFn: () => ElectricalPanel.list("tag") });
  const panelName = useMemo(() => new Map(panels.map((p) => [p.id, p.tag || p.name])), [panels]);

  // Mesma queryKey/serviço já usado no seletor de responsável em
  // Não Conformidades — cache compartilhado, sem lógica paralela de busca
  // de usuários. O filtro guarda o id do perfil e compara com
  // `responsavel_id` (ações novas) ou, para ações antigas sem vínculo, com
  // o texto `responsavel`. "me" = Minhas ações (usuário logado).
  const { data: admins = [] } = useQuery({ queryKey: ["assignable-users"], queryFn: listAssignableUsers });
  const adminDisplayById = useMemo(
    () => new Map(admins.map((a) => [a.id, a.full_name || a.email])),
    [admins]
  );

  const dateRange = useMemo(() => resolvePeriodRange(period, customApplied), [period, customApplied]);

  const patch = useMutation({
    mutationFn: ({ id, status }) => updateAction(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success("Ação atualizada");
    },
    onError: (e) => toast.error(`Falha: ${e.message}`),
  });

  const treating = actions.find((a) => a.id === treatingId) || null;

  const atrasadasCount = actions.filter((a) => a.atrasada).length;
  const pendentesCount = actions.filter((a) => isOpenAction(a.status)).length;

  const filtered = actions.filter((a) => {
    const s = search.toLowerCase();
    const hay = [a.descricao, a.responsavel, panelName.get(a.panel_id)].filter(Boolean).join(" ").toLowerCase();
    const matchSearch = !s || hay.includes(s);
    const matchFilter =
      filter === "all" ? true :
      filter === "pendentes" ? isOpenAction(a.status) :
      filter === "atrasadas" ? a.atrasada :
      a.status === filter;
    const responsavelId = responsavelFilter === "me" ? user?.id : responsavelFilter;
    const matchResponsavel =
      responsavelFilter === "all" ||
      (responsavelFilter === "sem_responsavel" ? isPendingAssignment(a) :
        a.responsavel_id === responsavelId ||
        (!a.responsavel_id && !!a.responsavel && a.responsavel === adminDisplayById.get(responsavelId)));
    const matchPeriod = isWithinRange(a.prazo, dateRange);
    return matchSearch && matchFilter && matchResponsavel && matchPeriod;
  });

  const PAGE_SIZE = 40;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = page * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  useEffect(() => { setPage(0); }, [search, filter, responsavelFilter, dateRange]);

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

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary">Ações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {pendentesCount} pendente(s)
          {atrasadasCount > 0 && <span className="text-destructive"> · {atrasadasCount} atrasada(s)</span>}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
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
        <Select value={responsavelFilter} onValueChange={setResponsavelFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Responsável" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os responsáveis</SelectItem>
            <SelectItem value="me">Minhas ações</SelectItem>
            <SelectItem value="sem_responsavel">Pendentes de atribuição</SelectItem>
            {admins.filter((a) => a.id !== user?.id).map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.full_name || a.email}</SelectItem>
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
          <p className="text-xs text-muted-foreground">
            Mostrando {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} de {filtered.length}
          </p>
          {pageItems.map((a) => {
            const st = ACT_STATUS[a.status] || ACT_STATUS.aberta;
            return (
              <Card key={a.id} className="border-border/60">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge variant="outline" className={`text-xs ${st.cls}`}>{st.label}</Badge>
                    {a.atrasada && <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/20"><AlertTriangle className="h-3 w-3 mr-0.5" />Atrasada</Badge>}
                    {a.prazo && <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{fmt(a.prazo)}</span>}
                    {a.concluida_em && <span className="text-xs text-secondary flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{fmt(a.concluida_em)}</span>}
                    {isAutomaticAction(a) && <Badge variant="outline" className="text-xs">Automática</Badge>}
                    {isPendingAssignment(a) && <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-200">Pendente de atribuição</Badge>}
                  </div>
                  <p className="text-sm font-medium">{a.descricao}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                    {a.responsavel && <span>Responsável: {a.responsavel}</span>}
                    {a.panel_id && <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{panelName.get(a.panel_id) || "quadro"}</span>}
                    {a.nonconformity_id && <Link to={`/nao-conformidades/${a.nonconformity_id}`} className="text-primary hover:underline">ver NC</Link>}
                    {a.numero_nota && <span>Nota: {a.numero_nota}</span>}
                    {a.om && <span>OM: {a.om}</span>}
                    {a.evidencia_pdf_url && (
                      <a href={a.evidencia_pdf_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                        <FileText className="h-3 w-3" />PDF de evidência
                      </a>
                    )}
                  </div>
                  {canTreatActions && (canEdit || isOpenAction(a.status)) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {/* "Concluída" não muda o status direto: abre o tratamento, que exige Nota, OM e fotos e gera o PDF.
                          Inspetor só muda o status de ações em aberto (não cancela nem reabre). */}
                      <Select value={a.status} onValueChange={(v) => {
                        if (v === "concluida") setTreatingId(a.id);
                        else patch.mutate({ id: a.id, status: v });
                      }}>
                        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{actionStatusOptions(Object.entries(ACT_STATUS), isInspetor).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                      {isOpenAction(a.status) && (
                        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setTreatingId(a.id)}>
                          <Wrench className="h-3.5 w-3.5" />Tratar / concluir
                        </Button>
                      )}
                    </div>
                  )}
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

      <ActionTreatmentDialog
        action={treating}
        open={!!treating}
        onOpenChange={(v) => { if (!v) setTreatingId(null); }}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ["actions"] })}
      />
    </div>
  );
}
