-- ============================================================================
-- NC concluída automaticamente quando suas ações são encerradas
-- ============================================================================
-- Problema: concluir uma ação nunca alterava a NC. A NC só passava para
-- "concluida" se alguém a marcasse na tela da NC — e só o Admin consegue:
-- o Editor não acessa a tela de NCs e o Inspetor não tem UPDATE em
-- nonconformities (policy "Editores gerenciam NCs", 0001). Com as ações
-- automáticas do checklist (0022) tratadas por Editor/Inspetor, as NCs
-- ficavam "aberta" e o Dashboard (NCs abertas, NCs corrigidas, severidade,
-- categoria, ranking) não refletia as correções.
--
-- Regra (a mesma que a tela da NC já usava para SUGERIR a conclusão —
-- domain/nonconformityRules.js#allActionsResolved): quando uma ação passa
-- para "concluida" ou "cancelada" e, com isso, TODAS as ações da NC estão
-- concluídas/canceladas, com ao menos uma concluída, a NC em aberto
-- ("aberta"/"em_tratamento") passa para "concluida". concluida_em é
-- preenchido pelo trigger trg_nc_concluida_em (0019).
--
-- O que NÃO muda:
--   * NC "cancelada" ou já "concluida" não é tocada;
--   * reabrir uma ação concluída não reabre a NC (continua manual);
--   * nenhuma policy/RLS: a função é SECURITY DEFINER só para fazer esta
--     única atualização de status, igual para Admin, Editor e Inspetor;
--   * requisitos da conclusão da ação (Nota, OM, fotos, PDF — 0017) e as
--     regras de Editor (0025) e Inspetor (0020) continuam valendo, pois
--     rodam ANTES (before update) e este trigger roda depois (after update).
-- A auditoria registra a mudança da NC com o usuário que concluiu a ação.
--
-- Concorrência: a NC é travada (for update) antes da checagem; duas ações
-- da mesma NC concluídas ao mesmo tempo são serializadas e a segunda já vê
-- a primeira concluída.
--
-- NCs que JÁ têm todas as ações encerradas não são alteradas por esta
-- migration — ver supabase/backfill/0026_nc_concluida_por_acoes_backfill.sql.
--
-- Idempotente. Validar sem aplicar: begin; <conteúdo> rollback;
-- Testes: supabase/tests/0026_nc_concluida_por_acoes.test.sql
-- ROLLBACK: drop trigger if exists trg_nc_concluida_por_acoes on public.actions;
--           drop function if exists public.conclude_nc_when_actions_resolved();
-- ============================================================================

create or replace function public.conclude_nc_when_actions_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nc_status text;
begin
  if new.nonconformity_id is null
     or new.status not in ('concluida', 'cancelada')
     or old.status is not distinct from new.status then
    return null;
  end if;

  select status into v_nc_status
    from public.nonconformities
   where id = new.nonconformity_id
     for update;

  if v_nc_status is null or v_nc_status not in ('aberta', 'em_tratamento') then
    return null;
  end if;

  if exists (
       select 1 from public.actions
        where nonconformity_id = new.nonconformity_id
          and status not in ('concluida', 'cancelada'))
     or not exists (
       select 1 from public.actions
        where nonconformity_id = new.nonconformity_id
          and status = 'concluida') then
    return null;
  end if;

  update public.nonconformities
     set status = 'concluida', updated_at = now()
   where id = new.nonconformity_id;

  return null;
end;
$$;

revoke all on function public.conclude_nc_when_actions_resolved() from public;

drop trigger if exists trg_nc_concluida_por_acoes on public.actions;
create trigger trg_nc_concluida_por_acoes
  after update of status on public.actions
  for each row execute function public.conclude_nc_when_actions_resolved();
