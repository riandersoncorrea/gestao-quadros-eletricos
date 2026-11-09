-- ============================================================================
-- Testes da migration 0029 (RLS por unidade + aprovação obrigatória)
-- ============================================================================
-- Rodar DEPOIS da 0029 e da 0030, inteiro, no SQL Editor (como postgres).
-- Tudo em BEGIN/ROLLBACK: usuários, quadros e registros de teste não ficam.
-- Cada bloco simula uma chamada direta à API: `set local role
-- authenticated` + request.jwt.claims com o id do usuário — o mesmo
-- mecanismo do PostgREST. Sucesso = nenhum "FALHA" e 'OK' no fim.
--
-- Não depende de dados reais de usuários: cria os seus próprios.
-- ============================================================================

begin;

-- --- Fixtures (como postgres) ----------------------------------------------------
-- Unidade de teste genérica (prova que uma 3ª unidade não exige regra nova).
insert into public.unidades_operacionais (codigo, nome, permite_escrita) values ('TST3', 'Unidade Teste 3', true);

insert into auth.users (id, email, raw_user_meta_data) values
  ('f0000000-0000-4000-a000-000000000001', 't29-admin-geral@example.invalid', '{}'),
  ('f0000000-0000-4000-a000-000000000002', 't29-admin-local-slz@example.invalid', '{}'),
  ('f0000000-0000-4000-a000-000000000003', 't29-viewer-slz@example.invalid', '{}'),
  ('f0000000-0000-4000-a000-000000000004', 't29-editor-slz@example.invalid', '{}'),
  ('f0000000-0000-4000-a000-000000000005', 't29-editor-efc@example.invalid', '{}'),
  ('f0000000-0000-4000-a000-000000000006', 't29-editor-tst3@example.invalid', '{}'),
  ('f0000000-0000-4000-a000-000000000007', 't29-pendente@example.invalid', '{}'),
  ('f0000000-0000-4000-a000-000000000008', 't29-sem-unidade@example.invalid', '{}');
insert into public.profiles (id, email)
select id, email from auth.users where email like 't29-%' on conflict (id) do nothing;

update public.profiles set role = 'admin', approved = true, acesso_todas_unidades = true where id = 'f0000000-0000-4000-a000-000000000001';
update public.profiles set role = 'admin', approved = true where id = 'f0000000-0000-4000-a000-000000000002';
update public.profiles set role = 'viewer', approved = true where id = 'f0000000-0000-4000-a000-000000000003';
update public.profiles set role = 'editor', approved = true where id in ('f0000000-0000-4000-a000-000000000004',
  'f0000000-0000-4000-a000-000000000005', 'f0000000-0000-4000-a000-000000000006');
update public.profiles set role = 'viewer', approved = false where id = 'f0000000-0000-4000-a000-000000000007';
update public.profiles set role = 'viewer', approved = true where id = 'f0000000-0000-4000-a000-000000000008';

insert into public.profile_unidades (profile_id, unidade_operacional_id)
select v.p::uuid, u.id from (values
  ('f0000000-0000-4000-a000-000000000002', 'SLZ'),
  ('f0000000-0000-4000-a000-000000000003', 'SLZ'),
  ('f0000000-0000-4000-a000-000000000004', 'SLZ'),
  ('f0000000-0000-4000-a000-000000000005', 'EFC'),
  ('f0000000-0000-4000-a000-000000000006', 'TST3'),
  ('f0000000-0000-4000-a000-000000000007', 'SLZ')) as v(p, c)
join public.unidades_operacionais u on u.codigo = v.c;

-- Hierarquia + quadros de EFC e TST3, com registros filhos (unidade herdada).
insert into public.localidades (id, nome, sigla, unidade_operacional_id)
select 'f1000000-0000-4000-a000-000000000001', 'T29 CIDADE EFC', 'TEFC', id from public.unidades_operacionais where codigo = 'EFC';
insert into public.localidades (id, nome, sigla, unidade_operacional_id)
select 'f1000000-0000-4000-a000-000000000002', 'T29 CIDADE TST3', 'TTST', id from public.unidades_operacionais where codigo = 'TST3';
insert into public.locais (id, localidade_id, nome) values
  ('f2000000-0000-4000-a000-000000000001', 'f1000000-0000-4000-a000-000000000001', 'T29 PREDIO EFC'),
  ('f2000000-0000-4000-a000-000000000002', 'f1000000-0000-4000-a000-000000000002', 'T29 PREDIO TST3');
