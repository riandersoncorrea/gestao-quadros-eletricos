// Regras de análise de uma inspeção. Funções puras — sem acesso a rede.
// A orquestração/persistência fica em src/services/inspectionService.js.

/**
 * Detecta se um quadro já possui uma inspeção vigente para uma data de
 * referência (a data da nova inspeção que se está tentando criar, ou a
 * data de hoje, ao exibir um indicador na listagem).
 *
 * Regra: `mostRecentInspection` é a inspeção mais recente (não cancelada)
 * já registrada para o quadro. Se ela tiver `next_inspection` preenchido e
 * `referenceDateStr` for menor ou igual a essa data, a inspeção anterior
 * ainda está vigente — ou seja, uma nova inspeção nessa data seria
 * duplicada. Datas são strings "yyyy-mm-dd" (formato do Postgres `date`),
 * comparadas lexicograficamente — mesma convenção já usada em
 * src/services/dashboardService.js para `next_inspection_date`.
 *
 * Retorna `null` quando não há conflito (quadro nunca inspecionado,
 * inspeção anterior cancelada, sem `next_inspection` registrado, ou a
 * inspeção anterior já venceu antes da data de referência) — nesses casos
 * uma nova inspeção deve ser permitida sem aviso.
 */
export function findVigenciaConflict(mostRecentInspection, referenceDateStr) {
  if (!mostRecentInspection || !referenceDateStr) return null;
  if (mostRecentInspection.status === "cancelada") return null;
  if (!mostRecentInspection.next_inspection) return null;
  if (referenceDateStr > mostRecentInspection.next_inspection) return null;
  return {
    lastInspectionDate: mostRecentInspection.inspection_date,
    nextInspectionDate: mostRecentInspection.next_inspection,
    emAndamento: mostRecentInspection.status === "em_execucao",
  };
}

/**
 * A partir de uma lista de inspeções já carregada (ex.: Inspection.list()),
 * determina, para cada quadro, qual é a inspeção mais recente NÃO CANCELADA
 * — mesmo critério de desempate (maior inspection_date; em empate, maior
 * created_at) usado por inspectionRepository.getMostRecentForPanel — e se
 * ela está vigente na data de referência (ver findVigenciaConflict acima).
 *
 * Fonte única de verdade para "quais quadros têm inspeção vigente" quando
 * já se tem a lista completa de inspeções em memória (listagem de
 * Checklists, relatório em PDF de quadros inspecionados etc.) — evita
 * repetir essa lógica em cada tela e evita N+1 queries, ao contrário de
 * checkPanelVigencia/getMostRecentForPanel, que consultam o banco por um
 * único quadro por vez (fluxo de criação de uma nova inspeção).
 *
 * Retorna um Map `panelId -> { inspection, conflict }` contendo somente os
 * quadros com inspeção vigente.
 */
export function computeVigentesByPanel(inspections, referenceDateStr) {
  const mostRecentByPanel = new Map();
  for (const insp of inspections) {
    if (insp.status === "cancelada") continue;
    const pid = insp.panel_ref_id || insp.panel_id;
    const current = mostRecentByPanel.get(pid);
    if (
      !current ||
      insp.inspection_date > current.inspection_date ||
      (insp.inspection_date === current.inspection_date && (insp.created_at || "") > (current.created_at || ""))
    ) {
      mostRecentByPanel.set(pid, insp);
    }
  }
  const result = new Map();
  for (const [pid, insp] of mostRecentByPanel) {
    const conflict = findVigenciaConflict(insp, referenceDateStr);
    if (conflict) result.set(pid, { inspection: insp, conflict });
  }
  return result;
}

/**
 * Resultado geral da inspeção: reprovado se alguma resposta "não conforme"
 * for de item obrigatório; aprovado com ressalvas se houver "não conforme"
 * em item não obrigatório; aprovado caso contrário.
 */
export function computeOverall(responses, items) {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const ncs = responses.filter((r) => r.resposta === "nao_conforme");
  if (ncs.some((r) => itemById.get(r.template_item_id)?.obrigatorio)) return "reprovado";
  if (ncs.length) return "aprovado_ressalvas";
  return "aprovado";
}

/**
 * Gera as linhas de não-conformidade criadas automaticamente a partir das
 * respostas "não conforme" de uma inspeção.
 */
export function buildAutoNonconformities({ responses, items, inspectionId, panelId, panelTag, sapOrderId, createdBy }) {
  const itemById = new Map(items.map((i) => [i.id, i]));
  return responses
    .filter((r) => r.resposta === "nao_conforme")
    .map((r) => {
      const it = itemById.get(r.template_item_id);
      return {
        panel_id: panelId,
        tag: panelTag || null,
        inspection_id: inspectionId,
        sap_order_id: sapOrderId || null,
        template_item_id: r.template_item_id,
        categoria: it?.modulo_nome || null,
        descricao:
          (r.descricao || "").trim() ||
          `${it?.codigo ? it.codigo + " — " : ""}${it?.titulo || "Item não conforme"}`,
        evidencia_url: r.evidencia_url || null,
        severidade: r.severidade || "media",
        recomendacao: r.recomendacao || null,
        status: "aberta",
        origem: "inspecao",
        created_by: createdBy,
      };
    });
}
