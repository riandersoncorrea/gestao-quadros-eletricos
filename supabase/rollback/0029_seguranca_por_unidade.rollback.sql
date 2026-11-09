-- ============================================================================
-- ROLLBACK da 0029 (segurança por unidade) — usar só em emergência
-- ============================================================================
-- Remove as policies RESTRITIVAS, os triggers e as funções da 0029: o banco
-- volta às regras de perfil anteriores (que nunca foram alteradas). Mantém as
-- colunas novas e a tabela profile_unidades (dados inofensivos, evitam perder
-- as atribuições); a remoção delas está comentada no fim.
-- ATENÇÃO: sem a 0029, contas não aprovadas voltam a ler dados e as unidades
-- deixam de ser separadas no banco. Não fazer com quadros da EFC importados
-- sem uma decisão explícita.
-- ============================================================================
begin;

do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
            where schemaname = 'public' and permissive = 'RESTRICTIVE'
              and (policyname like 'unidade:%' or policyname in ('aprovado: acesso', 'auditoria: só admin geral'))
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

drop policy if exists "Usuário lê as próprias unidades" on public.profile_unidades;
drop policy if exists "Admin geral gerencia unidades dos usuários" on public.profile_unidades;

do $$
declare t text;
begin
  foreach t in array array['inspections', 'inspection_responses', 'measurements', 'thermography_points',
    'nonconformities', 'actions', 'analysis_flags', 'panel_condition_history', 'panel_location_history',
    'sap_orders', 'panel_attachments']
  loop
    execute format('drop trigger if exists aa_herdar_unidade on public.%I', t);
  end loop;
end $$;
drop trigger if exists trg_check_profile_access_changes on public.profiles;
drop trigger if exists trg_check_panel_unidade_change on public.electrical_panels;
drop trigger if exists trg_cascade_panel_unidade on public.electrical_panels;

drop function if exists public.herdar_unidade();
drop function if exists public.check_profile_access_changes();
drop function if exists public.check_panel_unidade_change();
drop function if exists public.cascade_panel_unidade();
drop function if exists public.minhas_unidades_gravaveis();
drop function if exists public.minhas_unidades();
drop function if exists public.is_global_admin();
drop function if exists public.is_approved();

-- Opcional (perde as atribuições de unidade e as colunas herdadas):
-- drop table public.profile_unidades;
-- alter table public.profiles drop column acesso_todas_unidades;
-- alter table public.unidades_operacionais drop column permite_escrita;
-- alter table public.<cada tabela filha> drop column unidade_operacional_id;

commit;
