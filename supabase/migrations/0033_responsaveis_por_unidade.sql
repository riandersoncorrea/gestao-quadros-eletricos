-- ============================================================================
-- Responsáveis atribuíveis por unidade (atribuição manual de ações)
-- ============================================================================
-- Problema: a lista de responsáveis das telas de NC/Ações lia em `profiles`
-- todos os admin/inspetor aprovados, de TODAS as unidades. Com a EFC em
-- operação, um administrador local da EFC veria inspetores de São Luís — e
-- uma ação atribuída a quem não tem acesso à unidade fica invisível para ele
-- (RLS por unidade, 0029). O app não consegue filtrar sozinho: profile_unidades
-- de outros usuários só é legível pelo administrador geral.
--
-- Solução: função public.responsaveis_atribuiveis(p_unidade) — SECURITY
-- DEFINER, só leitura — que devolve os perfis aprovados com papel admin ou
-- inspetor COM ACESSO à unidade (acesso_todas_unidades ou vínculo em
-- profile_unidades). Só responde a quem também pode ler a unidade
-- (minhas_unidades(), 0029); para os demais devolve vazio. Devolve só
-- id/email/full_name/role, as mesmas colunas que a tela já lia.
--
-- São Luís hoje: a lista não muda (todos os admin/inspetor aprovados têm São
-- Luís ou acesso a todas as unidades desde a 0029).
--
-- Aditiva e idempotente. Validar sem aplicar: begin; <conteúdo> rollback;
-- Teste: supabase/tests/0033_responsaveis_por_unidade.test.sql
-- ROLLBACK: drop function if exists public.responsaveis_atribuiveis(uuid);
--           (o frontend volta sozinho à consulta anterior)
-- ============================================================================

create or replace function public.responsaveis_atribuiveis(p_unidade uuid)
returns table (id uuid, email text, full_name text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.email, p.full_name, p.role
    from public.profiles p
   where p_unidade = any (public.minhas_unidades())
     and p.approved
     and p.role in ('admin', 'inspetor')
     and (p.acesso_todas_unidades
          or exists (select 1 from public.profile_unidades pu
                      where pu.profile_id = p.id and pu.unidade_operacional_id = p_unidade))
   order by p.full_name nulls last, p.email
$$;

comment on function public.responsaveis_atribuiveis(uuid) is
  'Admin/inspetor aprovados com acesso à unidade (atribuição manual de ações). Vazio para quem não lê a unidade. Migration 0033.';

revoke all on function public.responsaveis_atribuiveis(uuid) from public, anon;
grant execute on function public.responsaveis_atribuiveis(uuid) to authenticated;
