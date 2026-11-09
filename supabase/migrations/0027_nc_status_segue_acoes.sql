-- ============================================================================
-- Status da NC acompanha automaticamente o status das suas ações
-- ============================================================================
-- Problema: só a CONCLUSÃO da NC era automática (0026). Quando uma ação
-- passava para "em_andamento", a NC continuava "aberta" (25 NCs assim em
-- 28/10/2026); reabrir uma ação não reabria a NC; e criar uma ação manual
-- punha a NC em "em_tratamento" mesmo com a ação ainda "aberta" — e isso só
-- no app (actionService.createAction), não para Editor/Inspetor.
--
-- Regra (função nc_status_by_actions, a MESMA usada pelo trigger, pelo
-- backfill e pelos testes), sobre TODAS as ações da NC:
--   alguma ação em_andamento                       → em_tratamento
--   ações abertas E alguma concluída (parcial)     → em_tratamento
--   só ações abertas (nenhuma concluída)           → aberta
--   todas concluídas/canceladas, ≥1 concluída      → concluida
--   todas canceladas                               → aberta
--   NC sem nenhuma ação                            → não muda (só sai de
--                                                    em_tratamento → aberta,
--                                                    p.ex. ao apagar a última)
--   NC "cancelada"                                 → nunca é tocada
-- Reabrir uma ação concluída REABRE a NC (decisão do usuário, 28/10/2026 —
-- substitui a regra da 0026 de não reabrir). concluida_em segue o trigger
-- trg_nc_concluida_em (0019): preenchido ao concluir, apagado ao reabrir.
--
-- Trigger AFTER INSERT / UPDATE OF status, nonconformity_id / DELETE em
-- actions. SECURITY DEFINER só para esta atualização de status, igual para
-- Admin, Editor e Inspetor (o Inspetor não tem UPDATE em nonconformities
-- pela RLS — inalterada). Roda depois dos triggers BEFORE de validação da
-- ação (0017 evidência, 0020 Inspetor, 0025 Editor), que continuam valendo.
-- A NC é travada (for update) antes do cálculo: ações da mesma NC alteradas
-- ao mesmo tempo são serializadas. A auditoria registra a mudança da NC com
-- o usuário que alterou a ação.
--
-- Substitui o trigger trg_nc_concluida_por_acoes / função
-- conclude_nc_when_actions_resolved (0026): a regra nova cobre a conclusão.
--
-- NCs que JÁ estão diferentes das suas ações não são alteradas por esta
-- migration — ver supabase/backfill/0027_nc_status_segue_acoes_backfill.sql.
--
-- Idempotente. Validar sem aplicar: begin; <conteúdo> rollback;
-- Testes: supabase/tests/0027_nc_status_segue_acoes.test.sql
-- ROLLBACK: drop trigger if exists trg_nc_status_segue_acoes on public.actions;
--           drop function if exists public.sync_nc_status_from_actions();
--           drop function if exists public.nc_status_by_actions(uuid, text);
--           e rodar de novo supabase/migrations/0026_nc_concluida_por_acoes.sql
-- ============================================================================

-- --- 1. A regra ---------------------------------------------------------------------
create or replace function public.nc_status_by_actions(p_nc_id uuid, p_status_atual text)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_status_atual = 'cancelada' then 'cancelada'
    when count(*) = 0 then
      case when p_status_atual = 'em_tratamento' then 'aberta' else p_status_atual end
    when count(*) filter (where status = 'em_andamento') > 0 then 'em_tratamento'
    when count(*) filter (where status = 'aberta') > 0
     and count(*) filter (where status = 'concluida') > 0 then 'em_tratamento'
    when count(*) filter (where status = 'aberta') > 0 then 'aberta'
    when count(*) filter (where status = 'concluida') > 0 then 'concluida'
    else 'aberta'
  end
  from public.actions
  where nonconformity_id = p_nc_id;
$$;

comment on function public.nc_status_by_actions(uuid, text) is
  'Status que a NC deve ter a partir das suas ações (regra da migration 0027). NC cancelada não muda.';

-- --- 2. O trigger -------------------------------------------------------------------
create or replace function public.sync_nc_status_from_actions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_atual text;
  v_novo text;
begin
  if tg_op = 'INSERT' then
    v_ids := array[new.nonconformity_id];
  elsif tg_op = 'DELETE' then
    v_ids := array[old.nonconformity_id];
  else
    if new.status is not distinct from old.status
       and new.nonconformity_id is not distinct from old.nonconformity_id then
      return null;
    end if;
    v_ids := case when new.nonconformity_id is distinct from old.nonconformity_id
                  then array[old.nonconformity_id, new.nonconformity_id]
                  else array[new.nonconformity_id] end;
  end if;

  foreach v_id in array v_ids loop
    continue when v_id is null;

    select status into v_atual
      from public.nonconformities
     where id = v_id
       for update;
    -- NC inexistente (ex.: apagada em cascata) ou cancelada: nada a fazer.
    continue when v_atual is null or v_atual = 'cancelada';

    v_novo := public.nc_status_by_actions(v_id, v_atual);
    if v_novo is distinct from v_atual then
      update public.nonconformities
         set status = v_novo, updated_at = now()
       where id = v_id;
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function public.sync_nc_status_from_actions() from public;

drop trigger if exists trg_nc_status_segue_acoes on public.actions;
create trigger trg_nc_status_segue_acoes
  after insert or update of status, nonconformity_id or delete on public.actions
  for each row execute function public.sync_nc_status_from_actions();

-- --- 3. Substitui a regra da 0026 (só conclusão) --------------------------------------
drop trigger if exists trg_nc_concluida_por_acoes on public.actions;
drop function if exists public.conclude_nc_when_actions_resolved();
