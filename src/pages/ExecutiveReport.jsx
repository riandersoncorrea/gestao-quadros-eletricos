import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchDashboardData } from "@/api/dashboard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ArrowLeft, Printer } from "lucide-react";

function Row({ label, value }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border/60 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default function ExecutiveReport() {
  const navigate = useNavigate();
  const { data: d, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboardData });

  if (isLoading || !d) {
    return <div className="p-8 max-w-3xl mx-auto"><Skeleton className="h-8 w-64 mb-6" /><Skeleton className="h-96 w-full" /></div>;
  }

  const hoje = format(new Date(), "dd/MM/yyyy 'às' HH:mm");
  const totalInsp6m = d.inspPorMes.reduce((s, m) => s + m.total, 0);
  const reprov6m = d.inspPorMes.reduce((s, m) => s + m.reprovadas, 0);

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4" /></Button>
        <Button size="sm" className="gap-2" onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir / PDF</Button>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Relatório Executivo — Integridade de Quadros BT</h1>
        <p className="text-sm text-muted-foreground">Serviços Operacionais · São Luís EFC · gerado em {hoje}</p>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Panorama</h2>
        <Row label="Total de quadros" value={d.totalQuadros} />
        <Row label="Índice de Saúde médio da carteira" value={d.isMedio ?? "sem dados"} />
        <Row label="Quadros em estado bom (IS ≥ 80)" value={d.healthBands.bom} />
        <Row label="Quadros em atenção (IS 50–79)" value={d.healthBands.atencao} />
        <Row label="Quadros críticos (IS < 50)" value={d.healthBands.critico} />
        <Row label="Quadros ainda sem avaliação" value={d.healthBands.semAvaliacao} />
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Não conformidades e ações</h2>
        <Row label="NCs abertas" value={d.ncAbertas} />
        <Row label="— das quais críticas" value={d.ncCriticas} />
        {d.ncPorCategoria.slice(0, 5).map((c) => (
          <Row key={c.categoria} label={`— em ${c.categoria}`} value={c.n} />
        ))}
        <Row label="Ações pendentes" value={d.acoesPendentes} />
        <Row label="— das quais atrasadas" value={d.acoesAtrasadas} />
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Plano de manutenção</h2>
        <Row label="Aderência ao plano (geral)" value={d.aderenciaGeral == null ? "sem ordens vencidas" : `${d.aderenciaGeral}%`} />
        {d.aderenciaPorLocalidade.map((l) => (
          <Row key={l.nome} label={`— ${l.nome}`} value={`${l.percent}% (${l.cumpridas}/${l.due})`} />
        ))}
        <Row label="Inspeções com data vencida" value={d.inspecoesVencidas} />
        <Row label="Inspeções realizadas nos últimos 6 meses" value={`${totalInsp6m} (${reprov6m} reprovadas)`} />
        <Row label="Inspeções no histórico" value={d.inspecoesTotais} />
      </section>

      {d.ranking.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Quadros prioritários</h2>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            {d.ranking.map((p) => (
              <li key={p.id}>
                <span className="font-mono text-xs">{p.tag}</span> — {p.name}
                {" · "}
                {p.health_index != null && `IS ${Math.round(p.health_index)}`}
                {p.criticality && ` · Crit. ${p.criticality}`}
                {p.ncAbertas > 0 && ` · ${p.ncAbertas} NC aberta(s)`}
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-xs text-muted-foreground pt-4 border-t border-border">
        Escopo: quadros de baixa tensão (BT). Índice de Saúde calculado a partir das inspeções validadas, com pesos configuráveis por dimensão.
      </p>
    </div>
  );
}
