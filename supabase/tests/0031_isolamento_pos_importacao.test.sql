-- ============================================================================
-- Isolamento com os dados reais da EFC (depois da 0031)
-- ============================================================================
-- Rodar DEPOIS da 0031 (como postgres). BEGIN/ROLLBACK: os usuários de teste
-- não ficam. Sucesso = nenhum "FALHA" e 'OK' no fim.
-- ============================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('f9000000-0000-4000-a000-000000000001', 't31-viewer-slz@example.invalid', '{}'),
  ('f9000000-0000-4000-a000-000000000002', 't31-viewer-efc@example.invalid', '{}');
insert into public.profiles (id, email) select id, email from auth.users where email like 't31-%' on conflict (id) do nothing;
update public.profiles set role = 'viewer', approved = true where email like 't31-%';
insert into public.profile_unidades (profile_id, unidade_operacional_id)
select 'f9000000-0000-4000-a000-000000000001', id from public.unidades_operacionais where codigo = 'SLZ';
insert into public.profile_unidades (profile_id, unidade_operacional_id)
select 'f9000000-0000-4000-a000-000000000002', id from public.unidades_operacionais where codigo = 'EFC';

select set_config('t31.slz_total', (select count(*)::text from public.electrical_panels p
  join public.unidades_operacionais u on u.id = p.unidade_operacional_id where u.codigo = 'SLZ'), true);
select set_config('t31.acd', (select id::text from public.electrical_panels where tag = 'ACD_QD_0001'), true);

select set_config('request.jwt.claims', '{"sub":"f9000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.electrical_panels) <> current_setting('t31.slz_total')::int then
    raise exception 'FALHA: viewer SLZ não vê exatamente os quadros de São Luís';
  end if;
  if exists (select 1 from public.electrical_panels where tag ~ '^(ACD|AAE|ARR|MBA|ITA|NVD|SIS|SPAB|VTM)_QD_')
     or exists (select 1 from public.localidades where sigla is not null) then
    raise exception 'FALHA: viewer SLZ vê dados da EFC';
  end if;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"f9000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.electrical_panels) <> 202 then raise exception 'FALHA: viewer EFC não vê os 202 quadros'; end if;
  if (select count(*) from public.localidades) <> 9 then raise exception 'FALHA: viewer EFC não vê as 9 cidades'; end if;
  if exists (select 1 from public.electrical_panels where tag ~ '^(PRT|OFC|PEL)_QD_')
     or exists (select 1 from public.nonconformities) or exists (select 1 from public.inspections) then
    raise exception 'FALHA: viewer EFC vê dados de São Luís';
  end if;
end $$;
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare v jsonb := public.get_public_panel(current_setting('t31.acd')::uuid);
begin
  if v ->> 'tag' <> 'ACD_QD_0001' or v ->> 'unidade_nome' <> 'EFC' or v ->> 'localidade_nome' <> 'AÇAILÂNDIA' then
    raise exception 'FALHA: QR público do quadro EFC (%)', v;
  end if;
end $$;
reset role;

select 'OK' as resultado;

rollback;
