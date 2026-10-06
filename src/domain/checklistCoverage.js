// Regra ÚNICA de "quadro sem checklist", compartilhada pelo relatório do
// Inventário (domain/panelsWithoutChecklistReport.js) e pelo planejamento de
// rota de inspeções do Mapa (domain/inspectionRoute.js). Função pura.
//
// Um quadro tem checklist se existe ao menos uma linha em `inspections`
// apontando para ele, por `panel_ref_id` (FK uuid) ou pela coluna legada
// `panel_id` (text) — o mesmo vínculo `panel_ref_id || panel_id` usado no
// resto do app. Status, resultado, NCs, risco e data da inspeção NÃO
// importam. Os vínculos vêm de inspectionRepository.listPanelLinks().

/** Ids (string) de todos os quadros que têm ao menos uma inspeção. */
export function panelIdsWithChecklist(inspectionLinks) {
  const ids = new Set();
  for (const link of inspectionLinks || []) {
    if (link.panel_ref_id) ids.add(String(link.panel_ref_id));
    if (link.panel_id) ids.add(String(link.panel_id));
  }
  return ids;
}

/** Só os quadros de `panels` sem nenhum checklist associado. */
export function panelsWithoutChecklist(panels, inspectionLinks) {
  const withChecklist = panelIdsWithChecklist(inspectionLinks);
  return (panels || []).filter((p) => !withChecklist.has(String(p.id)));
}
