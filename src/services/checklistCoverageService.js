import { listForChecklistCoverage } from "@/repositories/panelRepository";
import { listPanelLinks } from "@/repositories/inspectionRepository";

/**
 * Dados atuais do banco para o relatório "Quadros sem checklist": quadros
 * + vínculo inspeção → quadro, em paralelo (2 consultas paginadas, não uma
 * por quadro). Sem cache próprio — cada geração do relatório lê de novo.
 */
// Quadros: só da unidade ativa (listForChecklistCoverage recorta). Os
// vínculos inspeção -> quadro servem só para marcar esses quadros — vínculo
// de quadro de outra unidade não casa com nenhum quadro listado.
export async function fetchChecklistCoverageData() {
  const [panels, inspectionLinks] = await Promise.all([listForChecklistCoverage(), listPanelLinks()]);
  return { panels, inspectionLinks };
}

/**
 * Só o vínculo inspeção → quadro, lido na hora (sem cache) — para quem já
 * tem os quadros carregados (ex.: Mapa, ao calcular a rota de inspeções).
 */
export async function fetchInspectionLinks() {
  return listPanelLinks();
}
