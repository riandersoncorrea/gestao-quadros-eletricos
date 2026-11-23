// Rascunho local do checklist novo (InspectionForm), separado por USUÁRIO e
// UNIDADE OPERACIONAL.
//
// Antes havia uma chave única ("qe:inspection-draft:new"): num aparelho
// compartilhado, quem abrisse o checklist depois via o rascunho de outra
// pessoa, e o rascunho de uma unidade reaparecia na outra. Agora a chave leva
// o id do usuário e o da unidade, e o próprio rascunho guarda o dono — um
// rascunho só é restaurado para o mesmo usuário, na mesma unidade.
//
// Persistência "melhor esforço": falhas do armazenamento (modo privado, cota,
// bloqueio) nunca quebram o formulário.

export const INSPECTION_DRAFT_PREFIX = "qe:inspection-draft:new";
/** Chave antiga, sem dono: descartada (não há como saber de quem é). */
export const LEGACY_INSPECTION_DRAFT_KEY = INSPECTION_DRAFT_PREFIX;
export const INSPECTION_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const ownerIds = (owner) => ({
  userId: owner?.userId ? String(owner.userId) : null,
  unitId: owner?.unitId ? String(owner.unitId) : null,
});

/** Chave do rascunho do usuário na unidade; null sem usuário ou sem unidade. */
export function inspectionDraftKey(owner) {
  const { userId, unitId } = ownerIds(owner);
  if (!userId || !unitId) return null;
  return `${INSPECTION_DRAFT_PREFIX}:${userId}:${unitId}`;
}

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Grava o rascunho (com o dono). Sem usuário/unidade, não grava nada. */
export function saveInspectionDraft(storage, owner, data, now = Date.now()) {
  const key = inspectionDraftKey(owner);
  if (!storage || !key) return false;
  const { userId, unitId } = ownerIds(owner);
  return safe(() => {
    storage.setItem(key, JSON.stringify({ ...data, owner: { userId, unitId }, savedAt: now }));
    return true;
  }, false);
}

/**
 * Lê o rascunho do usuário na unidade. Devolve null (e remove a entrada)
 * quando expirou, quando é de outro checklist (templateId) ou quando o dono
 * gravado não confere com a chave (entrada copiada/adulterada).
 */
export function loadInspectionDraft(storage, owner, { templateId = null, maxAgeMs = INSPECTION_DRAFT_TTL_MS, now = Date.now() } = {}) {
  const key = inspectionDraftKey(owner);
  if (!storage || !key) return null;
  const raw = safe(() => storage.getItem(key));
  if (!raw) return null;
  const draft = safe(() => JSON.parse(raw));
  const { userId, unitId } = ownerIds(owner);
  const invalid = !draft || typeof draft !== "object"
    || draft.owner?.userId !== userId || draft.owner?.unitId !== unitId
    || (maxAgeMs && (!draft.savedAt || now - draft.savedAt > maxAgeMs))
    || (draft.template_id && templateId && draft.template_id !== templateId);
  if (invalid) {
    safe(() => storage.removeItem(key));
    return null;
  }
  return draft;
}

export function clearInspectionDraft(storage, owner) {
  const key = inspectionDraftKey(owner);
  if (storage && key) safe(() => storage.removeItem(key));
}

/** Remove o rascunho da chave antiga (sem dono). */
export function discardLegacyInspectionDraft(storage) {
  if (storage) safe(() => storage.removeItem(LEGACY_INSPECTION_DRAFT_KEY));
}

/** localStorage do navegador, ou null se indisponível. */
export function browserDraftStorage() {
  return safe(() => (typeof localStorage === "undefined" ? null : localStorage));
}
