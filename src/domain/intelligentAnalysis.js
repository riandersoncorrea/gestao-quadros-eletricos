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
// 3. Reincidência = o mesmo requisito (template_item_id/código) com NC
//    aberta (ver regra 6) em 2 OU MAIS inspeções DIFERENTES do MESMO
//    quadro. Duas NCs de requisitos diferentes, ou a mesma NC contada duas
//    vezes dentro da mesma inspeção, NÃO configuram reincidência.
// 4. Pareto das não conformidades = contagem de NCs abertas (ver regra 6)
//    por requisito (código), ordenada decrescente, com percentual
//    acumulado sobre o total de NCs do recorte filtrado.
// 5. Correlação (Índice de Saúde × Conformidade) = coeficiente de Pearson
//    entre a taxa de conformidade de cada inspeção e seu
//    health_index_resultado. Só é calculada com dados suficientes (ver
//    MIN_CORRELATION_POINTS) e é sempre apresentada como "correlação
//    observada", nunca como causalidade.
// 6. DUAS MÉTRICAS DISTINTAS, NUNCA MISTURADAS (ver diagnóstico da tarefa
//    "refine intelligent analysis and report"):
//    A) NÃO CONFORMIDADES DO PROCESSO — tabela `nonconformities`, sujeitas
//       ao ciclo de vida da NC (aberta/em_tratamento/concluída/cancelada).
//       "Quantidade de NCs" em QUALQUER lugar desta página (KPI, Pareto,
//       reincidência, evolução temporal, NC por localidade, ranking de
//       quadros) SEMPRE conta NCs com isOpenNonconformity(status) === true
//       — a MESMA regra usada pelo Dashboard (src/services/
//       dashboardService.js), reaproveitada de
//       src/domain/nonconformityRules.js. Nunca uma segunda definição de
//       "NC aberta".
//    B) RESULTADO DAS RESPOSTAS DO CHECKLIST — tabela `inspection_responses`,
//       sem ciclo de vida (uma resposta não "fecha"). Usada só para "Taxa
//       de conformidade" e "Conformidade por Dimensão" — não tem
//       equivalente no Dashboard, então continua definida a partir das
//       respostas, como sempre foi.
// ============================================================================

import { format, parseISO, differenceInCalendarDays, startOfWeek, startOfMonth } from "date-fns";
import { isOpenNonconformity } from "@/domain/nonconformityRules";
import { isWithinRange, matchesLocalidade } from "@/domain/dashboardFilters";

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

/** Data no formato pt-BR (dd/MM/aaaa) para uso em textos analíticos: o restante da página (tabelas, modal) já usa esse mesmo formato. */
function fmtDateBR(iso) {
  if (!iso) return "-";
  try { return format(parseISO(iso), "dd/MM/yyyy"); } catch { return iso; }
}

// Preposição + artigo corretos para as localidades reais do sistema ("no
// Porto", "na Oficina"), em vez do "em X" genérico — pedido de ajuste de
// texto. Qualquer localidade fora dessa lista cai no "em X" neutro, sem
// travar caso o cadastro de localidades mude no futuro.
const LOCALIDADE_PREPOSICAO = { Porto: "no Porto", Oficina: "na Oficina" };
function emLocalidade(nome) {
  return LOCALIDADE_PREPOSICAO[nome] || `em ${nome}`;
}

/**
 * "CÓDIGO: descrição do requisito", sempre que ambos estiverem disponíveis
 * (a descrição vem do catálogo ativo, já resolvida em `titulo` por
 * filterAnalysisData, nunca hardcodada aqui). Usada em todo texto
 * analítico que cita um requisito do checklist, para nunca expor um código
 * "PRO-01" sozinho quando a descrição já está disponível nos dados. Usa
 * dois-pontos como separador (não travessão), padronizado em toda a
 * página conforme pedido de ajuste de texto.
 */
export function describeRequisito(codigo, titulo) {
  if (codigo && titulo) return `${codigo}: ${titulo}`;
  return codigo || titulo || "requisito sem identificação";
}

/**
 * Mesma resolução código → descrição de `describeRequisito`, mas no formato
 * para uso dentro de frases corridas ("o requisito PRO-01, referente a
 * X, concentra..."), em vez do rótulo compacto "PRO-01: X" usado em
 * tabelas/badges. Evita encadear código, descrição e número como se fosse
 * uma frase só (Etapa 10/11 do pedido de refinamento de textos).
 */
export function requisitoFrase(codigo, titulo) {
  if (codigo && titulo) return `${codigo}, referente a ${titulo},`;
  if (codigo) return codigo;
  if (titulo) return titulo;
  return "não identificado";
}

// Texto padrão para gráficos/indicadores com dados de sobra insuficientes
// para um padrão confiável (Etapa 13 do pedido) — nunca inventamos um
// insight quando a amostra não sustenta uma leitura.
const SEM_PADRAO_TEXT = "Não há dados suficientes no período selecionado para identificar um padrão consistente.";

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
  const { panels, hierarchy, inspections, responses, templateItems, nonconformities = [] } = raw;
  const { localidadeId = "all", dateRange = null, panelId = "all", status = "all" } = filters || {};

  const locName = new Map((hierarchy?.localidades || []).map((l) => [l.id, l.nome]));
  const panelById = new Map(panels.map((p) => [p.id, p]));
  const panelLocMap = new Map(panels.map((p) => [p.id, p.localidade_id]));
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
  // Mapa de TODAS as inspeções (não só as filtradas) — usado para resolver
  // a data/resultado da inspeção de uma NC mesmo quando a NC passa no
  // filtro mas a inspeção de origem, por algum motivo, não (ex.: NC aberta
  // manualmente, sem inspeção associada).
  const allInspectionById = new Map(inspections.map((i) => [i.id, i]));
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

  // --- Não conformidades do PROCESSO (tabela nonconformities) ---------------
  // Mesma regra de "NC aberta" do Dashboard (isOpenNonconformity) e mesmo
  // recorte de período (isWithinRange sobre created_at, não sobre a data da
  // inspeção) — ver regra 6 no cabeçalho deste arquivo. Reaproveita
  // matchesLocalidade (dashboardFilters.js), a mesma função usada pelo
  // Dashboard para recortar NCs por localidade via panel_id.
  const filteredNCs = nonconformities
    .filter((nc) => isOpenNonconformity(nc.status))
    .filter((nc) => isWithinRange(nc.created_at, dateRange))
    .filter((nc) => localidadeId === "all" || matchesLocalidade(nc.panel_id, localidadeId, panelLocMap))
    .filter((nc) => panelId === "all" || nc.panel_id === panelId)
    .filter((nc) => {
      if (status === "all") return true;
      // Filtro de "resultado da inspeção" só faz sentido para NCs nascidas
      // de uma inspeção — uma NC manual (sem inspection_id) não tem
      // overall_result para comparar, então não passa quando esse filtro
      // está ativo (mesmo raciocínio de "não inventar relação" do pedido).
      const insp = nc.inspection_id ? allInspectionById.get(nc.inspection_id) : null;
      return insp?.overall_result === status;
    })
    .map((nc) => {
      const item = itemById.get(nc.template_item_id);
      return {
        ...nc,
        codigo: item?.codigo ?? null,
        titulo: item?.titulo ?? nc.descricao ?? null,
        modulo: item?.modulo ?? null,
        modulo_nome: item?.modulo_nome ?? nc.categoria ?? null,
      };
    });

  return {
    filteredInspections, filteredResponses: enrichedResponses, filteredNCs,
    panelById, panelLocMap, locName, itemById, inspectionById, allInspectionById,
  };
}

/**
 * Quantidade de inspeções realizadas por localidade, no recorte filtrado.
 * Genérico (todas as localidades presentes nos dados) — a Visão Executiva
 * escolhe quais localidades exibir como KPI individual (ver
 * src/pages/IntelligentAnalysis.jsx), sem hardcodar nomes aqui.
 */
