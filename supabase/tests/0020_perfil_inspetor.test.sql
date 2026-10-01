-- ============================================================================
-- Testes da migration 0020_perfil_inspetor.sql
-- ============================================================================
-- Rodar DEPOIS da migration, inteiro, no SQL Editor. Tudo dentro de
-- begin/rollback: usuários, NC e ações de teste não ficam no banco.
-- Simula as requisições do app trocando para o papel `authenticated` com o
-- JWT de um usuário de teste (o mesmo mecanismo que o Supabase usa).
-- Sucesso = nenhum erro "FALHA".
-- ============================================================================

begin;

-- --- Fixtures (como superusuário) ----------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-00000000a001', 'teste-inspetor-0020@example.invalid', '{}'),
  ('00000000-0000-4000-a000-00000000a002', 'teste-viewer-0020@example.invalid', '{}');
insert into public.profiles (id, email) values
  ('00000000-0000-4000-a000-00000000a001', 'teste-inspetor-0020@example.invalid'),
  ('00000000-0000-4000-a000-00000000a002', 'teste-viewer-0020@example.invalid')
on conflict (id) do nothing;
update public.profiles set role = 'inspetor', approved = true where id = '00000000-0000-4000-a000-00000000a001';
update public.profiles set role = 'viewer',   approved = true where id = '00000000-0000-4000-a000-00000000a002';

insert into public.nonconformities (id, descricao, origem)
values ('00000000-0000-4000-a000-0000000000c1', 'TESTE 0020', 'manual');
alter table public.actions disable trigger trg_check_action_completion;
insert into public.actions (id, nonconformity_id, descricao, status) values
  ('00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000c1', 'TESTE 0020 aberta', 'aberta'),
  ('00000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-0000000000c1', 'TESTE 0020 concluída', 'concluida');
alter table public.actions enable trigger trg_check_action_completion;

-- 0. Constraint de perfil ---------------------------------------------------------
do $$
begin
  begin
    update public.profiles set role = 'superusuario' where id = '00000000-0000-4000-a000-00000000a002';
    raise exception 'FALHA 0: perfil inválido aceito';
  exception when check_violation then null;
  end;
  raise notice 'OK 0: inspetor aceito, perfil inválido rejeitado';
end $$;

-- --- Como INSPETOR ------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000a001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000a001', true);

do $$
declare n int;
begin
  if public.current_role() is distinct from 'inspetor' then
    raise exception 'FALHA 1: current_role() = %', public.current_role();
  end if;
  if not exists (select 1 from public.nonconformities where id = '00000000-0000-4000-a000-0000000000c1')
     or (select count(*) from public.v_actions where nonconformity_id = '00000000-0000-4000-a000-0000000000c1') <> 2 then
    raise exception 'FALHA 1: inspetor não lê NC/ações';
  end if;
  raise notice 'OK 1: inspetor lê NCs e ações';

  -- 2. Tratamento permitido
  update public.actions set numero_nota = '123', om = '456', fotos_corretiva = array['https://x/1.jpg'],
         status = 'em_andamento', updated_at = now()
   where id = '00000000-0000-4000-a000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA 2: tratamento não gravou (% linhas)', n; end if;
  raise notice 'OK 2: inspetor grava Nota, OM, fotos e status em andamento';

  -- 3. Fora do tratamento: bloqueado
  begin
    update public.actions set descricao = 'alterada' where id = '00000000-0000-4000-a000-0000000000a1';
    raise exception 'FALHA 3: inspetor alterou a descrição';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.actions set status = 'cancelada' where id = '00000000-0000-4000-a000-0000000000a1';
    raise exception 'FALHA 3: inspetor cancelou a ação';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK 3: inspetor não altera descrição nem cancela';

  -- 4. Conclusão permitida
  update public.actions set status = 'concluida', concluida_em = current_date,
         evidencia_pdf_url = 'https://x/e.pdf'
   where id = '00000000-0000-4000-a000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA 4: conclusão não gravou'; end if;
  raise notice 'OK 4: inspetor conclui a ação';

  -- 5. Ação concluída: não altera nem reabre
  begin
    update public.actions set status = 'aberta' where id = '00000000-0000-4000-a000-0000000000a2';
    raise exception 'FALHA 5: inspetor reabriu ação concluída';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.actions set om = 'x' where id = '00000000-0000-4000-a000-0000000000a2';
    raise exception 'FALHA 5: inspetor alterou ação concluída';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK 5: ação concluída fica travada para o inspetor';

  -- 6. Criar e excluir ação: bloqueado
  begin
    insert into public.actions (nonconformity_id, descricao) values ('00000000-0000-4000-a000-0000000000c1', 'nova');
    raise exception 'FALHA 6: inspetor criou ação';
  exception when insufficient_privilege then null;
  end;
  delete from public.actions where id = '00000000-0000-4000-a000-0000000000a2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA 6: inspetor excluiu ação'; end if;
  raise notice 'OK 6: inspetor não cria nem exclui ações';

  -- 7. NC, quadros e perfis: sem escrita
  update public.nonconformities set status = 'concluida' where id = '00000000-0000-4000-a000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA 7: inspetor alterou NC'; end if;
  update public.electrical_panels set notes = notes where true;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA 7: inspetor alterou quadros'; end if;
  update public.profiles set role = 'admin' where id = '00000000-0000-4000-a000-00000000a001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA 7: inspetor alterou o próprio perfil'; end if;
  raise notice 'OK 7: inspetor não escreve em NCs, quadros nem perfis';
end $$;

-- --- Como VISUALIZADOR (regressão: continua sem escrever em ações) -----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000a002","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000a002', true);

do $$
declare n int;
begin
  update public.actions set om = 'y' where id = '00000000-0000-4000-a000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA 8: visualizador alterou ação'; end if;
  raise notice 'OK 8: visualizador continua sem escrita em ações';
end $$;

reset role;
rollback;
