-- ============================================================================
-- Testes da migration 0027_nc_status_segue_acoes.sql
-- ============================================================================
-- Rodar DEPOIS da migration, inteiro, no SQL Editor. Tudo dentro de
-- begin/rollback: usuários, NCs e ações de teste não ficam no banco.
-- Sucesso = nenhum erro "FALHA".
--
-- Pressupõe a segurança por unidade (0029) já aplicada: os usuários de teste
-- recebem São Luís e as NCs de teste são de São Luís, para que a RLS
-- restritiva por unidade esteja ativa nos blocos do Inspetor e do Editor.
-- O bloco do Editor usa um quadro de São Luís existente (só dentro desta
-- transação; nada é gravado).
-- ============================================================================

begin;

-- --- Fixtures (como superusuário) ----------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-00000027a001', 'teste-inspetor-0027@example.invalid', '{}'),
  ('00000000-0000-4000-a000-00000027a002', 'teste-editor-0027@example.invalid', '{}');
insert into public.profiles (id, email) values
  ('00000000-0000-4000-a000-00000027a001', 'teste-inspetor-0027@example.invalid'),
  ('00000000-0000-4000-a000-00000027a002', 'teste-editor-0027@example.invalid')
on conflict (id) do nothing;
update public.profiles set role = 'inspetor', approved = true where id = '00000000-0000-4000-a000-00000027a001';
update public.profiles set role = 'editor', approved = true where id = '00000000-0000-4000-a000-00000027a002';
insert into public.profile_unidades (profile_id, unidade_operacional_id)
select p.id, u.id from public.profiles p, public.unidades_operacionais u
 where p.id in ('00000000-0000-4000-a000-00000027a001', '00000000-0000-4000-a000-00000027a002')
   and u.codigo = 'SLZ';

-- c1: ciclo completo com duas ações; c2: só cancelamento; c3: em andamento →
-- cancelada; c4: NC cancelada; c5: apagar a única ação; c6: Inspetor;
-- c7: Editor (precisa de quadro: o Editor só trata ação vinculada a quadro).
insert into public.nonconformities (id, descricao, origem, status, unidade_operacional_id)
select v.id::uuid, v.descricao, v.origem, v.status, u.id
  from (values
    ('00000000-0000-4000-a000-0000000027c1', 'TESTE 0027 ciclo', 'manual', 'aberta'),
    ('00000000-0000-4000-a000-0000000027c2', 'TESTE 0027 só cancelada', 'manual', 'aberta'),
    ('00000000-0000-4000-a000-0000000027c3', 'TESTE 0027 andamento → cancelada', 'manual', 'aberta'),
    ('00000000-0000-4000-a000-0000000027c4', 'TESTE 0027 NC cancelada', 'manual', 'cancelada'),
    ('00000000-0000-4000-a000-0000000027c5', 'TESTE 0027 apagar ação', 'manual', 'aberta'),
    ('00000000-0000-4000-a000-0000000027c6', 'TESTE 0027 inspetor', 'inspecao', 'aberta')
  ) as v(id, descricao, origem, status)
  join public.unidades_operacionais u on u.codigo = 'SLZ';
insert into public.nonconformities (id, descricao, origem, status, panel_id)
select '00000000-0000-4000-a000-0000000027c7', 'TESTE 0027 editor', 'manual', 'aberta', p.id
  from public.electrical_panels p
  join public.unidades_operacionais u on u.id = p.unidade_operacional_id and u.codigo = 'SLZ'
 order by p.tag
 limit 1;

do $$
declare
  c1 constant uuid := '00000000-0000-4000-a000-0000000027c1';
  ev constant text := 'https://example.invalid/e.pdf';
