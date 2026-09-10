import { supabase } from "@/lib/supabaseClient";

const ORDER_COLS = [
  "ordem", "nota", "plano", "item", "tag", "equipamento", "local_texto",
  "data_planejada", "frequencia", "centro_trabalho", "sap_status", "raw_row",
  "panel_id", "link_status",
];

export async function listBatches() {
  const { data, error } = await supabase
    .from("sap_import_batches")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getBatch(id) {
  const { data, error } = await supabase
    .from("sap_import_batches")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function listOrders(batchId) {
  const { data, error } = await supabase
    .from("sap_orders")
    .select("*")
    .eq("batch_id", batchId)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return data;
}

/**
 * Grava um lote de importação e suas ordens. `orders` vem de buildOrders().
 * Ordens com erros de validação são ignoradas (contadas em error_count).
 */
export async function commitImport({ filename, mapping, orders, stats, notes }) {
  const { data: user } = await supabase.auth.getUser();
  const uid = user?.user?.id ?? null;

  const { data: batch, error: be } = await supabase
    .from("sap_import_batches")
    .insert({
      filename,
      column_mapping: mapping,
      total_rows: stats.total,
      new_count: stats.newTags?.length ?? 0,
      existing_count: stats.linked,
      unlinked_count: stats.unlinked,
      error_count: stats.withErrors,
      status: "importado",
      notes: notes || null,
      imported_by: uid,
      imported_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (be) throw be;

  const valid = orders.filter((o) => !o.errors?.length);
  const payload = valid.map((o) => {
    const row = { batch_id: batch.id };
    for (const c of ORDER_COLS) row[c] = o[c] ?? null;
    return row;
  });

  for (let i = 0; i < payload.length; i += 500) {
    const { error: oe } = await supabase.from("sap_orders").insert(payload.slice(i, i + 500));
    if (oe) throw oe;
  }
  return batch;
}

export async function relinkOrder(orderId, panelId) {
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("sap_orders")
    .update({
      panel_id: panelId,
      link_status: panelId ? "manual" : "sem_correspondencia",
      linked_by: user?.user?.id ?? null,
      linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);
  if (error) throw error;
}

export async function cancelBatch(id) {
  const { error } = await supabase
    .from("sap_import_batches")
    .update({ status: "cancelado" })
    .eq("id", id);
  if (error) throw error;
}
