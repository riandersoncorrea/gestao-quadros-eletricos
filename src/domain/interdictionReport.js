// Relatório "Evolução das corretivas nos quadros com risco de interdição".
// Funções puras — sem acesso a rede (a busca fica em
// src/services/interdictionReportService.js).
//
// Diferente do indicador da Análise Inteligente (computeInterdictionRisk,
// que só olha NCs ABERTAS), este relatório acompanha o HISTÓRICO: toda NC
// que já caracterizou risco de interdição, aberta ou não, e a situação da
// corretiva de cada uma. A regra de quem entra é a MESMA do indicador:
//  - NC criada antes de INTERDICTION_RULE_START (regra anterior): qualquer
//    NC de PRO-01 ou ATR-01;
//  - NC criada a partir dele (regra atual): ATR-01 não conforme, ou PRO-01
//    não conforme com área molhada = Sim na MESMA inspeção
//    (domain/inspectionRules.js#interdictionRiskConditions). NC manual
//    (sem inspeção) não entra pela regra atual.
// NCs canceladas, de inspeção cancelada ou que não atendem à regra atual
// ficam FORA dos totais, mas são listadas à parte com o motivo, para o
// relatório explicar o que deixou de contar.

import { INTERDICTION_RISK_CODES, INTERDICTION_RULE_START } from "@/domain/intelligentAnalysis";
import { WET_AREA_CHECK_CODE, INTERDICTION_GROUNDING_CODE, interdictionRiskConditions } from "@/domain/inspectionRules";
import { isOpenAction } from "@/domain/actionRules";

export { INTERDICTION_RISK_CODES, INTERDICTION_RULE_START };

const RULE_START_MS = Date.parse(INTERDICTION_RULE_START);

/** Prazo de "risco novo" e de "vence em breve", em dias corridos. */
export const RECENT_DAYS = 7;

/** Faixas de dias entre a inspeção e a conclusão da corretiva. */
export const LEAD_TIME_BINS = [
  { faixa: "0–7", min: 0, max: 7 },
  { faixa: "8–14", min: 8, max: 14 },
  { faixa: "15–21", min: 15, max: 21 },
  { faixa: "22–28", min: 22, max: 28 },
  { faixa: "29–35", min: 29, max: 35 },
  { faixa: "36+", min: 36, max: Infinity },
];

/** Situação da corretiva de UMA NC (rótulos da página em CORRECTIVE_LABEL). */
export const CORRECTIVE_LABEL = {
  concluida: "Concluída",
  em_andamento: "Em andamento",
  aberta: "Aberta",
  sem_acao: "Sem ação",
};

/** Situação de um QUADRO, a partir das corretivas das suas NCs de risco. */
export const PANEL_SITUATION_LABEL = {
  concluida: "Concluída",
  em_andamento: "Em andamento",
  pendente: "Pendente",
};

/** Motivos de uma NC de PRO-01/ATR-01 ficar fora dos totais. */
export const EXCLUSION_LABEL = {
  nc_cancelada: "NC cancelada",
  inspecao_cancelada: "Inspeção cancelada",
  sem_quadro: "NC sem quadro vinculado",
  manual_regra_atual: "NC manual registrada na regra atual (sem inspeção)",
  area_molhada_nao: "PRO-01 com área molhada = Não (regra atual)",
  area_molhada_sem_resposta: "PRO-01 sem resposta de área molhada (regra atual)",
};

const MOTIVO_ORDEM = Object.keys(EXCLUSION_LABEL);

const DAY_MS = 86400000;

/** "yyyy-mm-dd" do instante no fuso de Brasília (datas do relatório). */
export function localDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

/** Dias corridos entre duas datas "yyyy-mm-dd" (b − a). */
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** Segunda-feira da semana de uma data "yyyy-mm-dd". */
export function weekStart(day) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Regra de inclusão de UMA NC de PRO-01/ATR-01. Devolve
 * `{ regra: "anterior" | "atual" }` quando a NC caracteriza risco de
 * interdição, ou `{ motivo }` (chave de EXCLUSION_LABEL) quando não.
 * `respostas` = { [codigo]: inspection_response } da inspeção da NC.
 */
