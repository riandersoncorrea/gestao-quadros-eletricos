-- ============================================================================
-- Testes da 0037 — registro da área molhada (PRO-01) pelo administrador
-- ============================================================================
-- Rodar DEPOIS da 0037 (banco local descartável ou SQL Editor). Tudo em
-- BEGIN/ROLLBACK, só dados SINTÉTICOS (prefixo T37). Chamadas simulam a API
-- (role authenticated + request.jwt.claims). Sucesso = 'OK 0037'.
-- ============================================================================

begin;

update public.unidades_operacionais set permite_escrita = true where codigo = 'EFC';
select set_config('t37.efc', (select id::text from public.unidades_operacionais where codigo = 'EFC'), true),
       set_config('t37.slz', (select id::text from public.unidades_operacionais where codigo = 'SLZ'), true),
       set_config('t37.pro01', (select id::text from public.inspection_template_items where codigo = 'PRO-01' order by id limit 1), true),
       set_config('t37.atr01', (select id::text from public.inspection_template_items where codigo = 'ATR-01' order by id limit 1), true);

do $$ begin
  if nullif(current_setting('t37.pro01'), '') is null or nullif(current_setting('t37.atr01'), '') is null then
    raise exception 'FALHA fixture: catálogo sem PRO-01/ATR-01';
  end if;
end $$;

insert into auth.users (id, email) values
  ('37000000-0000-4000-a000-000000000001', 't37-admin-geral@example.invalid'),
  ('37000000-0000-4000-a000-000000000002', 't37-admin-local-efc@example.invalid'),
  ('37000000-0000-4000-a000-000000000003', 't37-editor-efc@example.invalid'),
  ('37000000-0000-4000-a000-000000000004', 't37-admin-local-slz@example.invalid');
insert into public.profiles (id, email) select id, email from auth.users where email like 't37-%' on conflict (id) do nothing;
update public.profiles set approved = true, role = 'admin', acesso_todas_unidades = true where id = '37000000-0000-4000-a000-000000000001';
update public.profiles set approved = true, role = 'admin'
 where id in ('37000000-0000-4000-a000-000000000002', '37000000-0000-4000-a000-000000000004');
update public.profiles set approved = true, role = 'editor' where id = '37000000-0000-4000-a000-000000000003';
insert into public.profile_unidades (profile_id, unidade_operacional_id)
select v.p::uuid, u.id from (values
  ('37000000-0000-4000-a000-000000000002', 'EFC'), ('37000000-0000-4000-a000-000000000003', 'EFC'),
  ('37000000-0000-4000-a000-000000000004', 'SLZ')) v(p, c)
join public.unidades_operacionais u on u.codigo = v.c;

insert into public.localidades (id, nome, sigla, unidade_operacional_id) values
  ('37100000-0000-4000-a000-000000000001', 'T37 CIDADE EFC', 'TSA', current_setting('t37.efc')::uuid);
insert into public.electrical_panels (id, tag, name, site, unidade_operacional_id, localidade_id) values
  ('37400000-0000-4000-a000-000000000001', 'TSA_QD_0001', 'T37 quadro EFC', null, current_setting('t37.efc')::uuid,
   '37100000-0000-4000-a000-000000000001');
-- Uma inspeção por resposta de PRO-01 (único por inspeção + item).
insert into public.inspections (id, panel_id, panel_ref_id, inspection_date, inspector_name, overall_result)
select ('3750000' || n || '-0000-4000-a000-000000000001')::uuid, '37400000-0000-4000-a000-000000000001',
       '37400000-0000-4000-a000-000000000001', '2026-10-10', 't37', 'reprovado'
  from generate_series(1, 6) n;
-- R1: PRO-01 NC sem área molhada (caso B1). R2: PRO-01 conforme. R3: ATR-01 NC.
-- R4: PRO-01 NC já respondida no checklist. R5: PRO-01 NC para os testes de unidade.
-- A inspeção 6 fica livre para o INSERT do formulário (bloco 1).
insert into public.inspection_responses (id, inspection_id, template_item_id, resposta, area_molhada) values
  ('37600000-0000-4000-a000-000000000001', '37500001-0000-4000-a000-000000000001', current_setting('t37.pro01')::uuid, 'nao_conforme', null),
  ('37600000-0000-4000-a000-000000000002', '37500002-0000-4000-a000-000000000001', current_setting('t37.pro01')::uuid, 'conforme', null),
  ('37600000-0000-4000-a000-000000000003', '37500001-0000-4000-a000-000000000001', current_setting('t37.atr01')::uuid, 'nao_conforme', null),
  ('37600000-0000-4000-a000-000000000004', '37500004-0000-4000-a000-000000000001', current_setting('t37.pro01')::uuid, 'nao_conforme', false),
  ('37600000-0000-4000-a000-000000000005', '37500005-0000-4000-a000-000000000001', current_setting('t37.pro01')::uuid, 'nao_conforme', null);