begin
  -- 0. O trigger da 0026 foi substituído ---------------------------------------
  if exists (select 1 from pg_trigger where tgname = 'trg_nc_concluida_por_acoes') then
    raise exception 'FALHA 0: trigger trg_nc_concluida_por_acoes ainda existe';
  end if;
  raise notice 'OK 0: trigger da 0026 substituído';

  -- 0b. O dono da função do trigger passa pela RLS -------------------------------
  -- Sem isso, a NC não acompanharia ações alteradas por Inspetor/Editor (a
  -- atualização da NC seria filtrada em silêncio pelas policies).
  if not exists (
    select 1 from pg_proc f join pg_roles r on r.oid = f.proowner
     where f.oid = 'public.sync_nc_status_from_actions()'::regprocedure
       and (r.rolsuper or r.rolbypassrls)) then
    raise exception 'FALHA 0b: dono de sync_nc_status_from_actions não passa pela RLS';
  end if;
  raise notice 'OK 0b: dono da função do trigger passa pela RLS';

  if not exists (select 1 from public.nonconformities where id = '00000000-0000-4000-a000-0000000027c7') then
    raise exception 'FALHA fixture: nenhum quadro de São Luís para o teste do Editor';
  end if;

  -- 1. Ação criada "aberta" mantém a NC "aberta" -------------------------------
  insert into public.actions (id, nonconformity_id, descricao, status)
  values ('00000000-0000-4000-a000-0000000027a1', c1, 'c1 a', 'aberta');
  if (select status from public.nonconformities where id = c1) <> 'aberta' then
    raise exception 'FALHA 1: NC mudou com ação apenas aberta';
  end if;
  raise notice 'OK 1: ação aberta → NC aberta';

  -- 2. Ação em andamento → NC em tratamento ------------------------------------
  update public.actions set status = 'em_andamento' where id = '00000000-0000-4000-a000-0000000027a1';
  if (select status from public.nonconformities where id = c1) <> 'em_tratamento' then
    raise exception 'FALHA 2: ação em andamento não pôs a NC em tratamento';
  end if;
  raise notice 'OK 2: ação em andamento → NC em tratamento';

  -- 3. Uma concluída + outra aberta → NC continua em tratamento ---------------
  insert into public.actions (id, nonconformity_id, descricao, status)
  values ('00000000-0000-4000-a000-0000000027a2', c1, 'c1 b', 'aberta');
  update public.actions
     set status = 'concluida', concluida_em = current_date,
         numero_nota = 'N-0027', om = 'OM-0027', fotos_corretiva = array['https://example.invalid/f.jpg'], evidencia_pdf_url = ev
   where id = '00000000-0000-4000-a000-0000000027a1';
  if (select status from public.nonconformities where id = c1) <> 'em_tratamento' then
    raise exception 'FALHA 3: correção parcial deveria deixar a NC em tratamento';
  end if;
  raise notice 'OK 3: parte concluída, parte aberta → NC em tratamento';

  -- 4. Concluir a última ação conclui a NC (com concluida_em) ------------------
  update public.actions
     set status = 'concluida', concluida_em = current_date,
         numero_nota = 'N-0027', om = 'OM-0027', fotos_corretiva = array['https://example.invalid/f.jpg'], evidencia_pdf_url = ev
   where id = '00000000-0000-4000-a000-0000000027a2';
  if (select status from public.nonconformities where id = c1) <> 'concluida'
     or (select concluida_em from public.nonconformities where id = c1) is null then
    raise exception 'FALHA 4: NC não concluída após a última ação';
  end if;
  raise notice 'OK 4: todas concluídas → NC concluída com concluida_em';

  -- 5. Reabrir uma ação reabre a NC e apaga concluida_em ------------------------
  update public.actions set status = 'aberta', concluida_em = null where id = '00000000-0000-4000-a000-0000000027a2';
  if (select status from public.nonconformities where id = c1) <> 'em_tratamento'
     or (select concluida_em from public.nonconformities where id = c1) is not null then
    raise exception 'FALHA 5: reabrir ação não reabriu a NC';
  end if;
  raise notice 'OK 5: ação reaberta → NC volta para em tratamento, sem concluida_em';

  -- 6. Só ações canceladas → NC aberta -----------------------------------------
  insert into public.actions (id, nonconformity_id, descricao, status)
  values ('00000000-0000-4000-a000-0000000027a3', '00000000-0000-4000-a000-0000000027c2', 'c2 a', 'aberta');
  update public.actions set status = 'cancelada' where id = '00000000-0000-4000-a000-0000000027a3';
  if (select status from public.nonconformities where id = '00000000-0000-4000-a000-0000000027c2') <> 'aberta' then
    raise exception 'FALHA 6: só canceladas deveria deixar a NC aberta';
  end if;
  raise notice 'OK 6: só canceladas → NC aberta';

  -- 7. Em andamento cancelada → NC volta para aberta ---------------------------
  insert into public.actions (id, nonconformity_id, descricao, status)
  values ('00000000-0000-4000-a000-0000000027a4', '00000000-0000-4000-a000-0000000027c3', 'c3 a', 'em_andamento');
  if (select status from public.nonconformities where id = '00000000-0000-4000-a000-0000000027c3') <> 'em_tratamento' then
    raise exception 'FALHA 7a: ação criada em andamento não pôs a NC em tratamento';
  end if;
  update public.actions set status = 'cancelada' where id = '00000000-0000-4000-a000-0000000027a4';
  if (select status from public.nonconformities where id = '00000000-0000-4000-a000-0000000027c3') <> 'aberta' then
    raise exception 'FALHA 7b: cancelar a única ação não devolveu a NC para aberta';
  end if;
  raise notice 'OK 7: em andamento → em tratamento; cancelada → aberta';

  -- 8. NC cancelada não é tocada ------------------------------------------------
  insert into public.actions (id, nonconformity_id, descricao, status)
  values ('00000000-0000-4000-a000-0000000027a5', '00000000-0000-4000-a000-0000000027c4', 'c4 a', 'em_andamento');
  if (select status from public.nonconformities where id = '00000000-0000-4000-a000-0000000027c4') <> 'cancelada' then
    raise exception 'FALHA 8: NC cancelada foi alterada';
  end if;
  raise notice 'OK 8: NC cancelada não muda';

  -- 9. Apagar a única ação de uma NC em tratamento → NC aberta -----------------
  insert into public.actions (id, nonconformity_id, descricao, status)
  values ('00000000-0000-4000-a000-0000000027a6', '00000000-0000-4000-a000-0000000027c5', 'c5 a', 'em_andamento');
  delete from public.actions where id = '00000000-0000-4000-a000-0000000027a6';
  if (select status from public.nonconformities where id = '00000000-0000-4000-a000-0000000027c5') <> 'aberta' then
    raise exception 'FALHA 9: apagar a única ação não devolveu a NC para aberta';
  end if;
  raise notice 'OK 9: última ação apagada → NC aberta';

  -- 10. A regra devolve o status atual quando já está coerente -----------------
  if public.nc_status_by_actions(c1, 'em_tratamento') <> 'em_tratamento' then
    raise exception 'FALHA 10: nc_status_by_actions incoerente';
  end if;
  raise notice 'OK 10: nc_status_by_actions coerente com o trigger';

  insert into public.actions (id, nonconformity_id, descricao, status)
  values ('00000000-0000-4000-a000-0000000027a7', '00000000-0000-4000-a000-0000000027c6', 'c6 a', 'aberta');
  insert into public.actions (id, nonconformity_id, descricao, status)
  values ('00000000-0000-4000-a000-0000000027a8', '00000000-0000-4000-a000-0000000027c7', 'c7 a', 'em_andamento');
  if (select status from public.nonconformities where id = '00000000-0000-4000-a000-0000000027c7') <> 'em_tratamento'
     or (select unidade_operacional_id from public.actions where id = '00000000-0000-4000-a000-0000000027a8')
        is distinct from (select id from public.unidades_operacionais where codigo = 'SLZ') then
    raise exception 'FALHA fixture: NC/ação do Editor fora do esperado';
  end if;
