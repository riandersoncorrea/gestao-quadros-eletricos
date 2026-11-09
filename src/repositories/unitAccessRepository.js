import { supabase } from "@/lib/supabaseClient";

// Acesso dos usuários às unidades operacionais (migration 0029):
// profiles.acesso_todas_unidades + tabela profile_unidades. Antes da 0029
// essas estruturas não existem: as leituras devolvem null ("modelo
// legado") e o app segue a regra anterior (domain/unitScope.js).

// Erros do PostgREST/Postgres para coluna/tabela/função inexistente.
const SCHEMA_MISSING = new Set(["PGRST204", "PGRST205", "PGRST202", "42703", "42P01", "42883"]);
export const isSchemaMissing = (error) => !!error && SCHEMA_MISSING.has(error.code);

/** Acesso do próprio usuário: { todas, unidadeIds } ou null (antes da 0029). */
export async function getMyAccess(userId) {
  const [perfil, vinculos] = await Promise.all([
    supabase.from("profiles").select("acesso_todas_unidades").eq("id", userId).maybeSingle(),
    supabase.from("profile_unidades").select("unidade_operacional_id").eq("profile_id", userId),
  ]);
  if (isSchemaMissing(perfil.error) || isSchemaMissing(vinculos.error)) return null;
  if (perfil.error) throw perfil.error;
  if (vinculos.error) throw vinculos.error;
  return {
    todas: !!perfil.data?.acesso_todas_unidades,
    unidadeIds: (vinculos.data || []).map((v) => v.unidade_operacional_id),
  };
}

/**
 * Acessos de todos os usuários (tela Usuários, só administrador geral — a
 * RLS de profile_unidades devolve a outros perfis só as próprias linhas).
 * Map profileId -> { todas, unidadeIds }, ou null antes da 0029.
 */
export async function listAllAccess() {
  const [perfis, vinculos] = await Promise.all([
    supabase.from("profiles").select("id, acesso_todas_unidades"),
    supabase.from("profile_unidades").select("profile_id, unidade_operacional_id"),
  ]);
  if (isSchemaMissing(perfis.error) || isSchemaMissing(vinculos.error)) return null;
  if (perfis.error) throw perfis.error;
  if (vinculos.error) throw vinculos.error;
  const map = new Map((perfis.data || []).map((p) => [p.id, { todas: !!p.acesso_todas_unidades, unidadeIds: [] }]));
  for (const v of vinculos.data || []) map.get(v.profile_id)?.unidadeIds.push(v.unidade_operacional_id);
  return map;
}

/** Define as unidades autorizadas de um usuário (só administrador geral — RLS). */
export async function setUserUnits(profileId, unidadeIds) {
  const { data: atuais, error } = await supabase
    .from("profile_unidades").select("unidade_operacional_id").eq("profile_id", profileId);
  if (error) throw error;
  const atuaisIds = (atuais || []).map((a) => a.unidade_operacional_id);
  const remover = atuaisIds.filter((id) => !unidadeIds.includes(id));
  const incluir = unidadeIds.filter((id) => !atuaisIds.includes(id));
  if (remover.length) {
    const { error: e } = await supabase.from("profile_unidades")
      .delete().eq("profile_id", profileId).in("unidade_operacional_id", remover);
    if (e) throw e;
  }
  if (incluir.length) {
    const { error: e } = await supabase.from("profile_unidades")
      .insert(incluir.map((id) => ({ profile_id: profileId, unidade_operacional_id: id })));
    if (e) throw e;
  }
}

/** Liga/desliga o acesso a todas as unidades (só administrador geral — trigger da 0029). */
export async function setGlobalAccess(profileId, todas) {
  const { error } = await supabase.from("profiles").update({ acesso_todas_unidades: !!todas }).eq("id", profileId);
  if (error) throw error;
}
