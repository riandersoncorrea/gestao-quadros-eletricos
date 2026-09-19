// Monta os dados do relatório em PDF de "quadros já inspecionados" (apoio
// ao planejamento/divisão de inspeções). Função pura — sem acesso a rede
// nem a jsPDF; a renderização do PDF fica em
// src/services/inspectedPanelsPdfService.js.
import { computeVigentesByPanel } from "./inspectionRules";

// Mesma configuração de ordenação natural pt-BR já usada para a hierarquia
// de localidades (ver hierarchyCollator em repositories/panelRepository.js)
// — garante "QD-2" antes de "QD-10" em vez de ordenação lexicográfica pura.
const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/**
 * Constrói o relatório de quadros com inspeção vigente, agrupado por
 * localidade (ordem alfabética/natural), com os quadros de cada grupo
 * também em ordem alfabética/natural pela identificação oficial do quadro
 * (electrical_panels.tag — a mesma usada no combobox de seleção de quadro
 * e nos cartões da Checklist).
 *
 * Reaproveita a MESMA regra de vigência da proteção contra inspeção
 * duplicada (computeVigentesByPanel/findVigenciaConflict, em
 * domain/inspectionRules.js) — não define uma segunda regra.
 *
 * `filteredInspectionIds` é o conjunto de ids de inspeção que já passaram
 * pelos filtros ativos na página de Checklists (busca, localidade, período,
 * resultado — o próprio array `filtered` calculado pela página). Um quadro
 * só entra no relatório se a inspeção que define sua vigência também
 * pertencer a esse conjunto — assim o relatório respeita exatamente os
 * mesmos filtros já aplicados em tela, sem reimplementar a lógica de
 * filtro (que continua vivendo só na página).
 */
export function buildInspectedPanelsReport({ inspections, panels, hierarchy, filteredInspectionIds, referenceDateStr }) {
  const vigentesByPanel = computeVigentesByPanel(inspections, referenceDateStr);
  const panelsById = new Map((panels || []).map((p) => [p.id, p]));
  const localidadesById = new Map((hierarchy?.localidades || []).map((l) => [l.id, l]));

  const rows = [];
  for (const [panelId, { inspection, conflict }] of vigentesByPanel) {
    if (!filteredInspectionIds.has(inspection.id)) continue;
    const panel = panelsById.get(panelId);
    const localidade = panel ? localidadesById.get(panel.localidade_id) : null;
    rows.push({
      tag: panel?.tag || inspection.panel_name || "Quadro não identificado",
      localidadeNome: localidade?.nome || "Sem localidade",
      ultimaInspecao: conflict.lastInspectionDate,
      proximaInspecao: conflict.nextInspectionDate,
      responsavel: inspection.inspector_name || "—",
      statusLabel: conflict.emAndamento ? "Em andamento" : "Inspeção vigente",
    });
  }

  const groupsMap = new Map();
  for (const row of rows) {
    if (!groupsMap.has(row.localidadeNome)) groupsMap.set(row.localidadeNome, []);
    groupsMap.get(row.localidadeNome).push(row);
  }

  const groups = [...groupsMap.entries()]
    .map(([nome, quadros]) => ({
      nome,
      quadros: [...quadros].sort((a, b) => collator.compare(a.tag, b.tag)),
    }))
    .sort((a, b) => collator.compare(a.nome, b.nome));

  return {
    generatedAt: new Date(),
    totalQuadros: rows.length,
    totalLocalidades: groups.length,
    groups,
  };
}
