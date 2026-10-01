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
 * Remove um arquivo do bucket a partir da sua URL pública. Devolve true se
 * o arquivo foi de fato apagado. O RLS do bucket só deixa cada usuário
 * apagar o que ele mesmo enviou (supabase/migrations/
 * 0018_storage_own_uploads_select.sql); para um arquivo de outro usuário a
 * API não dá erro, apenas não apaga nada — por isso o retorno e o aviso.
 * Usado hoje pelas fotos da corretiva das ações (services/actionService.js).
 */
export async function remove(fileUrl) {
  if (!fileUrl) return false;
  const marker = `/object/public/${BUCKET}/`;
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return false;
  const path = fileUrl.slice(idx + marker.length);
  const { data, error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
  const removed = (data || []).length > 0;
  if (!removed) console.warn(`Arquivo não removido do storage (inexistente ou enviado por outro usuário): ${path}`);
  return removed;
}