create or replace function pg_temp.recusa(cmd text) returns text language plpgsql as $$
begin
  execute cmd;
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;
grant execute on function pg_temp.recusa(text) to authenticated;

-- --- 0. Estrutura --------------------------------------------------------------
do $$ begin
  if (select prosecdef from pg_proc where proname = 'registrar_area_molhada' and pronamespace = 'public'::regnamespace) then
    raise exception 'FALHA 0.1: registrar_area_molhada deveria ser SECURITY INVOKER (passa pela RLS)';
  end if;
  if has_function_privilege('anon', 'public.registrar_area_molhada(uuid, boolean, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.registrar_area_molhada(uuid, boolean, text)', 'execute') then
    raise exception 'FALHA 0.2: permissões de execução de registrar_area_molhada';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_area_molhada_registro'
                   and tgrelid = 'public.inspection_responses'::regclass) then
    raise exception 'FALHA 0.3: trava trg_area_molhada_registro ausente';
  end if;
end $$;

-- --- 1. EDITOR DA EFC -----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"37000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare m text;
begin
  m := pg_temp.recusa($c$select public.registrar_area_molhada('37600000-0000-4000-a000-000000000001', true, 'Confirmado em campo pelo eletricista')$c$);
  if m is null or m not like '42501%' then raise exception 'FALHA 1.1: editor registrou área molhada (%)', m; end if;
  m := pg_temp.recusa($c$update public.inspection_responses set area_molhada = true where id = '37600000-0000-4000-a000-000000000001'$c$);
  if m is null or m not like '42501%' then raise exception 'FALHA 1.2: editor alterou a área molhada direto pela API (%)', m; end if;
  -- Checklist novo (INSERT pelo formulário): a resposta continua aceita.
  m := pg_temp.recusa($c$insert into public.inspection_responses (inspection_id, template_item_id, resposta, area_molhada, area_molhada_justificativa)
         values ('37500006-0000-4000-a000-000000000001', current_setting('t37.pro01')::uuid, 'nao_conforme', true, 'forja')$c$);
  if m is null or m not like '42501%' then raise exception 'FALHA 1.3: metadados de registro posterior aceitos no INSERT (%)', m; end if;
  insert into public.inspection_responses (inspection_id, template_item_id, resposta, area_molhada)
  values ('37500006-0000-4000-a000-000000000001', current_setting('t37.pro01')::uuid, 'nao_conforme', true);
  if not found then raise exception 'FALHA 1.4: INSERT do formulário com área molhada recusado'; end if;
end $$;
reset role;

