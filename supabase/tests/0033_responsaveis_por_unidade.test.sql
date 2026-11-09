-- ============================================================================
-- Teste da 0033 (responsáveis por unidade) — BEGIN/ROLLBACK, nada fica.
-- ============================================================================
-- Rodar DEPOIS da 0033 (e da 0029). Sucesso = 'OK' no fim, sem "FALHA".
-- ============================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-0000003300a1', 't33-inspetor-slz@example.invalid', '{}'),
  ('00000000-0000-4000-a000-0000003300a2', 't33-inspetor-efc@example.invalid', '{}'),
  ('00000000-0000-4000-a000-0000003300a3', 't33-admin-local-efc@example.invalid', '{}'),
  ('00000000-0000-4000-a000-0000003300a4', 't33-editor-efc@example.invalid', '{}'),
  ('00000000-0000-4000-a000-0000003300a5', 't33-pendente-efc@example.invalid', '{}');
insert into public.profiles (id, email)
select id, email from auth.users where email like 't33-%' on conflict (id) do nothing;
update public.profiles set role = 'inspetor', approved = true  where id = '00000000-0000-4000-a000-0000003300a1';
update public.profiles set role = 'inspetor', approved = true  where id = '00000000-0000-4000-a000-0000003300a2';
update public.profiles set role = 'admin',    approved = true  where id = '00000000-0000-4000-a000-0000003300a3';
update public.profiles set role = 'editor',   approved = true  where id = '00000000-0000-4000-a000-0000003300a4';
update public.profiles set role = 'inspetor', approved = false where id = '00000000-0000-4000-a000-0000003300a5';
insert into public.profile_unidades (profile_id, unidade_operacional_id)
select v.pid::uuid, u.id
  from (values ('00000000-0000-4000-a000-0000003300a1', 'SLZ'),
               ('00000000-0000-4000-a000-0000003300a2', 'EFC'),
               ('00000000-0000-4000-a000-0000003300a3', 'EFC'),
               ('00000000-0000-4000-a000-0000003300a4', 'EFC'),
               ('00000000-0000-4000-a000-0000003300a5', 'EFC')) as v(pid, codigo)
  join public.unidades_operacionais u on u.codigo = v.codigo;

select set_config('t33.efc', (select id::text from public.unidades_operacionais where codigo = 'EFC'), true);
select set_config('t33.slz', (select id::text from public.unidades_operacionais where codigo = 'SLZ'), true);

-- Como ADMINISTRADOR LOCAL DA EFC ---------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000003300a3","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-0000003300a3', true);
do $$
declare
  efc uuid := current_setting('t33.efc')::uuid;
  slz uuid := current_setting('t33.slz')::uuid;
  ids uuid[];
begin
  select array_agg(id) into ids from public.responsaveis_atribuiveis(efc);
  if not ('00000000-0000-4000-a000-0000003300a2' = any (ids) and '00000000-0000-4000-a000-0000003300a3' = any (ids)) then
    raise exception 'FALHA 1: inspetor/admin da EFC fora da lista da EFC';
  end if;
  if '00000000-0000-4000-a000-0000003300a1' = any (ids) then
    raise exception 'FALHA 2: inspetor só de São Luís na lista da EFC';
  end if;
  if '00000000-0000-4000-a000-0000003300a4' = any (ids) or '00000000-0000-4000-a000-0000003300a5' = any (ids) then
    raise exception 'FALHA 3: editor ou conta pendente na lista';
  end if;
  -- guarda a lista para a conferência 4 (como postgres: o admin local não lê
  -- as unidades dos outros usuários — é por isso que a função existe)
  perform set_config('t33.ids_efc', ids::text, true);
  if exists (select 1 from public.responsaveis_atribuiveis(slz)) then
    raise exception 'FALHA 5: admin local da EFC obteve a lista de São Luís';
  end if;
end $$;
reset role;

do $$
begin
  if exists (select 1 from public.profiles p
              where p.id = any (current_setting('t33.ids_efc')::uuid[])
                and not p.acesso_todas_unidades
                and not exists (select 1 from public.profile_unidades pu
                                 where pu.profile_id = p.id
                                   and pu.unidade_operacional_id = current_setting('t33.efc')::uuid)) then
    raise exception 'FALHA 4: alguém sem acesso à EFC na lista';
  end if;
end $$;

-- Como INSPETOR DE SÃO LUÍS ---------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000003300a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-0000003300a1', true);
do $$
declare ids uuid[];
begin
  select array_agg(id) into ids from public.responsaveis_atribuiveis(current_setting('t33.slz')::uuid);
  if not ('00000000-0000-4000-a000-0000003300a1' = any (ids)) then raise exception 'FALHA 6: inspetor SLZ fora da lista de SLZ'; end if;
  if '00000000-0000-4000-a000-0000003300a2' = any (ids) then raise exception 'FALHA 7: inspetor da EFC na lista de SLZ'; end if;
end $$;
reset role;

-- Visitante sem login não executa ------------------------------------------------------
do $$
begin
  if has_function_privilege('anon', 'public.responsaveis_atribuiveis(uuid)', 'execute') then
    raise exception 'FALHA 8: anon pode executar a função';
  end if;
end $$;

select 'OK' as resultado;

rollback;
