// Exportação da base do "Form Segurança" (outro setor) a partir das
// inspeções/checklists já salvos no sistema. Função pura — sem acesso a
// rede nem a xlsx; a geração do arquivo fica em
// src/services/safetyFormExportService.js.
//
// Mapeamento oficial (não inventar nem renumerar códigos): cada pergunta
// do nosso catálogo de checklist (por `codigo`) vira uma coluna do Form
// Segurança, na ordem abaixo.
export const SAFETY_FORM_QUESTION_MAP = [
  { codigo: "ID-05", header: "1 - O PAINEL POSSUI REGISTRO NO SAP ?" },
  { codigo: "ATR-01", header: "2- O PAINEL POSSUI ATERRAMENTO E ESTÁ FUNCIONAL?" },
  { codigo: "PRO-01", header: "3- O PAINEL POSSUÍ DISJUNTOR RESIDUAL E ESTÁ FUNCIONAL ?" },
  { codigo: "PRO-02", header: "4- O PAINEL POSSUI DPS (DISPOSITIVO DE PROTEÇÃO CONTRA SURTO), E ESTÁ FUNCIONAL?" },
  { codigo: "PRO-03", header: "5- O PAINEL POSSUI DISJUNTOR TERMOMAGNETICO E ESTÁ FUNCIONAL?" },
];

export const SAFETY_FORM_CODES = SAFETY_FORM_QUESTION_MAP.map((q) => q.codigo);

// Só uma coluna de TAG: "TAG do quadro" e "INFORME O TAG/IDENTIFICAÇÃO DO
// PAINEL:" são o mesmo dado (electrical_panels.tag) — confirmado e
// removida a duplicata a pedido do usuário.
export const TAG_FORM_HEADER = "INFORME O TAG/IDENTIFICAÇÃO DO PAINEL:";
export const PHOTO_HEADER = "1.1 - REGISTRE A FOTO DO PAINEL INSPECIONADO";

/**
 * Conversão de resposta do Checklist para o vocabulário do Form Segurança.
 * Só "conforme"/"nao_conforme" têm equivalente — qualquer outro valor
 * (N/A, não verificado, ou a pergunta simplesmente não ter resposta
 * salva nessa inspeção, comum em inspeções antigas de antes do código
 * existir no catálogo) fica vazio. Nunca inventa "INEXISTENTE" como
 * default.
 */
export function mapRespostaToSafetyForm(resposta) {
  if (resposta === "conforme") return "EXISTE E FUNCIONA";
  if (resposta === "nao_conforme") return "INEXISTENTE";
  return "";
}

/**
 * Monta as linhas do Excel: uma linha por inspeção (a lista `inspections`
 * já deve vir filtrada pelos filtros da página — ver InspectionList.jsx),
 * colunas na ordem oficial do mapeamento.
 *
 * `respostas` é a lista plana { inspection_id, codigo, resposta } vinda de
 * getSafetyFormResponses (services/inspectionService.js) — indexada aqui
 * por inspeção para montar cada linha em O(1), sem N+1.
 *
 * `panelsById` mapeia id do quadro (electrical_panels.id) -> quadro
 * completo (para tag e photo_url) — os mesmos quadros já carregados pela
 * página, não uma consulta nova.
 */
export function buildSafetyFormRows({ inspections, panelsById, respostas }) {
  const byInspection = new Map();
  for (const r of respostas) {
    if (!byInspection.has(r.inspection_id)) byInspection.set(r.inspection_id, new Map());
    byInspection.get(r.inspection_id).set(r.codigo, r.resposta);
  }

  return inspections.map((insp) => {
    const panel = panelsById.get(insp.panel_ref_id || insp.panel_id);
    // Mesma TAG oficial exibida no resto do sistema (electrical_panels.tag);
    // panel_name (denormalizado na própria inspeção) só entra como
    // reserva, se o quadro não puder mais ser resolvido.
    const tag = panel?.tag || insp.panel_name || "";
    const respMap = byInspection.get(insp.id) || new Map();

    const row = {
      [TAG_FORM_HEADER]: tag,
    };
    for (const { codigo, header } of SAFETY_FORM_QUESTION_MAP) {
      row[header] = mapRespostaToSafetyForm(respMap.get(codigo));
    }
    // Foto do painel: mesmo campo público já usado em PanelDetail/QR Code/
    // página pública (electrical_panels.photo_url) — não é por pergunta,
    // é a foto de referência do quadro. Vazio quando o quadro não tem foto.
    row[PHOTO_HEADER] = panel?.photo_url || "";
    return row;
  });
}
