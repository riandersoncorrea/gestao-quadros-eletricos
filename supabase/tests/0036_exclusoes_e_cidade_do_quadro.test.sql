-- ============================================================================
-- Testes da 0036 — itens 6, 7 e 8 (decisão D3 e P2 do diagnóstico 22/11/2026)
-- ============================================================================
--   6. Exclusão de ação / resposta / medição / termografia: só administrador
--      (geral ou local, na sua unidade). Anexo do quadro: editor continua.
--   7. Cidade do quadro em unidade SEM site (EFC): só o administrador geral
--      altera; São Luís (com site) sem mudança.
--   8. A exclusão auditada guarda o registro inteiro; anexos auditados.
-- Rodar DEPOIS da 0036 (banco local descartável ou SQL Editor). Tudo em
-- BEGIN/ROLLBACK, só dados SINTÉTICOS (prefixo T36X); a EFC é liberada só
-- dentro da transação. Cada bloco simula uma chamada direta à API
-- (role authenticated + request.jwt.claims). Sucesso = 'OK 0036 exclusões e cidade'.
-- ============================================================================

begin;

update public.unidades_operacionais set permite_escrita = true where codigo = 'EFC';
select set_config('t36x.efc', (select id::text from public.unidades_operacionais where codigo = 'EFC'), true),
       set_config('t36x.slz', (select id::text from public.unidades_operacionais where codigo = 'SLZ'), true);

insert into auth.users (id, email) values
  ('36a00000-0000-4000-a000-000000000001', 't36x-admin-geral@example.invalid'),
  ('36a00000-0000-4000-a000-000000000002', 't36x-admin-local-efc@example.invalid'),
  ('36a00000-0000-4000-a000-000000000003', 't36x-editor-efc@example.invalid'),
  ('36a00000-0000-4000-a000-000000000004', 't36x-editor-slz@example.invalid'),
  ('36a00000-0000-4000-a000-000000000005', 't36x-inspetor-efc@example.invalid'),
  ('36a00000-0000-4000-a000-000000000006', 't36x-admin-local-slz@example.invalid');
insert into public.profiles (id, email) select id, email from auth.users where email like 't36x-%' on conflict (id) do nothing;
update public.profiles set approved = true, role = 'admin', acesso_todas_unidades = true where id = '36a00000-0000-4000-a000-000000000001';
update public.profiles set approved = true, role = 'admin'
 where id in ('36a00000-0000-4000-a000-000000000002', '36a00000-0000-4000-a000-000000000006');
update public.profiles set approved = true, role = 'editor'
 where id in ('36a00000-0000-4000-a000-000000000003', '36a00000-0000-4000-a000-000000000004');
update public.profiles set approved = true, role = 'inspetor' where id = '36a00000-0000-4000-a000-000000000005';
insert into public.profile_unidades (profile_id, unidade_operacional_id)
select v.p::uuid, u.id from (values
  ('36a00000-0000-4000-a000-000000000002', 'EFC'), ('36a00000-0000-4000-a000-000000000003', 'EFC'),
  ('36a00000-0000-4000-a000-000000000004', 'SLZ'), ('36a00000-0000-4000-a000-000000000005', 'EFC'),
  ('36a00000-0000-4000-a000-000000000006', 'SLZ')) v(p, c)
join public.unidades_operacionais u on u.codigo = v.c;

-- Hierarquia: duas cidades da EFC, duas localidades de São Luís.
insert into public.localidades (id, nome, sigla, unidade_operacional_id) values
  ('36a10000-0000-4000-a000-000000000001', 'T36X CIDADE A', 'TXA', current_setting('t36x.efc')::uuid),
  ('36a10000-0000-4000-a000-000000000002', 'T36X CIDADE B', 'TXB', current_setting('t36x.efc')::uuid),
  ('36a10000-0000-4000-a000-000000000003', 'T36X LOCALIDADE SLZ 1', null, current_setting('t36x.slz')::uuid),
  ('36a10000-0000-4000-a000-000000000004', 'T36X LOCALIDADE SLZ 2', null, current_setting('t36x.slz')::uuid);
