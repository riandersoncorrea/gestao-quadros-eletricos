// Relatório "Quadros sem checklist" (página Inventário): quadros cadastrados
// que não têm NENHUMA inspeção/checklist associada. Função pura — sem acesso
// a rede; os dados vêm de services/checklistCoverageService.js. A regra de
// "sem checklist" é a compartilhada de domain/checklistCoverage.js.
import { buildPanelLocation } from "./panelLocation";
import { panelsWithoutChecklist } from "./checklistCoverage";

export const FILTER_ALL = "all";

export const PANEL_STATUS_LABEL = { ativo: "Ativo", inativo: "Inativo", manutencao: "Manutenção" };

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

function matches(value, filter) {
  return filter === FILTER_ALL || value === filter;
}

/**
 * `filters`: { unidadeId, localidadeId, status } — cada um um id/valor ou
 * FILTER_ALL. Unidade = electrical_panels.unidade_operacional_id (genérico,
 * vale para São Luís, EFC ou qualquer unidade nova); Site =
 * electrical_panels.localidade_id.
 *
 * Retorna { rows, total, totalNoRecorte } — `totalNoRecorte` é quantos
 * quadros existem no recorte (com ou sem checklist), para a tela distinguir
 * "todos têm checklist" de "nenhum quadro neste recorte".
 */
export function buildPanelsWithoutChecklistReport({ panels, inspectionLinks, hierarchy, unidades, filters }) {
  const { unidadeId = FILTER_ALL, localidadeId = FILTER_ALL, status = FILTER_ALL } = filters || {};
  const noRecorte = (panels || []).filter((p) =>
    matches(p.unidade_operacional_id, unidadeId)
    && matches(p.localidade_id, localidadeId)
    && matches(p.status, status)
  );

  const rows = panelsWithoutChecklist(noRecorte, inspectionLinks)
    .map((p) => {
      const loc = buildPanelLocation(p, hierarchy, unidades);
      return {
        id: p.id,
        tag: p.tag || "",
        nome: p.name || "",
        unidade: loc.unidade || "",
        site: loc.site || "",
        predio: loc.predio || "",
        sublocal: loc.sublocal || "",
        tipo: p.panel_type === "outro" ? (p.panel_type_custom || "Outro") : (p.panel_type || ""),
        tensao: p.voltage_nominal || "",
        frequencia: p.frequency_hz || "",
        status: PANEL_STATUS_LABEL[p.status] || p.status || "",
        sapLocal: p.sap_functional_location || "",
        sapEquipamento: p.sap_equipment_number || "",
      };
    })
    .sort((a, b) =>
      collator.compare(a.unidade, b.unidade)
      || collator.compare(a.site, b.site)
      || collator.compare(a.predio, b.predio)
      || collator.compare(a.tag, b.tag)
    );

  return { rows, total: rows.length, totalNoRecorte: noRecorte.length };
}

/**
 * Linha do Excel (uma por quadro) — mesmas linhas, na mesma ordem, que a
 * tabela em tela; nenhuma filtragem adicional aqui.
 */
export function toExportRow(row) {
  return {
    "Tag": row.tag,
    "Nome Descritivo": row.nome,
    "Localidade": row.unidade,
    "Site": row.site,
    "Local (Prédio)": row.predio,
    "Sublocal": row.sublocal,
    "Tipo de Quadro": row.tipo,
    "Tensão Nominal": row.tensao,
    "Frequência": row.frequencia,
    "Status Operacional": row.status,
    "Local de Instalação SAP": row.sapLocal,
    "Nº do Equipamento SAP": row.sapEquipamento,
  };
}