insert into public.sublocais (id, local_id, nome) values
  ('f3000000-0000-4000-a000-000000000001', 'f2000000-0000-4000-a000-000000000001', 'T29 SALA EFC');

insert into public.electrical_panels (id, tag, name, unidade_operacional_id, localidade_id, local_id, sublocal_id)
select 'f4000000-0000-4000-a000-000000000001', 'TEFC_QD_0001', 'T29 quadro EFC', u.id,
       'f1000000-0000-4000-a000-000000000001', 'f2000000-0000-4000-a000-000000000001', 'f3000000-0000-4000-a000-000000000001'
  from public.unidades_operacionais u where u.codigo = 'EFC';
insert into public.electrical_panels (id, tag, name, unidade_operacional_id, localidade_id)
select 'f4000000-0000-4000-a000-000000000002', 'TTST_QD_0001', 'T29 quadro TST3', u.id, 'f1000000-0000-4000-a000-000000000002'
  from public.unidades_operacionais u where u.codigo = 'TST3';

insert into public.inspections (id, panel_id, panel_ref_id, inspection_date, inspector_name, overall_result)
values ('f5000000-0000-4000-a000-000000000001', 'f4000000-0000-4000-a000-000000000001',
        'f4000000-0000-4000-a000-000000000001', '2026-10-10', 't29', 'reprovado');
insert into public.inspection_responses (id, inspection_id, resposta)
values ('f6000000-0000-4000-a000-000000000001', 'f5000000-0000-4000-a000-000000000001', 'nao_conforme');
insert into public.nonconformities (id, descricao, origem, inspection_id, severidade)   -- sem panel_id: herda pela inspeção
values ('f7000000-0000-4000-a000-000000000001', 'T29 NC EFC', 'inspecao', 'f5000000-0000-4000-a000-000000000001', 'alta');
insert into public.actions (id, descricao, nonconformity_id)                              -- sem panel_id: herda pela NC
values ('f8000000-0000-4000-a000-000000000001', 'T29 ação EFC', 'f7000000-0000-4000-a000-000000000001');
insert into public.nonconformities (id, descricao, origem, panel_id, severidade)
values ('f7000000-0000-4000-a000-000000000002', 'T29 NC TST3', 'manual', 'f4000000-0000-4000-a000-000000000002', 'baixa');
-- NC sem quadro, sem inspeção e sem unidade (pendente de classificação):
-- criada pelo próprio teste, para não depender de existir uma em produção.
insert into public.nonconformities (id, descricao, origem, severidade)
values ('f7000000-0000-4000-a000-000000000003', 'T29 NC sem unidade', 'manual', 'baixa');

-- --- 1. Herança e backfill (como postgres) ------------------------------------
do $$
declare
  v_slz uuid := (select id from public.unidades_operacionais where codigo = 'SLZ');
  v_efc uuid := (select id from public.unidades_operacionais where codigo = 'EFC');
  v_tst uuid := (select id from public.unidades_operacionais where codigo = 'TST3');
