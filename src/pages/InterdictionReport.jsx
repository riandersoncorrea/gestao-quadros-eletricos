import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from "recharts";
import {
  ShieldAlert, Clock, AlertTriangle, TrendingDown, Timer, Info, CalendarClock, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { fetchInterdictionReport } from "@/services/interdictionReportService";
import { CORRECTIVE_LABEL, LEAD_TIME_BINS } from "@/domain/interdictionReport";

// Paleta de gráficos da Vale (mesma de src/index.css, --chart-*).
const VERDE = "#007E7A";
const VERDE_ESCURO = "#005F5C";
const VERDE_CLARO = "#80BFBC";
const AMARELO = "#EDB111";
const LARANJA = "#E37222";
const LARANJA_ESCURO = "#B8461A";
const CINZA = "#B9BABB";
const TEXTO_ESCURO = "#111C27";
const AXIS_TICK = { fontSize: 12, fill: "#5E6B78" };
const GRID_STROKE = "#E8ECEF";

const SITUACAO = [
  { key: "concluida", label: "Concluída", color: VERDE, text: "#FFFFFF" },
  { key: "em_andamento", label: "Em andamento", color: AMARELO, text: TEXTO_ESCURO },
  { key: "pendente", label: "Pendente", color: LARANJA, text: TEXTO_ESCURO },
];
const CORRETIVA = [
  { key: "concluida", label: "Concluída", color: VERDE, text: "#FFFFFF" },
  { key: "em_andamento", label: "Em andamento", color: AMARELO, text: TEXTO_ESCURO },
  { key: "aberta", label: "Aberta", color: LARANJA, text: TEXTO_ESCURO },
];
const PILL = {
  concluida: "border-[#007E7A] text-[#005F5C] dark:text-[#80BFBC]",
  em_andamento: "border-[#EDB111] text-[#8A5E00] dark:text-[#EDB111]",
  aberta: "border-[#E37222] text-[#B8461A] dark:text-[#E37222]",
  sem_acao: "border-border text-muted-foreground",
};
const NC_STATUS_LABEL = { aberta: "Aberta", em_tratamento: "Em tratamento", concluida: "Concluída", cancelada: "Cancelada" };

// Enquanto a página está aberta (e a aba visível), os dados são relidos do
// banco a cada 5 minutos; o botão "Atualizar" relê na hora.
const AUTO_REFRESH_MS = 5 * 60 * 1000;

const fmtHora = (ms) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const pf = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });
const fmtD = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—");
const fmtDM = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "—");

function Swatch({ color, line }) {
  return <span className={`inline-block shrink-0 rounded-sm ${line ? "h-[3px] w-4" : "h-3 w-3"}`} style={{ background: color }} />;
}

function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5"><Swatch color={i.color} line={i.line} />{i.label}</span>
      ))}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }) {
  const toneCls = {
    primary: "bg-[#007E7A] text-white border-transparent",
    soft: "bg-sidebar border-sidebar-border",
  }[tone] || "bg-card";
  const valueCls = { warn: "text-[#8A5E00] dark:text-[#EDB111]", bad: "text-[#B8461A] dark:text-[#E37222]", soft: "text-sidebar-primary" }[tone] || "";
  const muted = tone === "primary" ? "text-white/85" : "text-muted-foreground";
  return (
    <div className={`rounded-xl border p-4 sm:p-5 flex flex-col gap-2 min-w-0 ${toneCls}`}>
      <span className={`text-xs sm:text-sm font-medium flex items-start gap-1.5 sm:gap-2 ${muted}`}>{Icon && <Icon className="h-4 w-4 shrink-0 mt-px" />}{label}</span>
      <span className={`text-3xl sm:text-4xl font-bold leading-none tracking-tight tabular-nums ${valueCls}`}>{value}</span>
      <span className={`text-xs sm:text-sm leading-snug ${muted}`}>{sub}</span>
    </div>
  );
}