export function classifyRiskNc(nc, inspection, respostas = {}) {
  if (nc.status === "cancelada") return { motivo: "nc_cancelada" };
  if (inspection?.status === "cancelada") return { motivo: "inspecao_cancelada" };
  if (!nc.panel_id) return { motivo: "sem_quadro" };
  const t = Date.parse(nc.created_at);
  if (!Number.isNaN(t) && t < RULE_START_MS) return { regra: "anterior" };
  if (!nc.inspection_id) return { motivo: "manual_regra_atual" };
  const cond = interdictionRiskConditions({
    pro01: respostas[WET_AREA_CHECK_CODE],
    atr01: respostas[INTERDICTION_GROUNDING_CODE],
  });
  if (nc.codigo === INTERDICTION_GROUNDING_CODE) return { regra: "atual" };
  if (nc.codigo === WET_AREA_CHECK_CODE && cond.pro01) return { regra: "atual" };
  const area = respostas[WET_AREA_CHECK_CODE]?.area_molhada;
  return { motivo: area === false ? "area_molhada_nao" : "area_molhada_sem_resposta" };
}

/**
 * Situação da corretiva de uma NC a partir das suas ações não canceladas:
 * qualquer ação em andamento → em_andamento; senão qualquer aberta →
 * aberta; senão todas concluídas → concluida. Sem ação: concluida se a
 * própria NC foi concluída (marcada na tela da NC), senão sem_acao.
 */
export function correctiveOf(nc, actions = []) {
  const acts = actions.filter((a) => a.status !== "cancelada");
  const abertas = acts.filter((a) => isOpenAction(a.status));
  const concluidas = acts.filter((a) => a.status === "concluida");
  let status;
  if (acts.some((a) => a.status === "em_andamento")) status = "em_andamento";
  else if (abertas.length) status = "aberta";
  else if (concluidas.length) status = "concluida";
  else if (nc.status === "concluida") status = "concluida";
  else status = "sem_acao";

  const prazoAberto = abertas.map((a) => a.prazo).filter(Boolean).sort()[0] || null;
  const conclusao = status === "concluida"
    ? (concluidas.map((a) => a.concluida_em).filter(Boolean).sort().pop() || localDate(nc.concluida_em))
    : null;
  const ref = abertas[0] || concluidas[concluidas.length - 1] || null;
  return {
    status,
    prazo: status === "concluida" ? (concluidas.map((a) => a.prazo).filter(Boolean).sort().pop() || null) : prazoAberto,
    concluidaEm: conclusao,
    responsavel: ref?.responsavel || null,
    acoes: acts.length,
  };
}

/**
 * Monta o relatório inteiro. Entradas (já buscadas pelo service):
 *  - ncs: NCs de PRO-01/ATR-01 (todas, inclusive canceladas), cada uma com
 *    `codigo` resolvido;
 *  - inspectionById: Map id → { inspection_date, status };
 *  - responsesByInspection: Map inspection_id → { [codigo]: resposta };
 *  - actionsByNc: Map nonconformity_id → ações (v_actions);
 *  - panelById, locName: quadros e nomes de localidade;
 *  - today: "yyyy-mm-dd" (data de referência para prazos e dias em aberto).
 */
