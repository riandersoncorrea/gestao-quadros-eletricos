import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchDashboardRaw, computeDashboardData } from "@/services/dashboardService";
import {
  PERIOD_OPTIONS, LOCALIDADE_ALL, resolvePeriodRange, validateCustomRange,
} from "@/domain/dashboardFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell, LabelList,
} from "recharts";
import {
  Activity, FileWarning, ListChecks, ClipboardCheck, Map, FileText, ArrowRight,
  TrendingDown, Gauge,
} from "lucide-react";

const GREEN = "#2E9E6B";
const AMBER = "#E5A100";
const RED = "#DC2626";
const GRAY = "#9CA3AF";

function Kpi({ icon: Icon, label, value, sub, tone, to }) {
  const toneCls = tone === "err" ? "text-destructive" : tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-secondary" : "text-foreground";
  const body = (
    <Card className="border-border/60 hover:shadow-md hover:border-primary/20 transition-all h-full">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${toneCls}`}>{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <Icon className="h-5 w-5 text-muted-foreground/50 shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

const BAR_LABEL_STYLE = { fontSize: 11, fontWeight: 600, fill: "#374151" };

// Rótulo de linha que some em zero, evitando poluir trechos "achatados" do
// gráfico de inspeções com uma fileira de "0" repetidos.
function nonZeroLineLabel(color, dy) {
  return ({ x, y, value }) => {
    if (!value) return null;
    return (
      <text x={x} y={y + dy} textAnchor="middle" fontSize={10} fontWeight={600} fill={color}>
        {value}
      </text>
    );
  };
}

function ChartCard({ title, action, children }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: raw, isLoading } = useQuery({ queryKey: ["dashboardRaw"], queryFn: fetchDashboardRaw });

  const [localidadeId, setLocalidadeId] = useState(LOCALIDADE_ALL);
  const [period, setPeriod] = useState("todo");
  const [customDraft, setCustomDraft] = useState({ from: "", to: "" });
  const [customApplied, setCustomApplied] = useState(null);
  const [customError, setCustomError] = useState(null);

  const filters = useMemo(
    () => ({ localidadeId, dateRange: resolvePeriodRange(period, customApplied) }),
    [localidadeId, period, customApplied]
  );
  const d = useMemo(() => (raw ? computeDashboardData(raw, filters) : null), [raw, filters]);

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

  const localidades = raw?.hierarchy?.localidades || [];

  const filterBar = (
    <div className="flex flex-wrap items-start gap-3">
      <Select value={localidadeId} onValueChange={setLocalidadeId}>
        <SelectTrigger className="w-full sm:w-56">
          <SelectValue placeholder="Localidade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={LOCALIDADE_ALL}>Todas as localidades</SelectItem>
          {localidades.map((l) => (
            <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={period} onValueChange={handlePeriodChange}>
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder="Período" />
        </SelectTrigger>
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
  );

  if (isLoading || !d) {
    return (
      <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  const healthData = [
    { name: "Bom (≥80)", value: d.healthBands.bom, color: GREEN },
    { name: "Atenção (50–79)", value: d.healthBands.atencao, color: AMBER },
    { name: "Crítico (<50)", value: d.healthBands.critico, color: RED },
    { name: "Sem avaliação", value: d.healthBands.semAvaliacao, color: GRAY },
  ];
  const sevColor = { Crítica: RED, Alta: "#EA580C", Média: AMBER, Baixa: GRAY };

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão Geral dos quadros elétricos</p>
        </div>
        <div className="flex gap-2">
          <Link to="/mapa"><Button variant="outline" size="sm" className="gap-2"><Map className="h-4 w-4" />Mapa</Button></Link>
          <Link to="/relatorio"><Button size="sm" className="gap-2"><FileText className="h-4 w-4" />Relatório executivo</Button></Link>
        </div>
      </div>

      {filterBar}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Gauge} label="Índice de Saúde médio" value={d.isMedio ?? "—"} sub={`${d.totalQuadros} quadros`} tone={d.isMedio == null ? undefined : d.isMedio >= 80 ? "ok" : d.isMedio >= 50 ? "warn" : "err"} />
        <Kpi icon={Activity} label="Quadros críticos" value={d.healthBands.critico} sub="Índice de Saúde < 50" tone={d.healthBands.critico ? "err" : "ok"} to="/inventario?health=critico" />
        <Kpi icon={FileWarning} label="NCs abertas" value={d.ncAbertas} sub={`${d.ncCriticas} crítica(s)`} tone={d.ncCriticas ? "err" : d.ncAbertas ? "warn" : "ok"} to="/nao-conformidades" />
        <Kpi icon={ListChecks} label="Ações atrasadas" value={d.acoesAtrasadas} sub={`${d.acoesPendentes} pendentes`} tone={d.acoesAtrasadas ? "err" : "ok"} to="/acoes?f=atrasadas" />
        <Kpi icon={ClipboardCheck} label="Inspeções vencidas" value={d.inspecoesVencidas} sub="próxima data no passado" tone={d.inspecoesVencidas ? "warn" : "ok"} to="/inventario" />
        <Kpi icon={ClipboardCheck} label="Inspeções realizadas" value={d.inspecoesTotais} sub="histórico total" to="/inspecoes" />
        <Kpi icon={TrendingDown} label="Quadros priorizados" value={d.ranking.length} sub="pior saúde / mais NCs" />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Distribuição do Índice de Saúde">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={healthData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {healthData.map((e, i) => <Cell key={i} fill={e.color} />)}
                <LabelList dataKey="value" position="right" style={BAR_LABEL_STYLE} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="NCs abertas por severidade" action={<Link to="/nao-conformidades" className="text-xs text-primary hover:underline">ver</Link>}>
          <ResponsiveContainer width="100%" height={200}>
            {/* margin.top e o domínio do eixo Y com folga de 15% acima do
                maior valor são só deste gráfico (não são um padrão global) —
                sem isso, o rótulo da barra mais alta (ex.: "411") encostava
                no limite superior do card e podia ficar cortado. A folga é
                proporcional ao valor, então continua funcionando para
                qualquer número, não só para o cenário atual. */}
            <BarChart data={d.ncPorSeveridade} margin={{ top: 20, left: 0, right: 10 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} domain={[0, (dataMax) => Math.max(1, Math.ceil(dataMax * 1.15))]} />
              <Tooltip />
              <Bar dataKey="n" radius={[4, 4, 0, 0]}>
                {d.ncPorSeveridade.map((e, i) => <Cell key={i} fill={sevColor[e.label] || GRAY} />)}
                <LabelList dataKey="n" position="top" style={BAR_LABEL_STYLE} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="NCs abertas por categoria">
          {d.ncPorCategoria.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma NC aberta.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={d.ncPorCategoria} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="categoria" width={130} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="n" fill="#0369A1" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="n" position="right" style={BAR_LABEL_STYLE} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Inspeções nos últimos 6 meses">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={d.inspPorMes} margin={{ top: 16, left: 0, right: 10 }}>
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11 }} iconSize={10} iconType="plainline" />
              <Line type="monotone" dataKey="total" stroke={GREEN} strokeWidth={2} name="Realizadas">
                <LabelList dataKey="total" content={nonZeroLineLabel(GREEN, -10)} />
              </Line>
              <Line type="monotone" dataKey="reprovadas" stroke={RED} strokeWidth={2} name="Reprovadas">
                <LabelList dataKey="reprovadas" content={nonZeroLineLabel(RED, 16)} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Ranking */}
      <div className="grid gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Quadros prioritários</CardTitle></CardHeader>
          <CardContent className="p-0">
            {d.ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhum quadro em situação crítica.</p>
            ) : (
              <div className="divide-y divide-border">
                {d.ranking.map((p) => (
                  <Link key={p.id} to={`/quadro/${p.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/40 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        <span className="font-mono text-xs text-primary mr-2">{p.tag}</span>{p.name}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-0.5">
                        {p.health_index != null && <span className="text-[11px] text-muted-foreground">IS {Math.round(p.health_index)}</span>}
                        {p.criticality && <span className="text-[11px] text-muted-foreground">· Crit. {p.criticality}</span>}
                        {p.ncAbertas > 0 && <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">{p.ncAbertas} NC</Badge>}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
