// Base RAC (tela de Não Conformidades): uma linha por NC dos quadros
// elegíveis da unidade ativa, para filtrar no Excel por categoria e
// enquadrar quadros na meta RAC. Função pura — sem rede nem Excel; a busca
// fica em services/racExportService.js e o arquivo em racExcelService.js.
//
// Regras (todas reaproveitam dados/regras que já existem no sistema):
//  - Quadro: só "ativo" e "manutencao" (domain/panelStatus.js). NC sem
//    quadro, ou de quadro inativo/de outra unidade, não entra.
//  - NC: todos os status (aberta, em tratamento, concluída, cancelada), com
//    a coluna "Status da NC" — nada é descartado em silêncio.
//  - Categoria e descrição: as do item do checklist que originou a NC
//    (nonconformities.template_item_id -> inspection_template_items:
//    modulo_nome; "codigo — titulo", o mesmo formato com que a NC é criada).
//    NC sem item (manual): a categoria e a descrição gravadas na própria NC.
//  - Categoria "Identificação" fica fora da exportação (comparação sem
//    acento e sem caixa). Só a exportação: nenhum dado é alterado.
//  - Site: em unidade com site (São Luís), electrical_panels.site
//    (Porto/Oficina/Pelotização); nas demais (EFC), a cidade =
//    localidades.nome do quadro.
//  - Local / Sublocal: locais.nome / sublocais.nome do quadro.
//  - Última inspeção: maior inspection_date entre as inspeções NÃO
//    canceladas do quadro (mesmo critério de getMostRecentForPanel).
//  - Próxima inspeção: electrical_panels.next_inspection_date (a data que
//    o sistema já mantém e exibe no Inventário, Mapa e Dashboard). Vazia se
//    o quadro não tiver.
//  - Risco de interdição: "Sim" se o quadro tem ao menos uma NC que entra no
//    relatório Risco de Interdição (histórico: aberta ou já corrigida —
//    domain/interdictionReport.js#classifyRiskNc); senão "Não".
import { isOperationalPanel } from "./panelStatus.js";

export const RAC_COLUMNS = [
  "TAG",
  "Site",
  "Local",
  "Sublocal",
  "Categoria da NC",
  "ID da NC",
  "Descrição da NC",
  "Data da última inspeção",
  "Data da próxima inspeção",
  "Risco de interdição?",
  "Status da NC",
];

/** Colunas de data (gravadas como data no Excel, não como texto). */
export const RAC_DATE_COLUMNS = ["Data da última inspeção", "Data da próxima inspeção"];

export const EXCLUDED_CATEGORY = "Identificação";

/** Rótulos de electrical_panels.site (os mesmos do cadastro do quadro). */
export const SITE_LABEL = { porto: "Porto", oficina: "Oficina", pelotizacao: "Pelotização" };

/** Rótulos do status da NC (os mesmos da tela de Não Conformidades). */
export const NC_STATUS_LABEL = {
  aberta: "Aberta",
  em_tratamento: "Em tratamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const norm = (s) => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function isExcludedCategory(categoria) {
  return norm(categoria) === norm(EXCLUDED_CATEGORY);
}

/** Exportação RAC: só administrador (mesmo perfil do relatório Risco de Interdição). */
export function canExportRac(role) {
  return role === "admin";
}

/** Categoria e descrição de uma NC: as do item de origem; sem item, as da própria NC. */
export function ncCategoryAndDescription(nc, item) {
  if (item) {
    return {
      categoria: item.modulo_nome || "",
      descricao: `${item.codigo ? `${item.codigo} — ` : ""}${item.titulo || ""}`.trim(),
    };
  }
  return { categoria: nc.categoria || "", descricao: nc.descricao || "" };
}

/** Map quadro -> data ("yyyy-mm-dd") da inspeção não cancelada mais recente. */
export function lastInspectionByPanel(inspections) {
  const last = new Map();
  for (const i of inspections || []) {
    if (i.status === "cancelada" || !i.inspection_date) continue;
    const pid = String(i.panel_ref_id || i.panel_id || "");
    if (!pid) continue;
    const day = String(i.inspection_date).slice(0, 10);
    if (!last.has(pid) || day > last.get(pid)) last.set(pid, day);
  }
  return last;
}

/** "yyyy-mm-dd" -> Date (meia-noite UTC: o Excel mostra o mesmo dia) ou null. */
export function toExcelDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/**
 * Linhas da base (uma por NC), na ordem TAG → categoria → descrição → id.
 * Entradas: `panels` (da unidade ativa, com status), `ncs`, `templateItems`
 * (todas as versões do catálogo), `inspections`, `hierarchy`
 * ({ localidades, locais, sublocais }), `usesSite` (unidade com site) e
 * `riskPanelIds` (Set de ids, texto).
 */
export function buildRacRows({ panels, ncs, templateItems, inspections, hierarchy, usesSite, riskPanelIds }) {
  const eligible = new Map((panels || []).filter(isOperationalPanel).map((p) => [String(p.id), p]));
  const itemById = new Map((templateItems || []).map((it) => [it.id, it]));
  const nome = (list) => new Map((list || []).map((x) => [x.id, x.nome]));
  const locName = nome(hierarchy?.localidades);
  const predioName = nome(hierarchy?.locais);
  const subName = nome(hierarchy?.sublocais);
  const lastByPanel = lastInspectionByPanel(inspections);
  const risk = riskPanelIds || new Set();

  const seen = new Set();
  const rows = [];
  for (const nc of ncs || []) {
    const panel = nc.panel_id ? eligible.get(String(nc.panel_id)) : null;
    if (!panel || seen.has(nc.id)) continue;
    const { categoria, descricao } = ncCategoryAndDescription(nc, itemById.get(nc.template_item_id));
    if (isExcludedCategory(categoria)) continue;
    seen.add(nc.id);
    const site = usesSite ? (SITE_LABEL[panel.site] || panel.site || "") : (locName.get(panel.localidade_id) || "");
    rows.push({
      "TAG": String(panel.tag ?? ""),
      "Site": site,
      "Local": predioName.get(panel.local_id) || "",
      "Sublocal": subName.get(panel.sublocal_id) || "",
      "Categoria da NC": categoria,
      "ID da NC": String(nc.id),
      "Descrição da NC": descricao,
      "Data da última inspeção": toExcelDate(lastByPanel.get(String(panel.id))),
      "Data da próxima inspeção": toExcelDate(panel.next_inspection_date),
      "Risco de interdição?": risk.has(String(panel.id)) ? "Sim" : "Não",
      "Status da NC": NC_STATUS_LABEL[nc.status] || nc.status || "",
    });
  }
  return rows.sort((a, b) =>
    collator.compare(a["TAG"], b["TAG"])
    || collator.compare(a["Categoria da NC"], b["Categoria da NC"])
    || collator.compare(a["Descrição da NC"], b["Descrição da NC"])
    || (a["ID da NC"] < b["ID da NC"] ? -1 : a["ID da NC"] > b["ID da NC"] ? 1 : 0));
}
