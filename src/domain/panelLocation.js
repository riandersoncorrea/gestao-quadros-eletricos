// Localização de um quadro para exibição (ex.: página de Ações, para o
// inspetor abrir Nota/OM sem sair da tela). Função pura — só monta o que
// já existe no cadastro do quadro; nenhum dado é duplicado na ação.
//
// Mapeamento dos campos (sem mudar o significado de nenhum deles):
//  - Localidade      -> unidades_operacionais.nome (via
//                       electrical_panels.unidade_operacional_id): a unidade
//                       macro (São Luís, EFC);
//  - Site            -> localidades.nome (via electrical_panels.localidade_id):
//                       subdivisão de São Luís (Porto, Oficina, Pelotização),
//                       raiz da hierarquia Site -> Prédio -> Sublocal;
//  - Local (Prédio)  -> locais.nome (via local_id);
//  - Sublocal        -> sublocais.nome (via sublocal_id);
//  - Quadro          -> tag (+ name);
//  - SAP             -> sap_functional_location / sap_equipment_number.

/**
 * `panel`: linha de electrical_panels; `hierarchy`: { localidades, locais,
 * sublocais } (fetchHierarchy); `unidades`: unidades_operacionais. Campos
 * ausentes viram null — a tela mostra "—" e nunca quebra.
 */
export function buildPanelLocation(panel, hierarchy, unidades) {
  if (!panel) return null;
  const find = (list, id) => (id ? (list || []).find((x) => x.id === id) : null);
  return {
    panelId: panel.id,
    unidade: find(unidades, panel.unidade_operacional_id)?.nome ?? null,
    site: find(hierarchy?.localidades, panel.localidade_id)?.nome ?? null,
    predio: find(hierarchy?.locais, panel.local_id)?.nome ?? null,
    sublocal: find(hierarchy?.sublocais, panel.sublocal_id)?.nome ?? null,
    tag: panel.tag || null,
    nome: panel.name || null,
    sapLocal: panel.sap_functional_location || null,
    sapEquipamento: panel.sap_equipment_number || null,
  };
}
