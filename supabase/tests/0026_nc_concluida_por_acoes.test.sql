-- ============================================================================
-- Testes da migration 0026_nc_concluida_por_acoes.sql
-- ============================================================================
-- Rodar DEPOIS da migration, inteiro, no SQL Editor. Tudo dentro de
-- begin/rollback: usuário, NCs e ações de teste não ficam no banco.
-- Sucesso = nenhum erro "FALHA".
-- ============================================================================

begin;

-- --- Fixtures (como superusuário) ----------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-00000026a001', 'teste-inspetor-0026@example.invalid', '{}');
insert into public.profiles (id, email) values
  ('00000000-0000-4000-a000-00000026a001', 'teste-inspetor-0026@example.invalid')
on conflict (id) do nothing;
update public.profiles set role = 'inspetor', approved = true where id = '00000000-0000-4000-a000-00000026a001';

-- c1: duas ações; c2: uma concluída + uma a cancelar; c3: só cancelamento;
-- c4: NC cancelada; c5: Inspetor conclui a única ação.
insert into public.nonconformities (id, descricao, origem, status) values
  ('00000000-0000-4000-a000-0000000026c1', 'TESTE 0026 duas ações', 'manual', 'em_tratamento'),
  ('00000000-0000-4000-a000-0000000026c2', 'TESTE 0026 concluída + cancelada', 'manual', 'aberta'),
  ('00000000-0000-4000-a000-0000000026c3', 'TESTE 0026 só cancelada', 'manual', 'aberta'),
  ('00000000-0000-4000-a000-0000000026c4', 'TESTE 0026 NC cancelada', 'manual', 'cancelada'),
  ('00000000-0000-4000-a000-0000000026c5', 'TESTE 0026 inspetor', 'inspecao', 'aberta');

alter table public.actions disable trigger trg_check_action_completion;
insert into public.actions (id, nonconformity_id, descricao, status) values
  ('00000000-0000-4000-a000-0000000026a1', '00000000-0000-4000-a000-0000000026c1', 'c1 a', 'em_andamento'),
  ('00000000-0000-4000-a000-0000000026a2', '00000000-0000-4000-a000-0000000026c1', 'c1 b', 'aberta'),
  ('00000000-0000-4000-a000-0000000026a3', '00000000-0000-4000-a000-0000000026c2', 'c2 a', 'concluida'),
  ('00000000-0000-4000-a000-0000000026a4', '00000000-0000-4000-a000-0000000026c2', 'c2 b', 'aberta'),
  ('00000000-0000-4000-a000-0000000026a5', '00000000-0000-4000-a000-0000000026c3', 'c3 a', 'aberta'),
  ('00000000-0000-4000-a000-0000000026a6', '00000000-0000-4000-a000-0000000026c4', 'c4 a', 'em_andamento'),
  ('00000000-0000-4000-a000-0000000026a7', '00000000-0000-4000-a000-0000000026c5', 'c5 a', 'em_andamento');
alter table public.actions enable trigger trg_check_action_completion;

-- Evidência exigida pela 0017 para concluir.
update public.actions
   set numero_nota = 'N-0026', om = 'OM-0026',
       fotos_corretiva = array['https://example.invalid/f.jpg'],
       evidencia_pdf_url = 'https://example.invalid/e.pdf'
 where id::text like '00000000-0000-4000-a000-0000000026a%';