export function computeInspecoesPorLocalidade({ filteredInspections, panelById, locName }) {
  const porLocalidade = new Map(); // localidadeNome -> count
  for (const i of filteredInspections) {
    const panel = panelById.get(resolvePanelId(i));
    const nome = panel?.localidade_id ? (locName.get(panel.localidade_id) || "Sem nome") : "Sem localidade";
    porLocalidade.set(nome, (porLocalidade.get(nome) || 0) + 1);
  }
  return [...porLocalidade.entries()].map(([localidade, inspecoes]) => ({ localidade, inspecoes }));
}

/** Visão Executiva (KPIs do topo da página). */
export function computeExecutiveKpis({ filteredInspections, filteredResponses, filteredNCs, panelById, locName }) {
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

  // Taxa de NC = NCs abertas / inspeções realizadas (Etapa 6.7 do pedido) —
  // uma NC por inspeção, não por resposta; ver regra 6 no cabeçalho.
  const taxaNcPorInspecao = inspecoesRealizadas ? (100 * filteredNCs.length) / inspecoesRealizadas : null;

  return {
    quadrosInspecionados,
    inspecoesRealizadas,
    conforme, naoConforme, naoAplicavel, naoVerificado,
    aplicaveis,
    taxaConformidade,
    naoConformidades: filteredNCs.length,
    taxaNcPorInspecao,
    indiceSaudeMedio,
    inspecoesPorLocalidade: computeInspecoesPorLocalidade({ filteredInspections, panelById, locName }),
  };
}

/** Análise descritiva: contagens e distribuições diretas dos dados filtrados. */
export function computeDescriptive({ filteredInspections, filteredNCs, panelById, locName }, kpis) {
  const porStatus = new Map();
  for (const i of filteredInspections) {
    const k = i.overall_result || "sem_resultado";
    porStatus.set(k, (porStatus.get(k) || 0) + 1);
  }

  const porLocalidade = new Map();
  const quadrosPorLocalidade = new Map(); // locNome -> Set(panelId) — cobertura, não volume de inspeções
  for (const i of filteredInspections) {
    const pid = resolvePanelId(i);
    const panel = panelById.get(pid);
    const locId = panel?.localidade_id || null;
    const nome = locId ? (locName.get(locId) || "Sem nome") : "Sem localidade";
    porLocalidade.set(nome, (porLocalidade.get(nome) || 0) + 1);
    if (!quadrosPorLocalidade.has(nome)) quadrosPorLocalidade.set(nome, new Set());
    quadrosPorLocalidade.get(nome).add(pid);
  }

  // Onde estão as NCs (tabela nonconformities, não respostas — ver regra 6).
  const dimNc = new Map();
  const perguntaNc = new Map(); // codigo -> { codigo, titulo, n }
  for (const nc of filteredNCs) {
    const dim = nc.modulo_nome || "Sem dimensão";
    dimNc.set(dim, (dimNc.get(dim) || 0) + 1);
    const key = nc.codigo || nc.titulo || nc.id;
    if (!perguntaNc.has(key)) perguntaNc.set(key, { codigo: nc.codigo, titulo: nc.titulo, n: 0 });
    perguntaNc.get(key).n += 1;
  }

  const resumo = {
    inspecoes: filteredInspections.length,
    quadros: kpis.quadrosInspecionados,
    conforme: kpis.conforme,
    naoConforme: kpis.naoConforme,
    naoAplicavel: kpis.naoAplicavel,
    naoVerificado: kpis.naoVerificado,
    taxaConformidade: kpis.taxaConformidade,
  };
  const dimensoesComMaisOcorrencias = [...dimNc.entries()].map(([dimensao, n]) => ({ dimensao, n })).sort((a, b) => b.n - a.n);
  const perguntasComMaisNc = [...perguntaNc.values()].sort((a, b) => b.n - a.n);
  const distribuicaoPorStatus = [...porStatus.entries()].map(([status, n]) => ({ status, n }));
  const distribuicaoPorLocalidade = [...porLocalidade.entries()].map(([localidade, n]) => ({ localidade, n })).sort((a, b) => b.n - a.n);
  const quadrosPorLocalidadeMap = new Map([...quadrosPorLocalidade.entries()].map(([loc, set]) => [loc, set.size]));

  return {
    resumo,
    dimensoesComMaisOcorrencias,
    perguntasComMaisNc,
    distribuicaoPorStatus,
    distribuicaoPorLocalidade,
    narrativas: buildDescriptiveNarratives({ resumo, kpis, dimensoesComMaisOcorrencias, perguntasComMaisNc, distribuicaoPorStatus, quadrosPorLocalidadeMap }),
  };
}

const STATUS_LABEL = {
  aprovado: "aprovada(s)",
  aprovado_ressalvas: "aprovada(s) com ressalvas",
  reprovado: "reprovada(s)",
  sem_resultado: "sem resultado registrado",
};

/**
 * Cartões narrativos da "Análise Descritiva" (Etapa 3/4 do pedido de
 * refinamento visual) — interpretação em linguagem natural, sempre derivada
 * das MESMAS estruturas já calculadas acima (resumo/kpis/dimensões/
 * perguntas), nunca uma segunda fonte de dados. Cada cartão traz um resumo
 * de uma linha e uma interpretação mais detalhada, no formato pedido
 * ("X concentra A, enquanto Y registra B, uma diferença de C").
 */
