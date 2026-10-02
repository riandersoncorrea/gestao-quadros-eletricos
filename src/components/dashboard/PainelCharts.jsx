// Cards de KPI e gráficos do Painel (Dashboard) — shadcn/ui + shadcn Charts
// (Recharts). Recebem os agregados já calculados por
// services/dashboardService.js#computeDashboardData; nenhum número fixo.
// Cores: paleta da Vale em --chart-1..5 (+ --chart-pink/--chart-gray),
// definida em src/index.css e referenciada pelos ChartConfig abaixo.
import React from "react";
import { Link } from "react-router-dom";
import { PieChart, Pie, Cell, Label, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const C = {
  verde: "hsl(var(--chart-1))",
  amarelo: "hsl(var(--chart-2))",
  laranja: "hsl(var(--chart-3))",
  laranjaEscuro: "hsl(var(--chart-4))",
  verdeClaro: "hsl(var(--chart-5))",
  rosa: "hsl(var(--chart-pink))",
  cinza: "hsl(var(--chart-gray))",
};

const nf = new Intl.NumberFormat("pt-BR");
const fmt = (n) => nf.format(n ?? 0);
/** Percentual inteiro de `part` em `total` (0 quando total = 0). */
export const pct = (part, total) => (total ? Math.round((100 * part) / total) : 0);

/** Card base do Painel: borda de 1px (zinc), cantos de 12px, sombra bem leve. */
export function PainelCard({ className, ...props }) {
  return (
    <Card
      className={cn("rounded-xl border border-zinc-200 dark:border-border shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]", className)}
      {...props}
    />
  );
}

// Cor do número do KPI (mesmos tons de antes do redesenho): "ok" verde,
// "err" vermelho, "warn" âmbar; sem tom = cor padrão do texto.
const TONE_CLS = { ok: "text-[hsl(var(--chart-1))]", err: "text-destructive", warn: "text-amber-600" };

/** Tom de um contador em que zero é bom (verde) e qualquer valor > 0 é ruim (vermelho). */
export const zeroIsGood = (n) => (n > 0 ? "err" : "ok");

// Pontos da escala do Índice de Saúde: 0 vermelho (destructive), 50 âmbar
// (amber-600), 100 o verde Vale (#007E7A, --chart-1).
const SCORE_STOPS = [
  [0, [220, 38, 38]],
  [50, [217, 119, 6]],
  [100, [0, 126, 122]],
];

/** Cor contínua para um índice 0–100: vermelho → âmbar → verde Vale. */
export function scoreColor(score) {
  const v = Math.max(0, Math.min(100, Number(score)));
  const i = v <= 50 ? 0 : 1;
  const [a, ca] = SCORE_STOPS[i];
  const [b, cb] = SCORE_STOPS[i + 1];
  const t = (v - a) / (b - a);
  const [r, g, bl] = ca.map((c, k) => Math.round(c + (cb[k] - c) * t));
  return `rgb(${r} ${g} ${bl})`;
}

/** KPI: título pequeno em cinza, número grande (30px, semibold) e linha de contexto. */
export function KpiCard({ label, value, sub, to, tone, color }) {
  const body = (
    <PainelCard className={cn("h-full", to && "transition-colors hover:border-[hsl(var(--chart-1))]/40")}>
      <div className="p-5">
        <p className="text-sm text-zinc-500 dark:text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-[30px] leading-9 font-semibold tabular-nums tracking-tight", TONE_CLS[tone])}
          style={color ? { color } : undefined}>{value}</p>
        {sub && <p className="mt-1 text-xs text-zinc-500 dark:text-muted-foreground">{sub}</p>}
      </div>
    </PainelCard>
  );
  return to ? <Link to={to} className="block h-full">{body}</Link> : body;
}

function ChartCard({ title, description, action, footer, children }) {
  return (
    <PainelCard className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-4">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {description && <CardDescription className="text-zinc-500 dark:text-muted-foreground">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="flex-1">{children}</CardContent>
      {footer && (
        <CardFooter className="border-t border-zinc-100 dark:border-border pt-4 text-sm text-zinc-500 dark:text-muted-foreground">
          {footer}
        </CardFooter>
      )}
    </PainelCard>
  );
}

const Empty = ({ children }) => (
  <p className="py-10 text-center text-sm text-zinc-500 dark:text-muted-foreground">{children}</p>
);

// --- 1. Índice de Saúde (donut) ---------------------------------------------------

const HEALTH_CONFIG = {
  bom: { label: "Bom (≥80)", color: C.verde },
  atencao: { label: "Atenção (50–79)", color: C.amarelo },
  critico: { label: "Crítico (<50)", color: C.laranja },
  semAvaliacao: { label: "Sem avaliação", color: C.cinza },
};

