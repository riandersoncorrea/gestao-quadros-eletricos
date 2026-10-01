-- ============================================================================
-- Data de conclusão da Não Conformidade (nonconformities.concluida_em)
-- ============================================================================
-- Aditiva. Até aqui a NC não guardava QUANDO foi concluída, então o KPI
-- "NCs corrigidas" só podia ser recortado pela data de abertura
-- (created_at). Com esta coluna, "NCs corrigidas no período" passa a
-- significar "concluídas dentro do período".
--
-- Regra (trigger, vale para qualquer caminho de gravação — tela, API):
--   * a NC PASSA para "concluida"  → concluida_em = agora;
--   * a NC sai de "concluida" (reaberta, cancelada…) → concluida_em = null;
--   * qualquer outra edição não mexe na data.
--
-- PREENCHIMENTO DAS NCs JÁ CONCLUÍDAS (explícito): concluida_em recebe o
-- momento em que o status mudou para "concluida", lido do audit_log (a
-- última mudança desse tipo). Se não houver esse registro (ex.: NC criada
-- já concluída), usa updated_at. Durante o preenchimento os triggers de
-- updated_at e de auditoria da tabela ficam desligados, para que o
-- preenchimento não altere updated_at nem gere linhas de auditoria — os
-- demais dados das NCs não são tocados.
--
-- Idempotente. Validar sem aplicar: begin; <conteúdo> rollback;
-- Testes: supabase/tests/0019_nonconformity_concluida_em.test.sql
-- ROLLBACK (manual): drop trigger if exists trg_nc_concluida_em on public.nonconformities;
--   drop function if exists public.set_nc_concluida_em();
--   alter table public.nonconformities drop column if exists concluida_em;
-- ============================================================================

-- --- 1. Coluna ---------------------------------------------------------------
alter table public.nonconformities
  add column if not exists concluida_em timestamptz;
create index if not exists idx_nc_concluida_em on public.nonconformities(concluida_em);
comment on column public.nonconformities.concluida_em is
  'Momento em que a NC passou para o status concluida (preenchido por trigger). Null se a NC não está concluída.';

-- --- 2. Preenchimento das NCs já concluídas ------------------------------------
alter table public.nonconformities disable trigger trg_nc_updated;
alter table public.nonconformities disable trigger trg_audit;

update public.nonconformities nc
   set concluida_em = coalesce(
         (select max(al.created_at)
            from public.audit_log al
           where al.tabela = 'nonconformities'
             and al.registro_id = nc.id
             and al.campo = 'status'
             and al.valor_novo = 'concluida'),
         nc.updated_at)
 where nc.status = 'concluida'
   and nc.concluida_em is null;

alter table public.nonconformities enable trigger trg_nc_updated;
alter table public.nonconformities enable trigger trg_audit;

-- --- 3. Manutenção automática da data -------------------------------------------
create or replace function public.set_nc_concluida_em()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'concluida' then
    if tg_op = 'INSERT' or old.status is distinct from 'concluida' then
      new.concluida_em := now();
    end if;
  else
    new.concluida_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_nc_concluida_em on public.nonconformities;
create trigger trg_nc_concluida_em
  before insert or update on public.nonconformities
  for each row execute function public.set_nc_concluida_em();

-- --- 4. Verificação ---------------------------------------------------------------
do $$
declare v_sem int;
begin
  select count(*) into v_sem from public.nonconformities
   where status = 'concluida' and concluida_em is null;
  if v_sem > 0 then
    raise exception '% NC(s) concluída(s) sem concluida_em', v_sem;
  end if;
end;
$$;
