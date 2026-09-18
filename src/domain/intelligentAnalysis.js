// Motor analítico da "Análise Inteligente dos Dados". Funções puras — sem
// acesso a rede (a orquestração/fetch fica em
// src/services/intelligentAnalysisService.js). Todas as regras de cálculo
// usadas nesta página ficam documentadas aqui, no ponto onde são aplicadas.
//
// ============================================================================
// REGRAS ANALÍTICAS (documentação central — ver seção 34 do pedido)
// ============================================================================
// 1. Taxa de conformidade = conforme / (conforme + não_conforme).
//    Respostas "não_aplicavel" e "não_verificado" NUNCA entram no
//    denominador — não são "erradas" nem "certas", são inconclusivas para
//    fins de conformidade.
// 2. Dimensão/módulo do checklist = agrupamento por `modulo_nome` (os 8
//    módulos reais do template: Identificação, Segurança, Integridade
//    física, Proteções, Barramentos e conexões, Cabos e isolação,
//    Aterramento, Documentação — módulos 8/9 não existem no catálogo e
//    não são inventados aqui). Esse agrupamento é DELIBERADAMENTE diferente
//    do `MODULE_TO_DIMENSION` usado pelo Índice de Saúde
//    (src/domain/healthIndex.js), que funde módulos (ex.: Identificação
//    dentro de "documentacao", módulos 5+6 juntos) para ponderar o Índice
//    de Saúde — aqui queremos os 8 módulos do checklist separados.
// 3. Reincidência = o mesmo requisito (template_item_id/código) respondido
//    "não_conforme" em 2 OU MAIS inspeções DIFERENTES do MESMO quadro.
//    Duas NCs de requisitos diferentes, ou a mesma NC contada duas vezes
//    dentro da mesma inspeção, NÃO configuram reincidência.
// 4. Pareto das não conformidades = contagem de respostas "não_conforme"
//    por requisito (código), ordenada decrescente, com percentual
//    acumulado sobre o total de NCs do recorte filtrado.
// 5. Correlação (Índice de Saúde × Conformidade) = coeficiente de Pearson
//    entre a taxa de conformidade de cada inspeção e seu
//    health_index_resultado. Só é calculada com dados suficientes (ver
//    MIN_CORRELATION_POINTS) e é sempre apresentada como "correlação
//    observada", nunca como causalidade.
// ============================================================================

import { format, parseISO, differenceInCalendarDays, startOfWeek, startOfMonth } from "date-fns";

export const MIN_CORRELATION_POINTS = 5;
export const RECURRENCE_MIN_OCCURRENCES = 2;
export const MIN_INSPECTIONS_FOR_LOCALITY_RATE = 1;

// Módulos reais do checklist, na ordem em que devem aparecer nos gráficos.
// Vem do próprio catálogo (inspection_template_items) — não é uma lista
// inventada; serve apenas para fixar a ordem de exibição das dimensões que
// de fato existem no template ativo.
const DIMENSION_ORDER = [1, 2, 3, 4, 5, 6, 7, 10];

function resolvePanelId(inspection) {
  return inspection.panel_ref_id || inspection.panel_id;
}

function isConclusiva(resposta) {
  return resposta === "conforme" || resposta === "nao_conforme";
}

/** Taxa de conformidade (0–100) de um conjunto de respostas. null se não houver respostas conclusivas. */
export function conformityRate(responses) {
  let conforme = 0, naoConforme = 0;
  for (const r of responses) {
    if (r.resposta === "conforme") conforme++;
    else if (r.resposta === "nao_conforme") naoConforme++;
  }
  const total = conforme + naoConforme;
  return total ? (100 * conforme) / total : null;
}

/**
 * Aplica os filtros (localidade, período, quadro, status) sobre os dados
 * brutos e devolve as coleções já recortadas + mapas de apoio usados pelo
 * resto do motor. Único ponto onde os filtros são interpretados.
 */
