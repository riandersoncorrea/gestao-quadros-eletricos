import React, { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchIntelligentAnalysisRaw, computeIntelligentAnalysis, getPanelSnapshotFromAnalysis } from "@/services/intelligentAnalysisService";
import {
  ANALYSIS_PERIOD_OPTIONS, STATUS_OPTIONS, LOCALIDADE_ALL,
  resolveAnalysisPeriodRange, validateCustomRange,
} from "@/domain/intelligentAnalysisFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BarChart, Bar, LineChart, Line, ComposedChart, ScatterChart, Scatter,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { toast } from "sonner";
import {
  Sparkles, FileDown, Info, TrendingUp, TrendingDown, Minus, AlertTriangle,
  Repeat, Target, Gauge, ClipboardCheck, ShieldAlert, MapPin, Calendar,
} from "lucide-react";

// Paleta de gráficos — reaproveita a identidade visual do sistema (mesmo
// verde já usado no Dashboard), sem introduzir cores novas e desconectadas.
// Variações de verde cobrem múltiplas séries "neutras" (sem significado de
// bom/ruim); âmbar e vermelho ficam reservados para os usos semânticos já
// estabelecidos (atenção/projeção e não conformidade/crítico).
const GREEN = "#2E9E6B";
const GREEN_DARK = "#1E6746";
const AMBER = "#E5A100";
const RED = "#DC2626";
const GRAY = "#9CA3AF";
const AXIS_TICK = { fontSize: 11, fill: "#8A94A0" };
const GRID_STROKE = "#EEF1F3";
// Padrão único de legenda para todos os gráficos (Etapa 7 do pedido de
// refinamento visual): sempre no canto superior esquerdo, marcadores
// discretos, mesma tipografia — com respiro em relação ao título e ao
// gráfico (Etapa 6/7 da segunda rodada de refinamento).
const LEGEND_PROPS = /** @type {const} */ ({ verticalAlign: "top", align: "left", iconType: "circle", iconSize: 7, wrapperStyle: { fontSize: 11.5, paddingBottom: 14, paddingTop: 2 } });
// Marcadores suaves e consistentes para linhas/pontos em todos os gráficos
// (Etapa 4 da segunda rodada): pequenos, preenchidos, sem anel branco
// pesado, com um destaque discreto só no hover.
const dotStyle = (color) => ({ r: 2.5, fill: color, strokeWidth: 0 });
const activeDotStyle = (color) => ({ r: 4.5, fill: color, strokeWidth: 1.5, stroke: "#fff" });

