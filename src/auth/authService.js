import { supabase } from "@/lib/supabaseClient";
import { getRoleAndApproval } from "@/repositories/userRepository";
import { appUrl } from "@/lib/utils";

/**
 * Abstração de autenticação. Hoje fala com o Supabase Auth; é a única
 * fronteira que uma futura troca por outro provedor (ex.: Microsoft Entra
 * ID) precisaria reimplementar — o resto do app não conhece `supabase.auth`.
 */

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/** Retorna uma função de unsubscribe, já pronta para uso em cleanup de useEffect. */
export function onAuthStateChange(callback) {
  const { data: subscription } = supabase.auth.onAuthStateChange(callback);
  return () => subscription.subscription.unsubscribe();
}

export async function signInWithPassword(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${appUrl}/` },
  });
}

export async function signUp(email, password) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function sendPasswordResetEmail(email) {
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/reset-password`,
  });
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

/** Id do usuário autenticado, para carimbar campos como `created_by`. */
export async function getCurrentUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/**
 * Usuário atual no formato que o app consome, mesclando o usuário autenticado
 * (Supabase Auth) com o papel/aprovação gravados em `profiles`.
 */
export async function getCurrentUser() {
  const session = await getSession();
  const authUser = session?.user ?? null;
  if (!authUser) return null;

  let profile = null;
  try {
    profile = await getRoleAndApproval(authUser.id);
  } catch (error) {
    // Network hiccups ou uma linha ainda não criada caem aqui — cair
    // silenciosamente para 'viewer'/não aprovado faria um admin de verdade
    // parecer rebaixado ou bloqueado sem nenhum rastro do motivo. O log
    // mantém isso diagnosticável.
    console.error('Failed to load profile role, defaulting to viewer/unapproved:', error);
  }

  return {
    id: authUser.id,
    email: authUser.email,
    full_name: authUser.user_metadata?.full_name || '',
    role: profile?.role || 'viewer',
    approved: profile?.approved ?? false,
  };
}
