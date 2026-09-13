import { supabase } from "@/lib/supabaseClient";

/** Ações de uma NC, já com o campo derivado `atrasada` da view v_actions. */
export async function listActionsForNC(ncId) {
  const { data, error } = await supabase
    .from("v_actions")
    .select("*")
    .eq("nonconformity_id", ncId)
    .order("prazo", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function listActions() {
  const { data, error } = await supabase
    .from("v_actions")
    .select("*")
    .order("prazo", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function createAction(values) {
  const { data: user } = await supabase.auth.getUser();
  const clean = { ...values };
  for (const k of Object.keys(clean)) if (clean[k] === "") clean[k] = null;
  const { data, error } = await supabase
    .from("actions")
    .insert({ ...clean, created_by: user?.user?.id ?? null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAction(id, values) {
  const patch = { ...values, updated_at: new Date().toISOString() };
  if (values.status === "concluida" && !values.concluida_em) {
    patch.concluida_em = new Date().toISOString().slice(0, 10);
  }
  const { data, error } = await supabase.from("actions").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteAction(id) {
  const { error } = await supabase.from("actions").delete().eq("id", id);
  if (error) throw error;
}
