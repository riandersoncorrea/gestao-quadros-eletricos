import { getCurrentUserId } from "@/auth/authService";
import * as inspectionRepository from "@/repositories/inspectionRepository";
import { bulkCreate as bulkCreateNonconformities } from "@/repositories/ncRepository";
import * as actionRepository from "@/repositories/actionRepository";
import { updateAfterInspection as updatePanelAfterInspection, getSite as getPanelSite } from "@/repositories/panelRepository";
import { computeOverall, buildAutoNonconformities, buildAutoActions, findVigenciaConflict } from "@/domain/inspectionRules";
import { responsiblesForSite } from "@/domain/siteResponsibles";
import { isOpenAction } from "@/domain/actionRules";
import { SAFETY_FORM_CODES } from "@/domain/safetyFormExport";

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

/** Erro lançado quando o quadro já possui uma inspeção vigente e a criação não foi forçada (ver createInspection). */
export class InspectionVigenteError extends Error {
  constructor(details) {
    super("Este quadro já possui uma inspeção vigente.");
    this.name = "InspectionVigenteError";
    this.code = "INSPECTION_VIGENTE";
    this.details = details;
  }
}

/**
 * Verifica se o quadro já possui uma inspeção vigente na data informada
 * (ver a regra em domain/inspectionRules.js#findVigenciaConflict). Consulta
 * sempre a inspeção mais recente diretamente no banco (sem cache), para que
 * a checagem no momento de salvar reflita inspeções criadas por outro
 * usuário entre a abertura do formulário e o envio.
 */
export async function checkPanelVigencia(panelId, referenceDateStr) {
  if (!panelId || !referenceDateStr) return null;
  const last = await inspectionRepository.getMostRecentForPanel(panelId);
  return findVigenciaConflict(last, referenceDateStr);
}

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

export { computeOverall };

/** Respostas dos códigos usados pela exportação do Form Segurança, para um conjunto de inspeções — ver domain/safetyFormExport.js. */
export async function getSafetyFormResponses(inspectionIds) {
  return inspectionRepository.getResponsesByCodesForInspections(inspectionIds, SAFETY_FORM_CODES);
}

/**
 * Cria a inspeção com respostas, medições, termografia e gera automaticamente
 * uma não-conformidade para cada item respondido como "Não Conforme".
 * (Supabase JS não tem transação — inserts são sequenciais.)
 */
export async function createInspection({ header, responses, measurements, thermography, template, items, forceDuplicate = false }) {
  // Segunda validação (a primeira é feita pela UI ao selecionar o quadro):
  // reconsulta a inspeção mais recente do quadro imediatamente antes de
  // gravar, para pegar uma inspeção vigente criada por outro usuário nesse
  // meio-tempo. `forceDuplicate` só é true depois que o usuário confirmou
  // explicitamente "Continuar mesmo assim" no aviso.
  if (!forceDuplicate) {
    const conflict = await checkPanelVigencia(header.panel_id, header.inspection_date);
    if (conflict) throw new InspectionVigenteError(conflict);
  }

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
      area_molhada: r.area_molhada ?? null,
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

  const ncRows = buildAutoNonconformities({
    responses: answered,
    items,
    inspectionId: insp.id,
    panelId: header.panel_id,
    panelTag: header.panel_tag,
    sapOrderId: header.sap_order_id,
    createdBy: uid,
  });
  const createdNcs = await bulkCreateNonconformities(ncRows);

  // Uma ação automática por NC, no mesmo momento da criação das NCs. Falha
  // aqui não desfaz a inspeção (já gravada — não há transação): o retorno
  // sinaliza para a tela avisar, e a ação pode ser aberta manualmente na NC.
  let autoActionsError = null;
  try {
    await createAutoActions({ ncs: createdNcs, items, panelId: header.panel_id, createdBy: uid });
  } catch (e) {
    console.error("Falha ao criar as ações automáticas das NCs:", e);
    autoActionsError = e;
  }

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

  return { ...insp, autoActionsError };
}

/**
 * Cria as ações automáticas das NCs recém-criadas de uma inspeção (regras
 * em domain/inspectionRules.js#buildAutoActions). A NC continua "aberta" —
 * diferente da ação manual, a automática não indica tratamento em curso.
 * Duplicação é impedida no banco (índice único uq_actions_auto_por_nc,
 * migration 0022).
 */
async function createAutoActions({ ncs, items, panelId, createdBy }) {
  if (!ncs.length) return [];
  const site = await getPanelSite(panelId);
  const candidates = responsiblesForSite(site);

  const openCounts = {};
  const lastAssignedAt = {};
  if (candidates.length > 1) {
    const rows = await actionRepository.listForResponsibles(candidates.map((c) => c.id));
    for (const a of rows) {
      if (isOpenAction(a.status)) openCounts[a.responsavel_id] = (openCounts[a.responsavel_id] || 0) + 1;
      if (a.origem === "automatica" && (a.created_at || "") > (lastAssignedAt[a.responsavel_id] || "")) {
        lastAssignedAt[a.responsavel_id] = a.created_at;
      }
    }
  }

  const rows = buildAutoActions({ ncs, items, site, openCounts, lastAssignedAt, createdBy });
  return actionRepository.bulkCreate(rows);
}