export function HealthDonutCard({ bands }) {
  const data = Object.keys(HEALTH_CONFIG).map((key) => ({ key, value: bands[key] || 0, fill: `var(--color-${key})` }));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ChartCard
      title="Índice de Saúde"
      description="Distribuição dos quadros por faixa"
      footer={total ? `${pct(bands.bom, total)}% dos quadros com saúde boa` : "Nenhum quadro no recorte selecionado"}
    >
      {total === 0 ? <Empty>Nenhum quadro.</Empty> : (
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <ChartContainer config={HEALTH_CONFIG} className="aspect-square h-[190px] w-[190px] shrink-0">
            <PieChart>
              <ChartTooltip cursor={false} content={<SimpleTooltip config={HEALTH_CONFIG} total={total} />} />
              <Pie data={data} dataKey="value" nameKey="key" innerRadius={62} outerRadius={88} strokeWidth={2} stroke="hsl(var(--card))">
                {data.map((d) => <Cell key={d.key} fill={d.fill} />)}
                <Label
                  content={({ viewBox }) => (
                    viewBox?.cx != null && (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy - 4} className="fill-foreground text-2xl font-semibold tabular-nums">{fmt(total)}</tspan>
                        <tspan x={viewBox.cx} y={viewBox.cy + 16} className="fill-zinc-500 text-xs">quadros</tspan>
                      </text>
                    )
                  )}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
          <ul className="w-full space-y-2.5">
            {data.map((d) => (
              <li key={d.key} className="flex items-center gap-2.5 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: HEALTH_CONFIG[d.key].color }} />
                <span className="flex-1 text-zinc-600 dark:text-muted-foreground">{HEALTH_CONFIG[d.key].label}</span>
                <span className="font-medium tabular-nums">{fmt(d.value)}</span>
                <span className="w-10 text-right text-xs text-zinc-500 tabular-nums">{pct(d.value, total)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}

// --- 2. NCs por severidade (barra 100% segmentada + mini-cards) -------------------

const SEV_STYLE = {
  critica: { label: "Crítica", color: C.laranjaEscuro },
  alta: { label: "Alta", color: C.laranja },
  media: { label: "Média", color: C.amarelo },
  baixa: { label: "Baixa", color: C.verde },
};

export function SeverityCard({ porSeveridade }) {
  const total = porSeveridade.reduce((s, x) => s + x.n, 0);
  const byKey = Object.fromEntries(porSeveridade.map((x) => [x.sev, x.n]));
  const graves = (byKey.critica || 0) + (byKey.alta || 0);
  return (
    <ChartCard
      title="NCs abertas por severidade"
      description="Distribuição das não conformidades em aberto"
      action={<Link to="/nao-conformidades" className="shrink-0 text-sm font-medium text-[hsl(var(--chart-1))] hover:text-[hsl(var(--chart-green-hover))] hover:underline">Ver todas →</Link>}
      footer={total ? `${pct(graves, total)}% das NCs abertas são críticas ou altas` : "Nenhuma NC aberta no recorte selecionado"}
    >
      <p className="text-[30px] leading-9 font-semibold tabular-nums tracking-tight">{fmt(total)}</p>
      <p className="text-xs text-zinc-500 dark:text-muted-foreground">NCs abertas</p>
      <div className="mt-4 flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-zinc-100 dark:bg-muted" role="img"
        aria-label={porSeveridade.map((x) => `${SEV_STYLE[x.sev].label}: ${x.n}`).join(", ")}>
        {total > 0 && porSeveridade.filter((x) => x.n > 0).map((x) => (
          <div key={x.sev} title={`${SEV_STYLE[x.sev].label}: ${fmt(x.n)}`}
            style={{ width: `${(100 * x.n) / total}%`, minWidth: 6, background: SEV_STYLE[x.sev].color }} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {porSeveridade.map((x) => (
          <Link key={x.sev} to={`/nao-conformidades?sev=${x.sev}`}
            className="rounded-lg border border-zinc-200 dark:border-border p-3 transition-colors hover:bg-zinc-50 dark:hover:bg-muted/40">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: SEV_STYLE[x.sev].color }} />
              {SEV_STYLE[x.sev].label}
            </div>
            <p className="mt-1 text-lg font-semibold tabular-nums">{fmt(x.n)}</p>
            <p className="text-xs text-zinc-500 tabular-nums">{pct(x.n, total)}%</p>
          </Link>
        ))}
      </div>
    </ChartCard>
  );
}

// --- 3. NCs por categoria (barras horizontais em HTML) -----------------------------

export function CategoryCard({ porCategoria }) {
  const data = [...porCategoria].sort((a, b) => b.n - a.n);
  const max = data[0]?.n || 0;
  const total = data.reduce((s, x) => s + x.n, 0);
  const top3 = data.slice(0, 3).reduce((s, x) => s + x.n, 0);
  return (
    <ChartCard
      title="NCs abertas por categoria"
      description="Categorias do checklist com mais não conformidades"
      footer={data.length ? `As 3 maiores categorias concentram ${pct(top3, total)}% das NCs listadas` : "Nenhuma NC aberta no recorte selecionado"}
    >
      {data.length === 0 ? <Empty>Nenhuma NC aberta.</Empty> : (
        <ul className="space-y-3">
          {data.map((x, i) => (
            <li key={x.categoria} className="grid grid-cols-[minmax(7rem,11rem)_1fr_3rem] items-center gap-3 text-sm">
              <span className="leading-tight text-zinc-700 dark:text-foreground">{x.categoria}</span>
              <div className="h-2.5 w-full rounded-full bg-zinc-100 dark:bg-muted">
                <div className="h-full rounded-full" style={{ width: `${max ? (100 * x.n) / max : 0}%`, minWidth: 6, background: i < 3 ? C.verde : C.verdeClaro }} />
              </div>
              <span className="text-right font-medium tabular-nums">{fmt(x.n)}</span>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

// --- 4. Inspeções nos últimos 6 meses (barras empilhadas) ---------------------------

const INSP_CONFIG = {
  aprovadas: { label: "Aprovadas", color: C.verde },
  reprovadas: { label: "Reprovadas", color: C.rosa },
};

/** Tooltip no padrão shadcn (ChartTooltipContent) com as séries + Total. */
function InspTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="grid min-w-[9rem] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{label}</div>
      {["aprovadas", "reprovadas"].map((k) => (
        <div key={k} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: INSP_CONFIG[k].color }} />
          <span className="flex-1 text-muted-foreground">{INSP_CONFIG[k].label}</span>
          <span className="font-mono font-medium tabular-nums text-foreground">{fmt(row[k])}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 border-t border-border/50 pt-1.5">
        <span className="flex-1 text-muted-foreground">Total</span>
        <span className="font-mono font-medium tabular-nums text-foreground">{fmt(row.total)}</span>
      </div>
    </div>
  );
}

/** Tooltip simples (rótulo + valor + %) para o donut. */
function SimpleTooltip({ active, payload, config, total }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const key = p.payload.key;
  return (
    <div className="grid min-w-[8rem] gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: config[key].color }} />
        <span className="flex-1 text-muted-foreground">{config[key].label}</span>
        <span className="font-mono font-medium tabular-nums text-foreground">{fmt(p.value)}</span>
      </div>
      <div className="text-muted-foreground">{pct(p.value, total)}% dos quadros</div>
    </div>
  );
}

/** Valor dentro do segmento, só quando cabe (altura ≥ 16px). */
const insideLabel = ({ x, y, width, height, value }) =>
  value > 0 && height >= 16 ? (
    <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central"
      className="fill-white text-[11px] font-medium tabular-nums">{value}</text>
  ) : null;

export function InspectionsCard({ porMes }) {
  const data = porMes.map((m) => ({ ...m, aprovadas: Math.max(0, m.total - m.reprovadas) }));
  const total = data.reduce((s, m) => s + m.total, 0);
  const reprov = data.reduce((s, m) => s + m.reprovadas, 0);
  // Rótulo do total acima da barra empilhada (posicionado pelo segmento do topo).
  const totalLabel = ({ x, y, width, index }) => {
    const t = data[index]?.total;
    return t ? (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" className="fill-foreground text-xs font-semibold tabular-nums">{t}</text>
    ) : null;
  };
  return (
    <ChartCard
      title="Inspeções nos últimos 6 meses"
      description="Aprovadas e reprovadas por mês"
      footer={total ? `Taxa de reprovação no período: ${pct(reprov, total)}% (${fmt(reprov)} de ${fmt(total)} inspeções)` : "Nenhuma inspeção nos últimos 6 meses"}
    >
      <ChartContainer config={INSP_CONFIG} className="aspect-auto h-[240px] w-full">
        <BarChart data={data} margin={{ top: 22, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="mes" interval={0} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} tickMargin={6} />
          <ChartTooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} content={<InspTooltip />} />
          <Bar dataKey="aprovadas" stackId="i" fill="var(--color-aprovadas)" maxBarSize={44}>
            <LabelList dataKey="aprovadas" content={insideLabel} />
          </Bar>
          <Bar dataKey="reprovadas" stackId="i" fill="var(--color-reprovadas)" radius={[4, 4, 0, 0]} maxBarSize={44}>
            <LabelList dataKey="reprovadas" content={insideLabel} />
            <LabelList dataKey="total" content={totalLabel} />
          </Bar>
        </BarChart>
      </ChartContainer>
      <div className="mt-2 flex items-center justify-center gap-4 text-xs text-zinc-500">
        {Object.entries(INSP_CONFIG).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c.color }} />{c.label}
          </span>
        ))}
      </div>
    </ChartCard>
  );
}