insert into public.locais (id, localidade_id, nome) values
  ('36a20000-0000-4000-a000-000000000001', '36a10000-0000-4000-a000-000000000001', 'T36X PREDIO A1'),
  ('36a20000-0000-4000-a000-000000000002', '36a10000-0000-4000-a000-000000000001', 'T36X PREDIO A2'),
  ('36a20000-0000-4000-a000-000000000003', '36a10000-0000-4000-a000-000000000002', 'T36X PREDIO B1'),
  ('36a20000-0000-4000-a000-000000000004', '36a10000-0000-4000-a000-000000000003', 'T36X PREDIO S1'),
  ('36a20000-0000-4000-a000-000000000005', '36a10000-0000-4000-a000-000000000004', 'T36X PREDIO S2');
insert into public.sublocais (id, local_id, nome) values
  ('36a30000-0000-4000-a000-000000000001', '36a20000-0000-4000-a000-000000000001', 'T36X SALA A1'),
  ('36a30000-0000-4000-a000-000000000002', '36a20000-0000-4000-a000-000000000003', 'T36X SALA B1'),
  ('36a30000-0000-4000-a000-000000000003', '36a20000-0000-4000-a000-000000000004', 'T36X SALA S1'),
  ('36a30000-0000-4000-a000-000000000004', '36a20000-0000-4000-a000-000000000005', 'T36X SALA S2');

-- Quadros: P1 (EFC, cidade A completa), P2 (EFC, só prédio — cidade pelo
-- prédio), P3 (EFC, sem localização), PS (São Luís, com site).
insert into public.electrical_panels (id, tag, name, site, unidade_operacional_id, localidade_id, local_id, sublocal_id) values
  ('36a40000-0000-4000-a000-000000000001', 'TXA_QD_0001', 'TXA_QD_0001 / T36X PREDIO A1 _SALA', null, current_setting('t36x.efc')::uuid,
   '36a10000-0000-4000-a000-000000000001', '36a20000-0000-4000-a000-000000000001', '36a30000-0000-4000-a000-000000000001'),
  ('36a40000-0000-4000-a000-000000000002', 'TXA_QD_0002', 'T36X quadro só prédio', null, current_setting('t36x.efc')::uuid,
   null, '36a20000-0000-4000-a000-000000000001', null),
  ('36a40000-0000-4000-a000-000000000003', 'TXA_QD_0003', 'T36X quadro sem local', null, current_setting('t36x.efc')::uuid,
   null, null, null),
  ('36a40000-0000-4000-a000-000000000004', 'T36X_SLZ_QD_0001', 'T36X quadro SLZ', 'oficina', current_setting('t36x.slz')::uuid,
   '36a10000-0000-4000-a000-000000000003', '36a20000-0000-4000-a000-000000000004', '36a30000-0000-4000-a000-000000000003');

-- Checklist / NC / ações / anexos, um conjunto por unidade.
insert into public.inspections (id, panel_id, panel_ref_id, inspection_date, inspector_name, overall_result) values
  ('36a50000-0000-4000-a000-000000000001', '36a40000-0000-4000-a000-000000000001', '36a40000-0000-4000-a000-000000000001', '2026-10-10', 't36x', 'reprovado'),
  ('36a50000-0000-4000-a000-000000000002', '36a40000-0000-4000-a000-000000000004', '36a40000-0000-4000-a000-000000000004', '2026-10-10', 't36x', 'reprovado');
insert into public.inspection_responses (id, inspection_id, resposta) values
  ('36a60000-0000-4000-a000-000000000001', '36a50000-0000-4000-a000-000000000001', 'nao_conforme'),
  ('36a60000-0000-4000-a000-000000000002', '36a50000-0000-4000-a000-000000000002', 'nao_conforme');
insert into public.measurements (id, inspection_id, panel_id, categoria, unidade) values
  ('36a61000-0000-4000-a000-000000000001', '36a50000-0000-4000-a000-000000000001', '36a40000-0000-4000-a000-000000000001', 'tensao', 'V');
insert into public.thermography_points (id, inspection_id, panel_id, equipamento) values
  ('36a62000-0000-4000-a000-000000000001', '36a50000-0000-4000-a000-000000000001', '36a40000-0000-4000-a000-000000000001', 't36x');
insert into public.nonconformities (id, descricao, origem, panel_id, inspection_id, severidade) values
  ('36a70000-0000-4000-a000-000000000001', 'T36X NC EFC', 'inspecao', '36a40000-0000-4000-a000-000000000001', '36a50000-0000-4000-a000-000000000001', 'alta'),
  ('36a70000-0000-4000-a000-000000000002', 'T36X NC SLZ', 'inspecao', '36a40000-0000-4000-a000-000000000004', '36a50000-0000-4000-a000-000000000002', 'alta');
