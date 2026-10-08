-- ============================================================================
-- Backfill (OPCIONAL, rodar uma vez, só com aprovação) — par da migration
-- 0026_nc_concluida_por_acoes.sql
-- ============================================================================
-- A 0026 só age daqui em diante (quando uma ação é concluída/cancelada).
-- Este script aplica a MESMA regra às NCs que JÁ estão nessa situação:
--   NC "aberta"/"em_tratamento" cujas ações estão TODAS concluídas ou
--   canceladas, com ao menos uma concluída  →  status "concluida".
--
-- concluida_em = dia da última ação concluída (actions.concluida_em é uma
-- data), ao meio-dia de Brasília, para o filtro de período do Dashboard
-- cair no dia certo. Se nenhuma ação tiver data, fica o momento do backfill
-- (valor do trigger 0019).
--
-- O trigger de auditoria continua LIGADO: cada NC fechada gera a linha de
-- auditoria "status → concluida" (usuário vazio quando rodado no SQL Editor).
--
-- Passo 1 (só leitura) mostra quantas NCs seriam fechadas.
-- Passo 2: validar com begin; … rollback; e só então rodar com commit.
-- ============================================================================

-- --- Passo 1: prévia (só leitura) ---------------------------------------------------
select count(*) as ncs_a_concluir
  from public.nonconformities nc
 where nc.status in ('aberta', 'em_tratamento')
   and exists (select 1 from public.actions a where a.nonconformity_id = nc.id and a.status = 'concluida')
   and not exists (select 1 from public.actions a where a.nonconformity_id = nc.id
                     and a.status not in ('concluida', 'cancelada'));

-- --- Passo 2: aplicar ----------------------------------------------------------------
begin;

create temp table tmp_nc_backfill_0026 on commit drop as
select nc.id,
       (select max(a.concluida_em) from public.actions a
         where a.nonconformity_id = nc.id and a.status = 'concluida') as ultima_conclusao
  from public.nonconformities nc
 where nc.status in ('aberta', 'em_tratamento')
   and exists (select 1 from public.actions a where a.nonconformity_id = nc.id and a.status = 'concluida')
   and not exists (select 1 from public.actions a where a.nonconformity_id = nc.id
                     and a.status not in ('concluida', 'cancelada'));

-- status (o trigger 0019 preenche concluida_em = now())
update public.nonconformities nc
   set status = 'concluida', updated_at = now()
  from tmp_nc_backfill_0026 t
 where nc.id = t.id;

-- concluida_em = data real da última ação concluída (o trigger 0019 não mexe
-- na data quando a NC já estava "concluida")
update public.nonconformities nc
   set concluida_em = (t.ultima_conclusao + time '12:00') at time zone 'America/Sao_Paulo'
  from tmp_nc_backfill_0026 t
 where nc.id = t.id
   and t.ultima_conclusao is not null;

select count(*) as ncs_concluidas from tmp_nc_backfill_0026;

rollback;  -- trocar por commit; depois de conferir o resultado
