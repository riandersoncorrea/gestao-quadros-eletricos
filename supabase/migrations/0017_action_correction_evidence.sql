-- ============================================================================
-- Evidência de correção na conclusão de uma Ação (Nota, OM, fotos, PDF)
-- ============================================================================
-- Aditiva e não destrutiva. Acrescenta à tabela `actions` (já existente —
-- não há tabela nova) os dados exigidos para concluir uma ação corretiva:
--   numero_nota       — Número da Nota (texto: formato definido pelo SAP/área)
--   om                — Ordem de Manutenção (texto, idem)
--   fotos_corretiva   — URLs públicas das fotos da corretiva no bucket
--                       `uploads` (mesmo storage/upload de evidências do
--                       checklist e fotos do inventário — nada em base64 no
--                       banco). Máximo 3 (constraint abaixo).
--   evidencia_pdf_url — URL do PDF de evidência gerado na conclusão, também
--                       no bucket `uploads`.
--   concluida_por     — usuário que concluiu (auth.users), para o PDF/auditoria.
-- A coluna antiga `actions.evidencia_url` (nunca usada pelo app) não é
-- tocada nem reaproveitada, para não misturar um eventual dado legado com
-- o PDF de evidência.
--
-- Ações já existentes (inclusive as já concluídas) continuam válidas: as
-- colunas novas são anuláveis (fotos = lista vazia) e a obrigatoriedade só
-- é verificada quando uma ação PASSA para "concluida" (trigger abaixo) —
-- editar/visualizar uma ação aberta, ou uma ação concluída antes desta
-- migration, não exige nada novo.
--
-- A regra também é aplicada no app (src/domain/actionCompletion.js); o
-- trigger é a garantia no banco contra conclusão por outro caminho (API
-- direta, tela antiga em cache).
--
-- Idempotente. Validar sem aplicar: begin; <conteúdo> rollback;
-- Testes: supabase/tests/0017_action_correction_evidence.test.sql
-- ============================================================================

-- --- 1. Colunas -----------------------------------------------------------------
alter table public.actions
  add column if not exists numero_nota text,
  add column if not exists om text,
  add column if not exists fotos_corretiva text[] not null default '{}',
  add column if not exists evidencia_pdf_url text,
  add column if not exists concluida_por uuid references auth.users(id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_actions_fotos_corretiva_max') then
    alter table public.actions
      add constraint chk_actions_fotos_corretiva_max check (cardinality(fotos_corretiva) <= 3);
  end if;
end;
$$;

comment on column public.actions.numero_nota is 'Número da Nota da correção. Obrigatório para concluir a ação.';
comment on column public.actions.om is 'Ordem de Manutenção (OM) da correção. Obrigatória para concluir a ação.';
comment on column public.actions.fotos_corretiva is 'URLs (bucket uploads) das fotos da corretiva — 1 a 3 para concluir.';
comment on column public.actions.evidencia_pdf_url is 'URL (bucket uploads) do PDF de evidência gerado na conclusão.';
comment on column public.actions.concluida_por is 'Usuário que concluiu a ação.';

-- --- 2. Obrigatoriedade na conclusão ---------------------------------------------
create or replace function public.check_action_completion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'concluida'
     and (tg_op = 'INSERT' or old.status is distinct from 'concluida') then
    if coalesce(btrim(new.numero_nota), '') = '' then
      raise exception 'Número da Nota é obrigatório para concluir a ação' using errcode = 'check_violation';
    end if;
    if coalesce(btrim(new.om), '') = '' then
      raise exception 'OM é obrigatória para concluir a ação' using errcode = 'check_violation';
    end if;
    if cardinality(new.fotos_corretiva) < 1 then
      raise exception 'Ao menos uma foto da corretiva é obrigatória para concluir a ação' using errcode = 'check_violation';
    end if;
    if coalesce(btrim(new.evidencia_pdf_url), '') = '' then
      raise exception 'PDF de evidência é obrigatório para concluir a ação' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_action_completion on public.actions;
create trigger trg_check_action_completion
  before insert or update on public.actions
  for each row execute function public.check_action_completion();

-- --- 3. v_actions passa a expor as colunas novas ---------------------------------
-- `select a.*` de uma view é expandido na criação: sem recriar, as colunas
-- novas não aparecem na view (que é o que o app lê). Mesma definição da
-- migration 0001; a view não guarda dado e herda RLS de actions
-- (security_invoker), então recriar não muda permissão nenhuma.
drop view if exists public.v_actions;
create view public.v_actions as
  select a.*,
    (a.status in ('aberta', 'em_andamento')
      and a.prazo is not null
      and a.prazo < current_date) as atrasada
  from public.actions a;
alter view public.v_actions set (security_invoker = on);

-- ============================================================================
-- ROLLBACK (manual, só se autorizado — perde Nota/OM/fotos/PDF gravados):
--   drop trigger if exists trg_check_action_completion on public.actions;
--   drop function if exists public.check_action_completion();
--   drop view if exists public.v_actions;
--   alter table public.actions drop constraint if exists chk_actions_fotos_corretiva_max,
--     drop column if exists numero_nota, drop column if exists om,
--     drop column if exists fotos_corretiva, drop column if exists evidencia_pdf_url,
--     drop column if exists concluida_por;
--   create view public.v_actions as select a.*, (a.status in ('aberta','em_andamento')
--     and a.prazo is not null and a.prazo < current_date) as atrasada from public.actions a;
--   alter view public.v_actions set (security_invoker = on);
-- ============================================================================
