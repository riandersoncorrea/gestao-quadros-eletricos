-- ============================================================================
-- Ação automática por NC do checklist
-- ============================================================================
-- Aditiva. Nenhum dado existente muda; nenhuma ação é criada para NCs antigas.
--
-- 1. actions.responsavel_id: vínculo do responsável com o perfil
--    (profiles.id). `responsavel` (texto) continua sendo o nome exibido e
--    impresso no PDF — as telas e o filtro atuais não mudam.
-- 2. actions.origem: 'manual' (aberta na tela da NC — padrão, vale para
--    todas as ações existentes) ou 'automatica' (gerada ao finalizar a
--    inspeção, ver src/services/inspectionService.js).
-- 3. Índice único: no máximo UMA ação automática por NC — garantia no
--    banco contra duplicação, qualquer que seja o caminho de gravação.
--
-- Não toca RLS: a ação automática é criada por quem finaliza a inspeção
-- (admin/editor, mesma policy "Editores gerenciam ações"). O trigger do
-- Inspetor (check_inspetor_action_update, 0020) continua bloqueando a
-- alteração dessas colunas por ele.
--
-- Idempotente. Validar sem aplicar: begin; <conteúdo> rollback;
-- Testes: supabase/tests/0022_acao_automatica.test.sql
-- ROLLBACK (manual):
--   drop index if exists public.uq_actions_auto_por_nc;
--   alter table public.actions drop column if exists origem;
--   alter table public.actions drop column if exists responsavel_id;
--   (antes, recriar a view v_actions como em 0017)
-- ============================================================================

alter table public.actions
  add column if not exists responsavel_id uuid references public.profiles(id) on delete set null;

alter table public.actions
  add column if not exists origem text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.actions'::regclass and conname = 'actions_origem_check'
  ) then
    alter table public.actions
      add constraint actions_origem_check check (origem in ('manual', 'automatica'));
  end if;
end;
$$;

create index if not exists idx_actions_responsavel on public.actions(responsavel_id);

create unique index if not exists uq_actions_auto_por_nc
  on public.actions(nonconformity_id)
  where origem = 'automatica';

-- `select a.*` da view é expandido na criação: recria para expor as colunas
-- novas — mesmo padrão e mesma definição de 0017 (security_invoker mantido,
-- a view não guarda dado e herda o RLS de actions).
drop view if exists public.v_actions;
create view public.v_actions as
  select a.*,
    (a.status in ('aberta', 'em_andamento')
      and a.prazo is not null
      and a.prazo < current_date) as atrasada
  from public.actions a;
alter view public.v_actions set (security_invoker = on);