export function filterAnalysisData(raw, filters) {
  const { panels, hierarchy, inspections, responses, templateItems } = raw;
  const { localidadeId = "all", dateRange = null, panelId = "all", status = "all" } = filters || {};

  const locName = new Map((hierarchy?.localidades || []).map((l) => [l.id, l.nome]));
  const panelById = new Map(panels.map((p) => [p.id, p]));
  const itemById = new Map(templateItems.map((it) => [it.id, it]));

  const filteredInspections = inspections.filter((insp) => {
    if (insp.status === "cancelada") return false;
    const pid = resolvePanelId(insp);
    const panel = panelById.get(pid);
    if (localidadeId !== "all" && panel?.localidade_id !== localidadeId) return false;
    if (panelId !== "all" && pid !== panelId) return false;
    if (status !== "all" && insp.overall_result !== status) return false;
    if (dateRange) {
      if (!insp.inspection_date) return false;
      const d = parseISO(insp.inspection_date);
      if (Number.isNaN(d.getTime()) || d < dateRange.start || d > dateRange.end) return false;
    }
    return true;
  });

  const inspectionById = new Map(filteredInspections.map((i) => [i.id, i]));
  const filteredResponses = responses.filter((r) => inspectionById.has(r.inspection_id));

  // Enriquece cada resposta com código/módulo canônicos do catálogo (fallback
  // para os campos denormalizados na própria resposta, para respostas cujo
  // item de template não exista mais).
  const enrichedResponses = filteredResponses.map((r) => {
    const item = itemById.get(r.template_item_id);
    return {
      ...r,
      codigo: item?.codigo ?? null,
      modulo: item?.modulo ?? r.modulo ?? null,
      modulo_nome: item?.modulo_nome ?? null,
      panel_id: resolvePanelId(inspectionById.get(r.inspection_id)),
    };
  });

  return { filteredInspections, filteredResponses: enrichedResponses, panelById, locName, itemById, inspectionById };
}

/** Visão Executiva (KPIs do topo da página). */
export function computeExecutiveKpis({ filteredInspections, filteredResponses, panelById }) {
  const quadrosInspecionados = new Set(filteredInspections.map(resolvePanelId)).size;
  const inspecoesRealizadas = filteredInspections.length;

  let conforme = 0, naoConforme = 0, naoAplicavel = 0, naoVerificado = 0;
  for (const r of filteredResponses) {
    if (r.resposta === "conforme") conforme++;
    else if (r.resposta === "nao_conforme") naoConforme++;
    else if (r.resposta === "nao_aplicavel") naoAplicavel++;
    else if (r.resposta === "nao_verificado") naoVerificado++;
  }
  const aplicaveis = conforme + naoConforme;
  const taxaConformidade = aplicaveis ? (100 * conforme) / aplicaveis : null;

  const withHI = filteredInspections.filter((i) => i.health_index_resultado != null);
  const indiceSaudeMedio = withHI.length
    ? withHI.reduce((s, i) => s + i.health_index_resultado, 0) / withHI.length
    : null;

  return {
    quadrosInspecionados,
    inspecoesRealizadas,
    conforme, naoConforme, naoAplicavel, naoVerificado,
    aplicaveis,
    taxaConformidade,
    naoConformidades: naoConforme,
    indiceSaudeMedio,
  };
}

/** Análise descritiva: contagens e distribuições diretas dos dados filtrados. */
export function computeDescriptive({ filteredInspections, filteredResponses, panelById, locName }, kpis) {
  const porStatus = new Map();
  for (const i of filteredInspections) {
    const k = i.overall_result || "sem_resultado";
    porStatus.set(k, (porStatus.get(k) || 0) + 1);
  }

  const porLocalidade = new Map();
  for (const i of filteredInspections) {
    const panel = panelById.get(resolvePanelId(i));
    const locId = panel?.localidade_id || null;
    const nome = locId ? (locName.get(locId) || "Sem nome") : "Sem localidade";
    porLocalidade.set(nome, (porLocalidade.get(nome) || 0) + 1);
  }

  const dimNc = new Map();
  const perguntaNc = new Map(); // codigo -> { codigo, titulo, n }
  for (const r of filteredResponses) {
    if (r.resposta !== "nao_conforme") continue;
    const dim = r.modulo_nome || "Sem dimensão";
    dimNc.set(dim, (dimNc.get(dim) || 0) + 1);
    const key = r.codigo || r.titulo;
    if (!perguntaNc.has(key)) perguntaNc.set(key, { codigo: r.codigo, titulo: r.titulo, n: 0 });
    perguntaNc.get(key).n += 1;
  }

  return {
    resumo: {
      inspecoes: filteredInspections.length,
      quadros: kpis.quadrosInspecionados,
      conforme: kpis.conforme,
      naoConforme: kpis.naoConforme,
      naoAplicavel: kpis.naoAplicavel,
      naoVerificado: kpis.naoVerificado,
      taxaConformidade: kpis.taxaConformidade,
    },
    dimensoesComMaisOcorrencias: [...dimNc.entries()].map(([dimensao, n]) => ({ dimensao, n })).sort((a, b) => b.n - a.n),
    perguntasComMaisNc: [...perguntaNc.values()].sort((a, b) => b.n - a.n),
    distribuicaoPorStatus: [...porStatus.entries()].map(([status, n]) => ({ status, n })),
    distribuicaoPorLocalidade: [...porLocalidade.entries()].map(([localidade, n]) => ({ localidade, n })).sort((a, b) => b.n - a.n),
  };
}

