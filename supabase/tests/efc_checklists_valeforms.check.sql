  -- ============================================================================
  -- Conferência da importação dos checklists históricos da EFC (ValeForms).
  -- Só leitura. Rodar DEPOIS do SQL de importação (supabase/private/), no SQL
  -- Editor. Sucesso = 'OK' no fim e nenhum erro "FALHA".
  -- ============================================================================

  do $$
  declare
    v_efc uuid := (select id from public.unidades_operacionais where codigo = 'EFC');
    v_n int;
  begin
    create temp table _ck_insp on commit drop as
    select i.* from public.inspections i where i.observacoes like 'Checklist importado do ValeForms%';

    if (select count(*) from _ck_insp) = 0 then raise exception 'FALHA 1: nenhuma inspeção importada'; end if;

    -- 2. Tudo na EFC, um checklist importado por quadro
    if exists (select 1 from _ck_insp where unidade_operacional_id is distinct from v_efc) then
      raise exception 'FALHA 2: inspeção importada fora da unidade EFC';
    end if;
    if exists (select 1 from _ck_insp group by panel_id having count(*) > 1) then
      raise exception 'FALHA 2b: quadro com mais de um checklist importado';
    end if;

    -- 3. Cada inspeção com uma resposta por item ativo do modelo, e unidade herdada
    select count(*) into v_n from _ck_insp c
    where (select count(*) from public.inspection_responses r where r.inspection_id = c.id)
        <> (select count(*) from public.inspection_template_items t where t.template_id = c.template_id and t.ativo);
    if v_n > 0 then raise exception 'FALHA 3: % inspeção(ões) com número de respostas diferente do modelo', v_n; end if;
    if exists (select 1 from public.inspection_responses r join _ck_insp c on c.id = r.inspection_id
                where r.unidade_operacional_id is distinct from v_efc) then
      raise exception 'FALHA 3b: resposta sem a unidade EFC';
    end if;
    if exists (select 1 from public.inspection_responses r join _ck_insp c on c.id = r.inspection_id
                where r.resposta = 'nao_verificado' and coalesce(trim(r.motivo), '') = '') then
      raise exception 'FALHA 3c: "Não verificado" sem motivo';
    end if;

    -- 4. Uma NC aberta por "não conforme", uma ação automática por NC
    select count(*) into v_n from public.inspection_responses r join _ck_insp c on c.id = r.inspection_id
    where r.resposta = 'nao_conforme'
      and not exists (select 1 from public.nonconformities n where n.inspection_id = c.id and n.template_item_id = r.template_item_id);
    if v_n > 0 then raise exception 'FALHA 4: % resposta(s) não conforme sem NC', v_n; end if;
    if (select count(*) from public.nonconformities n join _ck_insp c on c.id = n.inspection_id)
      <> (select count(*) from public.inspection_responses r join _ck_insp c on c.id = r.inspection_id where r.resposta = 'nao_conforme') then
      raise exception 'FALHA 4b: número de NCs diferente das respostas não conforme';
    end if;
    select count(*) into v_n from public.nonconformities n join _ck_insp c on c.id = n.inspection_id
    where (select count(*) from public.actions a where a.nonconformity_id = n.id and a.origem = 'automatica') <> 1;
    if v_n > 0 then raise exception 'FALHA 4c: % NC(s) sem exatamente uma ação automática', v_n; end if;
    if exists (select 1 from public.nonconformities n join _ck_insp c on c.id = n.inspection_id
                where n.unidade_operacional_id is distinct from v_efc or n.origem <> 'inspecao') then
      raise exception 'FALHA 4d: NC importada com unidade/origem errada';
    end if;
    if exists (select 1 from public.actions a join public.nonconformities n on n.id = a.nonconformity_id
                join _ck_insp c on c.id = n.inspection_id
                where a.unidade_operacional_id is distinct from v_efc or a.responsavel_id is not null or a.prazo is null) then
      raise exception 'FALHA 4e: ação importada com unidade errada, responsável preenchido ou sem prazo';
    end if;

    -- 5. Resultado geral coerente e Índice de Saúde calculado
    if exists (select 1 from _ck_insp c where c.overall_result = 'aprovado'
                and exists (select 1 from public.inspection_responses r where r.inspection_id = c.id and r.resposta = 'nao_conforme')) then
      raise exception 'FALHA 5: inspeção "aprovado" com item não conforme';
    end if;
    if exists (select 1 from _ck_insp where health_index_resultado is null) then
      raise exception 'FALHA 5b: inspeção sem Índice de Saúde';
    end if;

    -- 6. Quadro atualizado (datas, Índice de Saúde, foto externa e interna)
    select count(*) into v_n from _ck_insp c join public.electrical_panels p on p.id = c.panel_id
    where p.last_inspection_date is null or p.last_inspection_date < c.inspection_date
        or p.health_index is null or coalesce(p.photo_url, '') = '' or coalesce(p.photo_interna_url, '') = '';
    if v_n > 0 then raise exception 'FALHA 6: % quadro(s) sem datas/índice/fotos atualizados', v_n; end if;

    -- 7. Nada de São Luís foi tocado
    if exists (select 1 from public.inspections i join public.unidades_operacionais u on u.id = i.unidade_operacional_id
                where u.codigo <> 'EFC' and i.observacoes like 'Checklist importado do ValeForms%') then
      raise exception 'FALHA 7: inspeção importada em outra unidade';
    end if;
  end $$;

  select 'OK' as resultado,
        (select count(*) from public.inspections where observacoes like 'Checklist importado do ValeForms%') as inspecoes,
        (select count(*) from public.nonconformities n join public.inspections i on i.id = n.inspection_id
          where i.observacoes like 'Checklist importado do ValeForms%') as ncs;
