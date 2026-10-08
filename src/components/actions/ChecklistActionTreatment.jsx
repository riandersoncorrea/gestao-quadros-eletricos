import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listTreatableActionsForPanel } from "@/services/actionService";
import { IN_EXECUTION_ACTIONS_KEY } from "@/hooks/useInExecutionActions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Wrench } from "lucide-react";
import ActionTreatmentDialog from "@/components/actions/ActionTreatmentDialog";

/**
 * "Tratar ação" pelo Checklist (perfil Editor, sem acesso à página Ações):
 * 1) escolhe uma ação "Em execução" do quadro do checklist (lista relida do
 *    banco ao abrir — services/actionService.js#listTreatableActionsForPanel);
 * 2) abre o MESMO tratamento da página Ações (ActionTreatmentDialog: Nota,
 *    OM, fotos 1–3, PDF de evidência, conclusão), restrito ao quadro via
 *    `scopePanelId`.
 */
export default function ChecklistActionTreatment({ panelId, panelLabel, count, size = "sm" }) {
  const queryClient = useQueryClient();
  const [selectOpen, setSelectOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [treating, setTreating] = useState(null);

  const { data: actions = [], isFetching, isError } = useQuery({
    queryKey: [...IN_EXECUTION_ACTIONS_KEY, "quadro", panelId],
    queryFn: () => listTreatableActionsForPanel(panelId),
    enabled: selectOpen && !!panelId,
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    if (!selectOpen) return;
    setSelectedId(actions.length === 1 ? actions[0].id : null);
  }, [selectOpen, actions]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: IN_EXECUTION_ACTIONS_KEY });
    queryClient.invalidateQueries({ queryKey: ["actions"] });
    queryClient.invalidateQueries({ queryKey: ["nonconformities"] });
  };

  const continueTreatment = () => {
    const action = actions.find((a) => a.id === selectedId);
    if (!action) return;
    setSelectOpen(false);
    setTreating(action);
  };

  return (
    <>
      <Button size={size} variant="outline" className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50" onClick={() => setSelectOpen(true)}>
        <Wrench className="h-3.5 w-3.5" />Tratar ação{count > 1 ? ` (${count})` : ""}
      </Button>

      <Dialog open={selectOpen} onOpenChange={setSelectOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tratar ação</DialogTitle>
            <DialogDescription>{panelLabel}</DialogDescription>
          </DialogHeader>

          {isError ? (
            <p className="text-sm text-destructive">Não foi possível carregar as ações. Tente novamente.</p>
          ) : isFetching && !actions.length ? (
            <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : actions.length === 0 ? (
            <p className="text-sm rounded-lg border border-dashed p-4 text-center">
              Este quadro não possui ações em execução.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">{actions.length === 1 ? "Ação em execução" : "Selecione a ação"}</p>
              <div role="radiogroup" className="space-y-2">
                {actions.map((a, i) => {
                  const checked = selectedId === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => setSelectedId(a.id)}
                      className={`w-full text-left rounded-lg border p-3 space-y-1.5 transition-colors ${checked ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
                    >
                      <div className="flex items-start gap-2">
                        {actions.length > 1 && (
                          <span className={`mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 ${checked ? "border-primary bg-primary ring-2 ring-inset ring-background" : "border-muted-foreground/40"}`} />
                        )}
                        <span className="text-sm font-medium whitespace-pre-wrap flex-1">
                          {actions.length > 1 && `Ação ${i + 1} — `}{a.descricao}
                        </span>
                      </div>
                      {a.nonconformity?.descricao && (
                        <p className="text-xs text-muted-foreground flex gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                          <span><span className="font-medium">NC:</span> {a.nonconformity.descricao}</span>
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-200">Em andamento</Badge>
                        <span>Responsável: {a.responsavel || "—"}</span>
                        {a.numero_nota && <span>Nota: {a.numero_nota}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSelectOpen(false)}>Cancelar</Button>
            <Button onClick={continueTreatment} disabled={!selectedId}>Continuar tratamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ActionTreatmentDialog
        action={treating}
        open={!!treating}
        onOpenChange={(v) => { if (!v) setTreating(null); }}
        onChanged={refresh}
        scopePanelId={panelId}
      />
    </>
  );
}
