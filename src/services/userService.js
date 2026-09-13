import { supabase } from "@/lib/supabaseClient";

export async function listProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, approved, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function updateUserRole(id, role) {
  const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
  if (error) throw error;
}

export async function updateUserApproval(id, approved) {
  const { error } = await supabase.from("profiles").update({ approved }).eq("id", id);
  if (error) throw error;
}

/** Contagem de usuários pendentes de aprovação (badge do menu, admin only). */
export async function countPendingUsers() {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("approved", false);
  if (error) throw error;
  return count || 0;
}