do $$
begin
  -- 1. Concluir a 1ª de duas ações não conclui a NC ----------------------------
  update public.actions set status = 'concluida', concluida_em = current_date
   where id = '00000000-0000-4000-a000-0000000026a1';
  if (select status from public.nonconformities where id = '00000000-0000-4000-a000-0000000026c1') <> 'em_tratamento' then
    raise exception 'FALHA 1: NC concluída com ação ainda em aberto';
  end if;
  raise notice 'OK 1: NC continua em aberto enquanto há ação em aberto';

  -- 2. Concluir a última ação conclui a NC (com concluida_em) ------------------
  update public.actions set status = 'concluida', concluida_em = current_date
   where id = '00000000-0000-4000-a000-0000000026a2';
  if (select status from public.nonconformities where id = '00000000-0000-4000-a000-0000000026c1') <> 'concluida'
     or (select concluida_em from public.nonconformities where id = '00000000-0000-4000-a000-0000000026c1') is null then
    raise exception 'FALHA 2: NC não concluída após a última ação';
  end if;
  raise notice 'OK 2: última ação concluída → NC concluída com concluida_em';

  -- 3. Cancelar a última ação, havendo outra concluída, conclui a NC -----------
  update public.actions set status = 'cancelada' where id = '00000000-0000-4000-a000-0000000026a4';
  if (select status from public.nonconformities where id = '00000000-0000-4000-a000-0000000026c2') <> 'concluida' then
    raise exception 'FALHA 3: NC não concluída (concluída + cancelada)';
  end if;
  raise notice 'OK 3: concluída + cancelada → NC concluída';

  -- 4. Só ações canceladas não é correção ---------------------------------------
  update public.actions set status = 'cancelada' where id = '00000000-0000-4000-a000-0000000026a5';
  if (select status from public.nonconformities where id = '00000000-0000-4000-a000-0000000026c3') <> 'aberta' then
    raise exception 'FALHA 4: NC concluída só com ações canceladas';
  end if;
  raise notice 'OK 4: só canceladas → NC continua aberta';

  -- 5. NC cancelada não é tocada ------------------------------------------------
  update public.actions set status = 'concluida', concluida_em = current_date
   where id = '00000000-0000-4000-a000-0000000026a6';
  if (select status from public.nonconformities where id = '00000000-0000-4000-a000-0000000026c4') <> 'cancelada' then
    raise exception 'FALHA 5: NC cancelada foi alterada';
  end if;
  raise notice 'OK 5: NC cancelada não muda';

  -- 6. Reabrir ação não reabre a NC (continua manual) ---------------------------
  update public.actions set status = 'aberta', concluida_em = null
   where id = '00000000-0000-4000-a000-0000000026a2';
  if (select status from public.nonconformities where id = '00000000-0000-4000-a000-0000000026c1') <> 'concluida' then
    raise exception 'FALHA 6: reabrir ação alterou a NC';
  end if;
  raise notice 'OK 6: reabrir ação não reabre a NC';
end $$;

-- --- Como INSPETOR (sem UPDATE em nonconformities pela RLS) ----------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000026a001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000026a001', true);

do $$
declare n int;
begin
  -- 7. RLS de NCs inalterada: Inspetor continua sem alterar NC diretamente -----
  update public.nonconformities set descricao = 'x' where id = '00000000-0000-4000-a000-0000000026c5';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA 7: inspetor alterou NC diretamente'; end if;
  raise notice 'OK 7: inspetor continua sem UPDATE direto em NCs';

  -- 8. Inspetor conclui a ação → NC concluída pelo trigger ----------------------
  update public.actions set status = 'concluida', concluida_em = current_date
   where id = '00000000-0000-4000-a000-0000000026a7';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA 8: inspetor não concluiu a ação'; end if;
  if (select status from public.nonconformities where id = '00000000-0000-4000-a000-0000000026c5') <> 'concluida' then
    raise exception 'FALHA 8: NC não concluída quando o inspetor concluiu a ação';
  end if;
  raise notice 'OK 8: ação concluída pelo inspetor → NC concluída';
end $$;

reset role;

-- 9. Auditoria registra a mudança da NC com o usuário que concluiu a ação ------
do $$
begin
  if not exists (
    select 1 from public.audit_log
     where tabela = 'nonconformities'
       and registro_id = '00000000-0000-4000-a000-0000000026c5'
       and campo = 'status' and valor_novo = 'concluida'
       and usuario_id = '00000000-0000-4000-a000-00000026a001') then
    raise exception 'FALHA 9: mudança de status da NC sem auditoria do usuário';
  end if;
  raise notice 'OK 9: auditoria com o usuário que concluiu a ação';
end $$;

rollback;