end $$;

-- --- Como INSPETOR (sem UPDATE em nonconformities pela RLS) ----------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000027a001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000027a001', true);

do $$
declare n int;
begin
  -- 11. RLS de NCs inalterada: Inspetor continua sem alterar NC diretamente ----
  update public.nonconformities set descricao = 'x' where id = '00000000-0000-4000-a000-0000000027c6';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA 11: inspetor alterou NC diretamente'; end if;
  raise notice 'OK 11: inspetor continua sem UPDATE direto em NCs';

  -- 12. Inspetor põe a ação em andamento → NC em tratamento pelo trigger --------
  update public.actions set status = 'em_andamento' where id = '00000000-0000-4000-a000-0000000027a7';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA 12: inspetor não alterou a ação'; end if;
  if (select status from public.nonconformities where id = '00000000-0000-4000-a000-0000000027c6') <> 'em_tratamento' then
    raise exception 'FALHA 12: NC não acompanhou a ação alterada pelo inspetor';
  end if;
  raise notice 'OK 12: ação em andamento pelo inspetor → NC em tratamento';
end $$;

reset role;

-- --- Como EDITOR de São Luís (trata pelo Checklist ação em execução) -------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000027a002","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000027a002', true);

do $$
declare n int;
begin
  -- 14. Editor conclui a única ação em execução → NC concluída pelo trigger ------
  update public.actions
     set status = 'concluida', concluida_em = current_date,
         numero_nota = 'N-0027', om = 'OM-0027', fotos_corretiva = array['https://example.invalid/f.jpg'],
         evidencia_pdf_url = 'https://example.invalid/e.pdf'
   where id = '00000000-0000-4000-a000-0000000027a8';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA 14: editor não concluiu a ação'; end if;
  if (select status from public.nonconformities where id = '00000000-0000-4000-a000-0000000027c7') <> 'concluida' then
    raise exception 'FALHA 14: NC não acompanhou a conclusão feita pelo editor';
  end if;
  raise notice 'OK 14: editor conclui a ação → NC concluída';
end $$;

reset role;

-- 13. Auditoria registra a mudança da NC com o usuário que alterou a ação ------
do $$
begin
  if not exists (
    select 1 from public.audit_log
     where tabela = 'nonconformities'
       and registro_id = '00000000-0000-4000-a000-0000000027c6'
       and campo = 'status' and valor_novo = 'em_tratamento'
       and usuario_id = '00000000-0000-4000-a000-00000027a001') then
    raise exception 'FALHA 13: mudança de status da NC sem auditoria do usuário';
  end if;
  raise notice 'OK 13: auditoria com o usuário que alterou a ação';
end $$;

rollback;
