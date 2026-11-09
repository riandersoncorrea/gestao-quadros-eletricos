// Regras puras de isolamento por unidade operacional (São Luís, EFC, ...).
// Sem imports: testável com `node --test src/domain/unitScope.test.mjs`.
//
// Unidade = electrical_panels.unidade_operacional_id (migration 0016). Tudo o
// que não é quadro (inspeções, NCs, ações, flags, ordens SAP) pertence à
// unidade do SEU quadro (panel_ref_id || panel_id). Nenhum vínculo é
// alterado — o recorte é só de leitura.

/** Código da unidade padrão (comportamento atual do sistema). Único lugar com "SLZ". */
export const DEFAULT_UNIT_CODE = "SLZ";

/** Quadro de uma linha qualquer: inspeção (panel_ref_id/panel_id), NC/ação/flag (panel_id). */
export function panelIdOf(row) {
  const id = row?.panel_ref_id || row?.panel_id;
  return id ? String(id) : null;
}

/**
 * Pertinência de um registro à unidade ativa.
 *  - Depois da migration 0029 os registros filhos têm unidade_operacional_id
 *    própria (herdada do quadro): quando a linha traz essa coluna, vale ela.
 *    Unidade NULL (registro sem quadro, pendente de classificação) não
 *    pertence a nenhuma unidade — nunca vira São Luís por padrão.
 *  - Antes da 0029 (ou em consultas que não trazem a coluna): pelo quadro do
 *    registro; registro SEM quadro aparece só na unidade padrão, como sempre
 *    apareceu (comportamento anterior preservado; nada é gravado).
 */
export function makeUnitMembership(panelIds, { isDefaultUnit, unitId = null }) {
  const ids = new Set([...panelIds].map(String));
  const has = (panelId) => (panelId ? ids.has(String(panelId)) : !!isDefaultUnit);
  const hasRow = (row, getPanelId = panelIdOf) => {
    if (row && Object.prototype.hasOwnProperty.call(row, "unidade_operacional_id") && unitId) {
      return row.unidade_operacional_id === unitId;
    }
    return has(getPanelId(row));
  };
  return { has, hasRow, size: ids.size, isDefaultUnit: !!isDefaultUnit, unitId };
}

/** Membership a partir de quadros já recortados pela unidade (evita nova consulta). */
export function membershipFromPanels(panels, { isDefaultUnit, unitId = null }) {
  return makeUnitMembership((panels || []).map((p) => p.id), { isDefaultUnit, unitId });
}

export function filterByMembership(rows, membership, getPanelId = panelIdOf) {
  return (rows || []).filter((r) => membership.hasRow(r, getPanelId));
}

/**
 * Localidade pertence à unidade? Antes da migration 0028 a coluna
 * localidades.unidade_operacional_id não existe (undefined na linha): todas
 * as localidades existentes são de São Luís, então só aparecem na unidade
 * padrão. Depois da 0028, vale a coluna.
 */
export function localidadeInUnit(localidade, unitId, defaultUnitId) {
  const u = localidade?.unidade_operacional_id;
  if (u === undefined) return unitId === defaultUnitId;
  return u === unitId;
}

/** Recorta a hierarquia Localidade -> Prédio -> Sublocal para a unidade. */
export function scopeHierarchy({ localidades, locais, sublocais }, unitId, defaultUnitId) {
  const locs = (localidades || []).filter((l) => localidadeInUnit(l, unitId, defaultUnitId));
  const locIds = new Set(locs.map((l) => l.id));
  const predios = (locais || []).filter((lc) => locIds.has(lc.localidade_id));
  const predioIds = new Set(predios.map((lc) => lc.id));
  return {
    localidades: locs,
    locais: predios,
    sublocais: (sublocais || []).filter((s) => predioIds.has(s.local_id)),
  };
}