begin
  if (select unidade_operacional_id from public.inspections where id = 'f5000000-0000-4000-a000-000000000001') is distinct from v_efc
     or (select unidade_operacional_id from public.inspection_responses where id = 'f6000000-0000-4000-a000-000000000001') is distinct from v_efc
     or (select unidade_operacional_id from public.nonconformities where id = 'f7000000-0000-4000-a000-000000000001') is distinct from v_efc
     or (select unidade_operacional_id from public.actions where id = 'f8000000-0000-4000-a000-000000000001') is distinct from v_efc then
    raise exception 'FALHA: registros filhos não herdaram a unidade EFC (quadro -> inspeção -> NC -> ação)';
  end if;
  -- Backfill: tudo que tem quadro/pai de São Luís ficou SLZ.
  if exists (select 1 from public.inspections i join public.electrical_panels p on p.id = i.panel_id
              where p.unidade_operacional_id = v_slz and i.unidade_operacional_id is distinct from v_slz) then
    raise exception 'FALHA: backfill de inspeções de São Luís';
  end if;
  if exists (select 1 from public.actions a join public.nonconformities n on n.id = a.nonconformity_id
              where a.panel_id is null and n.unidade_operacional_id is not null
                and a.unidade_operacional_id is distinct from n.unidade_operacional_id) then
    raise exception 'FALHA: ação sem panel_id não seguiu a NC';
  end if;
  -- Sem quadro e sem pai: NULL, NUNCA São Luís por padrão (rodar logo após
  -- a 0029: depois dela, NC manual sem quadro passa a ter unidade explícita).
  if exists (select 1 from public.nonconformities where panel_id is null and inspection_id is null
               and descricao not like 'T29%' and unidade_operacional_id is not null) then
    raise exception 'FALHA: NC sem quadro e sem inspeção foi classificada numa unidade no backfill';
  end if;
  if exists (select 1 from public.sap_orders where panel_id is null and unidade_operacional_id is not null) then
    raise exception 'FALHA: ordem SAP sem quadro foi classificada numa unidade';
  end if;

  -- Quadro excluído: NC mantém a unidade já gravada (não vira "sem unidade" nem SLZ).
  delete from public.electrical_panels where id = 'f4000000-0000-4000-a000-000000000002';
  if (select unidade_operacional_id from public.nonconformities where id = 'f7000000-0000-4000-a000-000000000002') is distinct from v_tst
     or (select panel_id from public.nonconformities where id = 'f7000000-0000-4000-a000-000000000002') is not null then
    raise exception 'FALHA: NC de quadro excluído perdeu a unidade';
  end if;
  insert into public.electrical_panels (id, tag, name, unidade_operacional_id, localidade_id)
  values ('f4000000-0000-4000-a000-000000000002', 'TTST_QD_0001', 'T29 quadro TST3', v_tst, 'f1000000-0000-4000-a000-000000000002');
end $$;

-- Ids de unidade lidos como postgres (um usuário não vê unidades fora das suas).
select set_config('t29.efc', (select id::text from public.unidades_operacionais where codigo = 'EFC'), true);

-- --- 2. Administrador geral: todas as unidades ---------------------------------
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.electrical_panels where tag like 'PRT_QD_%' or tag like 'OFC_QD_%') < 300 then
    raise exception 'FALHA: admin geral não vê os quadros de São Luís';
  end if;
  if not exists (select 1 from public.electrical_panels where tag = 'TEFC_QD_0001')
     or not exists (select 1 from public.electrical_panels where tag = 'TTST_QD_0001') then
    raise exception 'FALHA: admin geral não vê EFC/TST3';
  end if;
  if (select count(*) from public.unidades_operacionais) < 3 then raise exception 'FALHA: admin geral não vê todas as unidades'; end if;
  -- Registros sem unidade (pendentes de classificação) são visíveis só a ele.
  if not exists (select 1 from public.nonconformities
                  where id = 'f7000000-0000-4000-a000-000000000003' and unidade_operacional_id is null) then
    raise exception 'FALHA: admin geral não vê os registros sem unidade';
  end if;
  -- EFC somente leitura vale também para o admin geral (pelo app/API).
  update public.electrical_panels set notes = 'x' where tag = 'TEFC_QD_0001';
  if found then raise exception 'FALHA: admin geral gravou na EFC somente leitura'; end if;
  -- Auditoria visível.
  perform 1 from public.audit_log limit 1;
end $$;
reset role;

