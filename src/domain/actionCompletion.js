// Requisitos para concluir uma ação corretiva (evidência da correção).
// Mesma regra imposta no banco pelo trigger check_action_completion
// (supabase/migrations/0017_action_correction_evidence.sql) — aqui ela é
// verificada antes, para a UI mostrar exatamente o que falta sem depender
// do erro do banco. O PDF de evidência não entra nesta lista: ele é gerado
// pelo próprio sistema no ato da conclusão (services/actionService.js).

export const MIN_CORRECTIVE_PHOTOS = 1;
export const MAX_CORRECTIVE_PHOTOS = 3;

const isBlank = (v) => !String(v ?? "").trim();

/**
 * Lista (em texto para o usuário) do que falta para concluir a ação.
 * Vazia = pode concluir.
 */
export function missingCompletionRequirements({ numero_nota, om, fotos_corretiva } = {}) {
  const missing = [];
  if (isBlank(numero_nota)) missing.push("Número da Nota");
  if (isBlank(om)) missing.push("OM");
  const fotos = (fotos_corretiva || []).length;
  if (fotos < MIN_CORRECTIVE_PHOTOS) {
    missing.push(MIN_CORRECTIVE_PHOTOS === 1 ? "ao menos 1 foto da corretiva" : `ao menos ${MIN_CORRECTIVE_PHOTOS} fotos da corretiva`);
  }
  if (fotos > MAX_CORRECTIVE_PHOTOS) missing.push(`no máximo ${MAX_CORRECTIVE_PHOTOS} fotos da corretiva`);
  return missing;
}

export function canAddCorrectivePhoto(fotos_corretiva) {
  return (fotos_corretiva || []).length < MAX_CORRECTIVE_PHOTOS;
}
