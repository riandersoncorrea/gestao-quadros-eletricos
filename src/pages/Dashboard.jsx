import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchDashboardRaw, computeDashboardData } from "@/services/dashboardService";
import {
  PERIOD_OPTIONS, LOCALIDADE_ALL, resolvePeriodRange, validateCustomRange,
} from "@/domain/dashboardFilters";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PainelCard, KpiCard, HealthDonutCard, SeverityCard, CategoryCard, InspectionsCard, zeroIsGood, scoreColor,
} from "@/components/dashboard/PainelCharts";
import { Map, FileText, ArrowRight } from "lucide-react";

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

      {/* KPIs — linhas de 4 cards */}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Índice de Saúde médio" value={d.isMedio ?? "—"} sub={`${d.totalQuadros} quadros`} color={d.isMedio == null ? undefined : scoreColor(d.isMedio)} />
        <KpiCard label="Quadros críticos" value={d.healthBands.critico} sub="Índice de Saúde < 50" to="/inventario?health=critico" tone={zeroIsGood(d.healthBands.critico)} />
        <KpiCard label="NCs abertas" value={d.ncAbertas} sub={`${d.ncCriticas} crítica(s)`} to="/nao-conformidades" tone={zeroIsGood(d.ncAbertas)} />
        <KpiCard label="Ações atrasadas" value={d.acoesAtrasadas} sub={`${d.acoesPendentes} pendentes`} to="/acoes?f=atrasadas" tone={zeroIsGood(d.acoesAtrasadas)} />
        <KpiCard label="Inspeções vencidas" value={d.inspecoesVencidas} sub="próxima data no passado" to="/inventario" tone={zeroIsGood(d.inspecoesVencidas)} />
        <KpiCard label="Inspeções realizadas" value={d.inspecoesTotais} sub="histórico total" to="/inspecoes" />
        <KpiCard label="Quadros priorizados" value={d.ranking.length} sub="pior saúde / mais NCs" />
        <KpiCard label="NCs corrigidas" value={d.ncCorrigidas} sub="concluídas no período" to="/nao-conformidades?status=concluida" tone={d.ncCorrigidas ? "ok" : undefined} />
      </div>

      {/* Gráficos — 2 colunas (1 em telas estreitas) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <HealthDonutCard bands={d.healthBands} />
        <SeverityCard porSeveridade={d.ncPorSeveridade} />
        <CategoryCard porCategoria={d.ncPorCategoria} />
        <InspectionsCard porMes={d.inspPorMes} />
      </div>

      {/* Ranking */}
      <div className="grid gap-4">
        <PainelCard>
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Quadros prioritários</CardTitle></CardHeader>
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
        </PainelCard>
      </div>
    </div>
  );
}
