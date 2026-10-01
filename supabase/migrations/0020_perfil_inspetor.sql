-- ============================================================================
-- Perfil "inspetor" — acesso só a Não Conformidades e Ações
-- ============================================================================
-- Aditiva. Reaproveita o modelo existente (profiles.role + current_role()
-- nas policies de RLS); não cria tabela de permissões.
--
-- 1. profiles.role passa a aceitar 'inspetor'. Nenhum perfil existente muda;
--    o cadastro novo continua entrando como 'viewer' (handle_new_user) e só
--    um admin pode trocar o perfil de alguém — e nunca o próprio (policy
--    "Admins can update other profiles", inalterada).
--
-- 2. O que o Inspetor pode GRAVAR no banco:
--    * actions: somente UPDATE, e somente o tratamento da ação — Número da
--      Nota, OM, fotos da corretiva, PDF de evidência, conclusão e status
--      entre aberta / em andamento / concluída. Não cria, não exclui, não
--      altera descrição/responsável/prazo/NC/quadro, não cancela e não
--      altera/reabre ação concluída ou cancelada (trigger check_inspetor_action_update).
--    * storage: já permitido a qualquer autenticado (upload) e apagar os
--      próprios arquivos (migration 0018) — nada novo aqui.
--    Nada mais: NCs, quadros, inspeções, usuários etc. continuam exigindo
--    admin/editor como antes. A LEITURA segue o modelo atual (todo
--    autenticado lê as tabelas operacionais — limitação pré-existente,
--    documentada em docs/ARCHITECTURE.md §11).
--
-- Idempotente. Validar sem aplicar: begin; <conteúdo> rollback;
-- Testes: supabase/tests/0020_perfil_inspetor.test.sql
-- ROLLBACK (manual, só sem usuários 'inspetor'):
--   drop trigger if exists trg_check_inspetor_action_update on public.actions;
--   drop function if exists public.check_inspetor_action_update();
--   drop policy if exists "Inspetores tratam ações" on public.actions;
--   alter table public.profiles drop constraint if exists profiles_role_check;
--   alter table public.profiles add constraint profiles_role_check
--     check (role in ('admin', 'editor', 'viewer'));
-- ============================================================================

-- --- 1. Novo valor de perfil -----------------------------------------------------
-- A constraint original foi criada inline em schema.sql (nome gerado pelo
-- Postgres); remove qualquer CHECK de profiles que trate de role e recria
-- com nome fixo.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'editor', 'viewer', 'inspetor'));

-- --- 2. Inspetor trata ações (só UPDATE) ---------------------------------------
drop policy if exists "Inspetores tratam ações" on public.actions;
create policy "Inspetores tratam ações" on public.actions
  for update to authenticated
  using (public.current_role() = 'inspetor')
  with check (public.current_role() = 'inspetor');

-- Restringe o UPDATE do Inspetor às colunas do tratamento. Admin/editor não
-- passam por nenhuma regra nova.
create or replace function public.check_inspetor_action_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tratamento text[] := array[
    'status', 'numero_nota', 'om', 'fotos_corretiva', 'evidencia_pdf_url',
    'concluida_em', 'concluida_por', 'updated_at'
  ];
begin
  if public.current_role() is distinct from 'inspetor' then
    return new;
  end if;

  if old.status in ('concluida', 'cancelada') then
    raise exception 'Inspetor não pode alterar nem reabrir uma ação concluída ou cancelada'
      using errcode = 'insufficient_privilege';
  end if;

  if (to_jsonb(new) - v_tratamento) is distinct from (to_jsonb(old) - v_tratamento) then
    raise exception 'Inspetor só pode alterar o tratamento da ação (Nota, OM, fotos, conclusão)'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status is distinct from old.status then
    if new.status not in ('aberta', 'em_andamento', 'concluida') then
      raise exception 'Inspetor não pode cancelar uma ação'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_inspetor_action_update on public.actions;
create trigger trg_check_inspetor_action_update
  before update on public.actions
  for each row execute function public.check_inspetor_action_update();