-- --- 2. ADMINISTRADOR LOCAL DA EFC ----------------------------------------------
select set_config('request.jwt.claims', '{"sub":"37000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  m text;
  r public.inspection_responses;
begin
  m := pg_temp.recusa($c$select public.registrar_area_molhada('37600000-0000-4000-a000-000000000001', true, 'curta')$c$);
  if m is null or m not like '22023%' then raise exception 'FALHA 2.1: justificativa curta aceita (%)', m; end if;
  m := pg_temp.recusa($c$select public.registrar_area_molhada('37600000-0000-4000-a000-000000000001', null, 'Confirmado em campo pelo eletricista')$c$);
  if m is null or m not like '22023%' then raise exception 'FALHA 2.2: valor nulo aceito (%)', m; end if;
  m := pg_temp.recusa($c$select public.registrar_area_molhada('37600000-0000-4000-a000-000000000002', true, 'Confirmado em campo pelo eletricista')$c$);
  if m is null or m not like '22023%' then raise exception 'FALHA 2.3: PRO-01 conforme aceito (%)', m; end if;
  m := pg_temp.recusa($c$select public.registrar_area_molhada('37600000-0000-4000-a000-000000000003', true, 'Confirmado em campo pelo eletricista')$c$);
  if m is null or m not like '22023%' then raise exception 'FALHA 2.4: item diferente de PRO-01 aceito (%)', m; end if;
  m := pg_temp.recusa($c$select public.registrar_area_molhada('37600000-0000-4000-a000-000000000004', true, 'Confirmado em campo pelo eletricista')$c$);
  if m is null or m not like '22023%' then raise exception 'FALHA 2.5: resposta já informada foi sobrescrita (%)', m; end if;
  m := pg_temp.recusa($c$update public.inspection_responses set area_molhada = true where id = '37600000-0000-4000-a000-000000000001'$c$);
  if m is null or m not like '42501%' then raise exception 'FALHA 2.6: admin alterou direto, sem a função (%)', m; end if;

  r := public.registrar_area_molhada('37600000-0000-4000-a000-000000000001', true, '  Confirmado em campo por J. Silva em 20/11  ');
  if r.area_molhada is distinct from true
     or r.area_molhada_registrada_por is distinct from '37000000-0000-4000-a000-000000000002'::uuid
     or r.area_molhada_registrada_em is null
     or r.area_molhada_justificativa is distinct from 'Confirmado em campo por J. Silva em 20/11' then
    raise exception 'FALHA 2.7: registro não gravou valor/metadados corretamente';
  end if;
  if r.resposta <> 'nao_conforme' or r.template_item_id <> current_setting('t37.pro01')::uuid then
    raise exception 'FALHA 2.8: registro alterou outros campos da resposta';
  end if;
  m := pg_temp.recusa($c$select public.registrar_area_molhada('37600000-0000-4000-a000-000000000001', false, 'Tentativa de corrigir depois')$c$);
  if m is null or m not like '22023%' then raise exception 'FALHA 2.9: segundo registro aceito (%)', m; end if;
  m := pg_temp.recusa($c$update public.inspection_responses set area_molhada_justificativa = 'x' where id = '37600000-0000-4000-a000-000000000001'$c$);
  if m is null or m not like '42501%' then raise exception 'FALHA 2.10: justificativa alterada direto (%)', m; end if;
end $$;
reset role;

-- --- 3. ADMINISTRADOR LOCAL DE SÃO LUÍS: resposta da EFC é invisível ----------
select set_config('request.jwt.claims', '{"sub":"37000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare m text;
begin
  m := pg_temp.recusa($c$select public.registrar_area_molhada('37600000-0000-4000-a000-000000000005', true, 'Confirmado em campo pelo eletricista')$c$);
  if m is null or m not like 'P0002%' then raise exception 'FALHA 3.1: admin de SLZ registrou área molhada na EFC (%)', m; end if;
end $$;
reset role;

-- --- 4. EFC somente leitura: nem o admin geral registra -------------------------
update public.unidades_operacionais set permite_escrita = false where codigo = 'EFC';
select set_config('request.jwt.claims', '{"sub":"37000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare m text;
begin
  m := pg_temp.recusa($c$select public.registrar_area_molhada('37600000-0000-4000-a000-000000000005', true, 'Confirmado em campo pelo eletricista')$c$);
  if m is null or m not like '42501%' then raise exception 'FALHA 4.1: registro com a EFC somente leitura (%)', m; end if;
end $$;
reset role;
update public.unidades_operacionais set permite_escrita = true where codigo = 'EFC';

-- --- 5. Auditoria e resultado ---------------------------------------------------
do $$ begin
  if not exists (select 1 from public.audit_log where tabela = 'inspection_responses' and acao = 'update'
                   and registro_id = '37600000-0000-4000-a000-000000000001' and campo = 'area_molhada'
                   and valor_anterior is null and valor_novo = 'true'
                   and usuario_id = '37000000-0000-4000-a000-000000000002') then
    raise exception 'FALHA 5.1: registro da área molhada sem auditoria (antes/depois/quem)';
  end if;
  if not exists (select 1 from public.audit_log where tabela = 'inspection_responses' and acao = 'update'
                   and registro_id = '37600000-0000-4000-a000-000000000001' and campo = 'area_molhada_justificativa') then
    raise exception 'FALHA 5.2: justificativa sem auditoria';
  end if;
  if (select area_molhada from public.inspection_responses where id = '37600000-0000-4000-a000-000000000005') is not null then
    raise exception 'FALHA 5.3: resposta alterada pelas tentativas recusadas';
  end if;
end $$;

-- --- 6. SQL Editor (sem usuário): continua livre -------------------------------
select set_config('request.jwt.claims', '', true);
update public.inspection_responses set area_molhada = false where id = '37600000-0000-4000-a000-000000000005';

select 'OK 0037' as resultado;
rollback;
