import React, { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchIntelligentAnalysisRaw, computeIntelligentAnalysis } from "@/services/intelligentAnalysisService";
import {
  ANALYSIS_PERIOD_OPTIONS, STATUS_OPTIONS, LOCALIDADE_ALL,
  resolveAnalysisPeriodRange, validateCustomRange,
} from "@/domain/intelligentAnalysisFilters";
import { exportIntelligentAnalysisPdf } from "@/services/intelligentAnalysisPdfService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  BarChart, Bar, LineChart, Line, ComposedChart, ScatterChart, Scatter,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { toast } from "sonner";
import {
  Sparkles, FileDown, Info, TrendingUp, TrendingDown, Minus, AlertTriangle,
  Repeat, Target, Gauge, ClipboardCheck, LayoutGrid, ShieldAlert,
} from "lucide-react";

const GREEN = "#2E9E6B";
const AMBER = "#E5A100";
const RED = "#DC2626";
const BLUE = "#0369A1";
const GRAY = "#9CA3AF";

function pct(v, digits = 1) {
  return v == null ? "—" : `${v.toFixed(digits)}%`;
}
function fmtDate(d) {
  if (!d) return "—";
  try { return new Date(d + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return d; }
}

function InfoHint({ text }) {
  return (
    <TooltipProvider delayDuration={150}>
      <UITooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground/60 inline-block ml-1 align-text-top cursor-help" />
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-xs">{text}</TooltipContent>
      </UITooltip>
    </TooltipProvider>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone, hint }) {
  const toneCls = tone === "err" ? "text-destructive" : tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-secondary" : "text-foreground";
  return (
    <Card className="border-border/60 h-full">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {label}{hint && <InfoHint text={hint} />}
            </p>
            <p className={`text-2xl font-bold mt-1 ${toneCls}`}>{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          {Icon && <Icon className="h-5 w-5 text-muted-foreground/50 shrink-0" />}
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ id, title, subtitle, action, children }) {
  return (
    <Card id={id} className="scroll-mt-4">
      <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyState({ text = "Nenhum dado encontrado para os filtros selecionados." }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
      <ShieldAlert className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

const TREND_ICON = { melhora: TrendingUp, piora: TrendingDown, estabilidade: Minus, aumento: TrendingUp, redução: TrendingDown };
const TREND_LABEL = { melhora: "Melhora", piora: "Piora", estabilidade: "Estabilidade", aumento: "Aumento", redução: "Redução" };
const TREND_COLOR = { melhora: "text-secondary", redução: "text-secondary", piora: "text-destructive", aumento: "text-destructive", estabilidade: "text-muted-foreground" };

function TrendBadge({ trend }) {
  if (!trend) return null;
  const Icon = TREND_ICON[trend] || Minus;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${TREND_COLOR[trend] || ""}`}>
      <Icon className="h-3.5 w-3.5" />{TREND_LABEL[trend] || trend}
    </span>
  );
}

export default function IntelligentAnalysis() {
  const { data: raw, isLoading } = useQuery({ queryKey: ["intelligent-analysis-raw"], queryFn: fetchIntelligentAnalysisRaw });

  const [localidadeId, setLocalidadeId] = useState(LOCALIDADE_ALL);
  const [panelId, setPanelId] = useState("all");
  const [status, setStatus] = useState("all");
  const [period, setPeriod] = useState("todo");
  const [customDraft, setCustomDraft] = useState({ from: "", to: "" });
  const [customApplied, setCustomApplied] = useState(null);
  const [customError, setCustomError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef(null);

  const filters = useMemo(() => ({
    localidadeId, panelId, status, period,
    dateRange: resolveAnalysisPeriodRange(period, customApplied),
  }), [localidadeId, panelId, status, period, customApplied]);

  const analysis = useMemo(() => (raw ? computeIntelligentAnalysis(raw, filters) : null), [raw, filters]);

  function handlePeriodChange(value) {
    setPeriod(value);
    setCustomError(null);
    if (value !== "personalizado") setCustomApplied(null);
  }
  function applyCustomRange() {
    const err = validateCustomRange(customDraft);
    if (err) { setCustomError(err); return; }
    setCustomError(null);
    setCustomApplied(customDraft);
  }

  const localidades = raw?.hierarchy?.localidades || [];
  const panelOptions = useMemo(
    () => (raw?.panels || []).map((p) => ({ value: p.id, label: `${p.tag} — ${p.name}` })),
    [raw]
  );

  async function handleExportPdf() {
    if (!analysis?.hasData) return;
    setExporting(true);
    try {
      await exportIntelligentAnalysisPdf({ analysis, filters, localidades, panelOptions });
      toast.success("Relatório PDF gerado!");
    } catch (err) {
      toast.error("Não foi possível gerar o PDF: " + (err?.message || "erro desconhecido"));
    } finally {
      setExporting(false);
    }
  }

  const periodLabel = ANALYSIS_PERIOD_OPTIONS.find((o) => o.value === period)?.label || "Todo o período";
  const localidadeLabel = localidadeId === LOCALIDADE_ALL ? "Todas as localidades" : (localidades.find((l) => l.id === localidadeId)?.nome || "—");

  if (isLoading || !raw) {
    return (
      <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
            <Sparkles className="h-5 w-5" />Análise Inteligente dos Dados
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Análise gerencial das inspeções de checklist — descritiva, diagnóstica, tendências e projeções.
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={handleExportPdf} disabled={!analysis?.hasData || exporting}>
          <FileDown className="h-4 w-4" />{exporting ? "Gerando PDF..." : "Exportar relatório PDF"}
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-start gap-3">
          <Select value={localidadeId} onValueChange={setLocalidadeId}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Localidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={LOCALIDADE_ALL}>Todas as localidades</SelectItem>
              {localidades.map((l) => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={period} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Período" /></SelectTrigger>
            <SelectContent>
              {ANALYSIS_PERIOD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="w-full sm:w-64">
            <Combobox
              options={[{ value: "all", label: "Todos os quadros" }, ...panelOptions]}
              value={panelId}
              onChange={setPanelId}
              placeholder="Todos os quadros"
              searchPlaceholder="Buscar por tag..."
            />
          </div>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {period === "personalizado" && (
            <div className="flex flex-wrap items-start gap-2">
              <div className="flex items-center gap-2">
                <Input type="date" aria-label="Data inicial" className="w-[150px]" value={customDraft.from}
                  onChange={(e) => setCustomDraft((s) => ({ ...s, from: e.target.value }))} />
                <span className="text-sm text-muted-foreground">até</span>
                <Input type="date" aria-label="Data final" className="w-[150px]" value={customDraft.to}
                  onChange={(e) => setCustomDraft((s) => ({ ...s, to: e.target.value }))} />
              </div>
              <Button size="sm" variant="outline" onClick={applyCustomRange}>Aplicar</Button>
            </div>
          )}
          {customError && <p className="text-xs text-destructive basis-full">{customError}</p>}
        </CardContent>
      </Card>

      {!analysis?.hasData ? (
        <Card><CardContent className="p-0"><EmptyState /></CardContent></Card>
      ) : (
        <div ref={reportRef} className="space-y-6">
          <ExecutiveVision kpis={analysis.kpis} />
          <DescriptiveSection descriptive={analysis.descriptive} />
          <DimensionChart dimensions={analysis.dimensions} />
          <ParetoSection pareto={analysis.pareto} />
          <TemporalSection temporal={analysis.temporal} />
          <LocalidadeSection byLocalidade={analysis.byLocalidade} />
          <RecurrenceSection recurrence={analysis.recurrence} />
          <HealthScatterSection healthVsConformity={analysis.healthVsConformity} />
          <DiagnosticsSection diagnostics={analysis.diagnostics} />
          <PredictiveSection predictive={analysis.predictive} temporal={analysis.temporal} />
          <InsightsSection insights={analysis.insights} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Seções
// ============================================================================

function ExecutiveVision({ kpis }) {
  return (
    <Section id="visao-executiva" title="Visão Executiva">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={LayoutGrid} label="Quadros inspecionados" value={kpis.quadrosInspecionados} />
        <Kpi icon={ClipboardCheck} label="Inspeções realizadas" value={kpis.inspecoesRealizadas} />
        <Kpi
          icon={Target} label="Taxa de conformidade" value={pct(kpis.taxaConformidade)}
          sub={`${kpis.conforme} de ${kpis.aplicaveis} aplicáveis`}
          tone={kpis.taxaConformidade == null ? undefined : kpis.taxaConformidade >= 90 ? "ok" : kpis.taxaConformidade >= 70 ? "warn" : "err"}
          hint="Conforme / (Conforme + Não Conforme). Respostas N/A e Não Verificado não entram no cálculo."
        />
        <Kpi icon={AlertTriangle} label="Não conformidades" value={kpis.naoConformidades} sub="respostas Não Conforme" tone={kpis.naoConformidades ? "warn" : "ok"} />
        <Kpi
          icon={Gauge} label="Índice de Saúde médio" value={kpis.indiceSaudeMedio != null ? Math.round(kpis.indiceSaudeMedio) : "—"}
          sub={kpis.indiceSaudeMedio == null ? "sem inspeções com IS calculado" : "das inspeções com IS calculado"}
        />
      </div>
    </Section>
  );
}

function DescriptiveSection({ descriptive }) {
  const r = descriptive.resumo;
  return (
    <Section id="analise-descritiva" title="Análise Descritiva" subtitle="Números diretos do recorte filtrado, sem interpretação.">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5 text-sm">
          <p>• {r.inspecoes} inspeção(ões) realizada(s) em {r.quadros} quadro(s).</p>
          <p>• {r.conforme} resposta(s) Conforme, {r.naoConforme} Não Conforme, {r.naoAplicavel} N/A{r.naoVerificado ? `, ${r.naoVerificado} Não Verificado` : ""}.</p>
          <p>• Taxa de conformidade: {pct(r.taxaConformidade)}.</p>
          <p>• Distribuição por status: {descriptive.distribuicaoPorStatus.map((s) => `${s.status.replace(/_/g, " ")} (${s.n})`).join(" · ") || "—"}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">Dimensões com mais ocorrências de NC</p>
            <ul className="text-sm space-y-1">
              {descriptive.dimensoesComMaisOcorrencias.slice(0, 5).map((d) => (
                <li key={d.dimensao} className="flex justify-between gap-2"><span className="truncate">{d.dimensao}</span><span className="font-medium">{d.n}</span></li>
              ))}
              {!descriptive.dimensoesComMaisOcorrencias.length && <li className="text-muted-foreground">Nenhuma NC no período.</li>}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">Perguntas com mais NC</p>
            <ul className="text-sm space-y-1">
              {descriptive.perguntasComMaisNc.slice(0, 5).map((p) => (
                <li key={p.codigo || p.titulo} className="flex justify-between gap-2">
                  <span className="truncate">{p.codigo ? `${p.codigo} — ` : ""}{p.titulo}</span><span className="font-medium shrink-0">{p.n}</span>
                </li>
              ))}
              {!descriptive.perguntasComMaisNc.length && <li className="text-muted-foreground">Nenhuma NC no período.</li>}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}

function DimensionChart({ dimensions }) {
  const data = dimensions.map((d) => ({ ...d, percentualLabel: d.percentual == null ? "sem dados" : `${d.percentual.toFixed(1)}%` }));
  return (
    <Section id="conformidade-dimensao" title="Conformidade por Dimensão" subtitle="Conforme / (Conforme + Não Conforme) — N/A não penaliza.">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 40 }}>
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="dimensao" width={160} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v, n, p) => [p.payload.percentual == null ? "sem respostas aplicáveis" : `${Number(v).toFixed(1)}%`, "Conformidade"]} />
          <Bar dataKey="percentual" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.percentual == null ? GRAY : d.percentual >= 90 ? GREEN : d.percentual >= 70 ? AMBER : RED} />
            ))}
            <LabelList dataKey="percentualLabel" position="right" style={{ fontSize: 11, fontWeight: 600, fill: "#374151" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-2 mt-2">
        {data.map((d) => (
          <Badge key={d.modulo} variant="outline" className="text-[11px]">
            {d.dimensao}: {d.aplicaveis} resposta(s) aplicável(is)
          </Badge>
        ))}
      </div>
    </Section>
  );
}

function ParetoSection({ pareto }) {
  return (
    <Section
      id="pareto-nc" title="Principais Não Conformidades"
      subtitle={`Concentração de ocorrências por requisito (Pareto) — não é um ranking de "piores" itens. Mostrando ${pareto.itens.length} de ${pareto.total} requisito(s) com ocorrência.`}
    >
      {pareto.itens.length === 0 ? <EmptyState text="Nenhuma não conformidade no período selecionado." /> : (
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={pareto.itens} margin={{ left: 0, right: 20, bottom: 60 }}>
            <XAxis dataKey="codigo" angle={-40} textAnchor="end" interval={0} height={70} tick={{ fontSize: 10 }} />
            <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v, name) => name === "% acumulado" ? [`${Number(v).toFixed(1)}%`, name] : [v, "Ocorrências"]}
              labelFormatter={(_, p) => p?.[0]?.payload?.titulo || ""}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="n" name="Ocorrências" fill={BLUE} radius={[4, 4, 0, 0]}>
              <LabelList dataKey="n" position="top" style={{ fontSize: 10, fontWeight: 600 }} />
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey="percentualAcumulado" name="% acumulado" stroke={RED} strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Section>
  );
}

function TemporalSection({ temporal }) {
  const granLabel = { dia: "diário", semana: "semanal", mes: "mensal" }[temporal.granularidade] || "";
  return (
    <Section id="evolucao-temporal" title="Evolução da Conformidade" subtitle={temporal.pontos.length ? `Agrupamento ${granLabel}, conforme o período e a quantidade de dados.` : undefined}>
      {temporal.pontos.length < 2 ? (
        <EmptyState text="Histórico insuficiente para traçar evolução (é necessário mais de um período com inspeções)." />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={temporal.pontos} margin={{ left: 0, right: 10, top: 10 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v, name) => name === "Taxa de conformidade" ? [`${Number(v).toFixed(1)}%`, name] : [v, name]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="inspecoes" name="Inspeções" fill={GRAY} radius={[3, 3, 0, 0]} />
            <Bar yAxisId="left" dataKey="naoConformidades" name="Não conformidades" fill={RED} radius={[3, 3, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="taxaConformidade" name="Taxa de conformidade" stroke={GREEN} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Section>
  );
}

function LocalidadeSection({ byLocalidade }) {
  return (
    <Section id="localidades" title="Não Conformidades por Localidade" subtitle="Considere a taxa, não só o volume: localidades com mais inspeções tendem a acumular mais ocorrências.">
      {byLocalidade.length === 0 ? <EmptyState /> : (
        <ResponsiveContainer width="100%" height={Math.max(220, byLocalidade.length * 42)}>
          <ComposedChart data={byLocalidade} layout="vertical" margin={{ left: 10, right: 40 }}>
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="localidade" width={140} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v, name) => name === "Taxa de NC" ? [`${Number(v).toFixed(1)}%`, name] : [v, name]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="inspecoes" name="Inspeções" fill={GRAY} radius={[0, 3, 3, 0]} />
            <Bar dataKey="naoConformidades" name="Não conformidades" fill={RED} radius={[0, 3, 3, 0]}>
              <LabelList
                dataKey="taxaNaoConformidade"
                position="right"
                formatter={(v) => (v == null ? "" : `${v.toFixed(1)}% taxa`)}
                style={{ fontSize: 10, fill: "#374151" }}
              />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Section>
  );
}

function RecurrenceSection({ recurrence }) {
  return (
    <Section
      id="reincidencias" title="Reincidências"
      subtitle="Mesmo requisito Não Conforme em 2 ou mais inspeções diferentes do mesmo quadro."
    >
      <div className="flex flex-wrap gap-2 mb-3">
        <Badge variant="outline">{recurrence.resumo.totalCasos} caso(s) de reincidência</Badge>
        <Badge variant="outline">{recurrence.resumo.quadrosAfetados} quadro(s) afetado(s)</Badge>
      </div>
      {recurrence.casos.length === 0 ? <EmptyState text="Nenhuma reincidência identificada no período selecionado." /> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quadro</TableHead>
                <TableHead>Requisito</TableHead>
                <TableHead className="text-right">Ocorrências</TableHead>
                <TableHead>Datas</TableHead>
                <TableHead>Última ocorrência</TableHead>
                <TableHead>Taxa de recorrência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recurrence.casos.map((c) => (
                <TableRow key={`${c.panelId}-${c.codigo}`}>
                  <TableCell className="font-mono text-xs">{c.panelTag}</TableCell>
                  <TableCell className="text-sm">{c.codigo ? `${c.codigo} — ` : ""}{c.titulo}</TableCell>
                  <TableCell className="text-right font-medium">{c.ocorrencias}</TableCell>
                  <TableCell className="text-xs">{c.datas.map(fmtDate).join(", ")}</TableCell>
                  <TableCell className="text-xs">{fmtDate(c.ultimaOcorrencia)}</TableCell>
                  <TableCell className="text-xs">
                    {c.taxa?.insuficiente ? <span className="text-muted-foreground">{c.taxa.motivo}</span> : `${c.taxa.taxa.toFixed(0)}% (${c.taxa.ocorrencias}/${c.taxa.aplicaveis})`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

function HealthScatterSection({ healthVsConformity }) {
  return (
    <Section id="is-vs-conformidade" title="Índice de Saúde × Conformidade" subtitle="Cada ponto representa uma inspeção.">
      {healthVsConformity.pontos.length === 0 ? (
        <EmptyState text="Nenhuma inspeção com Índice de Saúde calculado no período selecionado." />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="conformidade" name="Conformidade" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
              <YAxis type="number" dataKey="indiceSaude" name="Índice de Saúde" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <ZAxis range={[70, 70]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload;
                  return (
                    <div className="bg-card border border-border rounded-md p-2 text-xs shadow-md space-y-0.5">
                      <p className="font-semibold">{p.panelTag} — {p.panelName}</p>
                      <p>{p.localidade} · {fmtDate(p.data)}</p>
                      <p>Conformidade: {p.conformidade.toFixed(1)}%</p>
                      <p>Índice de Saúde: {p.indiceSaude.toFixed(0)}</p>
                    </div>
                  );
                }}
              />
              <Scatter data={healthVsConformity.pontos} fill={BLUE} />
            </ScatterChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">
            {healthVsConformity.dadosSuficientes
              ? `Correlação observada: r = ${healthVsConformity.correlacao.toFixed(2)} (coeficiente de Pearson). Correlação não implica causalidade.`
              : "Dados insuficientes para calcular correlação estatística (mínimo de 5 inspeções com Índice de Saúde)."}
          </p>
        </>
      )}
    </Section>
  );
}

function DiagnosticsSection({ diagnostics }) {
  return (
    <Section id="diagnostico" title="Diagnóstico dos Dados" subtitle="Padrões identificados a partir dos cálculos acima — sem atribuição de causas.">
      {diagnostics.length === 0 ? <EmptyState text="Sem padrões relevantes a destacar no período selecionado." /> : (
        <ul className="space-y-2">
          {diagnostics.map((d, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className="text-primary mt-0.5">•</span><span>{d.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function PredictiveSection({ predictive, temporal }) {
  const cp = predictive.conformityProjection;
  const nc = predictive.ncTrend;

  const chartData = useMemo(() => {
    if (cp.insuficiente) return [];
    const hist = cp.historico.map((h) => ({ label: temporal.pontos[h.x]?.label || h.label, historico: h.y }));
    const last = hist[hist.length - 1];
    const proj = cp.projecao.map((p) => ({ label: p.label, projecao: p.valor, min: p.intervaloMin, max: p.intervaloMax }));
    if (last) proj.unshift({ label: last.label, projecao: last.historico });
    return [...hist, ...proj];
  }, [cp, temporal]);

  return (
    <Section
      id="analise-preditiva" title="Análise Preditiva"
      subtitle="Baseada exclusivamente no histórico disponível. Método: regressão linear simples (determinística, sem IA generativa nos cálculos)."
    >
      {!predictive.enoughForTrend ? (
        <EmptyState text="Dados históricos insuficientes para gerar projeção confiável (mínimo de 6 inspeções no recorte filtrado)." />
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold mb-2">Projeção da Taxa de Conformidade</h3>
            {cp.insuficiente ? (
              <p className="text-sm text-muted-foreground">{cp.motivo}</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ left: 0, right: 10, top: 10 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => [v == null ? "—" : `${Number(v).toFixed(1)}%`, ""]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="historico" name="Histórico observado" stroke={BLUE} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="projecao" name="Cenário projetado" stroke={AMBER} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground mt-2">
                  Tendência estimada: <TrendBadge trend={cp.tendencia} />. Projeção calculada por regressão linear sobre o histórico do recorte filtrado —
                  representa um cenário estimado, não uma garantia. Intervalo aproximado dos pontos projetados:{" "}
                  {cp.projecao.map((p) => `${p.valor.toFixed(1)}% (${p.intervaloMin.toFixed(1)}%–${p.intervaloMax.toFixed(1)}%)`).join("; ")}.
                </p>
              </>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">Tendência de Não Conformidades</h3>
            {nc.insuficiente ? (
              <p className="text-sm text-muted-foreground">{nc.motivo}</p>
            ) : (
              <p className="text-sm flex items-center gap-2">
                Com base no histórico disponível, observa-se uma tendência de <TrendBadge trend={nc.tendencia} /> na quantidade de não conformidades. Essa tendência não representa garantia de continuidade.
              </p>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">Predição por Dimensão</h3>
            {Object.keys(predictive.dimensionTrends).length === 0 ? (
              <p className="text-sm text-muted-foreground">Dados insuficientes para estimativa preditiva por dimensão.</p>
            ) : (
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                {Object.entries(predictive.dimensionTrends).map(([dim, t]) => (
                  <li key={dim} className="flex items-center justify-between gap-2">
                    <span className="truncate">{dim}</span>
                    {t.insuficiente ? <span className="text-xs text-muted-foreground">dados insuficientes</span> : <TrendBadge trend={t.tendencia} />}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

const INSIGHT_GROUPS = [
  { key: "destaques", title: "Destaques", icon: Sparkles, color: "border-primary/30 bg-primary/5" },
  { key: "pontosDeAtencao", title: "Pontos de Atenção", icon: AlertTriangle, color: "border-amber-300 bg-amber-50" },
  { key: "evolucao", title: "Evolução", icon: TrendingUp, color: "border-secondary/30 bg-secondary/5" },
  { key: "recorrencias", title: "Recorrências", icon: Repeat, color: "border-destructive/30 bg-destructive/5" },
  { key: "concentracao", title: "Concentração", icon: Target, color: "border-border bg-muted/30" },
];

function InsightsSection({ insights }) {
  return (
    <Section id="insights-gerenciais" title="Insights Gerenciais" subtitle="Leitura objetiva dos indicadores acima, pronta para reunião de gestão.">
      <div className="grid md:grid-cols-2 gap-4">
        {INSIGHT_GROUPS.map((g) => {
          const items = insights[g.key] || [];
          const Icon = g.icon;
          return (
            <div key={g.key} className={`rounded-lg border p-3 ${g.color}`}>
              <p className="text-sm font-semibold flex items-center gap-1.5 mb-2"><Icon className="h-4 w-4" />{g.title}</p>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nada a destacar nesta categoria no período selecionado.</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((it, i) => (
                    <li key={i} className="text-xs">
                      <p className="font-medium">{it.titulo}</p>
                      <p className="text-muted-foreground">{it.descricao}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
