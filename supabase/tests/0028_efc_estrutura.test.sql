-- ============================================================================
-- Testes da migration 0028 (estrutura de unidades nas localidades)
-- ============================================================================
-- Rodar DEPOIS da 0028, inteiro, no SQL Editor (como postgres). Tudo em
-- BEGIN/ROLLBACK: nada fica no banco. Sucesso = nenhum "FALHA" e 'OK' no fim.
-- ============================================================================

begin;

do $$
declare
  v_slz uuid := (select id from public.unidades_operacionais where codigo = 'SLZ');
  v_efc uuid := (select id from public.unidades_operacionais where codigo = 'EFC');
  v_tst uuid;
  v_loc_slz uuid := (select id from public.localidades where nome = 'Porto');
  v_loc_efc uuid;
  v_loc_tst uuid;
  v_id uuid;
  v_tag text;
  v_ok boolean;
begin
  -- Estrutura e configuração
  if not (select usa_site from public.unidades_operacionais where id = v_slz) then
    raise exception 'FALHA: SLZ deveria usar site';
  end if;
  if (select usa_site from public.unidades_operacionais where id = v_efc) then
    raise exception 'FALHA: EFC não deveria usar site';
  end if;
  if exists (select 1 from public.localidades where nome in ('Porto', 'Oficina', 'Pelotização')
               and (unidade_operacional_id is distinct from v_slz or sigla is not null)) then
    raise exception 'FALHA: localidades de São Luís alteradas além da unidade';
  end if;
  if exists (select 1 from public.electrical_panels where unidade_operacional_id = v_slz and site is null) then
    raise exception 'FALHA: quadro SLZ existente sem site';
  end if;
  if (select column_default from information_schema.columns where table_schema = 'public'
        and table_name = 'localidades' and column_name = 'unidade_operacional_id') is not null then
    raise exception 'FALHA: localidades.unidade_operacional_id não deveria ter default';
  end if;

  -- 1. Localidade sem unidade -> erro (nada vira São Luís implicitamente)
  v_ok := false;
  begin
    insert into public.localidades (nome) values ('TESTE 0028 SEM UNIDADE');
  exception when not_null_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: localidade sem unidade foi aceita'; end if;

  insert into public.localidades (nome, sigla, unidade_operacional_id)
  values ('TESTE 0028 CIDADE EFC', 'TSTX', v_efc) returning id into v_loc_efc;

  -- 2. SLZ com site e sem TAG: continua gerando PRT_QD_ (regra intacta)
  insert into public.electrical_panels (name, site, localidade_id)
  values ('TESTE 0028 SLZ', 'porto', v_loc_slz) returning id, tag into v_id, v_tag;
  if v_tag !~ '^PRT_QD_[0-9]{4}$' then raise exception 'FALHA: TAG SLZ gerada fora do padrão: %', v_tag; end if;

  -- 3. SLZ sem site -> erro; apagar o site de um quadro SLZ -> erro
  v_ok := false;
  begin
    insert into public.electrical_panels (tag, name) values ('TESTE_0028_A', 'SLZ sem site');
  exception when not_null_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: quadro SLZ sem site foi aceito'; end if;
  v_ok := false;
  begin
    update public.electrical_panels set site = null where id = v_id;
  exception when not_null_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: site de quadro SLZ pôde ser apagado'; end if;

  -- 4. EFC com site -> erro; sem site, com TAG -> ok e TAG preservada
  v_ok := false;
  begin
    insert into public.electrical_panels (tag, name, site, unidade_operacional_id, localidade_id)
    values ('TSTX_QD_0001', 'EFC com site', 'porto', v_efc, v_loc_efc);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: quadro EFC com site foi aceito'; end if;
  insert into public.electrical_panels (tag, name, unidade_operacional_id, localidade_id)
  values ('TSTX_QD_0001', 'EFC', v_efc, v_loc_efc) returning tag into v_tag;
  if v_tag <> 'TSTX_QD_0001' then raise exception 'FALHA: TAG EFC alterada: %', v_tag; end if;

  -- 5. EFC sem TAG -> erro (não gera TAG de São Luís)
  v_ok := false;
  begin
    insert into public.electrical_panels (name, unidade_operacional_id) values ('EFC sem tag', v_efc);
  exception when others then v_ok := sqlerrm like '%Site desconhecido%';
  end;
  if not v_ok then raise exception 'FALHA: quadro EFC sem TAG não foi recusado como esperado'; end if;

  -- 6. Localidade de outra unidade -> erro (nos dois sentidos)
  v_ok := false;
  begin
    insert into public.electrical_panels (tag, name, unidade_operacional_id, localidade_id)
    values ('TSTX_QD_0002', 'EFC em loc SLZ', v_efc, v_loc_slz);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: quadro EFC aceito em localidade SLZ'; end if;
  v_ok := false;
  begin
    update public.electrical_panels set localidade_id = v_loc_efc where id = v_id;
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: quadro SLZ aceito em localidade EFC'; end if;

  -- 7. Edição comum de quadro SLZ continua funcionando
  update public.electrical_panels set notes = 'TESTE 0028' where id = v_id;

  -- 8. Sigla: única por unidade e no formato
  v_ok := false;
  begin
    insert into public.localidades (nome, sigla, unidade_operacional_id) values ('TESTE 0028 OUTRA', 'TSTX', v_efc);
  exception when unique_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: sigla repetida na mesma unidade foi aceita'; end if;
  v_ok := false;
  begin
    insert into public.localidades (nome, sigla, unidade_operacional_id) values ('TESTE 0028 MINUSC', 'acd', v_efc);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: sigla fora do formato foi aceita'; end if;

  -- 9. Terceira unidade: só dados, nenhuma regra nova
  insert into public.unidades_operacionais (codigo, nome) values ('TST3', 'Unidade Teste 3') returning id into v_tst;
  insert into public.localidades (nome, sigla, unidade_operacional_id) values ('TESTE 0028 CIDADE TST3', 'TTT', v_tst)
  returning id into v_loc_tst;
  insert into public.electrical_panels (tag, name, unidade_operacional_id, localidade_id)
  values ('TTT_QD_0001', 'Terceira unidade', v_tst, v_loc_tst);
  v_ok := false;
  begin
    insert into public.electrical_panels (tag, name, site, unidade_operacional_id, localidade_id)
    values ('TTT_QD_0002', 'Terceira com site', 'porto', v_tst, v_loc_tst);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: terceira unidade (sem usa_site) aceitou site'; end if;
end $$;

select 'OK' as resultado;

rollback;
