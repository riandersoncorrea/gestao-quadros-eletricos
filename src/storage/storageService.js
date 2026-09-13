import { supabase } from "@/lib/supabaseClient";

/**
 * Abstração de armazenamento de arquivos. Hoje fala com o Supabase Storage;
 * é a única fronteira que uma futura troca por outro provedor (ex.: Azure
 * Blob Storage) precisaria reimplementar — o resto do app não conhece
 * `supabase.storage` nem o nome do bucket.
 */

const BUCKET = "uploads";

/** URL pública de um arquivo já enviado, a partir do seu path no bucket. */
export function getUrl(path) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Envia um arquivo (nome gerado por UUID) e devolve sua URL pública. */
export async function uploadFile({ file }) {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  const path = `${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;

  return { file_url: getUrl(path) };
}

/**
 * Remove um arquivo do bucket a partir da sua URL pública. Nenhuma tela do
 * app usa isso ainda (arquivos de registros excluídos ficam órfãos hoje —
 * ver docs/ARCHITECTURE.md), mas a operação já fica disponível na
 * abstração para quando essa limpeza for implementada.
 */
export async function remove(fileUrl) {
  if (!fileUrl) return;
  const marker = `/object/public/${BUCKET}/`;
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return;
  const path = fileUrl.slice(idx + marker.length);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
