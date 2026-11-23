-- ============================================================================
-- Pendências funcionais da EFC antes da liberação — SÓ LEITURA
-- ============================================================================
-- Rodar no SQL Editor (como postgres) e exportar o resultado. Não altera
-- nada. O resultado contém dados reais: não versionar a saída (repo público).
--
-- B1 — PRO-01 (DR) "Não conforme" sem resposta de área molhada nos
--      checklists da EFC. Pela regra atual (desde 29/09/2026) o PRO-01 só
--      caracteriza risco de interdição com área molhada = Sim; sem a
--      resposta, a NC fica fora do relatório de risco. NADA é preenchido por
--      suposição: a lista serve para a confirmação em campo.
-- B2 — Ações das NCs críticas da EFC (TAG, NC, responsável, Nota, OM,
--      prazo, status). Nenhum prazo é alterado.
-- ============================================================================

-- B1 -------------------------------------------------------------------------
select p.tag,
       l.nome  as cidade,
       lc.nome as predio,
       s.nome  as sublocal,
       i.inspection_date as data_inspecao,
       r.resposta        as pro01_resposta,
       coalesce(r.area_molhada::text, 'sem resposta') as area_molhada,
       n.status          as status_nc,
       exists (select 1 from public.inspection_responses r2
                 join public.inspection_template_items t2 on t2.id = r2.template_item_id
                where r2.inspection_id = i.id and t2.codigo = 'ATR-01' and r2.resposta = 'nao_conforme') as ja_em_risco_por_atr01,
       i.id as inspecao_id,
       n.id as nc_id
  from public.inspection_responses r
  join public.inspection_template_items t on t.id = r.template_item_id and t.codigo = 'PRO-01'
  join public.inspections i on i.id = r.inspection_id
  join public.electrical_panels p on p.id = coalesce(i.panel_ref_id, i.panel_id)
  join public.unidades_operacionais u on u.id = p.unidade_operacional_id and u.codigo = 'EFC'
  left join public.localidades l on l.id = p.localidade_id
  left join public.locais lc on lc.id = p.local_id
  left join public.sublocais s on s.id = p.sublocal_id
  left join public.nonconformities n on n.inspection_id = i.id and n.template_item_id = t.id
 where r.resposta = 'nao_conforme' and r.area_molhada is null
 order by l.nome, p.tag;

-- B2 -------------------------------------------------------------------------
select p.tag,
       l.nome as cidade,
       t.codigo as item,
       n.descricao as nc,
       n.severidade,
       n.status as status_nc,
       a.descricao as acao,
       a.status as status_acao,
       coalesce(pr.full_name, pr.email, a.responsavel, 'pendente de atribuição') as responsavel,
       a.numero_nota,
       a.om,
       a.prazo,
       case when a.prazo < current_date and a.status in ('aberta', 'em_andamento') then 'atrasada'
            when a.prazo = current_date and a.status in ('aberta', 'em_andamento') then 'vence hoje'
            else '' end as situacao_prazo,
       a.id as acao_id,
       n.id as nc_id
  from public.actions a
  join public.nonconformities n on n.id = a.nonconformity_id
  join public.unidades_operacionais u on u.id = a.unidade_operacional_id and u.codigo = 'EFC'
  left join public.electrical_panels p on p.id = coalesce(a.panel_id, n.panel_id)
  left join public.localidades l on l.id = p.localidade_id
  left join public.inspection_template_items t on t.id = n.template_item_id
  left join public.profiles pr on pr.id = a.responsavel_id
 where n.severidade = 'critica'
 order by a.prazo, l.nome, p.tag, t.codigo;
