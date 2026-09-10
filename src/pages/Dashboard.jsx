import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchDashboardData } from "@/api/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
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
  const { data: d, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboardData });

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
          <h1 className="text-2xl font-bold tracking-tight">Torre de Controle</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão executiva da integridade dos quadros BT · Serviços Operacionais · São Luís EFC</p>
        </div>
        <div className="flex gap-2">
          <Link to="/mapa"><Button variant="outline" size="sm" className="gap-2"><Map className="h-4 w-4" />Mapa</Button></Link>
          <Link to="/relatorio"><Button size="sm" className="gap-2"><FileText className="h-4 w-4" />Relatório executivo</Button></Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Gauge} label="Índice de Saúde médio" value={d.isMedio ?? "—"} sub={`${d.totalQuadros} quadros`} tone={d.isMedio == null ? undefined : d.isMedio >= 80 ? "ok" : d.isMedio >= 50 ? "warn" : "err"} />
        <Kpi icon={Activity} label="Quadros críticos" value={d.healthBands.critico} sub="Índice de Saúde < 50" tone={d.healthBands.critico ? "err" : "ok"} to="/inventario?health=critico" />
        <Kpi icon={FileWarning} label="NCs abertas" value={d.ncAbertas} sub={`${d.ncCriticas} crítica(s)`} tone={d.ncCriticas ? "err" : d.ncAbertas ? "warn" : "ok"} to="/nao-conformidades" />
        <Kpi icon={ListChecks} label="Ações atrasadas" value={d.acoesAtrasadas} sub={`${d.acoesPendentes} pendentes`} tone={d.acoesAtrasadas ? "err" : "ok"} to="/acoes?f=atrasadas" />
        <Kpi icon={ClipboardCheck} label="Aderência ao plano" value={d.aderenciaGeral == null ? "—" : `${d.aderenciaGeral}%`} sub="ordens SAP no prazo" tone={d.aderenciaGeral == null ? undefined : d.aderenciaGeral >= 90 ? "ok" : d.aderenciaGeral >= 70 ? "warn" : "err"} />
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
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="NCs abertas por severidade" action={<Link to="/nao-conformidades" className="text-xs text-primary hover:underline">ver</Link>}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={d.ncPorSeveridade} margin={{ left: 0, right: 10 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="n" radius={[4, 4, 0, 0]}>
                {d.ncPorSeveridade.map((e, i) => <Cell key={i} fill={sevColor[e.label] || GRAY} />)}
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
                <Bar dataKey="n" fill="#0369A1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Inspeções nos últimos 6 meses">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={d.inspPorMes} margin={{ left: 0, right: 10 }}>
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="total" stroke={GREEN} strokeWidth={2} name="Realizadas" />
              <Line type="monotone" dataKey="reprovadas" stroke={RED} strokeWidth={2} name="Reprovadas" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Aderência por localidade + Ranking */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Aderência ao plano por localidade">
          {d.aderenciaPorLocalidade.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem ordens SAP vencidas.</p>
          ) : (
            <div className="space-y-2">
              {d.aderenciaPorLocalidade.map((l) => (
                <div key={l.nome}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span>{l.nome}</span>
                    <span className="text-muted-foreground">{l.cumpridas}/{l.due} · {l.percent}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${l.percent}%`, background: l.percent >= 90 ? GREEN : l.percent >= 70 ? AMBER : RED }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>

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
