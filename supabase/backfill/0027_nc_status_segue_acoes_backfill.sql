-- ============================================================================
-- Backfill (rodar uma vez, só com aprovação) — par da migration
-- 0027_nc_status_segue_acoes.sql
-- ============================================================================
-- A 0027 só age daqui em diante (quando uma ação é criada, muda de status ou
-- é apagada). Este script aplica a MESMA regra (public.nc_status_by_actions)
-- às NCs que JÁ estão diferentes das suas ações. Em 28/10/2026 eram 26:
--   25 "aberta" com ação em andamento  → em_tratamento
--    1 "em_tratamento" só com ação aberta → aberta
-- NCs canceladas não são tocadas (a regra devolve "cancelada").
--
-- Prévia em produção (09/11/2026): 14 aberta → em_tratamento,
-- 1 em_tratamento → aberta, 1 concluida → aberta.
--
-- EXCEÇÃO (decisão do usuário, 09/11/2026): a NC 6c6db536-… (OFC_QD_0011,
-- "PRO-01 — DR — teste funcional") fica CONCLUÍDA. A instalação do DR/DPS
-- foi feita (ação concluída em 30/09, antes da exigência de evidência); a
-- ação foi reaberta e cancelada em 29/10 sem que a correção tivesse sido
-- desfeita. Pela regra ela voltaria para "aberta". Se alguém alterar a ação
-- dela no futuro, o trigger passa a valer normalmente.
--
-- Se alguma NC passar para "concluida", concluida_em = dia da última ação
-- concluída, ao meio-dia de Brasília (mesmo critério do backfill 0026); o
-- trigger 0019 apaga concluida_em de NC que sai de "concluida".
--
-- O trigger de auditoria continua LIGADO: cada NC alterada gera a linha
-- "status → …" (usuário vazio quando rodado no SQL Editor).
--
-- Passo 1 (só leitura) mostra o que mudaria.
-- Passo 2: validar com begin; … rollback; e só então rodar com commit.
-- ============================================================================

-- --- Passo 1: prévia (só leitura) ---------------------------------------------------
select nc.status as status_atual,
       public.nc_status_by_actions(nc.id, nc.status) as status_novo,
       count(*) as ncs
  from public.nonconformities nc
 where public.nc_status_by_actions(nc.id, nc.status) is distinct from nc.status
   and nc.id <> '6c6db536-bc2b-47e9-8298-5aae11c9e35a'  -- exceção (ver cabeçalho)
 group by 1, 2
 order by 1, 2;

-- --- Passo 2: aplicar ----------------------------------------------------------------
begin;

create temp table tmp_nc_backfill_0027 on commit drop as
select nc.id,
       nc.status as status_atual,
       public.nc_status_by_actions(nc.id, nc.status) as status_novo,
       (select max(a.concluida_em) from public.actions a
         where a.nonconformity_id = nc.id and a.status = 'concluida') as ultima_conclusao
  from public.nonconformities nc
 where public.nc_status_by_actions(nc.id, nc.status) is distinct from nc.status
   and nc.id <> '6c6db536-bc2b-47e9-8298-5aae11c9e35a';  -- exceção (ver cabeçalho)

update public.nonconformities nc
   set status = t.status_novo, updated_at = now()
  from tmp_nc_backfill_0027 t
 where nc.id = t.id;

update public.nonconformities nc
   set concluida_em = (t.ultima_conclusao + time '12:00') at time zone 'America/Sao_Paulo'
  from tmp_nc_backfill_0027 t
 where nc.id = t.id
   and t.status_novo = 'concluida'
   and t.ultima_conclusao is not null;

-- Resumo + conferência numa linha só (o SQL Editor mostra o último resultado).
-- Esperado: mudancas = as da prévia, ncs_ainda_diferentes = 0 e
-- excecao_status = concluida (só a exceção continua diferente das ações).
select (select string_agg(status_atual || ' → ' || status_novo || ': ' || n, '; ' order by status_atual, status_novo)
          from (select status_atual, status_novo, count(*) as n
                  from tmp_nc_backfill_0027 group by 1, 2) r) as mudancas,
       count(*) filter (where nc.id <> '6c6db536-bc2b-47e9-8298-5aae11c9e35a') as ncs_ainda_diferentes,
       (select status from public.nonconformities
         where id = '6c6db536-bc2b-47e9-8298-5aae11c9e35a') as excecao_status
  from public.nonconformities nc
 where public.nc_status_by_actions(nc.id, nc.status) is distinct from nc.status;

rollback;  -- trocar por commit; depois de conferir o resultado
