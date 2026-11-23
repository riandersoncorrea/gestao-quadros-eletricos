-- ============================================================================
-- Relatório de PRAZOS das ações da EFC — SÓ LEITURA (pendência B2)
-- ============================================================================
-- Situação atual dos prazos ORIGINAIS das ações, para a decisão de manter ou
-- reprogramar. Não altera nada. Saída só com contagens (sem nomes, TAGs ou
-- dados pessoais); a lista detalhada fica em efc_pendencias_b1_b2.sql.
-- Rodar no SQL Editor (ou psql); as três consultas são independentes.
-- Para outra unidade, trocar o código em `params`.
--
-- Contexto: as ações dos checklists ValeForms nasceram em 10/11/2026 com
-- prazo pela severidade (crítica 1 dia, alta 7, média 30, baixa 90 —
-- src/domain/ncActionMatrix.js), sem responsável.
-- ============================================================================

-- 1. Ações em aberto por severidade da NC x situação do prazo ---------------
with params as (
  select 'EFC'::text as unidade, (now() at time zone 'America/Sao_Paulo')::date as hoje
), base as (
  select a.id, a.status, a.prazo, a.responsavel_id, a.responsavel,
         coalesce(n.severidade, 'sem NC') as severidade, p.hoje
    from public.actions a
    join params p on true
    join public.unidades_operacionais u on u.id = a.unidade_operacional_id and u.codigo = p.unidade
    left join public.nonconformities n on n.id = a.nonconformity_id
   where a.status in ('aberta', 'em_andamento')
)
select severidade,
       count(*)                                                         as em_aberto,
       count(*) filter (where prazo < hoje)                             as vencidas,
       count(*) filter (where prazo = hoje)                             as vencem_hoje,
       count(*) filter (where prazo > hoje and prazo <= hoje + 7)       as vencem_em_7_dias,
       count(*) filter (where prazo > hoje + 7 and prazo <= hoje + 30)  as vencem_em_8_a_30_dias,
       count(*) filter (where prazo > hoje + 30)                        as mais_de_30_dias,
       count(*) filter (where prazo is null)                            as sem_prazo,
       count(*) filter (where status = 'em_andamento')                  as em_andamento,
       count(*) filter (where responsavel_id is null and coalesce(btrim(responsavel), '') = '') as sem_responsavel,
       min(prazo)                                                       as prazo_mais_antigo,
       max(hoje - prazo) filter (where prazo < hoje)                    as maior_atraso_dias,
       round(avg(hoje - prazo) filter (where prazo < hoje), 1)          as atraso_medio_dias
  from base
 group by severidade
 order by array_position(array['critica', 'alta', 'media', 'baixa', 'sem NC'], severidade);

-- 2. Todas as ações por status (inclui concluídas/canceladas) e prazo -------
with params as (
  select 'EFC'::text as unidade, (now() at time zone 'America/Sao_Paulo')::date as hoje
)
select coalesce(n.severidade, 'sem NC') as severidade, a.status, a.prazo,
       count(*) as acoes,
       count(*) filter (where a.status = 'concluida' and a.concluida_em::date > a.prazo) as concluidas_apos_prazo
  from public.actions a
  join params p on true
  join public.unidades_operacionais u on u.id = a.unidade_operacional_id and u.codigo = p.unidade
  left join public.nonconformities n on n.id = a.nonconformity_id
 group by 1, 2, 3
 order by array_position(array['critica', 'alta', 'media', 'baixa', 'sem NC'], coalesce(n.severidade, 'sem NC')), a.status, a.prazo;

-- 3. Em aberto por cidade: vencidas x a vencer --------------------------------
with params as (
  select 'EFC'::text as unidade, (now() at time zone 'America/Sao_Paulo')::date as hoje
)
select coalesce(l.nome, 'sem cidade') as cidade,
       count(*)                                                   as em_aberto,
       count(*) filter (where a.prazo < p.hoje)                   as vencidas,
       count(*) filter (where a.prazo < p.hoje and n.severidade = 'critica') as criticas_vencidas,
       count(*) filter (where a.prazo >= p.hoje)                  as a_vencer
  from public.actions a
  join params p on true
  join public.unidades_operacionais u on u.id = a.unidade_operacional_id and u.codigo = p.unidade
  left join public.nonconformities n on n.id = a.nonconformity_id
  left join public.electrical_panels ep on ep.id = coalesce(a.panel_id, n.panel_id)
  left join public.localidades l on l.id = ep.localidade_id
 where a.status in ('aberta', 'em_andamento')
 group by 1
 order by vencidas desc, cidade;
