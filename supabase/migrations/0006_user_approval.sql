-- ============================================================================
-- Aprovação de novos usuários
-- ============================================================================
-- Aditiva: nova coluna `approved` em profiles. Usuários já existentes são
-- marcados como aprovados (não perdem acesso); novos cadastros (trigger
-- handle_new_user, tanto e-mail/senha quanto Google) entram com approved =
-- false por padrão e ficam bloqueados na tela de "solicitação pendente" até
-- um admin aprovar em /usuarios.
-- ============================================================================

alter table public.profiles
  add column if not exists approved boolean not null default false;

update public.profiles set approved = true where approved = false;

-- Fecha a lacuna de segurança no lado do banco: um usuário pendente que
-- chamasse a API diretamente (sem passar pela tela de "solicitação
-- pendente" do app) ainda cairia nas políticas de RLS que exigem
-- admin/editor. Com este ajuste, current_role() passa a retornar null para
-- quem não está aprovado, então essas políticas (insert/update/delete de
-- quadros, inspeções, não-conformidades, ações etc.) já bloqueiam.
-- Obs.: as políticas de SELECT existentes usam `using (true)` para qualquer
-- usuário autenticado (não passam por current_role()), então leitura via API
-- direta por um usuário pendente não é bloqueada por este ajuste — isso é
-- um comportamento pré-existente do modelo de permissões, não introduzido
-- aqui.
create or replace function public.current_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and approved = true;
$$;