/** Conformidade por dimensão (as 8 dimensões reais do template). */
export function computeConformityByDimension({ filteredResponses, itemById }) {
  // Nomes canônicos dos 8 módulos, na ordem certa — extraídos do próprio
  // catálogo carregado (não inventados), preservando DIMENSION_ORDER.
  const nameByModulo = new Map();
  for (const it of itemById.values()) {
    if (!nameByModulo.has(it.modulo)) nameByModulo.set(it.modulo, it.modulo_nome);
  }

  const acc = new Map(); // modulo -> {conforme, naoConforme, na}
  for (const r of filteredResponses) {
    if (r.modulo == null) continue;
    const e = acc.get(r.modulo) || { conforme: 0, naoConforme: 0, na: 0 };
    if (r.resposta === "conforme") e.conforme++;
    else if (r.resposta === "nao_conforme") e.naoConforme++;
    else e.na++;
    acc.set(r.modulo, e);
  }

  return DIMENSION_ORDER
    .filter((m) => nameByModulo.has(m))
    .map((modulo) => {
      const e = acc.get(modulo) || { conforme: 0, naoConforme: 0, na: 0 };
      const aplicaveis = e.conforme + e.naoConforme;
      return {
        modulo,
        dimensao: nameByModulo.get(modulo),
        conforme: e.conforme,
        naoConforme: e.naoConforme,
        naoAplicavel: e.na,
        aplicaveis,
        percentual: aplicaveis ? (100 * e.conforme) / aplicaveis : null,
      };
    });
}

/** Pareto das não conformidades por requisito. `limit` corta o gráfico (não os dados) para manter legibilidade. */
export function computeParetoNaoConformidades({ filteredResponses }, limit = 15) {
  const acc = new Map(); // key -> {codigo, titulo, n}
  for (const r of filteredResponses) {
    if (r.resposta !== "nao_conforme") continue;
    const key = r.codigo || r.titulo || "sem-codigo";
    if (!acc.has(key)) acc.set(key, { codigo: r.codigo, titulo: r.titulo, n: 0 });
    acc.get(key).n += 1;
  }
  const sorted = [...acc.values()].sort((a, b) => b.n - a.n);
  const total = sorted.reduce((s, x) => s + x.n, 0);
  let cum = 0;
  const withCumulative = sorted.map((x) => {
    cum += x.n;
    return { ...x, percentual: total ? (100 * x.n) / total : 0, percentualAcumulado: total ? (100 * cum) / total : 0 };
  });
  return { itens: withCumulative.slice(0, limit), total: sorted.length, totalOcorrencias: total };
}

/** Não conformidades por localidade — volume e taxa relativa (respostas aplicáveis). */
export function computeByLocalidade({ filteredInspections, filteredResponses, panelById, locName }) {
  const inspByLoc = new Map(); // locNome -> Set(inspection ids)
  for (const i of filteredInspections) {
    const panel = panelById.get(resolvePanelId(i));
    const nome = panel?.localidade_id ? (locName.get(panel.localidade_id) || "Sem nome") : "Sem localidade";
    if (!inspByLoc.has(nome)) inspByLoc.set(nome, new Set());
    inspByLoc.get(nome).add(i.id);
  }

  const respByLoc = new Map(); // locNome -> {conforme, naoConforme}
  const inspToLoc = new Map();
  for (const [nome, ids] of inspByLoc) for (const id of ids) inspToLoc.set(id, nome);
  for (const r of filteredResponses) {
    if (!isConclusiva(r.resposta)) continue;
    const nome = inspToLoc.get(r.inspection_id);
    if (!nome) continue;
    const e = respByLoc.get(nome) || { conforme: 0, naoConforme: 0 };
    if (r.resposta === "conforme") e.conforme++; else e.naoConforme++;
    respByLoc.set(nome, e);
  }

  return [...inspByLoc.entries()]
    .map(([localidade, ids]) => {
      const r = respByLoc.get(localidade) || { conforme: 0, naoConforme: 0 };
      const aplicaveis = r.conforme + r.naoConforme;
      return {
        localidade,
        inspecoes: ids.size,
        naoConformidades: r.naoConforme,
        taxaNaoConformidade: aplicaveis ? (100 * r.naoConforme) / aplicaveis : null,
      };
    })
    .sort((a, b) => b.naoConformidades - a.naoConformidades);
}