export function buildInterdictionReport({ ncs, inspectionById, responsesByInspection, actionsByNc, panelById, locName, today }) {
  const panelInfo = (panelId) => {
    const p = panelById.get(panelId);
    const tag = p?.tag || "—";
    const local = p?.name && p.tag && p.name.startsWith(p.tag) ? p.name.slice(p.tag.length).replace(/^\s*\/\s*/, "") : (p?.name || "");
    const localidade = p?.localidade_id ? (locName.get(p.localidade_id) || "Sem nome") : "Sem localidade";
    return { tag, local, localidade };
  };

  const incluidas = [];
  const excluidas = [];
  for (const nc of ncs) {
    const inspection = nc.inspection_id ? inspectionById.get(nc.inspection_id) : null;
    const respostas = nc.inspection_id ? responsesByInspection.get(nc.inspection_id) || {} : {};
    const cls = classifyRiskNc(nc, inspection, respostas);
    const dataRegistro = inspection?.inspection_date || localDate(nc.created_at);
    const area = respostas[WET_AREA_CHECK_CODE]?.area_molhada;
    // Antes da regra atual a pergunta de área molhada não existia.
    const semPergunta = Date.parse(nc.created_at) < RULE_START_MS;
    const base = {
      id: nc.id,
      panelId: nc.panel_id,
      ...panelInfo(nc.panel_id),
      codigo: nc.codigo,
      dataRegistro,
      areaMolhada: nc.codigo === WET_AREA_CHECK_CODE ? (area === true ? "Sim" : area === false ? "Não" : semPergunta ? "Sem pergunta" : "Sem resposta") : "—",
      ncStatus: nc.status,
    };
    if (cls.motivo) {
      excluidas.push({ ...base, motivo: cls.motivo, motivoLabel: EXCLUSION_LABEL[cls.motivo], atualizadaEm: localDate(nc.updated_at) });
      continue;
    }
    const corretiva = correctiveOf(nc, actionsByNc.get(nc.id) || []);
    incluidas.push({ ...base, regra: cls.regra, corretiva });
  }

  // --- Quadros ---------------------------------------------------------------
  const porQuadro = new Map();
  for (const r of incluidas) {
    if (!porQuadro.has(r.panelId)) porQuadro.set(r.panelId, { panelId: r.panelId, tag: r.tag, local: r.local, localidade: r.localidade, ncs: [] });
    porQuadro.get(r.panelId).ncs.push(r);
  }
  const quadros = [...porQuadro.values()].map((q) => {
    const st = q.ncs.map((n) => n.corretiva.status);
    const concluidas = st.filter((s) => s === "concluida").length;
    const emAndamento = st.includes("em_andamento");
    const pendentes = st.filter((s) => s === "aberta" || s === "sem_acao").length;
    const situacao = emAndamento ? "em_andamento" : pendentes === 0 && concluidas > 0 ? "concluida" : "pendente";
    // Pendente só por NC sem ação num quadro que já teve a corretiva
    // concluída: tipicamente a mesma NC lançada duas vezes.
    const ncDuplicada = situacao === "pendente" && concluidas > 0 && !st.includes("aberta");
    const concluidoEm = situacao === "concluida"
      ? q.ncs.map((n) => n.corretiva.concluidaEm).filter(Boolean).sort().pop() || null
      : null;
    return { ...q, situacao, ncDuplicada, concluidoEm };
  });

  // --- Tempo até a conclusão ------------------------------------------------
  const concluidas = incluidas.filter((r) => r.corretiva.status === "concluida" && r.corretiva.concluidaEm && r.dataRegistro);
  const leads = concluidas.map((r) => daysBetween(r.dataRegistro, r.corretiva.concluidaEm)).sort((a, b) => a - b);
  const mediana = leads.length
    ? (leads.length % 2 ? leads[(leads.length - 1) / 2] : (leads[leads.length / 2 - 1] + leads[leads.length / 2]) / 2)
    : null;
  const lead = {
    corretivas: leads.length,
    media: leads.length ? leads.reduce((s, v) => s + v, 0) / leads.length : null,
    mediana,
    maximo: leads.length ? leads[leads.length - 1] : null,
    aposPrazo: concluidas.filter((r) => r.corretiva.prazo && r.corretiva.concluidaEm > r.corretiva.prazo).length,
    faixas: LEAD_TIME_BINS.map((b) => ({ faixa: b.faixa, corretivas: leads.filter((d) => d >= b.min && d <= b.max).length })),
  };

  // --- Evolução semanal -------------------------------------------------------
  const semanas = [];
  const datasRegistro = incluidas.map((r) => r.dataRegistro).filter(Boolean).sort();
  if (datasRegistro.length) {
    const fim = weekStart(today);
    for (let s = weekStart(datasRegistro[0]); s <= fim; s = addDays(s, 7)) {
      semanas.push({ semana: s, registradas: 0, concluidas: 0, saldo: 0, quadrosConcluidos: 0 });
    }
    const idx = new Map(semanas.map((w, i) => [w.semana, i]));
    for (const r of incluidas) {
      const i = idx.get(weekStart(r.dataRegistro));
      if (i !== undefined) semanas[i].registradas++;
      if (r.corretiva.status === "concluida" && r.corretiva.concluidaEm) {
        const j = idx.get(weekStart(r.corretiva.concluidaEm));
        if (j !== undefined) semanas[j].concluidas++;
      }
    }
    let saldo = 0;
    for (const w of semanas) {
      saldo += w.registradas - w.concluidas;
      w.saldo = saldo;
      const fimSemana = addDays(w.semana, 6);
      w.quadrosConcluidos = quadros.filter((q) => q.concluidoEm && q.concluidoEm <= fimSemana).length;
    }
  }
  const pico = semanas.reduce((m, w) => (!m || w.saldo > m.saldo ? w : m), null);
  const saldoAtual = semanas.length ? semanas[semanas.length - 1].saldo : 0;

  // --- Recortes ---------------------------------------------------------------
  const conta = (lista, chave, valores) => {
    const by = new Map();
    for (const item of lista) {
      const k = item[chave];
      if (!by.has(k)) by.set(k, Object.fromEntries([[chave, k], ...valores.map((v) => [v, 0])]));
    }
    return by;
  };
  const locMap = conta(quadros, "localidade", ["concluida", "em_andamento", "pendente"]);
  for (const q of quadros) locMap.get(q.localidade)[q.situacao]++;
  const porLocalidade = [...locMap.values()]
    .map((l) => ({ ...l, total: l.concluida + l.em_andamento + l.pendente }))
    .sort((a, b) => b.total - a.total || a.localidade.localeCompare(b.localidade));

  const respMap = new Map();
  for (const r of incluidas) {
    const nome = r.corretiva.responsavel;
    if (!nome || r.corretiva.status === "sem_acao") continue;
    if (!respMap.has(nome)) respMap.set(nome, { responsavel: nome, concluida: 0, em_andamento: 0, aberta: 0 });
    respMap.get(nome)[r.corretiva.status]++;
  }
  const porResponsavel = [...respMap.values()]
    .map((r) => ({ ...r, total: r.concluida + r.em_andamento + r.aberta }))
    .sort((a, b) => b.total - a.total || a.responsavel.localeCompare(b.responsavel));

  // --- Pontos de atenção -----------------------------------------------------
  const emAberto = incluidas.filter((r) => r.corretiva.status !== "concluida");
  const comAcaoAberta = emAberto.filter((r) => r.corretiva.status === "em_andamento" || r.corretiva.status === "aberta");
  const vencidas = comAcaoAberta.filter((r) => r.corretiva.prazo && r.corretiva.prazo < today);
  const porPrazo = new Map();
  for (const r of comAcaoAberta) {
    if (!r.corretiva.prazo || r.corretiva.prazo < today) continue;
    if (!porPrazo.has(r.corretiva.prazo)) porPrazo.set(r.corretiva.prazo, []);
    porPrazo.get(r.corretiva.prazo).push(r);
  }
  const [prazoComumData, prazoComumLista] = [...porPrazo.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0] || [null, []];
  const prazoComumPorResp = new Map();
  for (const r of prazoComumLista) {
    const nome = r.corretiva.responsavel || "Sem responsável";
    prazoComumPorResp.set(nome, (prazoComumPorResp.get(nome) || 0) + 1);
  }
  const duplicadas = quadros.filter((q) => q.ncDuplicada);
  const novos = emAberto.filter((r) => r.dataRegistro && daysBetween(r.dataRegistro, today) <= RECENT_DAYS && !quadros.find((q) => q.panelId === r.panelId)?.ncDuplicada);
  const venceEmBreve = comAcaoAberta.filter((r) => r.corretiva.prazo && r.corretiva.prazo >= today && daysBetween(today, r.corretiva.prazo) <= RECENT_DAYS);

  // Reincidência após a correção: o quadro registra nova NC de risco depois
  // da data em que uma corretiva anterior dele foi concluída.
  const reincidentes = quadros.filter((q) => {
    const conclusoes = q.ncs.map((n) => n.corretiva.concluidaEm).filter(Boolean);
    return conclusoes.some((c) => q.ncs.some((n) => n.dataRegistro > c));
  });

  // --- Linhas da tabela "em aberto" -----------------------------------------
  const quadroDe = new Map(quadros.map((q) => [q.panelId, q]));
  const abertasTabela = emAberto
    .map((r) => {
      const q = quadroDe.get(r.panelId);
      const dias = r.dataRegistro ? daysBetween(r.dataRegistro, today) : null;
      let observacao = "";
      if (r.corretiva.status === "sem_acao" && q?.ncDuplicada) observacao = "O quadro já tem corretiva concluída; conferir se esta NC é duplicada";
      else if (r.corretiva.status === "sem_acao") observacao = "NC sem ação vinculada";
      else if (r.corretiva.prazo && r.corretiva.prazo < today) observacao = `Prazo vencido há ${daysBetween(r.corretiva.prazo, today)} dia(s)`;
      else if (r.corretiva.prazo && daysBetween(today, r.corretiva.prazo) <= RECENT_DAYS) {
        const n = daysBetween(today, r.corretiva.prazo);
        observacao = n === 0 ? "Prazo vence hoje" : `Prazo vence em ${n} dia(s)`;
      }
      return { ...r, diasEmAberto: dias, observacao, atrasada: !!(r.corretiva.prazo && r.corretiva.prazo < today && r.corretiva.status !== "sem_acao") };
    })
    .sort((a, b) => (b.diasEmAberto ?? -1) - (a.diasEmAberto ?? -1) || a.tag.localeCompare(b.tag));

  // --- Fora do relatório ------------------------------------------------------
  const exclusoesPorMotivo = Object.keys(EXCLUSION_LABEL)
    .map((motivo) => ({ motivo, label: EXCLUSION_LABEL[motivo], ncs: excluidas.filter((e) => e.motivo === motivo).length }))
    .filter((m) => m.ncs > 0);
  const canceladasPorCodigo = INTERDICTION_RISK_CODES.map((codigo) => ({
    codigo,
    ncs: excluidas.filter((e) => e.motivo === "nc_cancelada" && e.codigo === codigo).length,
  }));
  const incluidasPorCodigo = INTERDICTION_RISK_CODES.map((codigo) => ({
    codigo,
    ncs: incluidas.filter((r) => r.codigo === codigo).length,
    quadros: new Set(incluidas.filter((r) => r.codigo === codigo).map((r) => r.panelId)).size,
  }));

  const nQuadros = quadros.length;
  const nConcluidos = quadros.filter((q) => q.situacao === "concluida").length;
  return {
    today,
    regraInicio: localDate(INTERDICTION_RULE_START),
    primeiroRegistro: datasRegistro[0] || null,
    kpis: {
      quadros: nQuadros,
      ncs: incluidas.length,
      concluidos: nConcluidos,
      emAndamento: quadros.filter((q) => q.situacao === "em_andamento").length,
      pendentes: quadros.filter((q) => q.situacao === "pendente").length,
      duplicadas: duplicadas.length,
      pctConcluidos: nQuadros ? nConcluidos / nQuadros : null,
      ncsEmAberto: emAberto.length,
      saldoPico: pico ? { valor: pico.saldo, semana: pico.semana } : null,
      saldoAtual,
      quedaSaldo: pico && pico.saldo > 0 ? (pico.saldo - saldoAtual) / pico.saldo : null,
      excluidas: excluidas.length,
    },
    regras: {
      anterior: incluidas.filter((r) => r.regra === "anterior").length,
      atual: incluidas.filter((r) => r.regra === "atual").length,
    },
    incluidasPorCodigo,
    canceladasPorCodigo,
    semanas,
    porLocalidade,
    porResponsavel,
    lead,
    atencao: {
      prazoComum: prazoComumData
        ? { data: prazoComumData, corretivas: prazoComumLista.length, porResponsavel: [...prazoComumPorResp.entries()].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n) }
        : null,
      vencidas,
      venceEmBreve,
      duplicadas,
      novos,
      reincidentes,
    },
    abertas: abertasTabela,
    excluidas: excluidas.sort((a, b) => MOTIVO_ORDEM.indexOf(a.motivo) - MOTIVO_ORDEM.indexOf(b.motivo) || (a.dataRegistro || "").localeCompare(b.dataRegistro || "")),
    exclusoesPorMotivo,
  };
}
