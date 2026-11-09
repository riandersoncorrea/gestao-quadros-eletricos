-- ============================================================================
-- Administrador local só gerencia contas novas ou da própria unidade
-- ============================================================================
-- Problema: pela policy "Admins can update other profiles" (schema.sql) e o
-- trigger check_profile_access_changes (0029), um administrador LOCAL (perfil
-- admin sem acesso a todas as unidades) podia aprovar/reprovar contas e trocar
-- o perfil (editor/viewer/inspetor) de QUALQUER usuário que não fosse
-- administrador geral — inclusive de outra unidade (ex.: um admin local da
-- EFC alterando contas de São Luís).
--
-- Regra nova (decisão do usuário, 09/11/2026): o administrador local só altera
-- a conta de outro usuário quando ela
--   * é NOVA: ainda sem nenhuma unidade em profile_unidades (ex.: cadastro
--     pendente aguardando aprovação), ou
--   * tem ao menos uma unidade a que o administrador local também tem acesso.
-- Administrador geral, SQL Editor/service role e a edição do próprio perfil
-- (nome/foto via update_own_profile) não mudam.
--
-- Como: a checagem precisa ler as unidades do usuário-alvo, que a RLS de
-- profile_unidades esconde do administrador local; por isso fica numa função
-- SECURITY DEFINER mínima (public.admin_local_pode_gerenciar), chamada pelo
-- trigger. As demais regras do trigger (0029) são mantidas como estavam.
--
-- Idempotente. Validar sem aplicar: begin; <conteúdo> rollback;
-- Teste: supabase/tests/0034_admin_local_gerencia_propria_unidade.test.sql
-- ROLLBACK: supabase/rollback/0034_admin_local_gerencia_propria_unidade.rollback.sql
-- ============================================================================

create or replace function public.admin_local_pode_gerenciar(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profile_unidades pu where pu.profile_id = p_profile_id)
      or exists (select 1 from public.profile_unidades pu
                  where pu.profile_id = p_profile_id
                    and pu.unidade_operacional_id = any (public.minhas_unidades()))
$$;

comment on function public.admin_local_pode_gerenciar(uuid) is
  'Conta sem unidade (nova) ou com unidade acessível ao usuário corrente. Usada pelo trigger de profiles (0034).';

revoke all on function public.admin_local_pode_gerenciar(uuid) from public, anon;
grant execute on function public.admin_local_pode_gerenciar(uuid) to authenticated;

create or replace function public.check_profile_access_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- SQL Editor / service role (sem usuário na requisição) e admin geral: livre.
  if auth.uid() is null or public.is_global_admin() then
    return new;
  end if;
  if new.acesso_todas_unidades is distinct from old.acesso_todas_unidades then
    raise exception using errcode = '42501',
      message = 'Somente um administrador geral concede ou retira o acesso a todas as unidades';
  end if;
  if new.role is distinct from old.role and (old.role = 'admin' or new.role = 'admin') then
    raise exception using errcode = '42501',
      message = 'Somente um administrador geral concede ou retira o perfil de administrador';
  end if;
  if old.acesso_todas_unidades and old.id <> auth.uid()
     and (new.role, new.approved) is distinct from (old.role, old.approved) then
    raise exception using errcode = '42501',
      message = 'Somente um administrador geral altera o perfil de um administrador geral';
  end if;
  -- 0034: administrador local só gerencia contas novas ou da própria unidade.
  if old.id <> auth.uid() and not public.admin_local_pode_gerenciar(old.id) then
    raise exception using errcode = '42501',
      message = 'Administrador local só gerencia contas novas (ainda sem unidade) ou de unidades a que tem acesso';
  end if;
  return new;
end;
$$;