/** Escolhe a granularidade do agrupamento temporal a partir do período selecionado e da amplitude real dos dados. */
export function pickBucketGranularity(period, spanDays) {
  if (period === "semanal") return "dia";
  if (period === "trimestral" || period === "semestral") return "mes";
  if (period === "mensal") return spanDays > 45 ? "mes" : "semana";
  // "todo" ou sem período definido: adapta à amplitude real dos dados.
  if (spanDays <= 45) return "dia";
  if (spanDays <= 210) return "semana";
  return "mes";
}

function bucketKeyAndLabel(dateStr, granularity) {
  const d = parseISO(dateStr);
  if (granularity === "dia") return { key: format(d, "yyyy-MM-dd"), label: format(d, "dd/MM") };
  if (granularity === "semana") {
    const s = startOfWeek(d, { weekStartsOn: 1 });
    return { key: format(s, "yyyy-MM-dd"), label: `sem. ${format(s, "dd/MM")}` };
  }
  const s = startOfMonth(d);
  return { key: format(s, "yyyy-MM"), label: format(s, "MM/yyyy") };
}

/** Evolução temporal da conformidade, inspeções e NCs, no grão adequado ao período/dados. */
export function computeTemporalEvolution({ filteredInspections, filteredResponses }, period) {
  if (filteredInspections.length === 0) return { granularidade: null, pontos: [] };

  const dates = filteredInspections.map((i) => parseISO(i.inspection_date)).filter((d) => !Number.isNaN(d.getTime()));
  const min = new Date(Math.min(...dates)), max = new Date(Math.max(...dates));
  const spanDays = Math.max(1, differenceInCalendarDays(max, min));
  const granularidade = pickBucketGranularity(period, spanDays);

  const inspToBucket = new Map();
  const buckets = new Map(); // key -> {label, inspecoes:Set, conforme, naoConforme}
  for (const i of filteredInspections) {
    if (!i.inspection_date) continue;
    const { key, label } = bucketKeyAndLabel(i.inspection_date, granularidade);
    inspToBucket.set(i.id, key);
    if (!buckets.has(key)) buckets.set(key, { key, label, inspecoes: new Set(), conforme: 0, naoConforme: 0 });
    buckets.get(key).inspecoes.add(i.id);
  }
  for (const r of filteredResponses) {
    if (!isConclusiva(r.resposta)) continue;
    const key = inspToBucket.get(r.inspection_id);
    if (!key) continue;
    const b = buckets.get(key);
    if (r.resposta === "conforme") b.conforme++; else b.naoConforme++;
  }

  const pontos = [...buckets.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((b) => {
      const aplicaveis = b.conforme + b.naoConforme;
      return {
        key: b.key,
        label: b.label,
        inspecoes: b.inspecoes.size,
        naoConformidades: b.naoConforme,
        taxaConformidade: aplicaveis ? (100 * b.conforme) / aplicaveis : null,
      };
    });

  return { granularidade, pontos };
}

/**
 * Reincidência: mesmo requisito (código) "não_conforme" em >=2 inspeções
 * diferentes do mesmo quadro (RECURRENCE_MIN_OCCURRENCES). Duas respostas
 * NC de requisitos diferentes no mesmo quadro não contam como reincidência.
 */
export function computeRecurrence({ filteredInspections, filteredResponses, panelById }) {
  const inspDate = new Map(filteredInspections.map((i) => [i.id, i.inspection_date]));
  // group by (panel, codigo) -> Map(inspection_id -> true) para não contar
  // duas respostas da mesma inspeção como duas ocorrências.
  const groups = new Map();
  for (const r of filteredResponses) {
    if (r.resposta !== "nao_conforme") continue;
    const codigo = r.codigo || r.titulo;
    if (!codigo || !r.panel_id) continue;
    const key = `${r.panel_id}::${codigo}`;
    if (!groups.has(key)) {
      groups.set(key, { panelId: r.panel_id, codigo, titulo: r.titulo, inspections: new Map() });
    }
    groups.get(key).inspections.set(r.inspection_id, inspDate.get(r.inspection_id));
  }

  const casos = [...groups.values()]
    .filter((g) => g.inspections.size >= RECURRENCE_MIN_OCCURRENCES)
    .map((g) => {
      const panel = panelById.get(g.panelId);
      const datas = [...g.inspections.values()].filter(Boolean).sort();
      return {
        panelId: g.panelId,
        panelTag: panel?.tag || "—",
        panelName: panel?.name || "—",
        codigo: g.codigo,
        titulo: g.titulo,
        ocorrencias: g.inspections.size,
        datas,
        ultimaOcorrencia: datas[datas.length - 1] || null,
      };
    })
    .sort((a, b) => b.ocorrencias - a.ocorrencias);

  const quadrosAfetados = new Set(casos.map((c) => c.panelId)).size;
  return {
    casos,
    resumo: {
      totalCasos: casos.length,
      quadrosAfetados,
      requisitoMaisRecorrente: casos[0] || null,
    },
  };
}

/** Coeficiente de correlação de Pearson. null se n < 2 ou variância nula. */
export function pearsonCorrelation(pairs) {
  const n = pairs.length;
  if (n < 2) return null;
  const mx = pairs.reduce((s, p) => s + p.x, 0) / n;
  const my = pairs.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pairs) {
    const dx = p.x - mx, dy = p.y - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Índice de Saúde × Conformidade — um ponto por inspeção com health_index_resultado e respostas conclusivas. */
export function computeHealthVsConformity({ filteredInspections, filteredResponses, panelById, locName }) {
  const respByInsp = new Map();
  for (const r of filteredResponses) {
    if (!isConclusiva(r.resposta)) continue;
    if (!respByInsp.has(r.inspection_id)) respByInsp.set(r.inspection_id, []);
    respByInsp.get(r.inspection_id).push(r);
  }

  const pontos = [];
  for (const i of filteredInspections) {
    if (i.health_index_resultado == null) continue;
    const resp = respByInsp.get(i.id);
    const conformidade = resp ? conformityRate(resp) : null;
    if (conformidade == null) continue;
    const panel = panelById.get(resolvePanelId(i));
    pontos.push({
      inspectionId: i.id,
      panelTag: panel?.tag || "—",
      panelName: panel?.name || "—",
      localidade: panel?.localidade_id ? (locName.get(panel.localidade_id) || "—") : "—",
      data: i.inspection_date,
      conformidade,
      indiceSaude: i.health_index_resultado,
    });
  }

  const correlacao = pontos.length >= MIN_CORRELATION_POINTS
    ? pearsonCorrelation(pontos.map((p) => ({ x: p.conformidade, y: p.indiceSaude })))
    : null;

  return { pontos, correlacao, dadosSuficientes: pontos.length >= MIN_CORRELATION_POINTS };
}

/**
 * Série temporal de taxa de conformidade por dimensão, nos mesmos buckets
 * já usados em computeTemporalEvolution — insumo da predição por dimensão.
 * Retorna { [modulo_nome]: [{x, y}, ...] } com x = índice cronológico do bucket.
 */
export function computeDimensionTemporalSeries({ filteredInspections, filteredResponses, itemById }, period) {
  if (filteredInspections.length === 0) return {};
  const dates = filteredInspections.map((i) => parseISO(i.inspection_date)).filter((d) => !Number.isNaN(d.getTime()));
  if (!dates.length) return {};
  const min = new Date(Math.min(...dates)), max = new Date(Math.max(...dates));
  const spanDays = Math.max(1, differenceInCalendarDays(max, min));
  const granularidade = pickBucketGranularity(period, spanDays);

  const inspToBucket = new Map();
  const bucketKeys = new Set();
  for (const i of filteredInspections) {
    if (!i.inspection_date) continue;
    const { key } = bucketKeyAndLabel(i.inspection_date, granularidade);
    inspToBucket.set(i.id, key);
    bucketKeys.add(key);
  }
  const orderedKeys = [...bucketKeys].sort();
  const bucketIndex = new Map(orderedKeys.map((k, i) => [k, i]));

  const nameByModulo = new Map();
  for (const it of itemById.values()) if (!nameByModulo.has(it.modulo)) nameByModulo.set(it.modulo, it.modulo_nome);

  // acc: dimensao -> bucketKey -> {conforme, naoConforme}
  const acc = new Map();
  for (const r of filteredResponses) {
    if (!isConclusiva(r.resposta) || r.modulo == null) continue;
    const dim = nameByModulo.get(r.modulo);
    if (!dim) continue;
    const bKey = inspToBucket.get(r.inspection_id);
    if (!bKey) continue;
    if (!acc.has(dim)) acc.set(dim, new Map());
    const byBucket = acc.get(dim);
    const e = byBucket.get(bKey) || { conforme: 0, naoConforme: 0 };
    if (r.resposta === "conforme") e.conforme++; else e.naoConforme++;
    byBucket.set(bKey, e);
  }

  const out = {};
  for (const [dim, byBucket] of acc) {
    out[dim] = orderedKeys.map((key) => {
      const e = byBucket.get(key);
      if (!e) return { x: bucketIndex.get(key), y: null };
      const aplicaveis = e.conforme + e.naoConforme;
      return { x: bucketIndex.get(key), y: aplicaveis ? (100 * e.conforme) / aplicaveis : null };
    });
  }
  return out;
}

/** Inspeções aplicáveis (conforme ou não_conforme) de um requisito num quadro específico — usado na taxa de recorrência. */
export function countApplicableForRequisito({ filteredResponses }, panelId, codigo) {
  let n = 0;
  for (const r of filteredResponses) {
    if (r.panel_id !== panelId) continue;
    if ((r.codigo || r.titulo) !== codigo) continue;
    if (isConclusiva(r.resposta)) n++;
  }
  return n;
}

/**
 * Diagnóstico dos dados — frases geradas a partir dos cálculos acima, sem
 * atribuir causas. Cada frase carrega o indicador que a sustenta.
 */
export function computeDiagnostics({ dimensions, pareto, byLocalidade, recurrence, temporal }) {
  const achados = [];

  const dimsComNc = dimensions.filter((d) => d.naoConforme > 0).sort((a, b) => b.naoConforme - a.naoConforme);
  if (dimsComNc.length) {
    const top = dimsComNc.slice(0, 3).map((d) => d.dimensao).join(", ");
    achados.push({
      tipo: "concentracao_dimensao",
      texto: `Os dados do período analisado mostram maior concentração de não conformidades ${dimsComNc.length > 1 ? "nas dimensões" : "na dimensão"} ${top}.`,
      indicador: dimsComNc.slice(0, 3),
    });
  }

  if (pareto.itens.length) {
    const top = pareto.itens[0];
    achados.push({
      tipo: "requisito_concentrador",
      texto: `O requisito ${top.codigo || top.titulo} concentra o maior número de ocorrências de não conformidade no período analisado (${top.n} ocorrência(s), ${top.percentual.toFixed(1)}% do total).`,
      indicador: top,
    });
  }

  const locsComTaxa = byLocalidade.filter((l) => l.taxaNaoConformidade != null && l.naoConformidades > 0)
    .sort((a, b) => b.taxaNaoConformidade - a.taxaNaoConformidade);
  if (locsComTaxa.length) {
    const top = locsComTaxa[0];
    achados.push({
      tipo: "localidade_taxa",
      texto: `A localidade ${top.localidade} apresenta a maior taxa relativa de não conformidade no período (${top.taxaNaoConformidade.toFixed(1)}%), considerando as respostas aplicáveis.`,
      indicador: top,
    });
  }

  if (recurrence.casos.length) {
    const top = recurrence.casos[0];
    achados.push({
      tipo: "recorrencia",
      texto: `O requisito ${top.codigo || top.titulo} apresentou recorrência em ${top.ocorrencias} inspeções diferentes do quadro ${top.panelTag}.`,
      indicador: top,
    });
  }

  if (temporal.pontos.length >= 2) {
    const first = temporal.pontos[0], last = temporal.pontos[temporal.pontos.length - 1];
    if (first.taxaConformidade != null && last.taxaConformidade != null) {
      const delta = last.taxaConformidade - first.taxaConformidade;
      const direcao = delta > 1 ? "melhora" : delta < -1 ? "piora" : "estabilidade";
      achados.push({
        tipo: "evolucao",
        texto: direcao === "estabilidade"
          ? `A taxa de conformidade permaneceu estável entre ${first.label} (${first.taxaConformidade.toFixed(1)}%) e ${last.label} (${last.taxaConformidade.toFixed(1)}%).`
          : `A taxa de conformidade apresentou ${direcao} entre ${first.label} (${first.taxaConformidade.toFixed(1)}%) e ${last.label} (${last.taxaConformidade.toFixed(1)}%).`,
        indicador: { first, last, delta },
      });
    }
  }

  return achados;
}

/**
 * Insights Gerenciais: agrupa os achados já calculados em categorias
 * prontas para reunião de gestão. Nunca atribui causa — só reporta
 * associação/concentração, com o indicador que sustenta cada frase.
 */
export function buildManagerialInsights({ kpis, diagnostics, dimensions, pareto, byLocalidade, recurrence, predictive }) {
  const destaques = [];
  const pontosDeAtencao = [];
  const evolucao = [];
  const recorrencias = [];
  const concentracao = [];

  if (kpis.taxaConformidade != null) {
    destaques.push({
      titulo: "Taxa de conformidade geral",
      descricao: `${kpis.taxaConformidade.toFixed(1)}% das respostas aplicáveis no período foram "Conforme" (${kpis.conforme} de ${kpis.aplicaveis}).`,
      indicador: { taxaConformidade: kpis.taxaConformidade, conforme: kpis.conforme, aplicaveis: kpis.aplicaveis },
    });
  }
  destaques.push({
    titulo: "Cobertura de inspeção",
    descricao: `${kpis.inspecoesRealizadas} inspeção(ões) realizada(s) em ${kpis.quadrosInspecionados} quadro(s) distinto(s) no período analisado.`,
    indicador: { inspecoes: kpis.inspecoesRealizadas, quadros: kpis.quadrosInspecionados },
  });

  const piores = dimensions.filter((d) => d.percentual != null).sort((a, b) => a.percentual - b.percentual).slice(0, 2);
  for (const d of piores) {
    if (d.percentual >= 90) continue; // não sinalizar dimensão já bem avaliada como ponto de atenção
    pontosDeAtencao.push({
      titulo: `Dimensão ${d.dimensao}`,
      descricao: `Taxa de conformidade de ${d.percentual.toFixed(1)}% (${d.conforme} de ${d.aplicaveis} respostas aplicáveis).`,
      indicador: d,
    });
  }

  const evoAchado = diagnostics.find((a) => a.tipo === "evolucao");
  if (evoAchado) evolucao.push({ titulo: "Evolução da conformidade", descricao: evoAchado.texto, indicador: evoAchado.indicador });
  if (predictive && !predictive.conformityProjection?.insuficiente) {
    const t = predictive.conformityProjection.tendencia;
    evolucao.push({
      titulo: "Tendência projetada",
      descricao: `Com base na regressão linear sobre o histórico do período, a tendência estimada da taxa de conformidade é de ${t}.`,
      indicador: { tendencia: t, inclinacao: predictive.conformityProjection.inclinacaoPontosPorBucket },
    });
  }

  for (const c of (recurrence.casos || []).slice(0, 3)) {
    recorrencias.push({
      titulo: `${c.codigo || c.titulo} — quadro ${c.panelTag}`,
      descricao: `Reincidente em ${c.ocorrencias} inspeções diferentes deste quadro. Última ocorrência: ${c.ultimaOcorrencia || "—"}.`,
      indicador: c,
    });
  }

  if (pareto.itens.length) {
    const top = pareto.itens[0];
    concentracao.push({
      titulo: "Requisito com mais ocorrências",
      descricao: `${top.codigo || top.titulo} responde por ${top.percentual.toFixed(1)}% das não conformidades do período (${top.n} ocorrência(s)).`,
      indicador: top,
    });
  }
  const locTop = byLocalidade.filter((l) => l.taxaNaoConformidade != null && l.naoConformidades > 0)
    .sort((a, b) => b.taxaNaoConformidade - a.taxaNaoConformidade)[0];
  if (locTop) {
    concentracao.push({
      titulo: "Localidade com maior taxa relativa",
      descricao: `${locTop.localidade}: ${locTop.taxaNaoConformidade.toFixed(1)}% de não conformidade sobre as respostas aplicáveis (${locTop.naoConformidades} ocorrência(s) em ${locTop.inspecoes} inspeção(ões)).`,
      indicador: locTop,
    });
  }

  return { destaques, pontosDeAtencao, evolucao, recorrencias, concentracao };
}
