-- ============================================================================
-- Testes da migration 0017_action_correction_evidence.sql
-- ============================================================================
-- Rodar DEPOIS da migration, inteiro. Tudo dentro de begin/rollback: nada
-- do que é criado aqui fica no banco. Sucesso = nenhum erro "FALHA".
-- ============================================================================

begin;

-- Fixture: uma NC e uma ação aberta (sem quadro, para não depender de dados).
create temporary table _t on commit drop as
with nc as (
  insert into public.nonconformities (descricao, origem) values ('TESTE 0017', 'manual') returning id
), act as (
  insert into public.actions (nonconformity_id, descricao)
  select id, 'TESTE 0017 ação' from nc returning id, nonconformity_id
)
select nonconformity_id as nc_id, id as action_id from act;

-- 1. Colunas novas existem na tabela e na view, com defaults seguros --------
do $$
declare v record;
begin
  select * into v from public.v_actions where id = (select action_id from _t);
  if v.fotos_corretiva is null or cardinality(v.fotos_corretiva) <> 0 then
    raise exception 'FALHA 1: fotos_corretiva deveria ser lista vazia';
  end if;
  if v.numero_nota is not null or v.om is not null or v.evidencia_pdf_url is not null then
    raise exception 'FALHA 1: colunas novas deveriam nascer nulas';
  end if;
  if v.atrasada is null then raise exception 'FALHA 1: v_actions perdeu atrasada'; end if;
  raise notice 'OK 1: colunas novas visíveis em v_actions';
end $$;

-- 2. Ação aberta pode ser editada sem os dados de conclusão ----------------
do $$
begin
  update public.actions set descricao = 'editada', status = 'em_andamento' where id = (select action_id from _t);
  raise notice 'OK 2: edição normal não exige Nota/OM/fotos';
end $$;

-- 3. Concluir sem cada requisito é bloqueado -------------------------------
do $$
declare
  v_id uuid := (select action_id from _t);
  casos text[][] := array[
    array['nota', 'Número da Nota'],
    array['om', 'OM'],
    array['fotos', 'foto'],
    array['pdf', 'PDF']
  ];
  c text[];
begin
  foreach c slice 1 in array casos loop
    begin
      update public.actions set
        status = 'concluida',
        numero_nota = case when c[1] = 'nota' then '  ' else '123' end,
        om = case when c[1] = 'om' then null else '456' end,
        fotos_corretiva = case when c[1] = 'fotos' then '{}'::text[] else array['https://x/1.jpg'] end,
        evidencia_pdf_url = case when c[1] = 'pdf' then null else 'https://x/e.pdf' end
      where id = v_id;
      raise exception 'FALHA 3: concluiu sem %', c[1];
    exception when check_violation then
      if sqlerrm not like '%' || c[2] || '%' then raise exception 'FALHA 3: mensagem inesperada: %', sqlerrm; end if;
    end;
  end loop;
  raise notice 'OK 3: conclusão bloqueada sem Nota, OM, foto ou PDF (mensagens claras)';
end $$;

-- 4. Máximo de 3 fotos ------------------------------------------------------
do $$
begin
  begin
    update public.actions set fotos_corretiva = array['a','b','c','d'] where id = (select action_id from _t);
    raise exception 'FALHA 4: aceitou 4 fotos';
  exception when check_violation then null;
  end;
  update public.actions set fotos_corretiva = array['a','b','c'] where id = (select action_id from _t);
  raise notice 'OK 4: até 3 fotos aceitas, 4ª rejeitada';
end $$;

-- 5. Conclusão completa passa; edição posterior de ação concluída também ---
do $$
declare v_id uuid := (select action_id from _t);
begin
  update public.actions set status = 'concluida', numero_nota = '123', om = '456',
    fotos_corretiva = array['https://x/1.jpg'], evidencia_pdf_url = 'https://x/e.pdf',
    concluida_em = current_date
  where id = v_id;
  update public.actions set responsavel = 'outro' where id = v_id;
  raise notice 'OK 5: conclusão completa aceita';
end $$;

-- 6. Ação concluída antes da migration (sem dados novos) continua editável --
do $$
declare v_id uuid;
begin
  alter table public.actions disable trigger trg_check_action_completion;
  insert into public.actions (nonconformity_id, descricao, status)
  values ((select nc_id from _t), 'legado concluído', 'concluida') returning id into v_id;
  alter table public.actions enable trigger trg_check_action_completion;
  update public.actions set descricao = 'legado editado' where id = v_id;
  -- reabrir continua permitido, como hoje
  update public.actions set status = 'aberta' where id = v_id;
  raise notice 'OK 6: ação concluída legada editável e reabrível';
end $$;

-- 7. Inserir já concluída sem evidência é bloqueado ------------------------
do $$
begin
  begin
    insert into public.actions (nonconformity_id, descricao, status)
    values ((select nc_id from _t), 'x', 'concluida');
    raise exception 'FALHA 7: insert concluído sem evidência aceito';
  exception when check_violation then null;
  end;
  raise notice 'OK 7: insert já concluído sem evidência bloqueado';
end $$;

rollback;
