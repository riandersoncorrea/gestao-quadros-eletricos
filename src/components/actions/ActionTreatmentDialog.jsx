import React, { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  saveActionTreatment, addCorrectivePhoto, removeCorrectivePhoto, completeAction,
} from "@/services/actionService";
import { missingCompletionRequirements, MAX_CORRECTIVE_PHOTOS } from "@/domain/actionCompletion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Camera, Upload, Loader2, X, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import PanelLocation from "@/components/actions/PanelLocation";
import { usePanelLocations } from "@/hooks/usePanelLocations";

/**
 * Tratamento/conclusão de uma ação corretiva: Número da Nota, OM e fotos
 * da corretiva (1 a 3). As fotos são gravadas na ação assim que enviadas;
 * Nota/OM podem ser salvos como rascunho. "Concluir ação" valida tudo,
 * gera e guarda o PDF de evidência e só então marca a ação como concluída
 * (services/actionService.js#completeAction). Ação já concluída abre em
 * modo leitura, com o link do PDF.
 *
 * `action` vem da lista (v_actions) e é atualizada pelo pai via
 * `onChanged` (invalidação das queries) depois de cada gravação.
 */
export default function ActionTreatmentDialog({ action, open, onOpenChange, onChanged }) {
  const [nota, setNota] = useState("");
  const [om, setOm] = useState("");
  const [fotos, setFotos] = useState([]);
  const [missing, setMissing] = useState([]);
  // Localização do quadro da ação, à vista enquanto o inspetor preenche
  // Nota/OM (mesmo cache de quadros/hierarquia da página).
  const locationOf = usePanelLocations();

  // Reinicia o formulário ao abrir/trocar de ação — não a cada refetch da
  // lista, para não apagar o que o usuário está digitando.
  useEffect(() => {
    if (!action) return;
    setNota(action.numero_nota || "");
    setOm(action.om || "");
    setFotos(action.fotos_corretiva || []);
    setMissing([]);
  }, [action?.id, open]);

  const concluded = action?.status === "concluida";
  const fail = (e) => toast.error(e.message || "Falha ao salvar");

  const addPhoto = useMutation({
    mutationFn: (file) => addCorrectivePhoto(action.id, file),
    onSuccess: (row) => { setFotos(row.fotos_corretiva || []); setMissing([]); onChanged?.(); toast.success("Foto anexada"); },
    onError: fail,
  });
  const removePhoto = useMutation({
    mutationFn: (url) => removeCorrectivePhoto(action.id, url),
    onSuccess: (row) => { setFotos(row.fotos_corretiva || []); onChanged?.(); toast.success("Foto removida"); },
    onError: fail,
  });
  const save = useMutation({
    mutationFn: () => saveActionTreatment(action.id, { numero_nota: nota, om }),
    onSuccess: () => { onChanged?.(); toast.success("Tratamento salvo"); },
    onError: fail,
  });
  const complete = useMutation({
    mutationFn: () => completeAction(action.id, { numero_nota: nota, om }),
    onSuccess: () => {
      onChanged?.();
      toast.success("Ação concluída — PDF de evidência gerado");
      onOpenChange(false);
    },
    onError: fail,
  });

  const busy = addPhoto.isPending || removePhoto.isPending || save.isPending || complete.isPending;
  const canAddMore = fotos.length < MAX_CORRECTIVE_PHOTOS;

  const onPickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    if (!canAddMore) {
      toast.error(`Máximo de ${MAX_CORRECTIVE_PHOTOS} fotos da corretiva.`);
      return;
    }
    addPhoto.mutate(file);
  };

  const onComplete = () => {
    const faltando = missingCompletionRequirements({ numero_nota: nota, om, fotos_corretiva: fotos });
    setMissing(faltando);
    if (faltando.length) {
      toast.error(`Para concluir, informe: ${faltando.join(", ")}.`);
      return;
    }
    complete.mutate();
  };

  if (!action) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!complete.isPending) onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{concluded ? "Evidência da correção" : "Tratamento da ação"}</DialogTitle>
          <DialogDescription className="whitespace-pre-wrap">{action.descricao}</DialogDescription>
        </DialogHeader>

        <PanelLocation location={locationOf(action.panel_id)} singleColumn />

        {concluded ? (
          <div className="space-y-3 text-sm">
            <p><span className="text-muted-foreground">Número da Nota:</span> {action.numero_nota || "—"}</p>
            <p><span className="text-muted-foreground">OM:</span> {action.om || "—"}</p>
            {fotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {fotos.map((url, i) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-md border border-border bg-muted/40 overflow-hidden">
                    <img src={url} alt={`Foto da corretiva ${i + 1}`} className="h-full w-full object-contain" />
                  </a>
                ))}
              </div>
            )}
            {action.evidencia_pdf_url ? (
              <a href={action.evidencia_pdf_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-2"><FileText className="h-4 w-4" />Abrir PDF de evidência</Button>
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">Ação concluída antes da evidência obrigatória — sem PDF.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Campos com * são obrigatórios para concluir. Você pode salvar e concluir depois.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="acao-nota">Número da Nota *</Label>
                <Input id="acao-nota" value={nota} onChange={(e) => setNota(e.target.value)} disabled={busy}
                  aria-invalid={missing.includes("Número da Nota")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acao-om">OM *</Label>
                <Input id="acao-om" value={om} onChange={(e) => setOm(e.target.value)} disabled={busy}
                  aria-invalid={missing.includes("OM")} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Fotos da corretiva *</Label>
                <span className="text-xs text-muted-foreground">{fotos.length}/{MAX_CORRECTIVE_PHOTOS} · mín. 1, máx. {MAX_CORRECTIVE_PHOTOS}</span>
              </div>
              {fotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {fotos.map((url, i) => (
                    <div key={url} className="relative aspect-square rounded-md border border-border bg-muted/40 overflow-hidden">
                      <img src={url} alt={`Foto da corretiva ${i + 1}`} className="h-full w-full object-contain" />
                      <button type="button" disabled={busy} onClick={() => removePhoto.mutate(url)}
                        className="absolute top-1 right-1 rounded-full bg-background/90 border border-border p-1 text-destructive disabled:opacity-50"
                        aria-label={`Remover foto ${i + 1}`}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {canAddMore ? (
                <div className="flex flex-wrap gap-2">
                  <label className={`flex items-center gap-1.5 px-3 h-9 border border-dashed border-border rounded-md text-xs text-muted-foreground ${busy ? "opacity-50 pointer-events-none" : "cursor-pointer hover:bg-muted/50"}`}>
                    {addPhoto.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                    Câmera
                    <input type="file" className="hidden" accept="image/*" capture="environment" onChange={onPickFile} disabled={busy} />
                  </label>
                  <label className={`flex items-center gap-1.5 px-3 h-9 border border-dashed border-border rounded-md text-xs text-muted-foreground ${busy ? "opacity-50 pointer-events-none" : "cursor-pointer hover:bg-muted/50"}`}>
                    {addPhoto.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Galeria
                    <input type="file" className="hidden" accept="image/*" onChange={onPickFile} disabled={busy} />
                  </label>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Limite de {MAX_CORRECTIVE_PHOTOS} fotos atingido. Remova uma para trocar.</p>
              )}
            </div>

            {missing.length > 0 && (
              <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Para concluir, informe: {missing.join(", ")}.</span>
              </div>
            )}
            {complete.isPending && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />Gerando e salvando o PDF de evidência…
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {concluded ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={() => save.mutate()}>Salvar</Button>
              <Button disabled={busy} onClick={onComplete} className="gap-1.5">
                {complete.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Concluir ação
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
