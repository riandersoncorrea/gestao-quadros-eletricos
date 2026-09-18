import { supabase } from "@/lib/supabaseClient";

/** Anexos (diagramas) de um quadro, do mais antigo pro mais novo. */
export async function listByPanel(panelId) {
  const { data, error } = await supabase
    .from("panel_attachments")
    .select("*")
    .eq("panel_id", panelId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function create(values) {
  const { data, error } = await supabase.from("panel_attachments").insert(values).select().single();
  if (error) throw error;
  return data;
}

export async function remove(id) {
  const { error } = await supabase.from("panel_attachments").delete().eq("id", id);
  if (error) throw error;
}
