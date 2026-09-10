// Motor de análise e Índice de Saúde (0–100) para quadros BT.
// Funções puras — sem acesso a rede. A persistência fica em src/api/analysis.js.

// Cada módulo de checklist contribui para uma dimensão do Índice de Saúde.
// As dimensões e seus pesos ficam em public.health_index_config.
export const MODULE_TO_DIMENSION = {
  1: "documentacao",          // Identificação
  2: "seguranca",             // Segurança
  3: "integridade_fisica",    // Integridade física
  4: "protecoes",             // Proteções
  5: "conexoes_barramentos",  // Barramentos e conexões
  6: "conexoes_barramentos",  // Cabos e isolação
  7: "aterramento",           // Aterramento
  10: "documentacao",         // Documentação
};

const CRIT_SCORE = { A: 0, B: 45, C: 75, D: 92 };

/**
 * Nota 0–100 por dimensão a partir dos dados de uma inspeção.
 * Retorna { [dimensao]: número | null }. `null` = dimensão não avaliada
 * (nenhuma resposta conclusiva) → é excluída da ponderação.
 */
export function dimensionScores({ responses = [], measurements = [], thermography = [] }) {
  const acc = {}; // dimensao -> { conforme, naoConforme }
  for (const r of responses) {
    const dim = MODULE_TO_DIMENSION[r.modulo];
    if (!dim) continue;
    if (r.resposta === "conforme" || r.resposta === "nao_conforme") {
      acc[dim] = acc[dim] || { conforme: 0, naoConforme: 0 };
      if (r.resposta === "conforme") acc[dim].conforme += 1;
      else acc[dim].naoConforme += 1;
    }
  }

  const scores = {};
  for (const [dim, c] of Object.entries(acc)) {
    const total = c.conforme + c.naoConforme;
    scores[dim] = total ? Math.round((100 * c.conforme) / total) : null;
  }

  // Medições: conforme vs fora_limite
  const medEval = measurements.filter((m) => m.resultado === "conforme" || m.resultado === "fora_limite");
  if (medEval.length) {
    const ok = medEval.filter((m) => m.resultado === "conforme").length;
    scores.medicoes = Math.round((100 * ok) / medEval.length);
  } else {
    scores.medicoes = null;
  }

  // Termografia: pior criticidade entre os pontos avaliados
  const critList = thermography.map((t) => t.criticidade).filter(Boolean);
  if (critList.length) {
    scores.termografia = Math.min(...critList.map((c) => CRIT_SCORE[c] ?? 100));
  } else if (thermography.length) {
    scores.termografia = 90; // pontos medidos, nenhum classificado como anomalia
  } else {
    scores.termografia = null;
  }

  return scores;
}

/**
 * Índice de Saúde 0–100: média ponderada das dimensões avaliadas.
 * weights: array de { dimensao, peso, ativo }.
 * Retorna { index: number|null, parts: [{ dimensao, rotulo, score, peso }] }.
 */
export function healthIndex(scores, weights) {
  const active = weights.filter((w) => w.ativo !== false && Number(w.peso) > 0);
  let sumW = 0;
  let sum = 0;
  const parts = [];
  for (const w of active) {
    const score = scores[w.dimensao];
    parts.push({ dimensao: w.dimensao, rotulo: w.rotulo, score: score ?? null, peso: Number(w.peso) });
    if (score == null) continue;
    sumW += Number(w.peso);
    sum += Number(w.peso) * score;
  }
  return { index: sumW ? Math.round(sum / sumW) : null, parts };
}

export function healthBand(index) {
  if (index == null) return { label: "Sem avaliação", tone: "muted" };
  if (index >= 80) return { label: "Bom", tone: "ok" };
  if (index >= 50) return { label: "Atenção", tone: "warn" };
  return { label: "Crítico", tone: "err" };
}

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Regras de análise → flags. items: itens do template (para ler codigo/titulo).
 * Retorna [{ tipo, categoria, severidade, mensagem }].
 */
export function analysisFlags({ responses = [], measurements = [], thermography = [], items = [] }) {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const flags = [];
  const add = (tipo, categoria, severidade, mensagem) => flags.push({ tipo, categoria, severidade, mensagem });

  for (const r of responses) {
    if (r.resposta !== "nao_conforme") continue;
    const it = itemById.get(r.template_item_id);
    const codigo = it?.codigo || "";
    const titulo = it?.titulo || r.titulo || "item";
    const texto = norm(`${titulo} ${r.observacao || ""} ${r.justificativa || ""}`);

    if (r.modulo === 2) add("nc_seguranca", "Segurança", "critica", `Não conformidade de segurança: ${titulo}`);
    if (/^PRO-0?1$/i.test(codigo) || texto.includes("dr ") || texto.includes("diferencial residual"))
      add("dr_nc", "Proteções", "alta", `DR/dispositivo diferencial não conforme: ${titulo}`);
    if (texto.includes("carboniz") || texto.includes("superaquec") || texto.includes("queimad") || texto.includes("arco"))
      add("superaquecimento", "Barramentos e conexões", "critica", `Indício de superaquecimento/carbonização: ${titulo}`);
    if (r.modulo === 7) add("aterramento_nc", "Aterramento", "alta", `Não conformidade de aterramento: ${titulo}`);
    if (/BAR-0?8/i.test(codigo)) add("neutro_pe", "Aterramento", "alta", "Neutro e PE possivelmente no mesmo barramento (esquema TN-S)");
  }

  for (const m of measurements) {
    if (m.resultado !== "fora_limite") continue;
    const sev = m.categoria === "corrente_fuga" ? "alta" : "media";
    add("medicao_fora_limite", "Medições", sev,
      `Medição fora do limite: ${m.categoria}${m.parametro ? " " + m.parametro : ""} = ${m.valor ?? "?"} ${m.unidade || ""}`);
  }

  for (const t of thermography) {
    if (t.criticidade === "A") add("termo_critico", "Termografia", "critica",
      `Ponto quente crítico: ${t.equipamento || ""} ${t.ponto || ""}${t.delta_t != null ? ` (ΔT ${t.delta_t} °C)` : ""}`.trim());
    else if (t.criticidade === "B") add("termo_alto", "Termografia", "alta",
      `Ponto quente relevante: ${t.equipamento || ""} ${t.ponto || ""}`.trim());
  }

  return flags;
}