-- NC da EFC com duas ações: uma aberta, uma em andamento -> NC em tratamento (0027).
insert into public.actions (id, descricao, nonconformity_id, panel_id, status, origem, numero_nota, om) values
  ('36a80000-0000-4000-a000-000000000001', 'T36X ação EFC aberta', '36a70000-0000-4000-a000-000000000001', '36a40000-0000-4000-a000-000000000001', 'aberta', 'automatica', null, null),
  ('36a80000-0000-4000-a000-000000000002', 'T36X ação EFC em andamento', '36a70000-0000-4000-a000-000000000001', '36a40000-0000-4000-a000-000000000001', 'em_andamento', 'manual', '1', '1'),
  ('36a80000-0000-4000-a000-000000000003', 'T36X ação SLZ 1', '36a70000-0000-4000-a000-000000000002', '36a40000-0000-4000-a000-000000000004', 'aberta', 'automatica', null, null),
  ('36a80000-0000-4000-a000-000000000004', 'T36X ação SLZ 2', '36a70000-0000-4000-a000-000000000002', '36a40000-0000-4000-a000-000000000004', 'aberta', 'manual', null, null);
insert into public.panel_attachments (id, panel_id, file_url, file_name) values
  ('36a90000-0000-4000-a000-000000000001', '36a40000-0000-4000-a000-000000000001', 't36x/diagrama-efc.pdf', 'Diagrama T36X'),
  ('36a90000-0000-4000-a000-000000000002', '36a40000-0000-4000-a000-000000000004', 't36x/diagrama-slz.pdf', 'Diagrama T36X SLZ');

do $$ begin
  if (select status from public.nonconformities where id = '36a70000-0000-4000-a000-000000000001') <> 'em_tratamento' then
    raise exception 'FALHA fixture: NC da EFC deveria estar em tratamento (0027)';
  end if;
end $$;

create or replace function pg_temp.recusa(cmd text) returns text language plpgsql as $$
begin
  execute cmd;
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;
grant execute on function pg_temp.recusa(text) to authenticated;

-- --- 1. EDITOR DA EFC -----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"36a00000-0000-4000-a000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare m text;
begin
  -- 1.A Exclusões pela API: recusadas (0 linhas), exceto o anexo do quadro.
  delete from public.actions where id = '36a80000-0000-4000-a000-000000000001';
  if found then raise exception 'FALHA 1.A1: editor excluiu ação pela API'; end if;
  delete from public.inspection_responses where id = '36a60000-0000-4000-a000-000000000001';
  if found then raise exception 'FALHA 1.A2: editor excluiu resposta do checklist pela API'; end if;
  delete from public.measurements where id = '36a61000-0000-4000-a000-000000000001';
  if found then raise exception 'FALHA 1.A3: editor excluiu medição pela API'; end if;
  delete from public.thermography_points where id = '36a62000-0000-4000-a000-000000000001';
  if found then raise exception 'FALHA 1.A4: editor excluiu termografia pela API'; end if;
  delete from public.panel_attachments where id = '36a90000-0000-4000-a000-000000000001';
  if not found then raise exception 'FALHA 1.A5: editor não remove mais o diagrama do quadro (edição do quadro quebrou)'; end if;

  -- 1.B Cidade do quadro da EFC (TAG leva a sigla da cidade).
  m := pg_temp.recusa($c$update public.electrical_panels
         set localidade_id = '36a10000-0000-4000-a000-000000000002', local_id = '36a20000-0000-4000-a000-000000000003',
             sublocal_id = '36a30000-0000-4000-a000-000000000002'
       where id = '36a40000-0000-4000-a000-000000000001'$c$);
  if m is null or m not like '42501%' then raise exception 'FALHA 1.B1: editor trocou a cidade do quadro da EFC (%)', m; end if;
  -- Cidade efetiva pelo prédio (localidade_id vazio): prédio de outra cidade.
  m := pg_temp.recusa($c$update public.electrical_panels set local_id = '36a20000-0000-4000-a000-000000000003'
       where id = '36a40000-0000-4000-a000-000000000002'$c$);
  if m is null or m not like '42501%' then raise exception 'FALHA 1.B2: editor trocou a cidade (pelo prédio) do quadro da EFC (%)', m; end if;
  -- Apagar a localização também é trocar a cidade.
  m := pg_temp.recusa($c$update public.electrical_panels set localidade_id = null, local_id = null, sublocal_id = null
       where id = '36a40000-0000-4000-a000-000000000001'$c$);
  if m is null or m not like '42501%' then raise exception 'FALHA 1.B3: editor apagou a cidade do quadro da EFC (%)', m; end if;
  -- Permitido: prédio e sublocal dentro da MESMA cidade; demais campos.
  update public.electrical_panels set local_id = '36a20000-0000-4000-a000-000000000002', sublocal_id = null
   where id = '36a40000-0000-4000-a000-000000000001';
  if not found then raise exception 'FALHA 1.B4: troca de prédio na mesma cidade recusada'; end if;
  update public.electrical_panels set notes = 'T36X editado' where id = '36a40000-0000-4000-a000-000000000001';
  if not found then raise exception 'FALHA 1.B5: edição comum do quadro da EFC recusada'; end if;
  -- Permitido: quadro ainda sem cidade recebe a primeira.
  update public.electrical_panels set localidade_id = '36a10000-0000-4000-a000-000000000001',
         local_id = '36a20000-0000-4000-a000-000000000001', sublocal_id = '36a30000-0000-4000-a000-000000000001'
   where id = '36a40000-0000-4000-a000-000000000003';
  if not found then raise exception 'FALHA 1.B6: quadro sem cidade não recebeu a primeira cidade'; end if;
