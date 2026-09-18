import { getCurrentUserId } from "@/auth/authService";
import { uploadFile, remove as removeFromStorage } from "@/storage/storageService";
import * as panelAttachmentRepository from "@/repositories/panelAttachmentRepository";

export const MAX_DIAGRAMS = 5;
const TIPO_DIAGRAMA = "diagrama_unifilar";

/** Diagramas já persistidos de um quadro. */
export async function listDiagrams(panelId) {
  return panelAttachmentRepository.listByPanel(panelId);
}

/**
 * Total de diagramas do quadro: anexos novos + diagrama legado
 * (`electrical_panels.diagram_url`), quando existir. O legado também ocupa
 * uma vaga das 5 permitidas, por ser um dos diagramas do quadro.
 */
export function countDiagrams(attachments, hasLegacyDiagram) {
  return (attachments?.length || 0) + (hasLegacyDiagram ? 1 : 0);
}

export function remainingSlots(attachments, hasLegacyDiagram) {
  return Math.max(MAX_DIAGRAMS - countDiagrams(attachments, hasLegacyDiagram), 0);
}

/** Envia o arquivo ao Storage já existente, sem ainda vinculá-lo a um quadro. */
export async function uploadDiagramFile(file) {
  const { file_url } = await uploadFile({ file });
  return { file_url, file_name: file.name };
}

/**
 * Vincula diagramas já enviados ao Storage a um quadro. Revalida o limite
 * de MAX_DIAGRAMS (anexos existentes + diagrama legado, se houver) antes de
 * gravar qualquer linha — não confia apenas na checagem feita na interface.
 */
export async function attachDiagrams(panelId, diagramFiles, { attachments = [], hasLegacyDiagram = false } = {}) {
  if (diagramFiles.length === 0) return [];
  const current = countDiagrams(attachments, hasLegacyDiagram);
  if (current + diagramFiles.length > MAX_DIAGRAMS) {
    throw new Error(`Limite de ${MAX_DIAGRAMS} diagramas por quadro (${current}/${MAX_DIAGRAMS} já anexado(s)).`);
  }
  const uid = await getCurrentUserId();
  const created = [];
  for (const { file_url, file_name } of diagramFiles) {
    created.push(await panelAttachmentRepository.create({
      panel_id: panelId,
      tipo: TIPO_DIAGRAMA,
      file_url,
      file_name,
      created_by: uid,
    }));
  }
  return created;
}

/** Remove um diagrama já persistido: apaga a associação e, best-effort, o arquivo no Storage. */
export async function removeDiagram(attachment) {
  await panelAttachmentRepository.remove(attachment.id);
  await discardUploadedFile(attachment.file_url);
}

/**
 * Descarta um arquivo já enviado ao Storage que ainda não foi vinculado a
 * nenhum registro (ex.: removido pelo usuário antes de salvar o quadro).
 * Best-effort: falha ao limpar o Storage não deve travar o fluxo do
 * usuário (mesmo comportamento tolerado hoje pelo restante do app).
 */
export async function discardUploadedFile(fileUrl) {
  try {
    await removeFromStorage(fileUrl);
  } catch (err) {
    console.warn("Falha ao remover arquivo do Storage:", err);
  }
}