-- --- 3. Administrador local (só SLZ) --------------------------------------------
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_ok boolean;
begin
  if exists (select 1 from public.electrical_panels where tag in ('TEFC_QD_0001', 'TTST_QD_0001')) then
    raise exception 'FALHA: admin local SLZ vê quadro de outra unidade';
  end if;
  if exists (select 1 from public.nonconformities where descricao like 'T29%')
     or exists (select 1 from public.actions where descricao like 'T29%')
     or exists (select 1 from public.inspections where inspector_name = 't29')
     or exists (select 1 from public.localidades where nome like 'T29%')
     or exists (select 1 from public.locais where nome like 'T29%') then
    raise exception 'FALHA: admin local SLZ vê registros de outra unidade';
  end if;
  if (select count(*) from public.unidades_operacionais) <> 1 then raise exception 'FALHA: admin local vê outras unidades'; end if;
  if exists (select 1 from public.nonconformities where unidade_operacional_id is null)
     or exists (select 1 from public.nonconformities where id = 'f7000000-0000-4000-a000-000000000003') then
    raise exception 'FALHA: admin local vê registro sem unidade';
  end if;
  if exists (select 1 from public.audit_log) then raise exception 'FALHA: admin local lê a auditoria de todas as unidades'; end if;

  -- Grava em São Luís normalmente.
  update public.electrical_panels set notes = 'T29 admin local' where tag = 'PRT_QD_0001';
  if not found then raise exception 'FALHA: admin local não gravou em São Luís'; end if;
  -- Não grava em outra unidade (por id direto).
  update public.electrical_panels set notes = 'x' where id = 'f4000000-0000-4000-a000-000000000001';
  if found then raise exception 'FALHA: admin local gravou na EFC'; end if;

  -- Não se autoconcede acesso global, nem unidade, nem libera a EFC.
  v_ok := false;
  begin
    update public.profiles set acesso_todas_unidades = true where id = 'f0000000-0000-4000-a000-000000000003';
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: admin local concedeu acesso global'; end if;
  v_ok := false;
  begin
    insert into public.profile_unidades (profile_id, unidade_operacional_id)
    values ('f0000000-0000-4000-a000-000000000002', current_setting('t29.efc')::uuid);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: admin local atribuiu unidade'; end if;
  update public.unidades_operacionais set permite_escrita = true;
  if found then raise exception 'FALHA: admin local alterou a configuração da unidade'; end if;
  v_ok := false;
  begin
    update public.profiles set role = 'admin' where id = 'f0000000-0000-4000-a000-000000000003';
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: admin local promoveu alguém a admin'; end if;
  v_ok := false;
  begin
    update public.profiles set approved = false where id = 'f0000000-0000-4000-a000-000000000001';
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: admin local alterou o admin geral'; end if;
  -- Mover quadro de unidade: só admin geral.
  v_ok := false;
  begin
    update public.electrical_panels set unidade_operacional_id = current_setting('t29.efc')::uuid
     where tag = 'OFC_QD_0001';
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: admin local moveu quadro de unidade'; end if;
end $$;
reset role;

-- --- 4. Usuário comum (viewer SLZ) ---------------------------------------------
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.electrical_panels where tag like 'PRT_QD_%' or tag like 'OFC_QD_%') < 300 then
    raise exception 'FALHA: viewer SLZ perdeu acesso a São Luís';
  end if;
  if exists (select 1 from public.electrical_panels where tag in ('TEFC_QD_0001', 'TTST_QD_0001'))
     or exists (select 1 from public.v_actions where descricao like 'T29%')
     or exists (select 1 from public.inspection_responses where id = 'f6000000-0000-4000-a000-000000000001') then
    raise exception 'FALHA: viewer SLZ vê dados de outra unidade (inclusive pela view v_actions)';
  end if;
  update public.electrical_panels set notes = 'x' where tag = 'PRT_QD_0001';
  if found then raise exception 'FALHA: viewer gravou quadro (regra de perfil existente quebrou)'; end if;
  update public.profiles set role = 'admin' where id = auth.uid();
  if found then raise exception 'FALHA: viewer alterou o próprio perfil'; end if;
  perform public.update_own_profile('Viewer Renomeado', null);  -- autosserviço continua
end $$;
reset role;

-- --- 5. Conta NÃO aprovada: nenhum dado, nem por chamada direta ----------------
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-a000-000000000007","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.electrical_panels) or exists (select 1 from public.nonconformities)
     or exists (select 1 from public.actions) or exists (select 1 from public.inspections)
     or exists (select 1 from public.inspection_responses) or exists (select 1 from public.localidades)
     or exists (select 1 from public.locais) or exists (select 1 from public.unidades_operacionais)
     or exists (select 1 from public.inspection_templates) or exists (select 1 from public.health_index_config)
     or exists (select 1 from public.sap_orders) or exists (select 1 from public.v_actions) then
    raise exception 'FALHA: conta não aprovada lê dados';
  end if;
  if (select count(*) from public.profiles where id = auth.uid()) <> 1 then
    raise exception 'FALHA: conta pendente deveria ler o próprio perfil (tela "aguardando aprovação")';
  end if;
  insert into public.nonconformities (descricao, origem) values ('T29 pendente', 'manual');
  raise exception 'FALHA: conta não aprovada gravou NC';
exception
  when insufficient_privilege then null;  -- esperado
end $$;
reset role;

-- --- 6. Aprovado sem unidade: nada ------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-a000-000000000008","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.electrical_panels) or exists (select 1 from public.unidades_operacionais) then
    raise exception 'FALHA: usuário sem unidade lê dados';
  end if;
