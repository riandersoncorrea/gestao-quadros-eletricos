import React, { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Inspection } from "@/api/entities";
import { getInspectionFull } from "@/api/inspections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, User, Calendar, Trash2, Gauge, Thermometer, FileWarning, Activity, Siren, Printer } from "lucide-react";

const RESULT = {
  aprovado: { label: "Aprovado", cls: "bg-secondary/15 text-secondary border-secondary/20", icon: CheckCircle2 },
  aprovado_ressalvas: { label: "Aprovado c/ ressalvas", cls: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertTriangle },
  reprovado: { label: "Reprovado", cls: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
};
const RESP = {
  conforme: { label: "Conforme", cls: "bg-secondary/15 text-secondary" },
  nao_conforme: { label: "Não Conforme", cls: "bg-destructive/10 text-destructive" },
  nao_aplicavel: { label: "N/A", cls: "bg-muted text-muted-foreground" },
  nao_verificado: { label: "Não Verificado", cls: "bg-amber-100 text-amber-800" },
};
const SEV = { baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica" };
const FLAG_SEV = {
  info: "bg-muted text-muted-foreground border-border",
  baixa: "bg-muted text-muted-foreground border-border",
  media: "bg-amber-100 text-amber-800 border-amber-200",
  alta: "bg-orange-100 text-orange-800 border-orange-200",
  critica: "bg-destructive/10 text-destructive border-destructive/20",
};

function healthCls(hi) {
  if (hi == null) return "bg-muted text-muted-foreground border-border";
  if (hi >= 80) return "bg-secondary/15 text-secondary border-secondary/20";
  if (hi >= 50) return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-destructive/10 text-destructive border-destructive/20";
}

function fmt(d) { try { return d ? format(parseISO(d), "dd/MM/yyyy") : "—"; } catch { return d; } }

export default function InspectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canDelete } = useUserRole();
  const [delOpen, setDelOpen] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["inspection", id], queryFn: () => getInspectionFull(id) });

  const del = useMutation({
    mutationFn: () => Inspection.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspections"] });
      toast.success("Inspeção removida");
      navigate("/inspecoes");
    },
  });

  if (isLoading) return <div className="p-8 max-w-4xl mx-auto"><Skeleton className="h-8 w-64 mb-4" /><Skeleton className="h-64 w-full" /></div>;
  if (!data?.inspection) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Inspeção não encontrada</p>
        <Link to="/inspecoes"><Button variant="outline" className="mt-4">Voltar</Button></Link>
      </div>
    );
  }

  const { inspection: insp, responses, measurements, thermography, nonconformities, flags = [] } = data;
  const res = RESULT[insp.overall_result] || RESULT.aprovado;
  const ResIcon = res.icon;

  const exportPdf = () => {
    const prevTitle = document.title;
    const tag = (insp.panel_name || "inspecao").split(" — ")[0];
    document.title = `Inspecao_${tag}_${insp.inspection_date || ""}`.replace(/\s+/g, "_");
    const restore = () => { document.title = prevTitle; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  const byModule = new Map();
  for (const r of responses) {
    const k = r.modulo ?? 0;
    if (!byModule.has(k)) byModule.set(k, []);
    byModule.get(k).push(r);
  }
  const modules = [...byModule.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="print:hidden" onClick={() => navigate("/inspecoes")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{insp.panel_name || "Inspeção"}</h1>
              <Badge variant="outline" className={`text-xs ${res.cls}`}><ResIcon className="h-3 w-3 mr-1" />{res.label}</Badge>
              {insp.health_index_resultado != null && (
                <Badge variant="outline" className={`text-xs ${healthCls(insp.health_index_resultado)}`}>
                  <Activity className="h-3 w-3 mr-1" />Índice de Saúde {Math.round(insp.health_index_resultado)}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
              <span><Calendar className="h-3 w-3 inline mr-1" />{fmt(insp.inspection_date)}</span>
              <span><User className="h-3 w-3 inline mr-1" />{insp.inspector_name}</span>
              {insp.frequency && <span>{insp.frequency}</span>}
              {insp.panel_ref_id && <Link to={`/quadro/${insp.panel_ref_id}`} className="text-primary hover:underline print:hidden">ver quadro</Link>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" className="gap-2" onClick={exportPdf}>
            <Printer className="h-3 w-3" />Exportar PDF
          </Button>
          {canDelete && (
            <Button variant="outline" size="sm" className="gap-2 text-destructive hover:bg-destructive/10" onClick={() => setDelOpen(true)}>
              <Trash2 className="h-3 w-3" />Excluir
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi icon={CheckCircle2} label="Itens" value={responses.length} />
        <Kpi icon={FileWarning} label="Não conformidades" value={nonconformities.length} tone={nonconformities.length ? "err" : undefined} />
        <Kpi icon={Gauge} label="Medições" value={measurements.length} />
        <Kpi icon={Thermometer} label="Termografia" value={thermography.length} />
      </div>

      {/* Flags de análise */}
      {flags.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Siren className="h-4 w-4 text-destructive" />Análise automática</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {flags.map((fl) => (
              <div key={fl.id} className="flex items-start gap-2 text-sm">
                <Badge variant="outline" className={`text-[10px] shrink-0 ${FLAG_SEV[fl.severidade] || ""}`}>{SEV[fl.severidade] || fl.severidade}</Badge>
                <span>{fl.mensagem}{fl.categoria && <span className="text-muted-foreground"> · {fl.categoria}</span>}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Não conformidades */}
      {nonconformities.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FileWarning className="h-4 w-4 text-destructive" />Não conformidades geradas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {nonconformities.map((nc) => (
              <Link key={nc.id} to={`/nao-conformidades/${nc.id}`} className="block rounded-lg border border-border p-3 hover:border-primary/30 transition-colors">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">{SEV[nc.severidade] || nc.severidade}</Badge>
                  {nc.categoria && <span className="text-xs text-muted-foreground">{nc.categoria}</span>}
                  <Badge variant="outline" className="text-[10px] bg-muted">{nc.status}</Badge>
                </div>
                <p className="text-sm">{nc.descricao}</p>
                {nc.recomendacao && <p className="text-xs text-muted-foreground mt-1">Recomendação: {nc.recomendacao}</p>}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Checklist por módulo */}
      {modules.map(([mod, rows]) => (
        <Card key={mod}>
          <CardHeader className="pb-3"><CardTitle className="text-base">{mod}. {moduleName(mod)}</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border">
            {rows.map((r) => {
              const rr = RESP[r.resposta] || {};
              return (
                <div key={r.id} className="py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm flex-1">{r.titulo}</p>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${rr.cls || ""}`}>{rr.label || r.resposta}</Badge>
                  </div>
                  {r.justificativa && <p className="text-xs text-muted-foreground mt-1">Justificativa: {r.justificativa}</p>}
                  {r.motivo && <p className="text-xs text-muted-foreground mt-1">Motivo: {r.motivo}</p>}
                  {r.observacao && <p className="text-xs text-muted-foreground mt-1">Obs.: {r.observacao}</p>}
                  {r.evidencia_url && <a href={r.evidencia_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">ver evidência</a>}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {/* Medições */}
      {measurements.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" />Medições</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50"><tr className="text-left [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                <th>Categoria</th><th>Parâmetro</th><th>Fase</th><th>Valor</th><th>Limites</th><th>Resultado</th>
              </tr></thead>
              <tbody className="[&>tr]:border-t [&>tr>td]:px-3 [&>tr>td]:py-2">
                {measurements.map((m) => (
                  <tr key={m.id}>
                    <td>{m.categoria}</td>
                    <td>{m.parametro || "—"}</td>
                    <td>{m.fase || "—"}</td>
                    <td className="font-mono">{m.valor != null ? `${m.valor} ${m.unidade}` : "—"}</td>
                    <td className="text-muted-foreground">{m.limite_min ?? "—"} … {m.limite_max ?? "—"}</td>
                    <td>{m.resultado || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Termografia */}
      {thermography.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Thermometer className="h-4 w-4 text-primary" />Termografia</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50"><tr className="text-left [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                <th>Equipamento</th><th>Ponto</th><th>Temp.</th><th>Ambiente</th><th>ΔT</th><th>Crit.</th><th>Diagnóstico</th>
              </tr></thead>
              <tbody className="[&>tr]:border-t [&>tr>td]:px-3 [&>tr>td]:py-2">
                {thermography.map((t) => (
                  <tr key={t.id}>
                    <td>{t.equipamento || "—"}</td>
                    <td>{t.ponto || "—"}</td>
                    <td className="font-mono">{t.temperatura != null ? `${t.temperatura} °C` : "—"}</td>
                    <td className="font-mono">{t.temperatura_ambiente != null ? `${t.temperatura_ambiente} °C` : "—"}</td>
                    <td className="font-mono">{t.delta_t != null ? `${t.delta_t} °C` : "—"}</td>
                    <td>{t.criticidade || "—"}</td>
                    <td>{t.diagnostico || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {insp.observacoes && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Observações</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{insp.observacoes}</p></CardContent>
        </Card>
      )}

      {insp.assinatura_url && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Assinatura</CardTitle></CardHeader>
          <CardContent>
            <img src={insp.assinatura_url} alt="Assinatura" className="h-32 rounded-md border border-border bg-white" />
          </CardContent>
        </Card>
      )}

      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir inspeção</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove a inspeção e suas respostas, medições e pontos de termografia. As não-conformidades geradas <strong>não</strong> são apagadas.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>
              {del.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const MODULE_NAMES = {
  1: "Identificação", 2: "Segurança", 3: "Integridade física", 4: "Proteções",
  5: "Barramentos e conexões", 6: "Cabos e isolação", 7: "Aterramento", 10: "Documentação",
};
function moduleName(m) { return MODULE_NAMES[m] || "Outros"; }

function Kpi({ icon: Icon, label, value, tone }) {
  const cls = tone === "err" ? "text-destructive" : "text-foreground";
  return (
    <Card><CardContent className="p-3">
      <p className="text-xs text-muted-foreground flex items-center gap-1">{Icon && <Icon className="h-3 w-3" />}{label}</p>
      <p className={`text-xl font-bold ${cls}`}>{value}</p>
    </CardContent></Card>
  );
}