function buildDescriptiveNarratives({ resumo, kpis, dimensoesComMaisOcorrencias, perguntasComMaisNc, distribuicaoPorStatus, quadrosPorLocalidadeMap }) {
  const cards = [];

  // 1. Volume e cobertura ---------------------------------------------------
  {
    const statusTxt = distribuicaoPorStatus.length
      ? distribuicaoPorStatus.map((s) => `${s.n} ${STATUS_LABEL[s.status] || s.status.replace(/_/g, " ")}`).join(", ")
      : null;
    const mediaPorQuadro = resumo.quadros ? resumo.inspecoes / resumo.quadros : null;
    let interpretacao = statusTxt
      ? `Considerando o resultado geral de cada inspeção, o recorte se divide em ${statusTxt}.`
      : "Não há inspeções com resultado geral registrado no período selecionado.";
    if (mediaPorQuadro != null && resumo.quadros > 0) {
      interpretacao += mediaPorQuadro > 1.15
        ? ` Em média, cada quadro foi inspecionado ${mediaPorQuadro.toFixed(1)} vezes no período, o que sugere que parte dos quadros recebeu mais de uma visita.`
        : ` A relação entre inspeções e quadros distintos (${mediaPorQuadro.toFixed(1)} por quadro) indica que a maior parte dos quadros foi visitada uma única vez no recorte.`;
    }
    cards.push({
      chave: "volume",
      titulo: "Volume e Cobertura",
      icone: "ClipboardCheck",
      resumo: `Foram realizadas ${resumo.inspecoes} inspeção(ões) em ${resumo.quadros} quadro(s) distinto(s) no período analisado.`,
      interpretacao,
      indicadores: [
        { label: "Inspeções", value: resumo.inspecoes },
        { label: "Quadros distintos", value: resumo.quadros },
      ],
    });
  }

  // 2. Distribuição por localidade ------------------------------------------
  {
    const locs = [...(kpis.inspecoesPorLocalidade || [])].sort((a, b) => b.inspecoes - a.inspecoes);
    if (locs.length >= 2) {
      const top = locs[0], bottom = locs[locs.length - 1];
      const pctTop = kpis.inspecoesRealizadas ? (100 * top.inspecoes) / kpis.inspecoesRealizadas : null;
      const diff = top.inspecoes - bottom.inspecoes;
      const quadrosTop = quadrosPorLocalidadeMap?.get(top.localidade);
      const quadrosBottom = quadrosPorLocalidadeMap?.get(bottom.localidade);
      let interpretacao = `${top.localidade} concentra ${top.inspecoes} inspeção(ões), enquanto ${bottom.localidade} registra ${bottom.inspecoes}, uma diferença de ${diff} inspeção(ões) entre as duas localidades.`;
      if (quadrosTop != null && quadrosBottom != null) {
        interpretacao += quadrosTop !== quadrosBottom
          ? ` Essa concentração deve ser lida junto à quantidade de quadros existentes em cada localidade: ${top.localidade} tem ${quadrosTop} quadro(s) distinto(s) inspecionado(s) no recorte, contra ${quadrosBottom} ${emLocalidade(bottom.localidade)}, então um volume maior de inspeções não significa necessariamente uma cobertura proporcionalmente maior.`
          : ` As duas localidades têm a mesma quantidade de quadros distintos inspecionados (${quadrosTop}), o que reforça que a diferença de volume reflete mais frequência de visitas do que diferença de tamanho do parque.`;
      }
      cards.push({
        chave: "localidades",
        titulo: "Distribuição por Localidade",
        icone: "MapPin",
        resumo: `As inspeções do período estão concentradas principalmente ${emLocalidade(top.localidade)}${pctTop != null ? `, que representa ${pctTop.toFixed(1)}% do total analisado` : ""}.`,
        interpretacao,
        indicadores: locs.slice(0, 4).map((l) => ({ label: l.localidade, value: l.inspecoes })),
      });
    } else if (locs.length === 1) {
      cards.push({
        chave: "localidades",
        titulo: "Distribuição por Localidade",
        icone: "MapPin",
        resumo: `${locs[0].localidade} concentra todas as ${locs[0].inspecoes} inspeção(ões) do período.`,
        interpretacao: "Não há outra localidade com inspeções no recorte selecionado, então não é possível traçar uma comparação neste momento.",
        indicadores: [{ label: locs[0].localidade, value: locs[0].inspecoes }],
      });
    }
  }

  // 3. Conformidade das respostas -------------------------------------------
  if (kpis.aplicaveis > 0) {
    const inconclusivas = kpis.naoAplicavel + kpis.naoVerificado;
    let interpretacao = `Entre as respostas aplicáveis, ${kpis.naoConforme} foram registradas como não conforme.`;
    if (inconclusivas > 0) {
      interpretacao += ` Além dessas, ${kpis.naoAplicavel} resposta(s) ficaram como não aplicável${kpis.naoVerificado ? ` e ${kpis.naoVerificado} como não verificada` : ""}, itens que não entram no cálculo da taxa de conformidade por não serem conclusivos.`;
    }
    interpretacao += kpis.taxaConformidade >= 90
      ? " No geral, o nível de conformidade do período é considerado bom."
      : kpis.taxaConformidade >= 70
        ? " O nível de conformidade está na faixa de atenção, com espaço para melhoria."
        : " O nível de conformidade está abaixo do esperado e merece atenção prioritária.";
    cards.push({
      chave: "conformidade",
      titulo: "Conformidade das Respostas",
      icone: "Target",
      resumo: `${kpis.taxaConformidade.toFixed(1)}% das respostas aplicáveis do período foram registradas como conforme, num total de ${kpis.conforme} de ${kpis.aplicaveis} respostas.`,
      interpretacao,
      indicadores: [
        { label: "Conforme", value: kpis.conforme },
        { label: "Não conforme", value: kpis.naoConforme },
        { label: "N/A", value: kpis.naoAplicavel },
      ],
    });
  } else {
    cards.push({
      chave: "conformidade",
      titulo: "Conformidade das Respostas",
      icone: "Target",
      resumo: "Não há respostas conforme ou não conforme registradas no período selecionado.",
      interpretacao: SEM_PADRAO_TEXT,
      indicadores: [],
    });
  }

  // 4. Concentração de não conformidades -------------------------------------
  if (perguntasComMaisNc.length) {
    const top = perguntasComMaisNc[0];
    const totalNc = perguntasComMaisNc.reduce((s, p) => s + p.n, 0);
    const pctTop = totalNc ? (100 * top.n) / totalNc : null;
    const topDim = dimensoesComMaisOcorrencias[0];
    let interpretacao = `O requisito ${requisitoFrase(top.codigo, top.titulo)} concentra ${top.n} ocorrência(s) entre as não conformidades analisadas${pctTop != null ? `, o equivalente a ${pctTop.toFixed(1)}% do total` : ""}.`;
    if (topDim) {
      interpretacao += ` Olhando por dimensão do checklist, ${topDim.dimensao} é a que mais concentra ocorrências no período, com ${topDim.n} registro(s), o que ajuda a direcionar onde a atenção da equipe pode ter mais impacto.`;
    }
    cards.push({
      chave: "concentracao_nc",
      titulo: "Concentração de Não Conformidades",
      icone: "AlertTriangle",
      resumo: `${describeRequisito(top.codigo, top.titulo)} é o requisito com mais ocorrências entre as NCs abertas do período.`,
      interpretacao,
      indicadores: [
        { label: "Requisito líder", value: top.codigo || "-" },
        { label: "Ocorrências", value: top.n },
      ],
    });
  } else {
    cards.push({
      chave: "concentracao_nc",
      titulo: "Concentração de Não Conformidades",
      icone: "AlertTriangle",
      resumo: "Nenhuma não conformidade aberta foi identificada no período selecionado.",
      interpretacao: "Sem NCs abertas no recorte, não há concentração por requisito ou dimensão a reportar neste momento.",
      indicadores: [],
    });
  }

  return cards;
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

/**
 * Pareto das não conformidades por requisito (fonte: tabela
 * `nonconformities`, NCs abertas — ver regra 6). `limit` corta o gráfico
 * (não os dados) para manter legibilidade. Requisitos sempre identificados
 * pelo código do checklist (ex.: PRO-01) quando a NC tem template_item_id;
 * "Sem código" só para NCs manuais, sem origem no checklist.
 */
export function computeParetoNaoConformidades({ filteredNCs }, limit = 15) {
  const acc = new Map(); // key -> {codigo, titulo, n}
  for (const nc of filteredNCs) {
    const key = nc.codigo || nc.titulo || "sem-codigo";
    if (!acc.has(key)) acc.set(key, { codigo: nc.codigo, titulo: nc.titulo || "Sem código (NC manual)", n: 0 });
    acc.get(key).n += 1;
  }
  const sorted = [...acc.values()].sort((a, b) => b.n - a.n);
  const total = sorted.reduce((s, x) => s + x.n, 0);
  let cum = 0;
  const withCumulative = sorted.map((x) => {
    cum += x.n;
    return { ...x, percentual: total ? (100 * x.n) / total : 0, percentualAcumulado: total ? (100 * cum) / total : 0 };
  });
  // Ponto aproximado de 80% (regra de Pareto): índice (1-based) do primeiro
  // requisito cujo percentual acumulado já atinge 80% do total de NCs.
  const idx80 = withCumulative.findIndex((x) => x.percentualAcumulado >= 80);
  return {
    itens: withCumulative.slice(0, limit),
    total: sorted.length,
    totalOcorrencias: total,
    pontos80: idx80 === -1 ? null : idx80 + 1,
  };
}

/**
 * Não conformidades por localidade — volume (tabela `nonconformities`,
 * NCs abertas — ver regra 6) e taxa relativa = NCs abertas / inspeções
 * realizadas naquela localidade (não NCs/respostas — evita misturar
 * contagem de tickets com contagem de respostas de checklist).
 */
export function computeByLocalidade({ filteredInspections, filteredNCs, panelById, locName }) {
  const inspByLoc = new Map(); // locNome -> Set(inspection ids)
  for (const i of filteredInspections) {
    const panel = panelById.get(resolvePanelId(i));
    const nome = panel?.localidade_id ? (locName.get(panel.localidade_id) || "Sem nome") : "Sem localidade";
    if (!inspByLoc.has(nome)) inspByLoc.set(nome, new Set());
    inspByLoc.get(nome).add(i.id);
  }

  const ncByLoc = new Map(); // locNome -> count
  for (const nc of filteredNCs) {
    const panel = panelById.get(nc.panel_id);
    const nome = panel?.localidade_id ? (locName.get(panel.localidade_id) || "Sem nome") : "Sem localidade";
    ncByLoc.set(nome, (ncByLoc.get(nome) || 0) + 1);
  }
  // Localidades que só aparecem via NC (ex.: NC manual num quadro sem
  // inspeção no recorte) também entram no resultado, com 0 inspeção.
  for (const nome of ncByLoc.keys()) if (!inspByLoc.has(nome)) inspByLoc.set(nome, new Set());

  return [...inspByLoc.entries()]
    .map(([localidade, ids]) => {
      const naoConformidades = ncByLoc.get(localidade) || 0;
      return {
        localidade,
        inspecoes: ids.size,
        naoConformidades,
        taxaNaoConformidade: ids.size ? (100 * naoConformidades) / ids.size : null,
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

/**
 * Evolução temporal da conformidade (checklist, regra B), inspeções e NCs
 * abertas (tabela `nonconformities`, regra A), no grão adequado ao
 * período/dados. A conformidade é bucketizada pela data da inspeção; as
 * NCs são bucketizadas pela própria data de abertura (created_at) — podem
 * cair num bucket sem nenhuma inspeção no recorte (ex.: inspeção
 * retroativa) e, nesse caso, o bucket é criado mesmo assim, para não
 * perder a NC da contagem.
 */
export function computeTemporalEvolution({ filteredInspections, filteredResponses, filteredNCs }, period) {
  if (filteredInspections.length === 0) return { granularidade: null, pontos: [] };

  const dates = filteredInspections.map((i) => parseISO(i.inspection_date)).filter((d) => !Number.isNaN(d.getTime()));
  const min = new Date(Math.min(...dates)), max = new Date(Math.max(...dates));
  const spanDays = Math.max(1, differenceInCalendarDays(max, min));
  const granularidade = pickBucketGranularity(period, spanDays);

  const inspToBucket = new Map();
  const buckets = new Map(); // key -> {label, inspecoes:Set, conforme, naoConforme, naoConformidades}
  for (const i of filteredInspections) {
    if (!i.inspection_date) continue;
    const { key, label } = bucketKeyAndLabel(i.inspection_date, granularidade);
    inspToBucket.set(i.id, key);
    if (!buckets.has(key)) buckets.set(key, { key, label, inspecoes: new Set(), conforme: 0, naoConforme: 0, naoConformidades: 0 });
    buckets.get(key).inspecoes.add(i.id);
  }
  for (const r of filteredResponses) {
    if (!isConclusiva(r.resposta)) continue;
    const key = inspToBucket.get(r.inspection_id);
    if (!key) continue;
    const b = buckets.get(key);
    if (r.resposta === "conforme") b.conforme++; else b.naoConforme++;
  }
  for (const nc of filteredNCs) {
    if (!nc.created_at) continue;
    const { key, label } = bucketKeyAndLabel(nc.created_at, granularidade);
    if (!buckets.has(key)) buckets.set(key, { key, label, inspecoes: new Set(), conforme: 0, naoConforme: 0, naoConformidades: 0 });
    buckets.get(key).naoConformidades += 1;
  }

  const pontos = [...buckets.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((b) => {
      const aplicaveis = b.conforme + b.naoConforme;
      return {
        key: b.key,
        label: b.label,
        inspecoes: b.inspecoes.size,
        naoConformidades: b.naoConformidades,
        taxaConformidade: aplicaveis ? (100 * b.conforme) / aplicaveis : null,
      };
    });

  return { granularidade, pontos };
}

/**
 * Reincidência: mesmo requisito (código) com NC ABERTA (tabela
 * `nonconformities`, regra A — não resposta de checklist) em >=2 inspeções
 * DIFERENTES do mesmo quadro (RECURRENCE_MIN_OCCURRENCES). Duas NCs de
 * requisitos diferentes no mesmo quadro, ou duas NCs da mesma inspeção,
 * não contam como reincidência — o agrupamento é sempre por
 * (quadro, requisito) e a contagem é de inspeções distintas
 * (`nc.inspection_id`), nunca de linhas de NC.
 * NCs manuais (sem inspection_id/template_item_id) não entram: não há
 * como cruzá-las com "requisito" nem "inspeção diferente" sem inventar
 * uma relação que os dados não sustentam.
 */
export function computeRecurrence({ filteredNCs, panelById, allInspectionById }) {
  // group by (panel, codigo) -> Map(inspection_id -> data) para não contar
  // duas NCs da mesma inspeção como duas ocorrências.
  const groups = new Map();
  for (const nc of filteredNCs) {
    const codigo = nc.codigo;
    if (!codigo || !nc.panel_id || !nc.inspection_id) continue;
    const key = `${nc.panel_id}::${codigo}`;
    if (!groups.has(key)) {
      groups.set(key, { panelId: nc.panel_id, codigo, titulo: nc.titulo, inspections: new Map() });
    }
    const inspDate = allInspectionById.get(nc.inspection_id)?.inspection_date || null;
    groups.get(key).inspections.set(nc.inspection_id, inspDate);
  }

  const casos = [...groups.values()]
    .filter((g) => g.inspections.size >= RECURRENCE_MIN_OCCURRENCES)
    .map((g) => {
      const panel = panelById.get(g.panelId);
      const datas = [...g.inspections.values()].filter(Boolean).sort();
      return {
        panelId: g.panelId,
        panelTag: panel?.tag || "-",
        panelName: panel?.name || "-",
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

/**
 * Ranking de quadros por volume de NC abertas (tabela `nonconformities`,
 * regra A) no recorte filtrado — "quadros críticos" do diagnóstico e
 * fonte da lista de quadros do ícone de informações (Etapa 7/8 do pedido).
 * `limit` corta a lista exibida, não os dados agregados.
 */
export function computeRankingQuadros({ filteredNCs, panelById, locName }, limit = 10) {
  const acc = new Map(); // panelId -> count
  for (const nc of filteredNCs) {
    if (!nc.panel_id) continue;
    acc.set(nc.panel_id, (acc.get(nc.panel_id) || 0) + 1);
  }
  const ranked = [...acc.entries()]
    .map(([panelId, naoConformidades]) => {
      const panel = panelById.get(panelId);
      const localidade = panel?.localidade_id ? (locName.get(panel.localidade_id) || "Sem nome") : "Sem localidade";
      return {
        panelId,
        panelTag: panel?.tag || "-",
        panelName: panel?.name || "-",
        localidade,
        naoConformidades,
      };
    })
    .sort((a, b) => b.naoConformidades - a.naoConformidades);
  return { itens: ranked.slice(0, limit), total: ranked.length };
}

// Códigos do checklist associados à condição de risco de interdição (Etapa
// "add interdiction risk indicator" do pedido) — DR (PRO-01) e condutor de
// proteção/PE (ATR-01). Só os CÓDIGOS ficam fixos aqui; a descrição de
// cada um vem sempre do catálogo ativo (itemById), nunca hardcoded.
export const INTERDICTION_RISK_CODES = ["PRO-01", "ATR-01"];

/**
 * Indicador de risco de interdição: quadros com NC aberta (mesma regra A
 * do cabeçalho — isOpenNonconformity, já aplicada em `filteredNCs`) num
 * dos requisitos críticos de segurança acima. Não é uma segunda definição
 * de NC — reaproveita exatamente as mesmas NCs já usadas pelo resto da
 * Análise Inteligente e pelo Dashboard. Um quadro com as duas condições
 * conta uma única vez em `quadrosAfetados`; `condicoesCriticas` é a
 * contagem de ocorrências (uma por NC), propositalmente separada.
 */
export function computeInterdictionRisk({ filteredNCs, panelById, locName, allInspectionById, itemById }) {
  const itemByCodigo = new Map();
  for (const it of itemById.values()) {
    if (INTERDICTION_RISK_CODES.includes(it.codigo) && !itemByCodigo.has(it.codigo)) itemByCodigo.set(it.codigo, it);
  }
  const condicoesCatalogo = INTERDICTION_RISK_CODES.map((codigo) => {
    const titulo = itemByCodigo.get(codigo)?.titulo || null;
    return { codigo, titulo, label: describeRequisito(codigo, titulo) };
  });

  const ncsCriticas = filteredNCs.filter((nc) => INTERDICTION_RISK_CODES.includes(nc.codigo));

  const porQuadro = new Map(); // panelId -> { panelId, codigos:Set, ncs:[] }
  for (const nc of ncsCriticas) {
    if (!nc.panel_id) continue;
    if (!porQuadro.has(nc.panel_id)) porQuadro.set(nc.panel_id, { panelId: nc.panel_id, codigos: new Set(), ncs: [] });
    const g = porQuadro.get(nc.panel_id);
    g.codigos.add(nc.codigo);
    g.ncs.push(nc);
  }

  const quadros = [...porQuadro.values()]
    .map((g) => {
      const panel = panelById.get(g.panelId);
      const localidade = panel?.localidade_id ? (locName.get(panel.localidade_id) || "Sem nome") : "Sem localidade";
      const datas = g.ncs
        .map((nc) => (nc.inspection_id ? allInspectionById.get(nc.inspection_id)?.inspection_date : null) || nc.created_at)
        .filter(Boolean)
        .sort();
      return {
        panelId: g.panelId,
        panelTag: panel?.tag || "-",
        panelName: panel?.name || "-",
        localidade,
        condicoes: INTERDICTION_RISK_CODES.filter((c) => g.codigos.has(c)),
        // Rótulo compacto ("PRO-01 + ATR-01") para a tabela — a descrição
        // completa de cada código fica em `condicoesDescricao` (usada como
        // título/hover na UI), evitando código "pelado" sem contexto sem
        // sobrecarregar a linha da tabela (Etapa 7/13 do pedido).
        condicoesLabel: INTERDICTION_RISK_CODES.filter((c) => g.codigos.has(c)).join(" + "),
        condicoesDescricao: INTERDICTION_RISK_CODES.filter((c) => g.codigos.has(c))
          .map((c) => describeRequisito(c, itemByCodigo.get(c)?.titulo))
          .join("; "),
        ultimaOcorrencia: datas[datas.length - 1] || null,
        // "aberta" é o status mais urgente da NC (ver isOpenNonconformity) — se o
        // quadro tiver qualquer NC crítica ainda "aberta", ela prevalece sobre
        // uma eventual segunda condição já "em_tratamento".
        status: g.ncs.some((nc) => nc.status === "aberta") ? "aberta" : "em_tratamento",
        responsavel: panel?.responsible_engineer || null,
      };
    })
    .sort((a, b) => b.condicoes.length - a.condicoes.length || a.panelTag.localeCompare(b.panelTag));

  const porCondicao = condicoesCatalogo.map(({ codigo, titulo }) => {
    const doCodigo = ncsCriticas.filter((nc) => nc.codigo === codigo);
    return {
      codigo,
      titulo,
      ocorrencias: doCodigo.length,
      quadros: new Set(doCodigo.map((nc) => nc.panel_id)).size,
    };
  });

  // Cada localidade guarda tanto o total de OCORRÊNCIAS (uma por NC, pode
  // passar do número de quadros quando um quadro tem NC repetida do mesmo
  // código) quanto o total de QUADROS DISTINTOS afetados ali — os dois
  // números não precisam bater com "quadrosAfetados" do recorte inteiro
  // (que já deduplica entre localidades), então ambos ficam explícitos no
  // gráfico/tooltip para não parecer inconsistente com o KPI.
  const porLocalidadeMap = new Map(); // localidade -> { localidade, [codigo]: n, total, quadros:Set }
  for (const nc of ncsCriticas) {
    const panel = panelById.get(nc.panel_id);
    const localidade = panel?.localidade_id ? (locName.get(panel.localidade_id) || "Sem nome") : "Sem localidade";
    if (!porLocalidadeMap.has(localidade)) {
      const base = { localidade, total: 0, quadros: new Set() };
      for (const c of INTERDICTION_RISK_CODES) base[c] = 0;
      porLocalidadeMap.set(localidade, base);
    }
    const entry = porLocalidadeMap.get(localidade);
    entry[nc.codigo] = (entry[nc.codigo] || 0) + 1;
    entry.total += 1;
    if (nc.panel_id) entry.quadros.add(nc.panel_id);
  }
  const porLocalidade = [...porLocalidadeMap.values()]
    .map((entry) => ({ ...entry, quadros: entry.quadros.size }))
    .sort((a, b) => b.total - a.total);

  return {
    condicoesCatalogo,
    quadrosAfetados: porQuadro.size,
    condicoesCriticas: ncsCriticas.length,
    porCondicao,
    porLocalidade,
    quadros,
    leitura: buildInterdictionRiskReading({ quadrosAfetados: porQuadro.size, condicoesCriticas: ncsCriticas.length, porCondicao, porLocalidade, quadros }),
  };
}

/**
 * Texto analítico dinâmico do indicador de risco de interdição (Etapa 8 do
 * pedido) — sempre derivado dos mesmos números já calculados acima, nunca
 * um texto fixo. Proporcional à quantidade de dados: com poucos casos, o
 * texto fica mais simples.
 */
function buildInterdictionRiskReading({ quadrosAfetados, condicoesCriticas, porCondicao, porLocalidade, quadros }) {
  if (quadrosAfetados === 0) {
    return "Não há quadros com condição crítica associada a risco de interdição no período selecionado.";
  }

  const partes = [];
  partes.push(
    `${quadrosAfetados} quadro(s) apresentam pelo menos uma condição crítica associada a risco de interdição no período, somando ${condicoesCriticas} ocorrência(s) entre os dois requisitos monitorados.`
  );

  if (porLocalidade.length >= 2) {
    const top = porLocalidade[0];
    const pct = condicoesCriticas ? (100 * top.total) / condicoesCriticas : null;
    partes.push(
      `${top.localidade} concentra a maior parte dos casos${pct != null ? `, com ${pct.toFixed(1)}% do total` : ""}: ${top.total} ocorrência(s) em ${top.quadros} quadro(s) distinto(s).`
    );
  } else if (porLocalidade.length === 1) {
    partes.push(`Todos os casos identificados estão ${emLocalidade(porLocalidade[0].localidade)}.`);
  }

  const [pro01, atr01] = porCondicao;
  if (pro01 && atr01 && (pro01.ocorrencias || atr01.ocorrencias)) {
    if (pro01.ocorrencias === atr01.ocorrencias) {
      partes.push(`${describeRequisito(pro01.codigo, pro01.titulo)} e ${describeRequisito(atr01.codigo, atr01.titulo)} aparecem com a mesma frequência entre os casos identificados.`);
    } else {
      const maior = pro01.ocorrencias > atr01.ocorrencias ? pro01 : atr01;
      const menor = pro01.ocorrencias > atr01.ocorrencias ? atr01 : pro01;
      partes.push(
        `${describeRequisito(maior.codigo, maior.titulo)} responde pela maior parte das ocorrências, com ${maior.ocorrencias} registro(s)${menor.ocorrencias ? `, contra ${menor.ocorrencias} de ${menor.codigo}` : ""}.`
      );
    }
  }

  const multiCondicao = quadros.filter((q) => q.condicoes.length > 1).length;
  if (multiCondicao > 0) {
    partes.push(`${multiCondicao} quadro(s) apresentam as duas condições ao mesmo tempo, o que reforça a necessidade de atenção prioritária nesses pontos.`);
  }

  return partes.join(" ");
}

/**
 * Ficha-resumo de um quadro específico, montada só a partir dos dados já
 * carregados pela Análise Inteligente (raw + recorte filtrado) — nenhuma
 * consulta nova ao Supabase (Etapa 7/8 do pedido: "avaliar se é melhor
 * enriquecer o payload em lote" — aqui nem é preciso, tudo já está em
 * memória). `panel` vem de electrical_panels (fatos do quadro, não
 * filtrados: last_inspection_date/next_inspection_date são sempre os mais
 * recentes conhecidos); as contagens (inspeções/NCs) respeitam o recorte
 * filtrado atual, como o resto da página.
 */
export function computePanelSnapshot({ panelId, filteredInspections, filteredNCs, panelById, locName, recurrence }) {
  const panel = panelById.get(panelId);
  if (!panel) return null;

  const inspecoesDoQuadro = filteredInspections.filter((i) => resolvePanelId(i) === panelId);
  const ncsDoQuadro = filteredNCs.filter((nc) => nc.panel_id === panelId);
  const recorrenciasDoQuadro = (recurrence?.casos || []).filter((c) => c.panelId === panelId);

  const porCategoria = new Map();
  for (const nc of ncsDoQuadro) {
    const cat = nc.modulo_nome || "Sem categoria";
    porCategoria.set(cat, (porCategoria.get(cat) || 0) + 1);
  }
  const principaisCategorias = [...porCategoria.entries()]
    .map(([categoria, n]) => ({ categoria, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);

  return {
    panelId,
    tag: panel.tag || "-",
    nome: panel.name || "-",
    localidade: panel.localidade_id ? (locName.get(panel.localidade_id) || "-") : "-",
    status: panel.status || null,
    criticidade: panel.criticality || null,
    ultimaInspecao: panel.last_inspection_date || null,
    proximaInspecao: panel.next_inspection_date || null,
    inspecoesNoPeriodo: inspecoesDoQuadro.length,
    naoConformidadesNoPeriodo: ncsDoQuadro.length,
    recorrenciasNoPeriodo: recorrenciasDoQuadro,
    principaisCategorias,
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
      panelTag: panel?.tag || "-",
      panelName: panel?.name || "-",
      localidade: panel?.localidade_id ? (locName.get(panel.localidade_id) || "-") : "-",
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
 * Diagnóstico dos dados — organizado em categorias (Etapa 6 do pedido),
 * cada uma só aparece quando há evidência nos dados (nunca texto genérico
 * "de preenchimento" — ver Etapa 15/16). Cada achado carrega o indicador
 * numérico que o sustenta, nunca atribui causa, e sempre com linguagem do
 * tipo "os dados indicam/observa-se/há concentração de" quando a conclusão
 * não é diretamente demonstrável. Retorna { categorias, achados } —
 * `achados` é a mesma lista, achatada, mantida por compatibilidade com
 * buildManagerialInsights (que já consome esse formato).
 */
export function computeDiagnostics({ kpis, filteredInspections, dimensions, pareto, byLocalidade, recurrence, temporal, rankingQuadros }) {
  const categorias = [];
  const add = (chave, titulo, achadosDaCategoria) => {
    if (!achadosDaCategoria.length) return;
    categorias.push({ chave, titulo, achados: achadosDaCategoria });
  };

  // --- 1. Volume de inspeções -----------------------------------------
  const volInsp = [];
  volInsp.push({
    tipo: "volume_inspecoes",
    texto: `${kpis.inspecoesRealizadas} inspeção(ões) realizada(s) em ${kpis.quadrosInspecionados} quadro(s) distinto(s) no recorte analisado.`,
    indicador: { inspecoes: kpis.inspecoesRealizadas, quadros: kpis.quadrosInspecionados },
  });
  const locsPorInsp = [...kpis.inspecoesPorLocalidade].sort((a, b) => b.inspecoes - a.inspecoes);
  if (locsPorInsp.length >= 2 && kpis.inspecoesRealizadas > 0) {
    const top = locsPorInsp[0];
    const pctTop = (100 * top.inspecoes) / kpis.inspecoesRealizadas;
    volInsp.push({
      tipo: "concentracao_localidade_inspecoes",
      texto: `A localidade ${top.localidade} concentra ${pctTop.toFixed(1)}% das inspeções do período (${top.inspecoes} de ${kpis.inspecoesRealizadas}).`,
      indicador: { top, total: kpis.inspecoesRealizadas },
    });
  }
  if (kpis.inspecoesRealizadas < 5) {
    volInsp.push({
      tipo: "amostra_pequena",
      texto: `A amostra do período (${kpis.inspecoesRealizadas} inspeção(ões)) é pequena: os padrões abaixo devem ser lidos com cautela.`,
      indicador: { inspecoes: kpis.inspecoesRealizadas },
    });
  }
  add("volume_inspecoes", "Volume de Inspeções", volInsp);

  // --- 2. Não conformidades -------------------------------------------
  const ncs = [];
  if (kpis.naoConformidades > 0) {
    ncs.push({
      tipo: "volume_nc",
      texto: `${kpis.naoConformidades} não conformidade(s) aberta(s) no recorte analisado (tabela de não conformidades, status aberta/em tratamento).`,
      indicador: { naoConformidades: kpis.naoConformidades },
    });
    const dimsComNc = dimensions.filter((d) => d.naoConforme > 0).sort((a, b) => b.naoConforme - a.naoConforme);
    if (dimsComNc.length) {
      const top = dimsComNc.slice(0, 3).map((d) => d.dimensao).join(", ");
      ncs.push({
        tipo: "concentracao_dimensao",
        texto: `Os dados do período mostram maior concentração de respostas não conformes ${dimsComNc.length > 1 ? "nas dimensões" : "na dimensão"} ${top} do checklist.`,
        indicador: dimsComNc.slice(0, 3),
      });
    }
  } else {
    ncs.push({ tipo: "sem_nc", texto: "Nenhuma não conformidade aberta identificada no recorte analisado.", indicador: null });
  }
  add("nao_conformidades", "Não Conformidades", ncs);

  // --- 3. Localidades ---------------------------------------------------
  const locs = [];
  const locsComTaxa = byLocalidade.filter((l) => l.taxaNaoConformidade != null && l.naoConformidades > 0)
    .sort((a, b) => b.taxaNaoConformidade - a.taxaNaoConformidade);
  if (locsComTaxa.length) {
    const top = locsComTaxa[0];
    locs.push({
      tipo: "localidade_taxa",
      texto: `A localidade ${top.localidade} apresenta a maior taxa de NC por inspeção do período (${top.taxaNaoConformidade.toFixed(1)} NCs a cada 100 inspeções: ${top.naoConformidades} NC(s) em ${top.inspecoes} inspeção(ões)).`,
      indicador: top,
    });
    if (locsComTaxa.length >= 2) {
      const bottom = locsComTaxa[locsComTaxa.length - 1];
      if (bottom.localidade !== top.localidade) {
        locs.push({
          tipo: "localidade_taxa_menor",
          texto: `${bottom.localidade} apresenta a menor taxa de NC por inspeção entre as localidades com NC no período (${bottom.taxaNaoConformidade.toFixed(1)} NCs a cada 100 inspeções).`,
          indicador: bottom,
        });
      }
    }
  }
  add("localidades", "Localidades", locs);

  // --- 4. Quadros críticos ----------------------------------------------
  const quadrosCriticos = [];
  if (rankingQuadros?.itens?.length) {
    const top = rankingQuadros.itens[0];
    quadrosCriticos.push({
      tipo: "quadro_critico",
      texto: `O quadro ${top.panelTag} concentra o maior número de não conformidades abertas no período (${top.naoConformidades}), ${emLocalidade(top.localidade)}.`,
      indicador: top,
    });
    if (kpis.naoConformidades > 0) {
      const top3 = rankingQuadros.itens.slice(0, 3);
      const somaTop3 = top3.reduce((s, q) => s + q.naoConformidades, 0);
      const pct = (100 * somaTop3) / kpis.naoConformidades;
      if (top3.length >= 2 && pct >= 40) {
        quadrosCriticos.push({
          tipo: "concentracao_quadros",
          texto: `Os ${top3.length} quadros com mais ocorrências concentram ${pct.toFixed(1)}% das não conformidades abertas do período, um possível ponto de atenção prioritário.`,
          indicador: { top3, pct },
        });
      }
    }
  }
  add("quadros_criticos", "Quadros Críticos", quadrosCriticos);

  // --- 5. Requisitos críticos --------------------------------------------
  const requisitos = [];
  if (pareto.itens.length) {
    const top = pareto.itens[0];
    requisitos.push({
      tipo: "requisito_concentrador",
      texto: `O requisito ${requisitoFrase(top.codigo, top.titulo)} concentra o maior número de não conformidades do período, com ${top.n} ocorrência(s), o equivalente a ${top.percentual.toFixed(1)}% do total.`,
      indicador: top,
    });
  }
  add("requisitos_criticos", "Requisitos Críticos", requisitos);

  // --- 6. Recorrência -----------------------------------------------------
  const recorr = [];
  if (recurrence.casos.length) {
    const top = recurrence.casos[0];
    recorr.push({
      tipo: "recorrencia",
      texto: `Foram identificados ${recurrence.resumo.totalCasos} caso(s) de reincidência, afetando ${recurrence.resumo.quadrosAfetados} quadro(s). O requisito ${requisitoFrase(top.codigo, top.titulo)} é o que mais reincidiu, repetindo-se em ${top.ocorrencias} inspeções diferentes do quadro ${top.panelTag}.`,
      indicador: top,
    });
  } else {
    recorr.push({ tipo: "sem_recorrencia", texto: "Nenhum requisito reincidente identificado no recorte analisado (mesma NC em 2 ou mais inspeções diferentes do mesmo quadro).", indicador: null });
  }
  add("recorrencia", "Recorrência", recorr);

  // --- 7. Tendência temporal -----------------------------------------------
  const tend = [];
  const pontosTendComTaxa = temporal.pontos.filter((p) => p.taxaConformidade != null);
  if (pontosTendComTaxa.length >= 2) {
    const first = pontosTendComTaxa[0], last = pontosTendComTaxa[pontosTendComTaxa.length - 1];
    {
      const delta = last.taxaConformidade - first.taxaConformidade;
      const direcao = delta > 1 ? "melhora" : delta < -1 ? "piora" : "estabilidade";
      tend.push({
        tipo: "evolucao",
        texto: direcao === "estabilidade"
          ? `A taxa de conformidade permaneceu estável entre ${first.label} (${first.taxaConformidade.toFixed(1)}%) e ${last.label} (${last.taxaConformidade.toFixed(1)}%).`
          : `A taxa de conformidade apresentou ${direcao} entre ${first.label} (${first.taxaConformidade.toFixed(1)}%) e ${last.label} (${last.taxaConformidade.toFixed(1)}%).`,
        indicador: { first, last, delta },
      });
    }
  } else {
    tend.push({ tipo: "sem_tendencia", texto: "Não há histórico suficiente para identificar uma tendência temporal (é necessário mais de um período com inspeções no recorte).", indicador: null });
  }
  add("tendencia_temporal", "Tendência Temporal", tend);

  // --- 8. Concentração / Pareto ---------------------------------------------
  const paretoAchados = [];
  if (pareto.pontos80 != null && pareto.total > 1) {
    paretoAchados.push({
      tipo: "pareto_80",
      texto: `Os ${pareto.pontos80} requisito(s) com mais ocorrências (de ${pareto.total} distintos) concentram aproximadamente 80% das não conformidades do período, um padrão compatível com concentração tipo Pareto.`,
      indicador: { pontos80: pareto.pontos80, total: pareto.total },
    });
  }
  add("concentracao_pareto", "Concentração (Pareto)", paretoAchados);

  // --- 9. Taxa de NC --------------------------------------------------------
  const taxaNc = [];
  if (kpis.taxaNcPorInspecao != null) {
    taxaNc.push({
      tipo: "taxa_nc",
      texto: `A taxa geral é de ${kpis.taxaNcPorInspecao.toFixed(1)} não conformidade(s) aberta(s) a cada 100 inspeções no recorte analisado (${kpis.naoConformidades} NC(s) em ${kpis.inspecoesRealizadas} inspeção(ões)).`,
      indicador: { taxa: kpis.taxaNcPorInspecao, naoConformidades: kpis.naoConformidades, inspecoes: kpis.inspecoesRealizadas },
    });
  }
  add("taxa_nc", "Taxa de NC", taxaNc);

  // --- 10. Qualidade / limitação dos dados -----------------------------------
  const limitacoes = [];
  if (filteredInspections.some((i) => i.health_index_resultado == null)) {
    const semIS = filteredInspections.filter((i) => i.health_index_resultado == null).length;
    if (semIS === filteredInspections.length) {
      limitacoes.push({ tipo: "sem_indice_saude", texto: "Nenhuma inspeção do recorte possui Índice de Saúde calculado, portanto a correlação Índice de Saúde × Conformidade não pôde ser avaliada.", indicador: null });
    }
  }
  add("qualidade_dados", "Qualidade/Limitação dos Dados", limitacoes);

  const achados = categorias.flatMap((c) => c.achados);
  return { categorias, achados };
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
      titulo: `${describeRequisito(c.codigo, c.titulo)} (quadro ${c.panelTag})`,
      descricao: `Reincidente em ${c.ocorrencias} inspeções diferentes deste quadro. Última ocorrência: ${fmtDateBR(c.ultimaOcorrencia)}.`,
      indicador: c,
    });
  }

  if (pareto.itens.length) {
    const top = pareto.itens[0];
    concentracao.push({
      titulo: "Requisito com mais ocorrências",
      descricao: `O requisito ${requisitoFrase(top.codigo, top.titulo)} responde por ${top.percentual.toFixed(1)}% das não conformidades do período, com ${top.n} ocorrência(s).`,
      indicador: top,
    });
  }
  const locTop = byLocalidade.filter((l) => l.taxaNaoConformidade != null && l.naoConformidades > 0)
    .sort((a, b) => b.taxaNaoConformidade - a.taxaNaoConformidade)[0];
  if (locTop) {
    concentracao.push({
      titulo: "Localidade com maior taxa relativa",
      descricao: `${locTop.localidade}: ${locTop.taxaNaoConformidade.toFixed(1)} NCs a cada 100 inspeções (${locTop.naoConformidades} NC(s) aberta(s) em ${locTop.inspecoes} inspeção(ões)).`,
      indicador: locTop,
    });
  }

  return { destaques, pontosDeAtencao, evolucao, recorrencias, concentracao };
}

/**
 * "Leitura dos dados" curta (1–3 frases) sob cada gráfico relevante (Etapa
 * 5/7 do pedido) — acrescenta interpretação, não repete os números que já
 * estão no gráfico. Deriva tudo das estruturas já calculadas acima (não
 * refaz nenhum cálculo). Quando não há evidência suficiente para uma
 * leitura, o texto diz isso explicitamente em vez de forçar uma frase.
 */
export function computeChartDescriptions({ dimensions, pareto, byLocalidade, temporal, recurrence, healthVsConformity }) {
  const out = {};

  // --- Conformidade por Dimensão -------------------------------------------
  const dimsComDados = dimensions.filter((d) => d.percentual != null);
  if (dimsComDados.length >= 2) {
    const ordenadas = [...dimsComDados].sort((a, b) => b.percentual - a.percentual);
    const melhor = ordenadas[0];
    const pior = ordenadas[ordenadas.length - 1];
    const abaixoDe90 = ordenadas.filter((d) => d.percentual < 90);
    let texto = `A dimensão ${melhor.dimensao} tem o melhor desempenho do período, com ${pct1(melhor.percentual)} de conformidade, enquanto ${pior.dimensao} apresenta o menor índice, em ${pct1(pior.percentual)}.`;
    if (abaixoDe90.length) {
      texto += abaixoDe90.length === 1
        ? ` Apenas ${abaixoDe90[0].dimensao} está abaixo da faixa considerada boa (90%), o que a torna a principal candidata a um plano de ação focado.`
        : ` Ao todo, ${abaixoDe90.length} dimensões estão abaixo da faixa considerada boa (90%), o que sugere que o esforço de melhoria não deve se concentrar em um único ponto do checklist.`;
    } else {
      texto += " Todas as dimensões estão dentro da faixa considerada boa (90% ou mais), um sinal positivo de consistência entre os diferentes grupos de requisitos.";
    }
    out.dimensions = texto;
  } else if (dimsComDados.length === 1) {
    out.dimensions = `${dimsComDados[0].dimensao} é a única dimensão com respostas aplicáveis no período, com ${pct1(dimsComDados[0].percentual)} de conformidade. Não há outra dimensão para comparação neste recorte.`;
  } else {
    out.dimensions = SEM_PADRAO_TEXT;
  }

  // --- Principais Não Conformidades (Pareto) -------------------------------
  if (pareto.itens.length) {
    const top = pareto.itens[0];
    const partes = [`O requisito ${requisitoFrase(top.codigo, top.titulo)} é o que mais aparece entre as não conformidades abertas do período, respondendo por ${pct1(top.percentual)} do total (${top.n} ocorrência${top.n === 1 ? "" : "s"}).`];
    if (pareto.itens.length >= 2) {
      const segundo = pareto.itens[1];
      partes.push(`Em seguida vem ${describeRequisito(segundo.codigo, segundo.titulo)}, com ${pct1(segundo.percentual)}.`);
    }
    if (pareto.pontos80 != null && pareto.total > 1) {
      const proporcao = pareto.total ? (100 * pareto.pontos80) / pareto.total : null;
      partes.push(
        proporcao != null && proporcao <= 40
          ? `Apenas ${pareto.pontos80} dos ${pareto.total} requisitos distintos já respondem por cerca de 80% das ocorrências, um padrão de concentração forte que costuma indicar poucos pontos de origem para a maior parte dos problemas.`
          : `São necessários ${pareto.pontos80} dos ${pareto.total} requisitos distintos para somar cerca de 80% das ocorrências, uma distribuição mais espalhada, sem poucos itens dominando o total.`
      );
    }
    out.pareto = partes.join(" ");
  } else {
    out.pareto = "Nenhuma não conformidade aberta foi registrada no período selecionado, então não há concentração por requisito a analisar.";
  }

  // --- Não Conformidades por Localidade ------------------------------------
  if (byLocalidade.length >= 2) {
    const comTaxa = byLocalidade.filter((l) => l.taxaNaoConformidade != null).sort((a, b) => b.taxaNaoConformidade - a.taxaNaoConformidade);
    if (comTaxa.length >= 2) {
      const top = comTaxa[0], bottom = comTaxa[comTaxa.length - 1];
      let texto = `${top.localidade} apresenta a maior taxa de não conformidade por inspeção do período, com ${ncRate100(top.taxaNaoConformidade)}.`;
      if (top.localidade !== bottom.localidade) {
        texto += ` Em contraste, ${bottom.localidade} registra ${ncRate100(bottom.taxaNaoConformidade)}, a menor taxa entre as localidades com NC no recorte.`;
        texto += top.taxaNaoConformidade > bottom.taxaNaoConformidade * 1.3
          ? " Essa diferença é grande o suficiente para valer a pena investigar se há uma causa específica em jogo, como perfil dos quadros ou momento da última manutenção."
          : " A diferença entre as duas localidades é moderada e pode variar naturalmente conforme o volume de inspeções realizado em cada uma.";
      }
      out.localidade = texto;
    } else {
      out.localidade = SEM_PADRAO_TEXT;
    }
  } else {
    out.localidade = byLocalidade.length === 1
      ? `Apenas ${byLocalidade[0].localidade} tem inspeções no recorte selecionado, então não há comparação possível entre localidades neste momento.`
      : "Nenhuma inspeção foi encontrada no recorte selecionado.";
  }

  // --- Evolução da Conformidade (temporal) ---------------------------------
  const pontosComTaxa = temporal.pontos.filter((p) => p.taxaConformidade != null);
  if (pontosComTaxa.length >= 2) {
    const first = pontosComTaxa[0], last = pontosComTaxa[pontosComTaxa.length - 1];
    const delta = last.taxaConformidade - first.taxaConformidade;
    const totalNcPeriodo = temporal.pontos.reduce((s, p) => s + (p.naoConformidades || 0), 0);
    let texto = Math.abs(delta) <= 1
      ? `A taxa de conformidade se manteve estável ao longo do período analisado, variando de ${pct1(first.taxaConformidade)} para ${pct1(last.taxaConformidade)}.`
      : `A taxa de conformidade ${delta > 0 ? "subiu" : "caiu"} ${Math.abs(delta).toFixed(1)} pontos percentuais ao longo do período analisado, de ${pct1(first.taxaConformidade)} para ${pct1(last.taxaConformidade)}.`;
    if (totalNcPeriodo > 0) {
      texto += delta < -1
        ? " Vale acompanhar se essa queda está associada ao aumento de não conformidades abertas no mesmo intervalo."
        : " Esse comportamento pode ser observado junto ao volume de não conformidades abertas no mesmo intervalo, exibido nas barras do gráfico.";
    }
    out.temporal = texto;
  } else if (temporal.pontos.length < 2) {
    out.temporal = "Não há histórico suficiente para identificar uma tendência temporal, pois é necessário mais de um período com inspeções no recorte selecionado.";
  } else {
    out.temporal = SEM_PADRAO_TEXT;
  }

  // --- Reincidências ---------------------------------------------------------
  if (recurrence.casos.length) {
    const top = recurrence.casos[0];
    let texto = `O período reúne ${recurrence.resumo.totalCasos} caso(s) de reincidência, afetando ${recurrence.resumo.quadrosAfetados} quadro(s) distinto(s).`;
    texto += ` O requisito ${requisitoFrase(top.codigo, top.titulo)} é o mais recorrente, tendo se repetido em ${top.ocorrencias} inspeções diferentes do quadro ${top.panelTag}.`;
    if (recurrence.casos.length > 1) {
      texto += " Reincidências indicam que uma correção anterior pode não ter sido efetiva ou que o problema tem origem estrutural, e por isso costumam merecer prioridade sobre ocorrências isoladas.";
    }
    out.recurrence = texto;
  } else {
    out.recurrence = "Nenhum requisito reincidente foi identificado no período, ou seja, não há casos de uma mesma não conformidade se repetindo em inspeções diferentes do mesmo quadro.";
  }

  // --- Índice de Saúde × Conformidade ---------------------------------------
  if (healthVsConformity) {
    if (healthVsConformity.dadosSuficientes && healthVsConformity.correlacao != null) {
      const r = healthVsConformity.correlacao;
      const forca = Math.abs(r) >= 0.6 ? "forte" : Math.abs(r) >= 0.3 ? "moderada" : "fraca";
      const sentido = r >= 0 ? "positiva" : "negativa";
      let texto = `Os dados mostram uma correlação ${forca} e ${sentido} entre a taxa de conformidade e o Índice de Saúde das inspeções do período, com coeficiente de Pearson r = ${r.toFixed(2)}.`;
      texto += sentido === "positiva"
        ? " Esse comportamento pode indicar que inspeções com respostas mais conformes tendem a apresentar Índice de Saúde mais alto,"
        : " Esse comportamento pode indicar que inspeções com respostas mais conformes tendem a apresentar Índice de Saúde mais baixo neste recorte,";
      texto += " mas correlação não implica causalidade, e outros fatores não capturados aqui também podem influenciar o resultado.";
      out.health = texto;
    } else {
      out.health = SEM_PADRAO_TEXT + " É necessário um número maior de inspeções com Índice de Saúde calculado para uma leitura estatística confiável.";
    }
  }

  return out;
}

function pct1(v) { return v == null ? "-" : `${v.toFixed(1)}%`; }

// Taxa de NC por inspeção pode ultrapassar 100% (uma inspeção pode gerar
// mais de uma NC), então evitamos o sufixo "%" para não sugerir um valor
// limitado a 100 — expressamos como razão por 100 inspeções.
function ncRate100(v) { return v == null ? "-" : `${v.toFixed(1)} NCs a cada 100 inspeções`; }
