-- ============================================================================
-- Autoatendimento de perfil: nome e foto
-- ============================================================================
-- Aditiva. Objetivo: permitir que o próprio usuário edite full_name e
-- avatar_url sem tocar na única policy de UPDATE existente em profiles
-- ("Admins can update other profiles", que deliberadamente exclui a própria
-- linha do admin para evitar auto-rebaixamento — ver migration 0001).
--
-- Em vez de afrouxar RLS (o que abriria a linha inteira, inclusive role e
-- approved, a updates arbitrários do próprio usuário), usamos uma função
-- security definer que só sabe fazer uma coisa: atualizar full_name e
-- avatar_url da linha de quem chamou (auth.uid()). E-mail e role continuam
-- só editáveis por admin (role) ou pelo fluxo nativo do Supabase Auth
-- (e-mail — que não está exposto no app; ver decisão do product owner).
-- ============================================================================

alter table public.profiles
  add column if not exists avatar_url text;

create or replace function public.update_own_profile(p_full_name text, p_avatar_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set full_name = nullif(trim(p_full_name), ''),
      avatar_url = p_avatar_url
  where id = auth.uid();
end;
$$;

revoke all on function public.update_own_profile(text, text) from public;
grant execute on function public.update_own_profile(text, text) to authenticated;
