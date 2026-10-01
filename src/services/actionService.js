import { getCurrentUser, getCurrentUserId } from "@/auth/authService";
import * as actionRepository from "@/repositories/actionRepository";
import * as ncRepository from "@/repositories/ncRepository";
import { ElectricalPanel, fetchHierarchy } from "@/repositories/panelRepository";
import { updateNonconformity } from "@/services/ncService";
import { buildActionEvidencePdf } from "@/services/actionEvidencePdfService";
import { uploadFile, remove as removeFile } from "@/storage/storageService";
import { resizeImageIfNeeded } from "@/utils/imageProcessing";
import {
  missingCompletionRequirements, canAddCorrectivePhoto, MAX_CORRECTIVE_PHOTOS,
} from "@/domain/actionCompletion";

export async function listActionsForNC(ncId) {
  return actionRepository.listForNC(ncId);
}

export async function listActions() {
  return actionRepository.listAll();
}

/**
 * `currentNcStatus` (opcional): status da NC no momento da criação. Se ela
 * ainda estiver "aberta", a primeira ação registrada já a move para
 * "em_tratamento" — reflete que a NC passou a ter um tratamento em curso.
 * Não força nada além disso (concluir/cancelar continua manual).
 */
export async function createAction(values, options) {
  const { currentNcStatus } = options || {};
  const uid = await getCurrentUserId();
  const clean = { ...values };
  for (const k of Object.keys(clean)) if (clean[k] === "") clean[k] = null;
  const created = await actionRepository.create({ ...clean, created_by: uid });
  if (currentNcStatus === "aberta" && values.nonconformity_id) {
    await updateNonconformity(values.nonconformity_id, { status: "em_tratamento" });
  }
  return created;
}

/**
 * Atualização comum (status, responsável…). Concluir NÃO passa por aqui:
 * a conclusão exige Nota, OM, fotos e gera o PDF de evidência — ver
 * completeAction. Reabrir uma ação concluída (voltar para aberta/em
 * andamento) continua permitido, como antes.
 */
export async function updateAction(id, values) {
  if (values.status === "concluida") {
    throw new Error("Para concluir a ação, informe Número da Nota, OM e fotos da corretiva no tratamento da ação.");
  }
  return actionRepository.update(id, { ...values, updated_at: new Date().toISOString() });
}

export async function deleteAction(id) {
  return actionRepository.remove(id);
}

// --- Tratamento / evidência da correção ------------------------------------

function assertEditable(action) {
  if (action.status === "concluida") {
    throw new Error("Ação já concluída: a evidência não pode mais ser alterada.");
  }
}

const blankToNull = (v) => (String(v ?? "").trim() ? String(v).trim() : null);

/** Salva Número da Nota e OM sem concluir (rascunho do tratamento). */
export async function saveActionTreatment(id, { numero_nota, om }) {
  const current = await actionRepository.getById(id);
  assertEditable(current);
  return actionRepository.update(id, {
    numero_nota: blankToNull(numero_nota),
    om: blankToNull(om),
    updated_at: new Date().toISOString(),
  });
}

/**
 * Envia uma foto da corretiva ao storage (mesmo fluxo/otimização das
 * evidências do checklist) e já a grava na ação — a foto fica associada à
 * ação no banco imediatamente, não só no estado da tela.
 */
