import { getCurrentUserId } from "@/auth/authService";
import * as inspectionRepository from "@/repositories/inspectionRepository";
import { bulkCreate as bulkCreateNonconformities } from "@/repositories/ncRepository";
import { updateAfterInspection as updatePanelAfterInspection } from "@/repositories/panelRepository";

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

export async function getActiveTemplate() {
  const tpl = await inspectionRepository.getActiveTemplateRow();
  if (!tpl) return { template: null, items: [] };
  const items = await inspectionRepository.getTemplateItems(tpl.id);
  return { template: tpl, items };
}

export async function ordersForPanel(panelId) {
  if (!panelId) return [];
  return inspectionRepository.getSapOrdersForPanel(panelId);
}

export async function getInspectionFull(id) {
  return inspectionRepository.getInspectionAggregate(id);
}

export function computeOverall(responses, items) {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const ncs = responses.filter((r) => r.resposta === "nao_conforme");
  if (ncs.some((r) => itemById.get(r.template_item_id)?.obrigatorio)) return "reprovado";
  if (ncs.length) return "aprovado_ressalvas";
  return "aprovado";
}

/**
 * Cria a inspeção com respostas, medições, termografia e gera automaticamente
 * uma não-conformidade para cada item respondido como "Não Conforme".
 * (Supabase JS não tem transação — inserts são sequenciais.)
 */
export async function createInspection({ header, responses, measurements, thermography, template, items }) {
  const uid = await getCurrentUserId();
  const itemById = new Map(items.map((i) => [i.id, i]));
  const answered = responses.filter((r) => r.resposta);
  const overall = computeOverall(answered, items);

  const insp = await inspectionRepository.insertInspection({
    panel_id: header.panel_id,
    panel_ref_id: header.panel_id,
    panel_name: header.panel_name,
    inspection_date: header.inspection_date,
    inspector_name: header.inspector_name,
    frequency: header.frequency || null,
    next_inspection: header.next_inspection || null,
    overall_result: overall,
    observacoes: header.observacoes || null,
    assinatura_url: header.assinatura_url || null,
    template_id: template?.id ?? null,
    sap_order_id: header.sap_order_id || null,
    status: "executada",
    created_by: uid,
  });

  const respRows = answered.map((r) => {
    const it = itemById.get(r.template_item_id);
    return {
      inspection_id: insp.id,
      template_item_id: r.template_item_id,
      modulo: it?.modulo ?? null,
      titulo: it?.titulo ?? null,
      resposta: r.resposta,
      justificativa: r.justificativa || null,
      motivo: r.motivo || null,
      observacao: r.observacao || null,
      evidencia_url: r.evidencia_url || null,
    };
  });
  await inspectionRepository.insertResponses(respRows);

  const measRows = measurements
    .filter((m) => m.categoria && m.unidade)
    .map((m) => ({
      inspection_id: insp.id,
      panel_id: header.panel_id,
      categoria: m.categoria,
      parametro: m.parametro || null,
      valor: num(m.valor),
      unidade: m.unidade,
      instrumento: m.instrumento || null,
      instrumento_serie: m.instrumento_serie || null,
      limite_min: num(m.limite_min),
      limite_max: num(m.limite_max),
      resultado: m.resultado || null,
      observacao: m.observacao || null,
    }));
  await inspectionRepository.insertMeasurements(measRows);

  const thermoRows = thermography
    .filter((t) => t.equipamento || t.ponto || t.temperatura !== "")
    .map((t) => ({
      inspection_id: insp.id,
      panel_id: header.panel_id,
      equipamento: t.equipamento || null,
      ponto: t.ponto || null,
      temperatura: num(t.temperatura),
      temperatura_ambiente: num(t.temperatura_ambiente),
      delta_t:
        t.temperatura !== "" && t.temperatura_ambiente !== ""
          ? Number(t.temperatura) - Number(t.temperatura_ambiente)
          : null,
      instrumento: t.instrumento || null,
      imagem_url: t.imagem_url || null,
      imagem_termografica_url: t.imagem_termografica_url || null,
      observacao: t.observacao || null,
      diagnostico: t.diagnostico || null,
      criticidade: t.criticidade || null,
    }));
  await inspectionRepository.insertThermography(thermoRows);

  const ncRows = answered
    .filter((r) => r.resposta === "nao_conforme")
    .map((r) => {
      const it = itemById.get(r.template_item_id);
      return {
        panel_id: header.panel_id,
        tag: header.panel_tag || null,
        inspection_id: insp.id,
        sap_order_id: header.sap_order_id || null,
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
        created_by: uid,
      };
    });
  await bulkCreateNonconformities(ncRows);

  await updatePanelAfterInspection(header.panel_id, {
    last_inspection_date: header.inspection_date,
    ...(header.next_inspection ? { next_inspection_date: header.next_inspection } : {}),
  });

  try {
    const { recomputeInspectionAnalysis } = await import("@/services/healthIndexService");
    await recomputeInspectionAnalysis(insp.id);
  } catch (e) {
    console.error("Falha ao calcular Índice de Saúde da inspeção:", e);
  }

  return insp;
}
