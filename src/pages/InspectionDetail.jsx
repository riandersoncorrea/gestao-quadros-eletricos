import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Inspection } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRole } from "@/hooks/useUserRole";
import { format, parseISO } from "date-fns";
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Minus, User, Calendar, Trash2 } from "lucide-react";
import { toast } from "sonner";

const RESULT_CONFIG = {
  aprovado: { label: "Aprovado", className: "bg-secondary/15 text-secondary border-secondary/20", icon: CheckCircle2 },
  aprovado_ressalvas: { label: "Aprovado c/ Ressalvas", className: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertTriangle },
  reprovado: { label: "Reprovado", className: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
};

const ITEM_DISPLAY = {
  ok: { label: "OK", className: "bg-secondary/15 text-secondary" },
  nao_conforme: { label: "Não Conforme", className: "bg-destructive/10 text-destructive" },
  nao_aplicavel: { label: "N/A", className: "bg-muted text-muted-foreground" },
};

const CHECKLIST_ITEMS = [
  { field: "estado_geral_involucro", label: "Integridade do invólucro" },
  { field: "fechamento_portas_selos", label: "Fechamento de portas e selos" },
  { field: "limpeza_interna_externa", label: "Limpeza interna e externa" },
  { field: "ausencia_umidade_poeira", label: "Ausência de umidade/poeira" },
  { field: "identificacao_circuitos", label: "Identificação de circuitos" },
  { field: "conexoes_superaquecimento", label: "Conexões – sinais de superaquecimento" },
  { field: "dispositivos_dr_dps", label: "Dispositivos DR e DPS" },
  { field: "fiacao_cabos", label: "Fiação e cabos" },
  { field: "sinalizacao_seguranca", label: "Sinalização de segurança" },
];

export default function InspectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canDelete } = useUserRole();

  const { data: inspections, isLoading } = useQuery({
    queryKey: ["inspection", id],
    queryFn: () => Inspection.filter({ id }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => Inspection.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspections"] });
      toast.success("Inspeção removida");
      navigate("/inspecoes");
    },
  });

  const insp = inspections?.[0];

  if (isLoading) return (
    <div className="p-8 max-w-3xl mx-auto space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (!insp) return (
    <div className="p-8 text-center">
      <p className="text-muted-foreground">Inspeção não encontrada</p>
      <Link to="/inspecoes"><Button variant="outline" className="mt-4">Voltar</Button></Link>
    </div>
  );

  const r = RESULT_CONFIG[insp.overall_result] || RESULT_CONFIG.aprovado;
  const ResultIcon = r.icon;
  const nonConformes = CHECKLIST_ITEMS.filter(i => insp[i.field] === "nao_conforme");

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-xl font-bold">Relatório de Inspeção</h1>
            <p className="text-sm text-muted-foreground">{insp.panel_name}</p>
          </div>
        </div>
        {canDelete && (
          <Button variant="outline" size="sm" className="gap-2 text-destructive" onClick={() => deleteMutation.mutate()}>
            <Trash2 className="h-3 w-3" />Excluir
          </Button>
        )}
      </div>

      {/* Header Card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className={`text-sm px-3 py-1 flex items-center gap-2 ${r.className}`}>
                  <ResultIcon className="h-4 w-4" />{r.label}
                </Badge>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5" /><span>{format(parseISO(insp.inspection_date), "dd/MM/yyyy")}</span></div>
                <div className="flex items-center gap-2"><User className="h-3.5 w-3.5" /><span>{insp.inspector_name}</span></div>
                {insp.frequency && <div className="capitalize text-xs">Frequência: {insp.frequency}</div>}
                {insp.next_inspection && <div>Próxima: {format(parseISO(insp.next_inspection), "dd/MM/yyyy")}</div>}
              </div>
            </div>
            {nonConformes.length > 0 && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                <p className="text-xs font-semibold text-destructive mb-1">{nonConformes.length} não conformidade{nonConformes.length > 1 ? "s" : ""}</p>
                {nonConformes.map(i => <p key={i.field} className="text-xs text-destructive/80">• {i.label}</p>)}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Checklist Results */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Resultado do Checklist</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {CHECKLIST_ITEMS.map(item => {
              const val = insp[item.field] || "nao_aplicavel";
              const d = ITEM_DISPLAY[val];
              return (
                <div key={item.field} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-sm">{item.label}</span>
                  <Badge variant="outline" className={`text-xs ${d.className}`}>{d.label}</Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Termografia */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Termografia</CardTitle></CardHeader>
        <CardContent>
          {insp.termografia_realizada ? (
            <div className="flex items-center justify-between">
              <span className="text-sm">Resultado da termografia</span>
              <Badge variant="outline" className={insp.termografia_resultado === "normal" ? "bg-secondary/15 text-secondary" : "bg-destructive/10 text-destructive"}>
                {insp.termografia_resultado === "normal" ? "Normal" : "Pontos quentes detectados"}
              </Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Inspeção termográfica não realizada nesta visita.</p>
          )}
        </CardContent>
      </Card>

      {/* Diagrama e Observações */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Documentação e Observações</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Diagrama unifilar atualizado</span>
            <Badge variant="outline" className={
              insp.diagrama_atualizado === "sim" ? "bg-secondary/15 text-secondary" :
              insp.diagrama_atualizado === "nao" ? "bg-destructive/10 text-destructive" :
              "bg-muted text-muted-foreground"
            }>
              {insp.diagrama_atualizado === "sim" ? "Sim" : insp.diagrama_atualizado === "nao" ? "Não" : "N/A"}
            </Badge>
          </div>
          {insp.observacoes && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs font-medium text-muted-foreground mb-1">Observações</p>
              <p className="text-sm whitespace-pre-wrap">{insp.observacoes}</p>
            </div>
          )}
          {insp.photo_url && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Foto da Inspeção</p>
              <img src={insp.photo_url} alt="Foto" className="rounded-lg border border-border max-h-64 object-contain w-full" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}