end $$;
reset role;

-- --- 7. Editor autorizado na EFC: lê, mas não grava (somente leitura) ----------
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_ok boolean;
begin
  if not exists (select 1 from public.electrical_panels where tag = 'TEFC_QD_0001')
     or not exists (select 1 from public.nonconformities where id = 'f7000000-0000-4000-a000-000000000001') then
    raise exception 'FALHA: editor EFC não lê a EFC';
  end if;
  if exists (select 1 from public.electrical_panels where tag like 'PRT_QD_%') then
    raise exception 'FALHA: editor EFC vê São Luís';
  end if;
  update public.electrical_panels set notes = 'x' where tag = 'TEFC_QD_0001';
  if found then raise exception 'FALHA: editor gravou na EFC somente leitura'; end if;
  update public.nonconformities set status = 'em_tratamento' where id = 'f7000000-0000-4000-a000-000000000001';
  if found then raise exception 'FALHA: editor alterou NC da EFC somente leitura'; end if;
  v_ok := false;
  begin
    insert into public.nonconformities (descricao, origem, panel_id)
    values ('x', 'manual', 'f4000000-0000-4000-a000-000000000001');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: editor criou NC na EFC somente leitura'; end if;
  v_ok := false;
  begin
    insert into public.electrical_panels (tag, name, unidade_operacional_id, localidade_id)
    select 'TEFC_QD_0099', 'x', id, 'f1000000-0000-4000-a000-000000000001' from public.unidades_operacionais where codigo = 'EFC';
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: editor criou quadro na EFC somente leitura'; end if;
end $$;
reset role;

-- --- 8. Editor SLZ: grava em SLZ; não alcança outra unidade pela API -----------
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_ok boolean;
  v_unidade uuid;
begin
  update public.electrical_panels set notes = 'T29 editor' where tag = 'PRT_QD_0001';
  if not found then raise exception 'FALHA: editor SLZ não gravou em São Luís'; end if;
  insert into public.nonconformities (descricao, origem, panel_id)
  select 'T29 NC nova SLZ', 'manual', id from public.electrical_panels where tag = 'PRT_QD_0001'
  returning unidade_operacional_id into v_unidade;
  if v_unidade is null then raise exception 'FALHA: NC nova não herdou a unidade do quadro'; end if;
  -- Quadro de outra unidade (id conhecido): invisível -> unidade não herdada -> recusado.
  v_ok := false;
  begin
    insert into public.nonconformities (descricao, origem, panel_id) values ('x', 'manual', 'f4000000-0000-4000-a000-000000000002');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: editor SLZ criou NC em quadro de outra unidade'; end if;
  -- NC sem quadro e sem unidade: recusada (nada vira SLZ por padrão)...
  v_ok := false;
  begin
    insert into public.nonconformities (descricao, origem) values ('x', 'manual');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: NC sem quadro e sem unidade foi aceita'; end if;
  -- ...com a unidade informada explicitamente: aceita.
  insert into public.nonconformities (descricao, origem, unidade_operacional_id)
  select 'T29 NC manual SLZ explícita', 'manual', id from public.unidades_operacionais;  -- só vê a SLZ
  -- Trocar a unidade de uma NC para outra unidade: recusado.
  v_ok := false;
  begin
    update public.nonconformities set unidade_operacional_id = current_setting('t29.efc')::uuid
     where descricao = 'T29 NC manual SLZ explícita';
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA: editor moveu NC para outra unidade'; end if;
end $$;
reset role;

-- --- 9. Terceira unidade gravável: funciona sem nenhuma regra nova -------------
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  update public.electrical_panels set notes = 'T29 tst3' where tag = 'TTST_QD_0001';
  if not found then raise exception 'FALHA: editor TST3 não gravou na própria unidade'; end if;
  if exists (select 1 from public.electrical_panels where tag like 'PRT_QD_%' or tag = 'TEFC_QD_0001') then
    raise exception 'FALHA: editor TST3 vê outras unidades';
  end if;
end $$;
reset role;

-- --- 10. anon: sem acesso a tabelas ------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
begin
  begin
    perform 1 from public.electrical_panels limit 1;
    raise exception 'FALHA: anon leu electrical_panels';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.panel_public_info limit 1;
    raise exception 'FALHA: anon listou a view panel_public_info';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'OK' as resultado;

rollback;