export async function addCorrectivePhoto(id, file) {
  const current = await actionRepository.getById(id);
  assertEditable(current);
  if (!canAddCorrectivePhoto(current.fotos_corretiva)) {
    throw new Error(`Máximo de ${MAX_CORRECTIVE_PHOTOS} fotos da corretiva.`);
  }
  if (!file?.type?.startsWith("image/")) throw new Error("Selecione um arquivo de imagem.");
  const optimized = await resizeImageIfNeeded(file);
  const { file_url } = await uploadFile({ file: optimized });
  try {
    return await actionRepository.update(id, {
      fotos_corretiva: [...(current.fotos_corretiva || []), file_url],
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    await removeFile(file_url).catch(() => {});
    throw err;
  }
}

/** Remove uma foto da corretiva (da ação e, em seguida, do storage). */
export async function removeCorrectivePhoto(id, fileUrl) {
  const current = await actionRepository.getById(id);
  assertEditable(current);
  const updated = await actionRepository.update(id, {
    fotos_corretiva: (current.fotos_corretiva || []).filter((u) => u !== fileUrl),
    updated_at: new Date().toISOString(),
  });
  // Arquivo órfão não quebra nada; falha na limpeza não desfaz a remoção.
  await removeFile(fileUrl).catch((e) => console.warn("Falha ao remover foto do storage:", e));
  return updated;
}

async function resolvePanelContext(panelId) {
  if (!panelId) return { quadro: null, localidade: null };
  const [panels, hierarchy] = await Promise.all([ElectricalPanel.filter({ id: panelId }), fetchHierarchy()]);
  const p = panels?.[0];
  if (!p) return { quadro: null, localidade: null };
  const nome = (list, id) => list.find((x) => x.id === id)?.nome;
  const localidade = [
    nome(hierarchy.localidades, p.localidade_id),
    nome(hierarchy.locais, p.local_id),
    nome(hierarchy.sublocais, p.sublocal_id),
  ].filter(Boolean).join(" › ") || p.installation_location || null;
  // O nome de quadros de São Luís já começa pela tag ("PRT_QD_0001 / …").
  const quadro = p.name && p.tag && p.name.startsWith(p.tag)
    ? p.name
    : [p.tag, p.name].filter(Boolean).join(" — ");
  return { quadro, localidade };
}

/**
 * Conclui a ação: valida os requisitos, salva Nota/OM, gera o PDF de
 * evidência com o estado final, guarda o PDF no storage e só então marca a
 * ação como concluída (numa única gravação, junto com a referência ao PDF).
 * Se qualquer etapa falhar, a ação continua em aberto. Um PDF só é gerado
 * aqui — salvar o tratamento antes de concluir não gera PDF.
 */
export async function completeAction(id, { numero_nota, om }) {
  const current = await actionRepository.getById(id);
  if (current.status === "concluida") throw new Error("Ação já concluída.");
  if (current.status === "cancelada") throw new Error("Ação cancelada não pode ser concluída. Reabra-a antes.");

  const treatment = { numero_nota: blankToNull(numero_nota), om: blankToNull(om) };
  const missing = missingCompletionRequirements({ ...current, ...treatment });
  if (missing.length) throw new Error(`Para concluir a ação, informe: ${missing.join(", ")}.`);

  await actionRepository.update(id, { ...treatment, updated_at: new Date().toISOString() });

  const [nc, user] = await Promise.all([
    current.nonconformity_id ? ncRepository.getById(current.nonconformity_id) : null,
    getCurrentUser(),
  ]);
  const { quadro, localidade } = await resolvePanelContext(current.panel_id || nc?.panel_id);
  const concluidaEm = new Date().toISOString().slice(0, 10);

  const blob = await buildActionEvidencePdf({
    nc: nc || {},
    action: current,
    quadro: quadro || nc?.tag || null,
    localidade,
    numeroNota: treatment.numero_nota,
    om: treatment.om,
    concluidaEm,
    concluidaPor: user?.full_name || user?.email || null,
    fotos: current.fotos_corretiva,
  });
  const file = new File([blob], `evidencia-correcao-acao-${id}.pdf`, { type: "application/pdf" });
  const { file_url } = await uploadFile({ file });

  try {
    return await actionRepository.update(id, {
      status: "concluida",
      concluida_em: concluidaEm,
      concluida_por: user?.id || null,
      evidencia_pdf_url: file_url,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    await removeFile(file_url).catch(() => {});
    throw err;
  }
}