/**
 * Unidades que o usuário pode usar — ponto ÚNICO da regra no frontend.
 *  - `access` (migration 0029: profiles.acesso_todas_unidades +
 *    profile_unidades): { todas, unidadeIds }. O banco aplica a mesma regra
 *    pela RLS; aqui ela só decide o que o seletor oferece.
 *  - `access` null (antes da 0029): regra anterior — admin usa todas as
 *    unidades ativas; os demais perfis só a unidade padrão.
 */
export function getAllowedUnits(units, user, access = null) {
  const ativas = (units || []).filter((u) => u.ativo !== false);
  if (access) {
    if (access.todas) return ativas;
    const ids = new Set(access.unidadeIds || []);
    return ativas.filter((u) => ids.has(u.id));
  }
  if (user?.role === "admin") return ativas;
  return ativas.filter((u) => u.codigo === DEFAULT_UNIT_CODE);
}

/** Administrador geral (0029): admin com acesso a todas as unidades. */
export function isGlobalAdmin(user, access) {
  return user?.role === "admin" && !!access?.todas;
}

/** Unidade ativa: a escolhida (se permitida) ou a padrão. */
export function resolveActiveUnit(allowedUnits, storedUnitId) {
  return (
    allowedUnits.find((u) => u.id === storedUnitId) ||
    allowedUnits.find((u) => u.codigo === DEFAULT_UNIT_CODE) ||
    allowedUnits[0] ||
    null
  );
}

/**
 * Unidade aceita gravações? Depois da 0029 vale a configuração da própria
 * unidade (unidades_operacionais.permite_escrita — a EFC fica false nesta
 * etapa), a mesma que o banco aplica pela RLS. Antes da 0029 (coluna
 * ausente): só a unidade padrão.
 */
export function isWritableUnit(unit) {
  if (!unit) return false;
  if (Object.prototype.hasOwnProperty.call(unit, "permite_escrita")) {
    return !!unit.permite_escrita && unit.ativo !== false;
  }
  return unit.codigo === DEFAULT_UNIT_CODE;
}

/**
 * A unidade usa o nível "site" (electrical_panels.site — Porto/Oficina/
 * Pelotização, só São Luís): unidades_operacionais.usa_site (migration 0028);
 * antes da 0028, só a unidade padrão.
 */
export function unitUsesSite(unit) {
  if (!unit) return false;
  if (Object.prototype.hasOwnProperty.call(unit, "usa_site")) return !!unit.usa_site;
  return unit.codigo === DEFAULT_UNIT_CODE;
}

/**
 * Cadastro de quadro NOVO pela tela: a TAG é gerada pelo banco
 * (next_panel_tag), que só sabe gerar por site (PRT/OFC/PEL). Unidade sem
 * site (EFC) cadastra quadros por planilha (importação); a EDIÇÃO dos
 * quadros dela segue isWritableUnit.
 */
export function canCreatePanelsInUnit(unit) {
  return isWritableUnit(unit) && unitUsesSite(unit);
}

/** Nome do 1º nível da localização na unidade: "Site" (São Luís) ou "Cidade". */
export function localidadeLabel(unit) {
  return unitUsesSite(unit) ? "Site" : "Cidade";
}

/**
 * Identificação da unidade em relatórios, PDFs e planilhas (cabeçalho), para
 * um arquivo gerado numa unidade não ser confundido com o de outra.
 */
export function unitReportLabel(unit) {
  return `Unidade: ${unit?.nome || "—"}`;
}

/**
 * Nome de arquivo com o código da unidade: `${base}${sep}${CODIGO}${sep}${sufixo}.${ext}`
 * (ex.: inventario_quadros_EFC_2026-11-08.xlsx). Mantém o separador já
 * usado por cada exportação.
 */
export function unitFileName(base, unit, suffix, ext, sep = "_") {
  const code = String(unit?.codigo || "SEM-UNIDADE").replace(/[^A-Za-z0-9_-]/g, "");
  return [base, code, suffix].filter(Boolean).join(sep) + `.${ext}`;
}
