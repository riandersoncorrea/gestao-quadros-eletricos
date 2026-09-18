// Camada preditiva da Análise Inteligente dos Dados. Método: regressão
// linear simples (mínimos quadrados) sobre as séries temporais já
// calculadas por src/domain/intelligentAnalysis.js.
//
// Por que regressão linear simples:
// - é explicável e auditável (qualquer pessoa consegue conferir a conta:
//   inclinação + intercepto de uma reta);
// - é reproduzível (determinística — mesma entrada, mesma saída sempre;
//   nada de aleatoriedade ou modelo treinado);
// - é adequada ao volume de dados do projeto hoje (dezenas de inspeções,
//   poucos pontos temporais por recorte de filtro) — um modelo mais
//   complexo (ex.: ARIMA, redes neurais) exigiria muito mais histórico do
//   que existe para não apenas memorizar ruído;
// - já é compatível com o ambiente atual (Math puro, sem biblioteca nova).
//
// Nenhum destes cálculos usa IA generativa. Quando o texto interpretativo
// da página menciona IA, ele SEMPRE parte destes números já calculados
// (ver seção "IA Generativa / Interpretação" do pedido) — a IA nunca
// calcula o indicador em si.

export const MIN_BUCKETS_FOR_PROJECTION = 4;
export const MIN_INSPECTIONS_FOR_TREND = 6;
export const MIN_APPLICABLE_FOR_RECURRENCE_RATE = 3;
// Abaixo desta variação (em pontos percentuais por "bucket" de tempo), a
// tendência é classificada como estabilidade — evita rotular ruído como
// melhora/piora.
export const TREND_NOISE_THRESHOLD_PP = 1.0;

/** Regressão linear simples (y = a + b·x) por mínimos quadrados, com erro padrão da estimativa. */
export function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0, sxx = 0;
  for (const p of points) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) * (p.x - mx); }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  for (const p of points) { const pred = intercept + slope * p.x; sse += (p.y - pred) ** 2; }
  const stdError = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  return {
    slope, intercept, stdError, n,
    predict: (x) => intercept + slope * x,
  };
}

export function classifyTrend(slope) {
  if (slope > TREND_NOISE_THRESHOLD_PP) return "melhora";
  if (slope < -TREND_NOISE_THRESHOLD_PP) return "piora";
  return "estabilidade";
}

/**
 * Projeção da taxa de conformidade para os próximos `horizon` buckets de
 * tempo. Exige MIN_BUCKETS_FOR_PROJECTION pontos com taxa calculável;
 * caso contrário, retorna insuficiente=true e nenhuma projeção.
 */
export function projectConformity(temporalPoints, horizon = 2) {
  const valid = temporalPoints
    .map((p, i) => ({ x: i, y: p.taxaConformidade, label: p.label }))
    .filter((p) => p.y != null);

  if (valid.length < MIN_BUCKETS_FOR_PROJECTION) {
    return { insuficiente: true, motivo: "Dados históricos insuficientes para gerar projeção confiável." };
  }

  const reg = linearRegression(valid);
  if (!reg) return { insuficiente: true, motivo: "Dados históricos insuficientes para gerar projeção confiável." };

  const lastX = valid[valid.length - 1].x;
  const projecao = Array.from({ length: horizon }, (_, i) => {
    const x = lastX + i + 1;
    const y = Math.max(0, Math.min(100, reg.predict(x)));
    return {
      x, label: `Projeção ${i + 1}`,
      valor: y,
      intervaloMin: Math.max(0, y - reg.stdError),
      intervaloMax: Math.min(100, y + reg.stdError),
    };
  });

  return {
    insuficiente: false,
    tendencia: classifyTrend(reg.slope),
    inclinacaoPontosPorBucket: reg.slope,
    historico: valid,
    projecao,
  };
}

/** Tendência da quantidade/taxa de não conformidades (sem projetar valores absolutos de contagem, só a direção). */
export function projectNaoConformidades(temporalPoints) {
  const valid = temporalPoints
    .map((p, i) => ({ x: i, y: p.naoConformidades, label: p.label }))
    .filter((p) => p.y != null);

  if (valid.length < MIN_BUCKETS_FOR_PROJECTION) {
    return { insuficiente: true, motivo: "Dados históricos insuficientes para identificar tendência de não conformidades." };
  }
  const reg = linearRegression(valid);
  if (!reg) return { insuficiente: true, motivo: "Dados históricos insuficientes para identificar tendência de não conformidades." };

  // Para contagens, o limiar de "ruído" é relativo à média observada (10%),
  // não em pontos percentuais fixos como na conformidade (%).
  const media = valid.reduce((s, p) => s + p.y, 0) / valid.length;
  const noise = Math.max(0.5, media * 0.1);
  const tendencia = reg.slope > noise ? "aumento" : reg.slope < -noise ? "redução" : "estabilidade";

  return { insuficiente: false, tendencia, inclinacao: reg.slope, historico: valid };
}

/**
 * Predição por dimensão: para cada dimensão com série temporal suficiente,
 * classifica a tendência (melhora/estabilidade/piora) da taxa de
 * conformidade daquela dimensão ao longo dos mesmos buckets de tempo já
 * usados na evolução geral.
 */
export function predictDimensionTrends(dimensionSeriesByBucket) {
  // dimensionSeriesByBucket: { [dimensao]: [{x, y: taxaConformidade|null}, ...] }
  const out = {};
  for (const [dimensao, series] of Object.entries(dimensionSeriesByBucket)) {
    const valid = series.filter((p) => p.y != null);
    if (valid.length < MIN_BUCKETS_FOR_PROJECTION) {
      out[dimensao] = { insuficiente: true };
      continue;
    }
    const reg = linearRegression(valid);
    out[dimensao] = reg
      ? { insuficiente: false, tendencia: classifyTrend(reg.slope), inclinacao: reg.slope, pontos: valid.length }
      : { insuficiente: true };
  }
  return out;
}

/**
 * Estimativa de risco de recorrência para um caso já identificado como
 * reincidente (ver computeRecurrence). É uma FREQUÊNCIA EMPÍRICA (ocorrências
 * NC / inspeções aplicáveis daquele requisito naquele quadro), apresentada
 * como "taxa de recorrência observada" — não é uma probabilidade de um
 * modelo estatístico, e é só calculada quando há aplicações suficientes.
 */
export function estimateRecurrenceRate(occurrences, totalApplicable) {
  if (totalApplicable < MIN_APPLICABLE_FOR_RECURRENCE_RATE) {
    return { insuficiente: true, motivo: "Dados insuficientes para estimativa preditiva." };
  }
  return { insuficiente: false, taxa: (100 * occurrences) / totalApplicable, ocorrencias: occurrences, aplicaveis: totalApplicable };
}