end $$;
reset role;

-- --- 2. INSPETOR DA EFC: não exclui ação ----------------------------------------
select set_config('request.jwt.claims', '{"sub":"36a00000-0000-4000-a000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  delete from public.actions where id = '36a80000-0000-4000-a000-000000000001';
  if found then raise exception 'FALHA 2.1: inspetor excluiu ação'; end if;
end $$;
reset role;

-- --- 3. EDITOR DE SÃO LUÍS: mesma regra de exclusão; localidade livre ----------
select set_config('request.jwt.claims', '{"sub":"36a00000-0000-4000-a000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  delete from public.actions where id = '36a80000-0000-4000-a000-000000000003';
  if found then raise exception 'FALHA 3.1: editor de SLZ excluiu ação pela API'; end if;
  delete from public.inspection_responses where id = '36a60000-0000-4000-a000-000000000002';
  if found then raise exception 'FALHA 3.2: editor de SLZ excluiu resposta pela API'; end if;
  -- São Luís (unidade com site): trocar a localidade continua como antes.
  update public.electrical_panels set localidade_id = '36a10000-0000-4000-a000-000000000004',
         local_id = '36a20000-0000-4000-a000-000000000005', sublocal_id = '36a30000-0000-4000-a000-000000000004'
   where id = '36a40000-0000-4000-a000-000000000004';
  if not found then raise exception 'FALHA 3.3: editor de SLZ não troca mais a localidade do quadro (comportamento mudou)'; end if;
  delete from public.panel_attachments where id = '36a90000-0000-4000-a000-000000000002';
  if not found then raise exception 'FALHA 3.4: editor de SLZ não remove mais o diagrama do quadro'; end if;
end $$;
reset role;

-- --- 4. ADMINISTRADOR LOCAL DA EFC ----------------------------------------------
select set_config('request.jwt.claims', '{"sub":"36a00000-0000-4000-a000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
declare m text;
begin
  -- Exclui a ação em andamento: a NC passa a seguir só a ação aberta (0027).
  delete from public.actions where id = '36a80000-0000-4000-a000-000000000002';
  if not found then raise exception 'FALHA 4.1: admin local não excluiu ação da EFC'; end if;
  delete from public.actions where id = '36a80000-0000-4000-a000-000000000004';
  if found then raise exception 'FALHA 4.2: admin local da EFC excluiu ação de SLZ'; end if;
  m := pg_temp.recusa($c$update public.electrical_panels set localidade_id = '36a10000-0000-4000-a000-000000000002',
         local_id = '36a20000-0000-4000-a000-000000000003', sublocal_id = null
       where id = '36a40000-0000-4000-a000-000000000001'$c$);
  if m is null or m not like '42501%' then raise exception 'FALHA 4.3: admin local trocou a cidade do quadro da EFC (%)', m; end if;
end $$;
reset role;

do $$ begin
  if (select status from public.nonconformities where id = '36a70000-0000-4000-a000-000000000001') <> 'aberta' then
    raise exception 'FALHA 4.4: NC não recalculada pelas ações restantes após a exclusão pelo admin (0027)';
  end if;
end $$;

-- --- 5. ADMINISTRADOR LOCAL DE SÃO LUÍS: exclusão como antes ------------------
select set_config('request.jwt.claims', '{"sub":"36a00000-0000-4000-a000-000000000006","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  delete from public.actions where id = '36a80000-0000-4000-a000-000000000004';
  if not found then raise exception 'FALHA 5.1: admin local de SLZ não excluiu ação de SLZ'; end if;
  delete from public.actions where id = '36a80000-0000-4000-a000-000000000001';
  if found then raise exception 'FALHA 5.2: admin local de SLZ excluiu ação da EFC'; end if;
end $$;
reset role;

-- --- 6. ADMINISTRADOR GERAL ------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"36a00000-0000-4000-a000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  update public.electrical_panels set localidade_id = '36a10000-0000-4000-a000-000000000002',
         local_id = '36a20000-0000-4000-a000-000000000003', sublocal_id = '36a30000-0000-4000-a000-000000000002'
   where id = '36a40000-0000-4000-a000-000000000001';
  if not found then raise exception 'FALHA 6.1: admin geral não trocou a cidade do quadro da EFC'; end if;
  delete from public.inspection_responses where id = '36a60000-0000-4000-a000-000000000001';
  if not found then raise exception 'FALHA 6.2: admin geral não excluiu resposta'; end if;
end $$;
reset role;

-- --- 7. SQL Editor (sem usuário na requisição): livre, como hoje ---------------
select set_config('request.jwt.claims', '', true);
do $$ begin
  update public.electrical_panels set localidade_id = '36a10000-0000-4000-a000-000000000001',
         local_id = '36a20000-0000-4000-a000-000000000001', sublocal_id = null
   where id = '36a40000-0000-4000-a000-000000000001';
  if not found then raise exception 'FALHA 7.1: SQL Editor não corrigiu a cidade do quadro'; end if;
end $$;

-- --- 8. Auditoria: exclusões guardam o registro --------------------------------
do $$
declare v text;
begin
  select valor_anterior into v from public.audit_log
   where tabela = 'actions' and acao = 'delete' and registro_id = '36a80000-0000-4000-a000-000000000002';
  if v is null or (v::jsonb ->> 'descricao') <> 'T36X ação EFC em andamento' or (v::jsonb ->> 'numero_nota') <> '1' then
    raise exception 'FALHA 8.1: exclusão da ação sem o registro na auditoria (%)', left(coalesce(v, 'null'), 120);
  end if;
  if (select usuario_id from public.audit_log
       where tabela = 'actions' and acao = 'delete' and registro_id = '36a80000-0000-4000-a000-000000000002')
     is distinct from '36a00000-0000-4000-a000-000000000002'::uuid then
    raise exception 'FALHA 8.2: auditoria não registrou quem excluiu a ação';
  end if;
  select valor_anterior into v from public.audit_log
   where tabela = 'panel_attachments' and acao = 'delete' and registro_id = '36a90000-0000-4000-a000-000000000001';
  if v is null or (v::jsonb ->> 'file_url') <> 't36x/diagrama-efc.pdf' then
    raise exception 'FALHA 8.3: exclusão de anexo não auditada com o registro';
  end if;
  if not exists (select 1 from public.audit_log where tabela = 'inspection_responses' and acao = 'delete'
                   and registro_id = '36a60000-0000-4000-a000-000000000001' and valor_anterior is not null) then
    raise exception 'FALHA 8.4: exclusão de resposta sem o registro na auditoria';
  end if;
  -- UPDATE continua como antes (um registro por campo alterado).
  if not exists (select 1 from public.audit_log where tabela = 'electrical_panels' and acao = 'update'
                   and registro_id = '36a40000-0000-4000-a000-000000000001' and campo = 'notes'
                   and valor_novo = 'T36X editado') then
    raise exception 'FALHA 8.5: auditoria de alteração mudou de formato';
  end if;
  -- Registros que deviam ficar intactos.
  if not exists (select 1 from public.actions where id = '36a80000-0000-4000-a000-000000000001')
     or not exists (select 1 from public.actions where id = '36a80000-0000-4000-a000-000000000003')
     or not exists (select 1 from public.measurements where id = '36a61000-0000-4000-a000-000000000001')
     or not exists (select 1 from public.thermography_points where id = '36a62000-0000-4000-a000-000000000001')
     or not exists (select 1 from public.inspection_responses where id = '36a60000-0000-4000-a000-000000000002') then
    raise exception 'FALHA 8.6: registro excluído por quem não podia';
  end if;
end $$;

select 'OK 0036 exclusões e cidade' as resultado;
rollback;