function Section({ id, title, subtitle, children, className = "" }) {
  return (
    <Card id={id} className={`scroll-mt-4 ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{subtitle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Barra horizontal empilhada (situação por localidade / por responsável). */
function StackRows({ rows, labelKey, series, labelWidth = "w-24" }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r[labelKey]} className="flex items-center gap-3 text-sm">
          <span className={`${labelWidth} shrink-0 font-medium truncate`} title={r[labelKey]}>{r[labelKey]}</span>
          <div className="flex-1 min-w-0">
            <div className="flex h-7 gap-0.5 rounded-md overflow-hidden" style={{ width: `${(100 * r.total) / max}%` }}>
              {series.filter((s) => r[s.key] > 0).map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-center text-xs font-bold tabular-nums"
                  style={{ flex: r[s.key], background: s.color, color: s.text }}
                  title={`${s.label}: ${r[s.key]}`}
                >
                  {r[s.key]}
                </div>
              ))}
            </div>
          </div>
          <span className="w-8 shrink-0 text-right text-muted-foreground tabular-nums">{r.total}</span>
        </div>
      ))}
    </div>
  );
}

function WeeklyTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const w = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground mb-1">Semana de {fmtD(w.semana)}</p>
      <p className="flex items-center gap-1.5"><Swatch color={CINZA} />NCs registradas: <b className="tabular-nums">{w.registradas}</b></p>
      <p className="flex items-center gap-1.5"><Swatch color={VERDE} />Corretivas concluídas: <b className="tabular-nums">{w.concluidas}</b></p>
      <p className="flex items-center gap-1.5"><Swatch color={LARANJA} line />Saldo em aberto: <b className="tabular-nums">{w.saldo}</b></p>
      <p className="flex items-center gap-1.5 text-muted-foreground">Quadros concluídos (acum.): <b className="tabular-nums text-foreground">{w.quadrosConcluidos}</b></p>
    </div>
  );
}

// Rótulo de barra: dentro do topo quando a barra é alta, senão acima dela —
// deixa o espaço acima das barras altas livre para a linha do saldo.
const barLabel = (fill, insideFill) => function BarValue({ x, y, width, height, value }) {
  if (!value) return null;
  const inside = height >= 22 && width >= 20;
  return (
    <text x={x + width / 2} y={inside ? y + 14 : y - 5} textAnchor="middle" fontSize={11} fontWeight={700} fill={inside ? insideFill : fill}>{value}</text>
  );
};

// Rótulo do saldo à direita do ponto, para não cobrir os rótulos das barras.
function SaldoLabel({ x, y, value }) {
  return <text x={x + 8} y={y - 8} fontSize={12} fontWeight={700} fill={LARANJA_ESCURO}>{value}</text>;
}

function WeeklyChart({ semanas, totalQuadros }) {
  return (
    <div className="flex flex-col gap-3">
      <Legend items={[
        { label: "NCs registradas", color: CINZA },
        { label: "Corretivas concluídas", color: VERDE },
        { label: "Saldo em aberto", color: LARANJA, line: true },
      ]} />
      <div className="h-[260px] sm:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={semanas} margin={{ top: 24, right: 28, left: -8, bottom: 0 }} barGap={4}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="semana" tickFormatter={fmtDM} tick={{ ...AXIS_TICK, fontSize: 11 }} interval={0} tickLine={false} axisLine={{ stroke: "#9AA5B1" }} />
            <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} />
            <Tooltip content={<WeeklyTooltip />} cursor={{ fill: "rgba(0,126,122,0.06)" }} />
            <Bar dataKey="registradas" fill={CINZA} radius={[3, 3, 0, 0]} maxBarSize={30}>
              <LabelList dataKey="registradas" content={barLabel("#5E6B78", TEXTO_ESCURO)} />
            </Bar>
            <Bar dataKey="concluidas" fill={VERDE} radius={[3, 3, 0, 0]} maxBarSize={30}>
              <LabelList dataKey="concluidas" content={barLabel(VERDE_ESCURO, "#FFFFFF")} />
            </Bar>
            <Line type="linear" dataKey="saldo" stroke={LARANJA} strokeWidth={3} dot={{ r: 4, fill: "#fff", stroke: LARANJA, strokeWidth: 2.5 }} activeDot={{ r: 5 }}>
              <LabelList dataKey="saldo" content={SaldoLabel} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="border-t pt-2 flex flex-col gap-1.5">
        <p className="text-xs text-muted-foreground">Quadros com corretiva concluída, acumulado no fim de cada semana (de {totalQuadros})</p>
        <div>
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(4.25rem, 1fr))" }}>
            {semanas.map((w) => (
              <div key={w.semana} className="flex flex-col items-center rounded-md bg-muted/50 py-1.5 tabular-nums">
                <span className="text-[10px] text-muted-foreground">{fmtDM(w.semana)}</span>
                <span className={`text-base font-bold ${w.quadrosConcluidos ? "text-[#007E7A] dark:text-[#80BFBC]" : "text-muted-foreground/60"}`}>{w.quadrosConcluidos}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadHistogram({ faixas }) {
  const max = Math.max(1, ...faixas.map((f) => f.corretivas));
  const top = Math.max(...faixas.map((f) => f.corretivas));
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-6 gap-2 items-end h-36 border-b border-[#9AA5B1] px-1">
        {faixas.map((f) => (
          <div key={f.faixa} className="flex flex-col items-center justify-end gap-1 h-full">
            <span className="text-xs font-bold tabular-nums">{f.corretivas}</span>
            <div className="w-full rounded-t" style={{ height: `${(100 * f.corretivas) / max}%`, minHeight: f.corretivas ? 3 : 0, background: f.corretivas === top ? VERDE : VERDE_CLARO }} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-2 px-1 text-xs text-center text-muted-foreground">
        {faixas.map((f) => <span key={f.faixa}>{f.faixa}</span>)}
      </div>
      <p className="text-[11px] text-center text-muted-foreground">dias entre a inspeção e a conclusão</p>
    </div>
  );
}

function Badge({ n, color, text }) {
  return (
    <span className="shrink-0 min-w-[2.25rem] text-center rounded-md px-1.5 py-0.5 text-sm font-extrabold tabular-nums" style={{ background: color, color: text }}>{n}</span>
  );
}

function Attention({ atencao }) {
  const items = [];
  if (atencao.prazoComum && atencao.prazoComum.corretivas > 1) {
    items.push(
      <><b>{atencao.prazoComum.corretivas} corretivas</b> em andamento <b>vencem juntas em {fmtD(atencao.prazoComum.data)}</b>
        {" "}({atencao.prazoComum.porResponsavel.map((r) => `${r.nome.split(" ")[0]} ${r.n}`).join(" · ")}).</>
    );
  }
  const badges = [];
  if (atencao.prazoComum && atencao.prazoComum.corretivas > 1) badges.push([atencao.prazoComum.corretivas, AMARELO, TEXTO_ESCURO]);
  if (atencao.vencidas.length) {
    items.push(<><b>Corretiva vencida</b>: {atencao.vencidas.map((r) => `${r.tag} (prazo ${fmtD(r.corretiva.prazo)})`).join(", ")}.</>);
    badges.push([atencao.vencidas.length, LARANJA_ESCURO, "#FFFFFF"]);
  }
  if (atencao.duplicadas.length) {
    items.push(<><b>NC possivelmente duplicada</b> em quadro já corrigido ({atencao.duplicadas.map((q) => q.tag).join(", ")}): conferir e cancelar.</>);
    badges.push([atencao.duplicadas.length, LARANJA, TEXTO_ESCURO]);
  }
  if (atencao.novos.length) {
    items.push(<><b>Risco novo</b> nos últimos 7 dias: {atencao.novos.map((r) => `${r.tag} (${fmtD(r.dataRegistro)}${r.corretiva.prazo ? `, prazo ${fmtD(r.corretiva.prazo)}` : ""})`).join(", ")}.</>);
    badges.push([atencao.novos.length, "#EBF5F4", VERDE_ESCURO]);
  }
  items.push(atencao.reincidentes.length
    ? <><b>Voltaram a ter risco</b> depois da corretiva concluída: {atencao.reincidentes.map((q) => q.tag).join(", ")}.</>
    : <>Nenhum quadro voltou a ter risco depois da corretiva concluída.</>);
  badges.push([atencao.reincidentes.length, "#EBF5F4", VERDE_ESCURO]);

  return (
    <ul className="flex flex-col gap-3 text-sm leading-snug">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 items-start">
          <Badge n={badges[i][0]} color={badges[i][1]} text={badges[i][2]} />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function FunnelStep({ step, value, label, tone }) {
  const cls = tone === "out" ? "bg-muted text-muted-foreground" : tone === "final" ? "bg-[#007E7A] text-white" : "bg-sidebar text-sidebar-foreground";
  const stepCls = tone === "final" ? "bg-white/20 text-white" : "bg-background/70 text-muted-foreground";
  return (
    <div className={`rounded-lg p-3 sm:p-4 flex flex-col gap-2 min-w-0 ${cls}`}>
      <span className={`self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ${stepCls}`}>Passo {step}</span>
      <span className="text-2xl sm:text-3xl font-bold tabular-nums leading-none">{value}</span>
      <span className="text-xs sm:text-sm leading-snug">{label}</span>
    </div>
  );
}

/** Barra única com a situação dos quadros (concluída / em andamento / pendente). */
function SituationBar({ kpis }) {
  const total = kpis.quadros || 1;
  const parts = [
    { ...SITUACAO[0], n: kpis.concluidos },
    { ...SITUACAO[1], n: kpis.emAndamento },
    { ...SITUACAO[2], n: kpis.pendentes },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-5 w-full gap-0.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={parts.map((p) => `${p.label}: ${p.n}`).join(", ")}>
        {parts.filter((p) => p.n > 0).map((p) => (
          <div key={p.key} style={{ width: `${(100 * p.n) / total}%`, background: p.color }} title={`${p.label}: ${p.n}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {parts.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-2">
            <Swatch color={p.color} />
            <b className="tabular-nums">{p.n}</b>
            <span className="text-muted-foreground">{p.label.toLowerCase()}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${PILL[status] || ""}`}>{CORRECTIVE_LABEL[status]}</span>
  );
}

const obsAlert = (obs) => obs.startsWith("Prazo vencido") || obs.startsWith("O quadro");

/** Lista em cartões para telas estreitas (as tabelas ficam a partir de md). */
function MobileRows({ rows, render }) {
  return <div className="md:hidden flex flex-col gap-3">{rows.map(render)}</div>;
}

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-sm tabular-nums">{children}</dd>
    </div>
  );
}

export default function InterdictionReport() {
  const { data: rep, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["interdiction-report"],
    queryFn: fetchInterdictionReport,
    refetchInterval: AUTO_REFRESH_MS,
  });

  const titulo = (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 shrink-0" />Risco de Interdição
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Evolução das corretivas nos quadros com risco de interdição · relatório para a gerência{rep ? ` · posição em ${fmtD(rep.today)}` : ""}
        </p>
      </div>
      {/* Mesma faixa de 40px (h-10) do logo da gerência, que o AppLayout
          flutua no topo à direita: botão e logo ficam na mesma linha. */}
      <div className="flex items-center gap-3 shrink-0 sm:h-10">
        {dataUpdatedAt > 0 && (
          <span className="text-xs text-muted-foreground text-right leading-snug">
            Atualizado às {fmtHora(dataUpdatedAt)}
            {error && rep
              ? <span className="block text-destructive">não foi possível atualizar agora</span>
              : <span className="block">atualiza sozinho a cada 5 min</span>}
          </span>
        )}
        <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Atualizando…" : "Atualizar"}
        </Button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
        {titulo}
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }
  if (error && !rep) {
    return (
      <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
        {titulo}
        <Card><CardContent className="p-6 text-sm text-destructive">Não foi possível carregar o relatório: {error.message}</CardContent></Card>
      </div>
    );
  }

  const k = rep.kpis;
  const totalRegistradas = k.ncs + k.excluidas;
  const canceladas = rep.excluidas.filter((e) => e.motivo === "nc_cancelada");
  const outrasExclusoes = rep.exclusoesPorMotivo.filter((m) => m.motivo !== "nc_cancelada");
  const outrasN = outrasExclusoes.reduce((s, m) => s + m.ncs, 0);
  const { atencao } = rep;

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      {titulo}

      {k.quadros > 0 ? (
        <>
          <section className="rounded-xl border bg-card p-5 sm:p-7 grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center" aria-label="Resumo">
            <div className="flex items-baseline gap-3 lg:flex-col lg:items-start lg:gap-1 lg:pr-8 lg:border-r">
              <span className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-none tabular-nums text-[#007E7A] dark:text-[#80BFBC]">{pf.format(k.pctConcluidos)}</span>
              <span className="text-sm text-muted-foreground leading-snug max-w-[12rem]">dos quadros com corretiva concluída</span>
            </div>
            <div className="flex flex-col gap-5 min-w-0">
              <p className="text-base sm:text-lg leading-relaxed">
                <b>{k.concluidos} dos {k.quadros} quadros</b> com risco de interdição já tiveram a corretiva concluída.
                {k.saldoPico && k.saldoPico.valor > k.saldoAtual && (
                  <> O saldo de NCs em aberto caiu de <b>{k.saldoPico.valor}</b>, na semana de {fmtD(k.saldoPico.semana)}, para <b>{k.saldoAtual}</b>.</>
                )}
              </p>
              <SituationBar kpis={k} />
            </div>
          </section>

          <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4" aria-label="Indicadores">
            <Kpi icon={ShieldAlert} label="Quadros com risco de interdição" value={k.quadros} sub={`${k.ncs} NCs registradas desde ${fmtD(rep.primeiroRegistro)}`} />
            <Kpi icon={Clock} label="Em andamento" value={k.emAndamento} sub={atencao.prazoComum ? `${atencao.prazoComum.corretivas} corretivas vencem em ${fmtD(atencao.prazoComum.data)}` : "quadros com corretiva em execução"} tone="warn" />
            <Kpi icon={AlertTriangle} label="Pendentes" value={k.pendentes} sub={k.duplicadas ? `${k.duplicadas} com NC possivelmente duplicada` : "sem corretiva iniciada"} tone="bad" />
            <Kpi icon={Timer} label="Tempo médio até concluir" value={rep.lead.media != null ? `${nf.format(rep.lead.media)} dias` : "—"} sub={rep.lead.media != null ? `mediana ${nf.format(rep.lead.mediana)} · máximo ${rep.lead.maximo} dias` : "nenhuma corretiva concluída"} />
            <Kpi icon={TrendingDown} label="Saldo de NCs em aberto" value={k.quedaSaldo != null ? `−${pf.format(k.quedaSaldo)}` : k.saldoAtual} sub={k.saldoPico ? `de ${k.saldoPico.valor} (semana de ${fmtDM(k.saldoPico.semana)}) para ${k.saldoAtual}` : ""} tone="soft" />
            <Kpi icon={CalendarClock} label="Corretivas vencidas" value={atencao.vencidas.length} sub={`${atencao.venceEmBreve.length} vencem nos próximos 7 dias`} tone={atencao.vencidas.length ? "bad" : undefined} />
          </section>

          <Section
            id="origem" title="De onde vêm os números"
            subtitle="Do total de NCs de PRO-01 (DR) e ATR-01 (condutor de proteção) já registradas até os quadros acompanhados neste relatório."
          >
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <FunnelStep step={1} value={totalRegistradas} label="NCs de PRO-01 e ATR-01 registradas no sistema" />
              <FunnelStep step={2} value={`−${k.excluidas}`} label={`ficam fora: ${canceladas.length} canceladas${outrasN ? ` e ${outrasN} por outro motivo` : ""} (detalhe no fim da página)`} tone="out" />
              <FunnelStep step={3} value={k.ncs} label="NCs com risco de interdição" />
              <FunnelStep step={4} value={k.quadros} label="quadros acompanhados; um quadro pode ter mais de uma NC" tone="final" />
            </div>
          </Section>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            <Section
              id="evolucao" title="NCs registradas × corretivas concluídas, por semana" className="xl:col-span-3 min-w-0"
              subtitle="Semanas de segunda a domingo. A linha laranja mostra quantas NCs de risco seguiam sem corretiva concluída ao fim de cada semana."
            >
              <WeeklyChart semanas={rep.semanas} totalQuadros={k.quadros} />
            </Section>

            <Card className="xl:col-span-2 min-w-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Situação dos quadros por localidade</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">Cada quadro conta uma vez. Concluída: todas as NCs de risco do quadro têm corretiva concluída.</p>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                  <Legend items={SITUACAO} />
                  <StackRows rows={rep.porLocalidade} labelKey="localidade" series={SITUACAO} labelWidth="w-20 sm:w-24" />
                </div>
                <div className="h-px bg-border" />
                <div className="flex flex-col gap-3">
                  <p className="text-base font-semibold">Corretivas por responsável</p>
                  <Legend items={CORRETIVA} />
                  <StackRows rows={rep.porResponsavel} labelKey="responsavel" series={CORRETIVA} labelWidth="w-28 sm:w-52" />
                  <p className="text-xs text-muted-foreground">Responsável registrado na ação. NCs sem ação não aparecem aqui.</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <Section id="regra" title="Como o risco de interdição é definido">
              <div className="flex flex-col gap-4 text-sm leading-relaxed">
                <div className="flex gap-3 items-start">
                  <Badge n={rep.regras.anterior} color="hsl(var(--muted))" text="hsl(var(--foreground))" />
                  <p><b>Regra anterior</b>, NCs registradas até {fmtD(prevDay(rep.regraInicio))}: qualquer NC de <b>PRO-01</b> (DR, teste funcional) ou <b>ATR-01</b> (condutor de proteção PE).</p>
                </div>
                <div className="flex gap-3 items-start">
                  <Badge n={rep.regras.atual} color="#EBF5F4" text={VERDE_ESCURO} />
                  <p><b>Regra atual</b>, desde {fmtD(rep.regraInicio)}: PRO-01 não conforme em quadro que alimenta <b>área molhada</b>, ou ATR-01 não conforme.</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Por requisito: {rep.incluidasPorCodigo.map((c) => `${c.codigo} ${c.ncs} NC${c.ncs === 1 ? "" : "s"}`).join(" · ")}
                  {rep.canceladasPorCodigo.some((c) => c.ncs) && <> (canceladas: {rep.canceladasPorCodigo.map((c) => `${c.codigo} ${c.ncs}`).join(" · ")})</>}.
                </p>
              </div>
            </Section>

            <Section id="tempo" title="Dias da inspeção à conclusão" subtitle={`${rep.lead.corretivas} corretivas concluídas${rep.lead.aposPrazo ? `, ${rep.lead.aposPrazo} depois do prazo` : ""}.`}>
              <LeadHistogram faixas={rep.lead.faixas.length ? rep.lead.faixas : LEAD_TIME_BINS.map((b) => ({ faixa: b.faixa, corretivas: 0 }))} />
            </Section>

            <Section id="atencao" title="Pontos de atenção" className="md:col-span-2 xl:col-span-1">
              <Attention atencao={atencao} />
            </Section>
          </div>

          <Section
            id="em-aberto" title={`Quadros em aberto (${rep.abertas.length} NCs)`}
            subtitle="NCs de risco sem corretiva concluída, das mais antigas para as mais recentes. Toque no quadro para abrir a NC."
          >
            <MobileRows
              rows={rep.abertas}
              render={(r) => (
                <div key={r.id} className="rounded-lg border p-3 flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={`/nao-conformidades/${r.id}`} className="font-semibold text-primary hover:underline">{r.tag}</Link>
                      <p className="text-xs text-muted-foreground line-clamp-2">{r.local} · {r.localidade}</p>
                    </div>
                    <StatusPill status={r.corretiva.status} />
                  </div>
                  <dl className="grid grid-cols-3 gap-2">
                    <Fact label="Inspeção">{fmtD(r.dataRegistro)}</Fact>
                    <Fact label="Prazo"><span className={r.atrasada ? "text-destructive font-semibold" : ""}>{fmtD(r.corretiva.prazo)}</span></Fact>
                    <Fact label="Dias em aberto">{r.diasEmAberto ?? "—"}</Fact>
                    <Fact label="Requisito">{r.codigo}</Fact>
                    <Fact label="Área molhada">{r.areaMolhada}</Fact>
                    <Fact label="Responsável"><span className="block truncate">{r.corretiva.responsavel || "—"}</span></Fact>
                  </dl>
                  {r.observacao && <p className={`text-xs ${obsAlert(r.observacao) ? "text-destructive" : "text-muted-foreground"}`}>{r.observacao}</p>}
                </div>
              )}
            />
            <div className="hidden md:block overflow-x-auto rounded-md border max-h-[34rem]">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Quadro</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead>Localidade</TableHead>
                    <TableHead>Requisito</TableHead>
                    <TableHead>Inspeção</TableHead>
                    <TableHead>Área molhada</TableHead>
                    <TableHead>Corretiva</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead className="text-right">Dias em aberto</TableHead>
                    <TableHead>Observação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rep.abertas.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-semibold whitespace-nowrap"><Link to={`/nao-conformidades/${r.id}`} className="text-primary hover:underline">{r.tag}</Link></TableCell>
                      <TableCell className="min-w-[10rem]">{r.local}</TableCell>
                      <TableCell>{r.localidade}</TableCell>
                      <TableCell>{r.codigo}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{fmtD(r.dataRegistro)}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.areaMolhada}</TableCell>
                      <TableCell><StatusPill status={r.corretiva.status} /></TableCell>
                      <TableCell className="whitespace-nowrap">{r.corretiva.responsavel || "—"}</TableCell>
                      <TableCell className={`whitespace-nowrap tabular-nums ${r.atrasada ? "text-destructive font-semibold" : ""}`}>{fmtD(r.corretiva.prazo)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.diasEmAberto ?? "—"}</TableCell>
                      <TableCell className={`min-w-[14rem] text-xs ${obsAlert(r.observacao) ? "text-destructive" : "text-muted-foreground"}`}>{r.observacao}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>
        </>
      ) : (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Nenhum quadro com risco de interdição registrado.</CardContent></Card>
      )}

      <Section
        id="fora" title={`NCs canceladas e outras fora do relatório (${rep.excluidas.length})`}
        subtitle="NCs de PRO-01 e ATR-01 que existem no sistema mas não entram nos totais acima."
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border bg-sidebar/60 p-4 flex gap-3 text-sm leading-relaxed">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-sidebar-primary" />
            <div className="flex flex-col gap-1.5 min-w-0">
              <p><b>Por que as canceladas ficam de fora:</b> uma NC cancelada foi encerrada sem correção, por decisão de quem a gerencia (por exemplo, registro em duplicidade ou condição não confirmada em campo). Ela não gera corretiva e por isso não conta como risco nem como pendência.</p>
              <p className="text-muted-foreground">O sistema não guarda o motivo do cancelamento; a data mostrada é a da última alteração da NC. Para conferir, abra a NC.</p>
              {outrasExclusoes.length > 0 && (
                <p className="text-muted-foreground">Outros motivos: {outrasExclusoes.map((m) => `${m.label} (${m.ncs})`).join("; ")}.</p>
              )}
            </div>
          </div>
          {rep.excluidas.length > 0 ? (
            <>
              <MobileRows
                rows={rep.excluidas}
                render={(r) => (
                  <div key={r.id} className="rounded-lg border p-3 flex flex-col gap-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/nao-conformidades/${r.id}`} className="font-semibold text-primary hover:underline">{r.tag}</Link>
                        <p className="text-xs text-muted-foreground line-clamp-2">{r.local} · {r.localidade}</p>
                      </div>
                      <span className="inline-block rounded-full border px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground">{NC_STATUS_LABEL[r.ncStatus] || r.ncStatus}</span>
                    </div>
                    <dl className="grid grid-cols-3 gap-2">
                      <Fact label="Requisito">{r.codigo}</Fact>
                      <Fact label="Inspeção">{fmtD(r.dataRegistro)}</Fact>
                      <Fact label="Última alteração">{fmtD(r.atualizadaEm)}</Fact>
                    </dl>
                    <p className="text-xs"><span className="text-muted-foreground">Motivo:</span> {r.motivoLabel}</p>
                  </div>
                )}
              />
              <div className="hidden md:block overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quadro</TableHead>
                      <TableHead>Local</TableHead>
                      <TableHead>Localidade</TableHead>
                      <TableHead>Requisito</TableHead>
                      <TableHead>Inspeção</TableHead>
                      <TableHead>Área molhada</TableHead>
                      <TableHead>Status da NC</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Última alteração</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rep.excluidas.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-semibold whitespace-nowrap"><Link to={`/nao-conformidades/${r.id}`} className="text-primary hover:underline">{r.tag}</Link></TableCell>
                        <TableCell className="min-w-[10rem]">{r.local}</TableCell>
                        <TableCell>{r.localidade}</TableCell>
                        <TableCell>{r.codigo}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{fmtD(r.dataRegistro)}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.areaMolhada}</TableCell>
                        <TableCell>{NC_STATUS_LABEL[r.ncStatus] || r.ncStatus}</TableCell>
                        <TableCell className="min-w-[12rem]">{r.motivoLabel}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{fmtD(r.atualizadaEm)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma NC de PRO-01 ou ATR-01 ficou fora do relatório.</p>
          )}
        </div>
      </Section>

      <p className="text-xs text-muted-foreground leading-relaxed max-w-5xl">
        Fonte: banco do sistema, consultado ao abrir esta página. Uma linha por NC; a corretiva é a ação vinculada à NC e só é concluída com Nota, OM e fotos.
        Situação do quadro: <b>em andamento</b> se alguma corretiva está em execução; <b>concluída</b> se todas as NCs de risco do quadro têm corretiva concluída; <b>pendente</b> nos demais casos.
      </p>
    </div>
  );
}

function prevDay(day) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
