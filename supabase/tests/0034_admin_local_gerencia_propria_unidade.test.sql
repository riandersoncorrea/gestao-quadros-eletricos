-- ============================================================================
-- Teste da 0034 (administrador local x contas de outras unidades)
-- ============================================================================
-- BEGIN/ROLLBACK: usuários de teste não ficam. Rodar DEPOIS da 0034.
-- Sucesso = 'OK' no fim, sem "FALHA".
-- ============================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-0000003400a1', 't34-admin-local-efc@example.invalid', '{}'),
  ('00000000-0000-4000-a000-0000003400a2', 't34-editor-slz@example.invalid', '{}'),
  ('00000000-0000-4000-a000-0000003400a3', 't34-nova-sem-unidade@example.invalid', '{}'),
  ('00000000-0000-4000-a000-0000003400a4', 't34-viewer-efc@example.invalid', '{}'),
  ('00000000-0000-4000-a000-0000003400a5', 't34-editor-slz-e-efc@example.invalid', '{}'),
  ('00000000-0000-4000-a000-0000003400a6', 't34-admin-geral@example.invalid', '{}');
insert into public.profiles (id, email)
select id, email from auth.users where email like 't34-%' on conflict (id) do nothing;
update public.profiles set role = 'admin',  approved = true  where id = '00000000-0000-4000-a000-0000003400a1';
update public.profiles set role = 'editor', approved = true  where id = '00000000-0000-4000-a000-0000003400a2';
update public.profiles set role = 'viewer', approved = false where id = '00000000-0000-4000-a000-0000003400a3';
update public.profiles set role = 'viewer', approved = true  where id = '00000000-0000-4000-a000-0000003400a4';
update public.profiles set role = 'editor', approved = true  where id = '00000000-0000-4000-a000-0000003400a5';
update public.profiles set role = 'admin',  approved = true, acesso_todas_unidades = true
 where id = '00000000-0000-4000-a000-0000003400a6';
insert into public.profile_unidades (profile_id, unidade_operacional_id)
select v.pid::uuid, u.id
  from (values ('00000000-0000-4000-a000-0000003400a1', 'EFC'),
               ('00000000-0000-4000-a000-0000003400a2', 'SLZ'),
               ('00000000-0000-4000-a000-0000003400a4', 'EFC'),
               ('00000000-0000-4000-a000-0000003400a5', 'SLZ'),
               ('00000000-0000-4000-a000-0000003400a5', 'EFC')) as v(pid, codigo)
  join public.unidades_operacionais u on u.codigo = v.codigo;

-- Como ADMINISTRADOR LOCAL DA EFC ---------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000003400a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-0000003400a1', true);
do $$
declare n int;
begin
  -- 1. Conta de São Luís: recusada (perfil e aprovação)
  begin
    update public.profiles set role = 'viewer' where id = '00000000-0000-4000-a000-0000003400a2';
    raise exception 'FALHA 1a: admin local da EFC alterou o perfil de conta de São Luís';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set approved = false where id = '00000000-0000-4000-a000-0000003400a2';
    raise exception 'FALHA 1b: admin local da EFC reprovou conta de São Luís';
  exception when insufficient_privilege then null;
  end;

  begin
    -- 2. Conta nova (sem unidade): aprova e define o perfil
    update public.profiles set approved = true, role = 'inspetor' where id = '00000000-0000-4000-a000-0000003400a3';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FALHA 2: admin local não aprovou conta nova'; end if;

    -- 3. Conta da própria unidade: altera
    update public.profiles set role = 'editor' where id = '00000000-0000-4000-a000-0000003400a4';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FALHA 3: admin local não alterou conta da EFC'; end if;

    -- 4. Conta com São Luís E EFC (compartilha a EFC): altera
    update public.profiles set role = 'viewer' where id = '00000000-0000-4000-a000-0000003400a5';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FALHA 4: admin local não alterou conta que também é da EFC'; end if;

  exception when insufficient_privilege then
    raise exception 'FALHA 2-4: admin local recusado em conta nova ou da própria unidade (%)', sqlerrm;
  end;

  -- 5. Continua sem poder atribuir unidade nem promover a admin (regras da 0029)
  begin
    insert into public.profile_unidades (profile_id, unidade_operacional_id)
    select '00000000-0000-4000-a000-0000003400a3', id from public.unidades_operacionais where codigo = 'EFC';
    raise exception 'FALHA 5a: admin local atribuiu unidade';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-4000-a000-0000003400a4';
    raise exception 'FALHA 5b: admin local promoveu a administrador';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Como ADMINISTRADOR GERAL: continua livre --------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000003400a6","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-0000003400a6', true);
do $$
declare n int;
begin
  update public.profiles set role = 'viewer' where id = '00000000-0000-4000-a000-0000003400a2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA 6: admin geral não alterou conta de São Luís'; end if;
end $$;
reset role;

do $$
begin
  if has_function_privilege('anon', 'public.admin_local_pode_gerenciar(uuid)', 'execute') then
    raise exception 'FALHA 7: anon pode executar a função auxiliar';
  end if;
end $$;

select 'OK' as resultado;

rollback;
