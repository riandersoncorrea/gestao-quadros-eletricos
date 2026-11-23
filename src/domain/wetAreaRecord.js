// Registro POSTERIOR da área molhada (PRO-01) pelo administrador — migration
// 0037 (public.registrar_area_molhada). Pendência B1 da EFC: checklists
// históricos sem a pergunta ficam fora do risco de interdição (regra atual:
// PRO-01 não conforme + área molhada = Sim). Nada é preenchido por
// suposição: o administrador registra Sim/Não com a fonte da informação.
import { WET_AREA_CHECK_CODE } from "@/domain/inspectionRules";

export const WET_AREA_MIN_JUSTIFICATION = 10;

/** Resposta de PRO-01 "Não conforme" ainda sem a informação de área molhada. */
export function needsWetAreaRecord(response) {
  return response?.codigo === WET_AREA_CHECK_CODE
    && response?.resposta === "nao_conforme"
    && (response?.area_molhada === null || response?.area_molhada === undefined);
}

/** A área molhada foi registrada depois do checklist (e não no formulário). */
export function wetAreaRecordedLater(response) {
  return !!response?.area_molhada_registrada_em;
}

/** Mensagem de validação do formulário de registro, ou null se válido. */
export function wetAreaRecordError({ value, justificativa }) {
  if (value !== true && value !== false) return "Informe se o quadro alimenta pontos em área molhada (Sim ou Não).";
  if (String(justificativa ?? "").trim().length < WET_AREA_MIN_JUSTIFICATION) {
    return `Informe a fonte da informação (mínimo de ${WET_AREA_MIN_JUSTIFICATION} caracteres).`;
  }
  return null;
}
