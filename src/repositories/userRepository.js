import { supabase } from "@/lib/supabaseClient";

export async function list() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, approved, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

/** Papel, aprovação, nome e foto de um único usuário (usado ao montar a sessão). */
export async function getRoleAndApproval(id) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, approved, full_name, avatar_url")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Autoatendimento: o próprio usuário atualiza seu nome/foto via a função
 * `update_own_profile` (security definer, só toca full_name/avatar_url da
 * linha de auth.uid() — não dá acesso a role/approved/e-mail).
 */
export async function updateOwnProfile({ full_name, avatar_url }) {
  const { error } = await supabase.rpc("update_own_profile", {
    p_full_name: full_name ?? null,
    p_avatar_url: avatar_url ?? null,
  });
  if (error) throw error;
}

export async function updateRole(id, role) {
  const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
  if (error) throw error;
}

export async function updateApproval(id, approved) {
  const { error } = await supabase.from("profiles").update({ approved }).eq("id", id);
  if (error) throw error;
}

export async function countPending() {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("approved", false);
  if (error) throw error;
  return count || 0;
}
