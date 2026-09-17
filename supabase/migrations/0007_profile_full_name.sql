-- ============================================================================
-- Nome do usuário em profiles
-- ============================================================================
-- Aditiva: nova coluna `full_name` em profiles. O Google OAuth já preenche
-- full_name/name em auth.users.raw_user_meta_data; cadastro por e-mail/senha
-- não coleta nome (Register.jsx só pede e-mail/senha), então fica null nesse
-- caso e a UI usa o e-mail como fallback.
--
-- Só o trigger handle_new_user (INSERT em auth.users) passa a gravar esse
-- valor, então apenas novos cadastros são capturados — usuários já
-- existentes ficam com full_name null até se recadastrarem. Não há trigger
-- de UPDATE em auth.users (ex.: vincular Google depois de já ter conta por
-- e-mail/senha) para manter o escopo mínimo; isso é uma limitação conhecida,
-- não um bug.
-- ============================================================================

alter table public.profiles
  add column if not exists full_name text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