function pct(v, digits = 1) {
  return v == null ? "-" : `${v.toFixed(digits)}%`;
}
function fmtDate(d) {
  if (!d) return "-";
  try { return new Date(d + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return d; }
}
// Preposição + artigo corretos para as localidades reais do sistema ("no
// Porto", "na Oficina") em vez do "em X" genérico — mesma regra usada no
// domínio (src/domain/intelligentAnalysis.js), duplicada aqui só para os
// pontos de texto que vivem na própria UI (ex.: filtro de localidade
// selecionada no gráfico).
const LOCALIDADE_PREPOSICAO = { Porto: "no Porto", Oficina: "na Oficina" };
function emLocalidade(nome) {
  return LOCALIDADE_PREPOSICAO[nome] || `em ${nome}`;
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
  const iconToneCls = tone === "err" ? "bg-destructive/10 text-destructive" : tone === "warn" ? "bg-amber-100 text-amber-700" : tone === "ok" ? "bg-secondary/15 text-secondary" : "bg-primary/10 text-primary";
  return (
    <Card className="border-border/60 h-full transition-shadow hover:shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide leading-snug">
              {label}{hint && <InfoHint text={hint} />}
            </p>
            <p className={`text-2xl font-bold mt-1.5 tabular-nums ${toneCls}`}>{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{sub}</p>}
          </div>
          {Icon && (
            <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${iconToneCls}`}>
              <Icon className="h-4 w-4" />
            </div>
          )}
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

/** Bloco "Análise" — interpretação sob um gráfico, sempre no mesmo formato visual em toda a página, próxima do gráfico e com espaçamento inferior equilibrado (Etapa 1/7 da segunda rodada de refinamento). */
function ChartReading({ text }) {
  if (!text) return null;
  return (
    <div className="mt-5 pt-4 border-t border-border/60">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/80 mb-1.5">Análise</p>
      <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}

/** Legenda customizada (canto superior esquerdo) para gráficos cujas cores têm significado sem serem "séries" nomeadas do Recharts (ex.: faixas de cor por limiar). */
function ChartLegendDots({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: it.color }} />{it.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Tooltip customizado, único para todos os gráficos da página (Etapa 14 da
 * segunda rodada de refinamento): fundo sólido, cantos arredondados, sombra
 * leve, nome completo da categoria (nunca abreviado como no eixo) e valores
 * já formatados por quem chama. `rows` é a lista de linhas já resolvidas
 * pelo gráfico (evita repetir a mesma lógica de formatação em vários
 * lugares); `title` é o cabeçalho (geralmente o rótulo do eixo X ou a
 * categoria do ponto).
 */
function ChartTooltip({ active, title, rows }) {
  if (!active || !rows?.length) return null;
  return (
    <div className="bg-card border border-border/70 rounded-lg px-3 py-2.5 text-xs shadow-lg min-w-[160px] max-w-[260px]">
      {title && <p className="font-semibold text-foreground mb-1.5">{title}</p>}
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground min-w-0">
              {r.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: r.color }} />}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="font-medium tabular-nums text-foreground shrink-0">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Botão de ícone "informações do quadro" — abre o modal com a ficha-resumo (Etapa 7/8 do pedido). */
function PanelInfoButton({ panelId, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(panelId)}
      className="inline-flex items-center justify-center h-5 w-5 rounded-full text-muted-foreground/70 hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
      title="Ver informações do quadro"
    >
      <Info className="h-3.5 w-3.5" />
    </button>
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
  const [infoPanelId, setInfoPanelId] = useState(null);
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
    () => (raw?.panels || []).map((p) => ({ value: p.id, label: `${p.tag}: ${p.name}` })),
    [raw]
  );

  async function handleExportPdf() {
    if (!analysis?.hasData) return;
    setExporting(true);
    try {
      // jsPDF + html2canvas são pesados e usados só por este botão —
      // carregados sob demanda no clique, não no carregamento da página.
      const { exportIntelligentAnalysisPdf } = await import("@/services/intelligentAnalysisPdfService");
      await exportIntelligentAnalysisPdf({ analysis, filters, localidades, panelOptions });
      toast.success("Relatório PDF gerado!");
    } catch (err) {
      toast.error("Não foi possível gerar o PDF: " + (err?.message || "erro desconhecido"));
    } finally {
      setExporting(false);
    }
  }

  const periodLabel = ANALYSIS_PERIOD_OPTIONS.find((o) => o.value === period)?.label || "Todo o período";
  const localidadeLabel = localidadeId === LOCALIDADE_ALL ? "Todas as localidades" : (localidades.find((l) => l.id === localidadeId)?.nome || "-");

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
            Análise gerencial das inspeções de checklist: descritiva, diagnóstica, tendências e projeções.
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
        <Card><CardContent className="p-0"><EmptyState text="Sem dados suficientes para análise com os filtros selecionados." /></CardContent></Card>
      ) : (
        <div ref={reportRef} className="space-y-6">
          <ExecutiveVision kpis={analysis.kpis} risk={analysis.interdictionRisk} />
          <DescriptiveSection descriptive={analysis.descriptive} />
          <DimensionChart dimensions={analysis.dimensions} reading={analysis.chartDescriptions.dimensions} />
          <ParetoSection pareto={analysis.pareto} reading={analysis.chartDescriptions.pareto} />
          <TemporalSection temporal={analysis.temporal} reading={analysis.chartDescriptions.temporal} />
          <LocalidadeSection byLocalidade={analysis.byLocalidade} reading={analysis.chartDescriptions.localidade} />
          <InterdictionRiskSection risk={analysis.interdictionRisk} onOpenPanel={setInfoPanelId} />
          <RankingQuadrosSection rankingQuadros={analysis.rankingQuadros} onOpenPanel={setInfoPanelId} />
          <RecurrenceSection recurrence={analysis.recurrence} reading={analysis.chartDescriptions.recurrence} onOpenPanel={setInfoPanelId} />
          <HealthScatterSection healthVsConformity={analysis.healthVsConformity} reading={analysis.chartDescriptions.health} />
          <DiagnosticsSection diagnostics={analysis.diagnostics} />
          <PredictiveSection predictive={analysis.predictive} temporal={analysis.temporal} />
          <InsightsSection insights={analysis.insights} />
        </div>
      )}

      <PanelInfoDialog
        panelId={infoPanelId}
        snapshot={infoPanelId ? getPanelSnapshotFromAnalysis(analysis, infoPanelId) : null}
        onClose={() => setInfoPanelId(null)}
      />
    </div>
  );
}

// ============================================================================
// Seções
// ============================================================================

function ExecutiveVision({ kpis, risk }) {
  const porLocalidade = new Map(kpis.inspecoesPorLocalidade.map((l) => [l.localidade, l.inspecoes]));
  const condicoesLabel = risk.condicoesCatalogo.map((c) => c.label).join(" · ");
  return (
    <Section id="visao-executiva" title="Visão Executiva">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={ClipboardCheck} label="Inspeções realizadas" value={kpis.inspecoesRealizadas} />
        <Kpi icon={MapPin} label="Inspeções no Porto" value={porLocalidade.get("Porto") ?? 0} sub="localidade Porto" />
        <Kpi icon={MapPin} label="Inspeções na Oficina" value={porLocalidade.get("Oficina") ?? 0} sub="localidade Oficina" />
        <Kpi
          icon={Target} label="Taxa de conformidade" value={pct(kpis.taxaConformidade)}
          sub={`${kpis.conforme} de ${kpis.aplicaveis} aplicáveis`}
          tone={kpis.taxaConformidade == null ? undefined : kpis.taxaConformidade >= 90 ? "ok" : kpis.taxaConformidade >= 70 ? "warn" : "err"}
          hint="Conforme / (Conforme + Não Conforme). Respostas N/A e Não Verificado não entram no cálculo."
        />
        <Kpi
          icon={AlertTriangle} label="Não conformidades" value={kpis.naoConformidades}
          sub="abertas no período (mesma regra do Dashboard)" tone={kpis.naoConformidades ? "warn" : "ok"}
          hint="Registros da tabela de Não Conformidades com status Aberta ou Em Tratamento, abertos dentro do período selecionado, mesma definição usada no Painel."
        />
        <Kpi
          icon={ShieldAlert} label="Quadros com risco de interdição" value={risk.quadrosAfetados}
          sub="Quadros com NC em PRO-01 ou ATR-01" tone={risk.quadrosAfetados ? "err" : "ok"}
          hint={`Quadros distintos com NC aberta em ${condicoesLabel}. Um quadro com as duas condições conta uma única vez. Ocorrências no período: ${risk.condicoesCriticas}.`}
        />
        <Kpi
          icon={Gauge} label="Índice de Saúde médio" value={kpis.indiceSaudeMedio != null ? Math.round(kpis.indiceSaudeMedio) : "-"}
          sub={kpis.indiceSaudeMedio == null ? "sem inspeções com IS calculado" : "das inspeções com IS calculado"}
        />
      </div>
    </Section>
  );
}

const DESCRIPTIVE_ICONS = { ClipboardCheck, MapPin, Target, AlertTriangle, ShieldAlert };

/** Um cartão de interpretação da Análise Descritiva — categoria/ícone, resumo, interpretação e indicadores (Etapa 3 do pedido de refinamento visual). */
function DescriptiveCard({ card }) {
  const Icon = DESCRIPTIVE_ICONS[card.icone] || Sparkles;
  return (
    <div className="rounded-lg border border-border/60 p-4 bg-card h-full flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{card.titulo}</p>
      </div>
      <p className="text-sm font-medium text-foreground leading-snug">{card.resumo}</p>
      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{card.interpretacao}</p>
      {card.indicadores?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-auto pt-3 border-t border-border/50">
          {card.indicadores.map((ind, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
              <span className="text-muted-foreground">{ind.label}:</span>
              <span className="font-semibold tabular-nums">{ind.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DescriptiveSection({ descriptive }) {
  return (
    <Section
      id="analise-descritiva" title="Análise Descritiva"
      subtitle="Leitura interpretativa do recorte filtrado, derivada dos mesmos dados exibidos nos gráficos abaixo."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {descriptive.narrativas.map((card) => <DescriptiveCard key={card.chave} card={card} />)}
      </div>
    </Section>
  );
}

const DIMENSION_LEGEND = [
  { label: "≥ 90% Bom", color: GREEN },
  { label: "70–89% Atenção", color: AMBER },
  { label: "< 70% Crítico", color: RED },
  { label: "Sem dados", color: GRAY },
];

function DimensionChart({ dimensions, reading }) {
  const data = dimensions.map((d) => ({ ...d, percentualLabel: d.percentual == null ? "sem dados" : `${d.percentual.toFixed(1)}%` }));
  return (
    <Section id="conformidade-dimensao" title="Conformidade por Dimensão" subtitle="Conforme / (Conforme + Não Conforme). N/A não penaliza.">
      <ChartLegendDots items={DIMENSION_LEGEND} />
      <ResponsiveContainer width="100%" height={Math.max(320, data.length * 42)}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 48, top: 4 }}>
          <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="dimensao" width={180} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(46,103,70,0.06)" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload;
              if (!p) return null;
              const color = p.percentual == null ? GRAY : p.percentual >= 90 ? GREEN : p.percentual >= 70 ? AMBER : RED;
              const value = p.percentual == null ? "sem respostas aplicáveis" : `${p.percentual.toFixed(1)}%`;
              return <ChartTooltip active={active} title={p.dimensao} rows={[{ label: "Conformidade", value, color }]} />;
            }}
          />
          <Bar dataKey="percentual" radius={[0, 4, 4, 0]} barSize={20} maxBarSize={22}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.percentual == null ? GRAY : d.percentual >= 90 ? GREEN : d.percentual >= 70 ? AMBER : RED} />
            ))}
            <LabelList dataKey="percentualLabel" position="right" style={{ fontSize: 11, fontWeight: 600, fill: "#374151" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-2 mt-3">
        {data.map((d) => (
          <Badge key={d.modulo} variant="outline" className="text-[11px] font-normal">
            {d.dimensao}: {d.aplicaveis} resposta(s) aplicável(is)
          </Badge>
        ))}
      </div>
      <ChartReading text={reading} />
    </Section>
  );
}

/**
 * Rodapé "Significado dos códigos" do gráfico de Pareto (pedido de
 * refinamento visual) — usa só os códigos que de fato aparecem em
 * `pareto.itens`, já resolvidos com a descrição oficial do template ativo
 * em computeParetoNaoConformidades/filterAnalysisData (nenhum lookup novo
 * de catálogo aqui, nenhuma lista fixa). Acompanha automaticamente
 * filtros/período/localidade porque `pareto.itens` já é o recorte atual.
 * NCs manuais sem código (sem correspondência no catálogo) não entram,
 * pois não há descrição oficial a resolver para elas.
 */
function ParetoLegend({ itens }) {
  const list = itens.filter((it) => it.codigo && it.titulo);
  if (list.length === 0) return null;
  return (
    <div className="mt-5 pt-4 border-t border-border/60">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/80 mb-2">Significado dos códigos</p>
      <dl className={`grid gap-x-6 gap-y-1.5 text-xs ${list.length > 6 ? "sm:grid-cols-2" : ""}`}>
        {list.map((it) => (
          <div key={it.codigo} className="flex gap-1.5 min-w-0">
            <dt className="font-semibold text-foreground shrink-0">{it.codigo}:</dt>
            <dd className="text-muted-foreground leading-snug">{it.titulo}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ParetoSection({ pareto, reading }) {
  // Altura proporcional à quantidade de itens (mais itens -> mais espaço
  // horizontal por categoria e labels rotacionados -> mais altura), sem
  // "flutuar" no topo do card quando há poucos itens nem estourar quando há
  // muitos (Etapa 1 da segunda rodada de refinamento visual).
  const chartHeight = Math.max(320, Math.min(420, 210 + pareto.itens.length * 14));
  return (
    <Section
      id="pareto-nc" title="Principais Não Conformidades"
      subtitle={`Concentração de NCs abertas por requisito (Pareto). Não é um ranking de "piores" itens. Mostrando ${pareto.itens.length} de ${pareto.total} requisito(s) com ocorrência.`}
    >
      {pareto.itens.length === 0 ? <EmptyState text="Nenhuma não conformidade aberta no período selecionado." /> : (
        <div className="flex flex-col items-center">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart data={pareto.itens} margin={{ left: 16, right: 16, top: 28, bottom: 56 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="codigo" angle={-38} textAnchor="end" interval={0} height={56} tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={38} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS_TICK} axisLine={false} tickLine={false} width={38} />
              <Tooltip
                cursor={{ fill: "rgba(30,103,70,0.06)" }}
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload;
                  if (!p) return null;
                  const titulo = p.codigo && p.titulo ? `${p.codigo}: ${p.titulo}` : (p.titulo || p.codigo || "");
                  return (
                    <ChartTooltip
                      active={active}
                      title={titulo}
                      rows={[
                        { label: "Ocorrências", value: p.n, color: GREEN_DARK },
                        { label: "% acumulado", value: `${p.percentualAcumulado.toFixed(1)}%`, color: AMBER },
                      ]}
                    />
                  );
                }}
              />
              <Legend {...LEGEND_PROPS} />
              <Bar yAxisId="left" dataKey="n" name="Ocorrências" fill={GREEN_DARK} radius={[4, 4, 0, 0]} maxBarSize={40}>
                <LabelList dataKey="n" position="top" style={{ fontSize: 10, fontWeight: 600, fill: "#4B5563" }} />
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="percentualAcumulado" name="% acumulado" stroke={AMBER} strokeWidth={1.75} dot={dotStyle(AMBER)} activeDot={activeDotStyle(AMBER)} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <ChartReading text={reading} />
      <ParetoLegend itens={pareto.itens} />
    </Section>
  );
}

function TemporalSection({ temporal, reading }) {
  const granLabel = { dia: "diário", semana: "semanal", mes: "mensal" }[temporal.granularidade] || "";
  return (
    <Section id="evolucao-temporal" title="Evolução da Conformidade" subtitle={temporal.pontos.length ? `Agrupamento ${granLabel}, conforme o período e a quantidade de dados.` : undefined}>
      {temporal.pontos.length < 2 ? (
        <EmptyState text="Histórico insuficiente para traçar evolução (é necessário mais de um período com inspeções)." />
      ) : (
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={temporal.pontos} margin={{ left: 4, right: 24, top: 36, bottom: 10 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} angle={temporal.pontos.length > 8 ? -30 : 0} textAnchor={temporal.pontos.length > 8 ? "end" : "middle"} height={temporal.pontos.length > 8 ? 50 : 30} />
            <YAxis yAxisId="left" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS_TICK} axisLine={false} tickLine={false} width={38} />
            <Tooltip
              cursor={{ fill: "rgba(107,114,128,0.06)" }}
              content={({ active, label, payload }) => {
                if (!payload?.length) return null;
                const rows = payload.map((p) => ({
                  label: p.name,
                  color: p.color,
                  value: p.name === "Taxa de conformidade" ? (p.value == null ? "-" : `${Number(p.value).toFixed(1)}%`) : p.value,
                }));
                return <ChartTooltip active={active} title={label} rows={rows} />;
              }}
            />
            <Legend {...LEGEND_PROPS} />
            <Bar yAxisId="left" dataKey="inspecoes" name="Inspeções" fill={GRAY} radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Bar yAxisId="left" dataKey="naoConformidades" name="Não conformidades" fill={RED} radius={[3, 3, 0, 0]} maxBarSize={28} />
            {/* Rótulo só na série relevante (taxa de conformidade) — as barras de
                inspeções/NCs já têm o próprio eixo e tooltip; rotular também elas
                poluiria o gráfico sem ganho de leitura (pedido de ajuste de rótulos). */}
            <Line yAxisId="right" type="monotone" dataKey="taxaConformidade" name="Taxa de conformidade" stroke={GREEN} strokeWidth={1.75} dot={dotStyle(GREEN)} activeDot={activeDotStyle(GREEN)} connectNulls>
              <LabelList dataKey="taxaConformidade" position="top" offset={10} formatter={(v) => (v == null ? "" : pct(v))} style={{ fontSize: 10, fontWeight: 600, fill: GREEN_DARK }} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <ChartReading text={reading} />
    </Section>
  );
}

function LocalidadeSection({ byLocalidade, reading }) {
  return (
    <Section id="localidades" title="Não Conformidades por Localidade" subtitle="Taxa = NCs abertas / inspeções realizadas na localidade. Não é comparação bruta de volume.">
      {byLocalidade.length === 0 ? <EmptyState /> : (
        <ResponsiveContainer width="100%" height={Math.max(240, byLocalidade.length * 46 + 30)}>
          <ComposedChart data={byLocalidade} layout="vertical" margin={{ left: 10, right: 56, top: 28 }}>
            <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
            <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="localidade" width={160} tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(107,114,128,0.06)" }}
              content={({ active, label, payload }) => {
                if (!payload?.length) return null;
                const rows = payload.map((p) => ({
                  label: p.name,
                  color: p.color,
                  value: p.name === "Não conformidades" && p.payload.taxaNaoConformidade != null
                    ? `${p.value} (${p.payload.taxaNaoConformidade.toFixed(1)}/100 insp.)`
                    : p.value,
                }));
                return <ChartTooltip active={active} title={label} rows={rows} />;
              }}
            />
            <Legend {...LEGEND_PROPS} />
            <Bar dataKey="inspecoes" name="Inspeções" fill={GRAY} radius={[0, 3, 3, 0]} barSize={18} />
            <Bar dataKey="naoConformidades" name="Não conformidades" fill={RED} radius={[0, 3, 3, 0]} barSize={18}>
              <LabelList
                dataKey="taxaNaoConformidade"
                position="right"
                formatter={(v) => (v == null ? "" : `${v.toFixed(1)}/100 insp.`)}
                style={{ fontSize: 10, fill: "#374151" }}
              />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <ChartReading text={reading} />
    </Section>
  );
}

const INTERDICTION_STATUS_LABEL = { aberta: "Aberta", em_tratamento: "Em tratamento" };
// Cores fixas por posição do código em INTERDICTION_RISK_CODES (PRO-01,
// ATR-01) — uso pontual de vermelho/âmbar coerente com a convenção
// semântica já existente na página (crítico/atenção), reservado a este
// indicador de segurança específico.
const INTERDICTION_COLORS = [RED, AMBER];
// Cor do texto do rótulo quando ele cabe dentro do próprio segmento —
// branco sobre o vermelho (bom contraste) e um tom escuro sobre o âmbar
// (branco teria contraste ruim sobre essa cor mais clara).
const INTERDICTION_LABEL_TEXT_COLOR = ["#fff", "#4A3600"];

/**
 * Rótulo de valor para cada segmento da barra empilhada de condições
 * críticas (Etapa de rótulos de dados do pedido de refinamento). Quando o
 * segmento é largo o suficiente, o número fica centrado dentro dele; quando
 * é estreito demais (valor pequeno) para caber com folga, o rótulo sai para
 * fora, logo à direita do próprio segmento, na cor da série — assim o
 * número de um valor pequeno nunca fica espremido ou sobreposto ao
 * segmento vizinho. Não altera o valor exibido, só onde ele é desenhado.
 */
function makeStackedBarLabel(fill, textColor) {
  return function StackedBarLabel({ x, y, width, height, value }) {
    if (!value) return null;
    const cy = y + height / 2;
    const fits = width >= 20;
    return (
      <text
        x={fits ? x + width / 2 : x + width + 4}
        y={cy}
        dy={3.5}
        textAnchor={fits ? "middle" : "start"}
        fontSize={10}
        fontWeight={600}
        fill={fits ? textColor : fill}
      >
        {value}
      </text>
    );
  };
}

/**
 * "Condições Críticas de Interdição" — quadros com NC aberta em PRO-01
 * (DR) ou ATR-01 (condutor de proteção/PE). Toda a agregação vem de
 * `risk` (computeInterdictionRisk, já calculado a partir das mesmas NCs
 * usadas pelo resto da página); este componente só formata.
 */
function InterdictionRiskSection({ risk, onOpenPanel }) {
  const [selectedLocalidade, setSelectedLocalidade] = useState(null);
  const quadrosVisiveis = selectedLocalidade
    ? risk.quadros.filter((q) => q.localidade === selectedLocalidade)
    : risk.quadros;

  return (
    <Section
      id="risco-interdicao" title="Condições Críticas de Interdição"
      subtitle={`Quadros com NC em ${risk.condicoesCatalogo.map((c) => c.label).join(" ou ")}.`}
    >
      {risk.quadrosAfetados === 0 ? (
        <EmptyState text="Nenhum quadro com condição crítica de interdição identificada no período selecionado." />
      ) : (
        <>
          {/* id próprio (separado da tabela abaixo) para o PDF capturar só o gráfico + leitura, sem a lista de quadros — ver intelligentAnalysisPdfService.js */}
          <div id="risco-interdicao-chart">
            <ResponsiveContainer width="100%" height={Math.max(220, risk.porLocalidade.length * 52 + 30)}>
              <ComposedChart
                data={risk.porLocalidade} layout="vertical" margin={{ left: 10, right: 34, top: 28 }}
                onClick={(e) => {
                  const loc = e?.activeLabel;
                  if (loc) setSelectedLocalidade((cur) => (cur === loc ? null : loc));
                }}
              >
                <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
                <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="localidade" width={110} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(220,38,38,0.05)" }}
                  content={({ active, label, payload }) => {
                    const p = payload?.[0]?.payload;
                    if (!p) return null;
                    const rows = risk.condicoesCatalogo.map((c, i) => ({ label: c.label, value: p[c.codigo] || 0, color: INTERDICTION_COLORS[i] }));
                    rows.push({ label: "Total de condições críticas", value: p.total });
                    rows.push({ label: "Quadros distintos afetados", value: p.quadros });
                    return <ChartTooltip active={active} title={label} rows={rows} />;
                  }}
                />
                <Legend {...LEGEND_PROPS} />
                {risk.condicoesCatalogo.map((c, i) => (
                  <Bar
                    key={c.codigo} dataKey={c.codigo} name={c.label} stackId="condicoes"
                    fill={INTERDICTION_COLORS[i]} barSize={22} cursor="pointer"
                    radius={i === risk.condicoesCatalogo.length - 1 ? [0, 3, 3, 0] : [0, 0, 0, 0]}
                  >
                    <LabelList dataKey={c.codigo} content={makeStackedBarLabel(INTERDICTION_COLORS[i], INTERDICTION_LABEL_TEXT_COLOR[i])} />
                  </Bar>
                ))}
              </ComposedChart>
            </ResponsiveContainer>
            <ChartReading text={risk.leitura} />
          </div>

          {selectedLocalidade && (
            <div className="flex items-center gap-2 mt-3 text-xs">
              <span className="text-muted-foreground">Filtrando quadros:</span>
              <Badge variant="outline">{selectedLocalidade}</Badge>
              <button type="button" className="text-primary hover:underline" onClick={() => setSelectedLocalidade(null)}>
                Limpar filtro
              </button>
            </div>
          )}

          <div className="mt-5 pt-4 border-t border-border/60">
            <p className="text-xs font-semibold text-foreground mb-3">
              Quadros afetados{selectedLocalidade ? ` ${emLocalidade(selectedLocalidade)}` : ""}
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quadro</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Localidade</TableHead>
                    <TableHead>Condição crítica</TableHead>
                    <TableHead>Última ocorrência</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quadrosVisiveis.map((q) => (
                    <TableRow key={q.panelId}>
                      <TableCell className="font-mono text-xs">{q.panelTag}</TableCell>
                      <TableCell className="text-sm">{q.panelName}</TableCell>
                      <TableCell className="text-sm">{q.localidade}</TableCell>
                      <TableCell className="text-xs font-medium" title={q.condicoesDescricao}>{q.condicoesLabel}</TableCell>
                      <TableCell className="text-xs">{fmtDate(q.ultimaOcorrencia)}</TableCell>
                      <TableCell className="text-xs">{q.responsavel || "-"}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className={q.status === "aberta" ? "text-destructive border-destructive/30" : "text-amber-700 border-amber-300"}>
                          {INTERDICTION_STATUS_LABEL[q.status] || q.status}
                        </Badge>
                      </TableCell>
                      <TableCell><PanelInfoButton panelId={q.panelId} onOpen={onOpenPanel} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </Section>
  );
}

function RankingQuadrosSection({ rankingQuadros, onOpenPanel }) {
  return (
    <Section
      id="quadros-criticos" title="Quadros Críticos"
      subtitle={`Ranking por volume de NCs abertas no período. Mostrando ${rankingQuadros.itens.length} de ${rankingQuadros.total} quadro(s) com NC.`}
    >
      {rankingQuadros.itens.length === 0 ? <EmptyState text="Nenhum quadro com não conformidade aberta no período selecionado." /> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quadro</TableHead>
                <TableHead>Localidade</TableHead>
                <TableHead className="text-right">NCs abertas</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rankingQuadros.itens.map((q) => (
                <TableRow key={q.panelId}>
                  <TableCell className="font-mono text-xs">{q.panelTag}</TableCell>
                  <TableCell className="text-sm">{q.localidade}</TableCell>
                  <TableCell className="text-right font-medium">{q.naoConformidades}</TableCell>
                  <TableCell><PanelInfoButton panelId={q.panelId} onOpen={onOpenPanel} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

function RecurrenceSection({ recurrence, reading, onOpenPanel }) {
  return (
    <Section
      id="reincidencias" title="Reincidências"
      subtitle="Mesmo requisito com NC aberta em 2 ou mais inspeções diferentes do mesmo quadro."
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
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recurrence.casos.map((c) => (
                <TableRow key={`${c.panelId}-${c.codigo}`}>
                  <TableCell className="font-mono text-xs">{c.panelTag}</TableCell>
                  <TableCell className="text-sm">{c.codigo ? `${c.codigo}: ` : ""}{c.titulo}</TableCell>
                  <TableCell className="text-right font-medium">{c.ocorrencias}</TableCell>
                  <TableCell className="text-xs">{c.datas.map(fmtDate).join(", ")}</TableCell>
                  <TableCell className="text-xs">{fmtDate(c.ultimaOcorrencia)}</TableCell>
                  <TableCell className="text-xs">
                    {c.taxa?.insuficiente ? <span className="text-muted-foreground">{c.taxa.motivo}</span> : `${c.taxa.taxa.toFixed(0)}% (${c.taxa.ocorrencias}/${c.taxa.aplicaveis})`}
                  </TableCell>
                  <TableCell><PanelInfoButton panelId={c.panelId} onOpen={onOpenPanel} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <ChartReading text={reading} />
    </Section>
  );
}

function HealthScatterSection({ healthVsConformity, reading }) {
  return (
    <Section id="is-vs-conformidade" title="Índice de Saúde × Conformidade" subtitle="Cada ponto representa uma inspeção.">
      {healthVsConformity.pontos.length === 0 ? (
        <EmptyState text="Nenhuma inspeção com Índice de Saúde calculado no período selecionado." />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis type="number" dataKey="conformidade" name="Conformidade" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis type="number" dataKey="indiceSaude" name="Índice de Saúde" domain={[0, 100]} tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} />
              <ZAxis range={[36, 36]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3", stroke: "#C9CFD6" }}
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload;
                  if (!p) return null;
                  return (
                    <ChartTooltip
                      active={active}
                      title={`${p.panelTag}: ${p.panelName}`}
                      rows={[
                        { label: `${p.localidade} · ${fmtDate(p.data)}`, value: "" },
                        { label: "Conformidade", value: `${p.conformidade.toFixed(1)}%`, color: GREEN_DARK },
                        { label: "Índice de Saúde", value: p.indiceSaude.toFixed(0), color: AMBER },
                      ]}
                    />
                  );
                }}
              />
              <Scatter data={healthVsConformity.pontos} fill={GREEN_DARK} fillOpacity={0.75} />
            </ScatterChart>
          </ResponsiveContainer>
          <ChartReading text={reading} />
        </>
      )}
    </Section>
  );
}

function DiagnosticsSection({ diagnostics }) {
  const categorias = diagnostics.categorias || [];
  return (
    <Section id="diagnostico" title="Diagnóstico dos Dados" subtitle="Padrões identificados a partir dos cálculos acima, por categoria, sem atribuição de causas.">
      {categorias.length === 0 ? <EmptyState text="Sem padrões relevantes a destacar no período selecionado." /> : (
        <div className="grid md:grid-cols-2 gap-4">
          {categorias.map((cat) => (
            <div key={cat.chave} className="rounded-lg border border-border/70 p-3">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">{cat.titulo}</p>
              <ul className="space-y-1.5">
                {cat.achados.map((d, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-primary mt-0.5">•</span><span>{d.texto}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
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
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData} margin={{ left: 4, right: 16, top: 28 }}>
                    <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS_TICK} axisLine={false} tickLine={false} width={38} />
                    <Tooltip
                      cursor={{ stroke: "#C9CFD6", strokeDasharray: "3 3" }}
                      content={({ active, label, payload }) => {
                        if (!payload?.length) return null;
                        const rows = payload.filter((p) => p.value != null).map((p) => ({ label: p.name, color: p.color, value: `${Number(p.value).toFixed(1)}%` }));
                        return <ChartTooltip active={active} title={label} rows={rows} />;
                      }}
                    />
                    <Legend {...LEGEND_PROPS} />
                    <Line type="monotone" dataKey="historico" name="Histórico observado" stroke={GREEN_DARK} strokeWidth={1.75} dot={dotStyle(GREEN_DARK)} activeDot={activeDotStyle(GREEN_DARK)} connectNulls />
                    <Line type="monotone" dataKey="projecao" name="Cenário projetado" stroke={AMBER} strokeWidth={1.75} strokeDasharray="5 4" dot={dotStyle(AMBER)} activeDot={activeDotStyle(AMBER)} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground mt-2">
                  Tendência estimada: <TrendBadge trend={cp.tendencia} />. Projeção calculada por regressão linear sobre o histórico do recorte filtrado,
                  representando um cenário estimado, não uma garantia. Intervalo aproximado dos pontos projetados:{" "}
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

/**
 * Ficha-resumo do quadro (Etapa 7/8 do pedido) — todo o conteúdo vem de
 * `snapshot` (computePanelSnapshot, já derivado dos dados carregados pela
 * página, sem consulta nova por clique).
 */
function PanelInfoDialog({ panelId, snapshot, onClose }) {
  return (
    <Dialog open={!!panelId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        {!snapshot ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Quadro não encontrado nos dados atuais.</div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <span className="font-mono">{snapshot.tag}</span>
                {snapshot.criticidade && <Badge variant="outline" className="text-[10px]">Criticidade {snapshot.criticidade}</Badge>}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground -mt-2">{snapshot.nome}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Localidade</p>
                  <p className="font-medium flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3 text-primary/60" />{snapshot.localidade}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Status</p>
                  <p className="font-medium capitalize mt-0.5">{snapshot.status || "-"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Última inspeção</p>
                  <p className="font-medium flex items-center gap-1 mt-0.5"><Calendar className="h-3 w-3 text-primary/60" />{fmtDate(snapshot.ultimaInspecao)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Próxima inspeção</p>
                  <p className="font-medium flex items-center gap-1 mt-0.5"><Calendar className="h-3 w-3 text-primary/60" />{fmtDate(snapshot.proximaInspecao)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Inspeções no período</p>
                  <p className="font-medium mt-0.5">{snapshot.inspecoesNoPeriodo}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">NCs abertas no período</p>
                  <p className={`font-medium mt-0.5 ${snapshot.naoConformidadesNoPeriodo ? "text-destructive" : ""}`}>{snapshot.naoConformidadesNoPeriodo}</p>
                </div>
              </div>

              {snapshot.principaisCategorias.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Principais categorias com NC</p>
                  <ul className="space-y-1">
                    {snapshot.principaisCategorias.map((c) => (
                      <li key={c.categoria} className="flex justify-between text-xs"><span>{c.categoria}</span><span className="font-medium">{c.n}</span></li>
                    ))}
                  </ul>
                </div>
              )}

              {snapshot.recorrenciasNoPeriodo.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Requisitos recorrentes</p>
                  <ul className="space-y-1">
                    {snapshot.recorrenciasNoPeriodo.map((r) => (
                      <li key={r.codigo} className="flex justify-between text-xs"><span>{r.codigo ? `${r.codigo}: ` : ""}{r.titulo}</span><span className="font-medium">{r.ocorrencias}x</span></li>
                    ))}
                  </ul>
                </div>
              )}

              <Link to={`/quadro/${snapshot.panelId}`} className="text-xs text-primary hover:underline inline-block pt-1">
                Abrir ficha completa do quadro →
              </Link>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
