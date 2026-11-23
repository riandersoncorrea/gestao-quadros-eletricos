-- ============================================================================
-- Testes da migration 0036 (unidade dos registros filhos pela cadeia real)
-- ============================================================================
-- Rodar DEPOIS da 0036, inteiro (banco local descartável ou SQL Editor).
-- Tudo em BEGIN/ROLLBACK: unidade de teste liberada, usuários, quadros e
-- registros não ficam. Só dados SINTÉTICOS (prefixo T36); não depende de
-- dados reais de nenhuma unidade.
-- Cada bloco simula uma chamada direta à API (role authenticated +
-- request.jwt.claims). Sucesso = nenhum "FALHA" e 'OK 0036' no fim.
--
-- Unidades: usa São Luís (SLZ) e a EFC, com a EFC LIBERADA só dentro desta
-- transação (permite_escrita = true) — é o cenário pós-liberação. Os
-- registros "de São Luís" e "da EFC" usados aqui são criados pelo teste.
-- ============================================================================

begin;

-- --- Fixtures (como postgres) -------------------------------------------------
update public.unidades_operacionais set permite_escrita = true where codigo = 'EFC';

insert into auth.users (id, email) values
  ('36000000-0000-4000-a000-000000000001', 't36-admin-geral@example.invalid'),
  ('36000000-0000-4000-a000-000000000002', 't36-admin-local-efc@example.invalid'),
  ('36000000-0000-4000-a000-000000000003', 't36-editor-efc@example.invalid'),
  ('36000000-0000-4000-a000-000000000004', 't36-editor-slz@example.invalid'),
  ('36000000-0000-4000-a000-000000000005', 't36-inspetor-efc@example.invalid'),
  ('36000000-0000-4000-a000-000000000006', 't36-viewer-efc@example.invalid');
insert into public.profiles (id, email) select id, email from auth.users where email like 't36-%' on conflict (id) do nothing;
update public.profiles set approved = true, role = 'admin', acesso_todas_unidades = true where id = '36000000-0000-4000-a000-000000000001';
update public.profiles set approved = true, role = 'admin'    where id = '36000000-0000-4000-a000-000000000002';
update public.profiles set approved = true, role = 'editor'   where id in ('36000000-0000-4000-a000-000000000003', '36000000-0000-4000-a000-000000000004');
update public.profiles set approved = true, role = 'inspetor' where id = '36000000-0000-4000-a000-000000000005';
update public.profiles set approved = true, role = 'viewer'   where id = '36000000-0000-4000-a000-000000000006';
insert into public.profile_unidades (profile_id, unidade_operacional_id)
select v.p::uuid, u.id from (values
  ('36000000-0000-4000-a000-000000000002', 'EFC'), ('36000000-0000-4000-a000-000000000003', 'EFC'),
  ('36000000-0000-4000-a000-000000000004', 'SLZ'), ('36000000-0000-4000-a000-000000000005', 'EFC'),
  ('36000000-0000-4000-a000-000000000006', 'EFC')) v(p, c)
join public.unidades_operacionais u on u.codigo = v.c;

select set_config('t36.efc', (select id::text from public.unidades_operacionais where codigo = 'EFC'), true),
       set_config('t36.slz', (select id::text from public.unidades_operacionais where codigo = 'SLZ'), true);

-- Hierarquia sintética: uma cidade da EFC e uma localidade de São Luís de teste.
insert into public.localidades (id, nome, sigla, unidade_operacional_id) values
  ('36100000-0000-4000-a000-000000000001', 'T36 CIDADE EFC', 'TTRS', current_setting('t36.efc')::uuid),
  ('36100000-0000-4000-a000-000000000002', 'T36 LOCALIDADE SLZ', null, current_setting('t36.slz')::uuid),
  ('36100000-0000-4000-a000-000000000003', 'T36 OUTRA CIDADE EFC', 'TTRX', current_setting('t36.efc')::uuid);
insert into public.locais (id, localidade_id, nome) values
  ('36200000-0000-4000-a000-000000000001', '36100000-0000-4000-a000-000000000001', 'T36 PREDIO EFC A'),
  ('36200000-0000-4000-a000-000000000003', '36100000-0000-4000-a000-000000000001', 'T36 PREDIO EFC B'),
  ('36200000-0000-4000-a000-000000000002', '36100000-0000-4000-a000-000000000002', 'T36 PREDIO SLZ');
insert into public.sublocais (id, local_id, nome) values
  ('36300000-0000-4000-a000-000000000001', '36200000-0000-4000-a000-000000000001', 'T36 SALA EFC'),
  ('36300000-0000-4000-a000-000000000002', '36200000-0000-4000-a000-000000000002', 'T36 SALA SLZ');

insert into public.electrical_panels (id, tag, name, site, unidade_operacional_id, localidade_id, local_id, sublocal_id) values
  ('36400000-0000-4000-a000-000000000001', 'TTRS_QD_0001', 'T36 quadro EFC 1', null, current_setting('t36.efc')::uuid,
   '36100000-0000-4000-a000-000000000001', '36200000-0000-4000-a000-000000000001', '36300000-0000-4000-a000-000000000001'),
  ('36400000-0000-4000-a000-000000000003', 'TTRS_QD_0002', 'T36 quadro EFC 2', null, current_setting('t36.efc')::uuid,
   '36100000-0000-4000-a000-000000000001', '36200000-0000-4000-a000-000000000001', null),
  ('36400000-0000-4000-a000-000000000002', 'T36_SLZ_QD_0001', 'T36 quadro SLZ', 'oficina', current_setting('t36.slz')::uuid,
   '36100000-0000-4000-a000-000000000002', '36200000-0000-4000-a000-000000000002', '36300000-0000-4000-a000-000000000002');

-- Registros pré-existentes (como se viessem do histórico), um por unidade.
insert into public.inspections (id, panel_id, panel_ref_id, inspection_date, inspector_name, overall_result) values
  ('36500000-0000-4000-a000-000000000001', '36400000-0000-4000-a000-000000000001', '36400000-0000-4000-a000-000000000001', '2026-10-10', 't36', 'reprovado'),
  ('36500000-0000-4000-a000-000000000002', '36400000-0000-4000-a000-000000000002', '36400000-0000-4000-a000-000000000002', '2026-10-10', 't36', 'reprovado');
insert into public.nonconformities (id, descricao, origem, panel_id, inspection_id, severidade) values
  ('36700000-0000-4000-a000-000000000001', 'T36 NC EFC', 'inspecao', '36400000-0000-4000-a000-000000000001', '36500000-0000-4000-a000-000000000001', 'alta'),
  ('36700000-0000-4000-a000-000000000002', 'T36 NC SLZ', 'inspecao', '36400000-0000-4000-a000-000000000002', '36500000-0000-4000-a000-000000000002', 'alta');
insert into public.actions (id, descricao, nonconformity_id, panel_id, status, origem) values
  ('36800000-0000-4000-a000-000000000001', 'T36 ação EFC', '36700000-0000-4000-a000-000000000001', '36400000-0000-4000-a000-000000000001', 'aberta', 'automatica'),
  ('36800000-0000-4000-a000-000000000002', 'T36 ação SLZ', '36700000-0000-4000-a000-000000000002', '36400000-0000-4000-a000-000000000002', 'aberta', 'automatica');
-- NC manual sem quadro da EFC (unidade explícita, como o app envia).
insert into public.nonconformities (id, descricao, origem, severidade, unidade_operacional_id) values
  ('36700000-0000-4000-a000-000000000003', 'T36 NC manual EFC sem quadro', 'manual', 'baixa', current_setting('t36.efc')::uuid);

-- Impressão digital de TODOS os registros já existentes (histórico + fixtures)
-- para provar, no fim, que nenhum foi alterado pelos testes que deviam falhar.
create temp table t36_antes as
select 'inspections' t, id, md5(to_jsonb(x)::text) h from public.inspections x union all
select 'inspection_responses', id, md5(to_jsonb(x)::text) from public.inspection_responses x union all
select 'nonconformities', id, md5(to_jsonb(x)::text) from public.nonconformities x union all
select 'actions', id, md5(to_jsonb(x)::text) from public.actions x union all
select 'analysis_flags', id, md5(to_jsonb(x)::text) from public.analysis_flags x union all
select 'electrical_panels', id, md5(to_jsonb(x)::text) from public.electrical_panels x;

-- --- 0. Estrutura --------------------------------------------------------------
do $$
begin
  if not (select prosecdef from pg_proc where proname = 'herdar_unidade' and pronamespace = 'public'::regnamespace) then
    raise exception 'FALHA 0.1: herdar_unidade não é SECURITY DEFINER';
  end if;
  if has_function_privilege('authenticated', 'public.unidade_do_vinculo(text, uuid)', 'execute')
     or has_function_privilege('anon', 'public.unidade_do_vinculo(text, uuid)', 'execute') then
    raise exception 'FALHA 0.2: unidade_do_vinculo executável pela API (oráculo de unidade)';
  end if;
  if (select unidade_operacional_id from public.nonconformities where id = '36700000-0000-4000-a000-000000000001')
     is distinct from current_setting('t36.efc')::uuid
     or (select unidade_operacional_id from public.actions where id = '36800000-0000-4000-a000-000000000002')
     is distinct from current_setting('t36.slz')::uuid then
    raise exception 'FALHA 0.3: herança pela cadeia (quadro -> NC -> ação) não funcionou';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'nonconformities' and policyname = 'nc: exclusão só admin'
                   and permissive = 'RESTRICTIVE' and cmd = 'DELETE') then
    raise exception 'FALHA 0.4: policy restritiva de exclusão de NC ausente';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE' and cmd = 'DELETE'
        and (tablename, policyname) in (('actions', 'ação: exclusão só admin'),
                                        ('inspection_responses', 'checklist: exclusão só admin'),
                                        ('measurements', 'checklist: exclusão só admin'),
                                        ('thermography_points', 'checklist: exclusão só admin'))) <> 4 then
    raise exception 'FALHA 0.5: policies restritivas de exclusão (ação/checklist) ausentes';
  end if;
  -- Nenhuma função SECURITY DEFINER desta migration executável pela API.
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
               and p.proname in ('herdar_unidade', 'unidade_do_vinculo', 'cascade_unidade_filhos',
                                 'cascade_panel_unidade', 'check_localizacao_unidade')
               and (has_function_privilege('authenticated', p.oid, 'execute')
                    or has_function_privilege('anon', p.oid, 'execute'))) then
    raise exception 'FALHA 0.6: função SECURITY DEFINER da 0036 executável por anon/authenticated';
  end if;
end $$;

-- Helper de teste: executa um comando e diz se foi RECUSADO (qualquer erro de
-- permissão/integridade) — devolve a mensagem para o relatório.
create or replace function pg_temp.recusa(cmd text) returns text language plpgsql as $$
begin
  execute cmd;
  return null;            -- aceito
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;
grant execute on function pg_temp.recusa(text) to authenticated;
grant select on t36_antes to authenticated;

-- --- 1. EDITOR DA EFC -----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"36000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  efc text := current_setting('t36.efc');
  slz text := current_setting('t36.slz');
  m text;
  v_insp uuid; v_nc uuid; v_act uuid;
begin
  -- 1.A Fluxo normal na EFC (sem informar unidade, como o app faz).
  insert into public.inspections (panel_id, panel_ref_id, inspection_date, inspector_name, overall_result)
  values ('36400000-0000-4000-a000-000000000001', '36400000-0000-4000-a000-000000000001', current_date, 't36', 'reprovado')
  returning id into v_insp;
  insert into public.inspection_responses (inspection_id, resposta) values (v_insp, 'nao_conforme');
  insert into public.measurements (inspection_id, panel_id, categoria, unidade) values (v_insp, '36400000-0000-4000-a000-000000000001', 'tensao', 'V');
  insert into public.thermography_points (inspection_id, panel_id, equipamento) values (v_insp, '36400000-0000-4000-a000-000000000001', 'disj');
  insert into public.analysis_flags (inspection_id, panel_id, tipo, severidade) values (v_insp, '36400000-0000-4000-a000-000000000001', 't36', 'media');
  insert into public.nonconformities (panel_id, inspection_id, descricao, severidade, origem)
  values ('36400000-0000-4000-a000-000000000001', v_insp, 'T36 NC nova EFC', 'media', 'inspecao') returning id into v_nc;
  insert into public.actions (nonconformity_id, panel_id, descricao, origem) values (v_nc, '36400000-0000-4000-a000-000000000001', 'T36 ação nova', 'automatica')
  returning id into v_act;
  -- Unidade informada IGUAL à da cadeia continua aceita (ncService envia a ativa).
  insert into public.nonconformities (panel_id, descricao, severidade, origem, unidade_operacional_id)
  values ('36400000-0000-4000-a000-000000000001', 'T36 NC manual com quadro', 'baixa', 'manual', efc::uuid);
  insert into public.panel_attachments (panel_id, file_url) values ('36400000-0000-4000-a000-000000000001', 't36/diag.pdf');
  if (select count(*) from (
        select unidade_operacional_id u from public.inspections where id = v_insp union all
        select unidade_operacional_id from public.inspection_responses where inspection_id = v_insp union all
        select unidade_operacional_id from public.measurements where inspection_id = v_insp union all
        select unidade_operacional_id from public.thermography_points where inspection_id = v_insp union all
        select unidade_operacional_id from public.analysis_flags where inspection_id = v_insp union all
        select unidade_operacional_id from public.nonconformities where id = v_nc union all
        select unidade_operacional_id from public.actions where id = v_act) x where u is distinct from efc::uuid) > 0 then
    raise exception 'FALHA 1.A: fluxo normal da EFC não herdou a unidade EFC';
  end if;
  -- Editor NÃO exclui ação pela API (decisão D3: só administrador; item 6).
  delete from public.actions where id = v_act;
  if found then raise exception 'FALHA 1.A2: editor excluiu ação da EFC pela API'; end if;

  -- 1.B Forja de unidade no payload apontando para São Luís.
  m := pg_temp.recusa(format($c$insert into public.inspections (panel_id, panel_ref_id, inspection_date, inspector_name, overall_result, unidade_operacional_id)
         values ('36400000-0000-4000-a000-000000000002', '36400000-0000-4000-a000-000000000002', current_date, 'forja', 'aprovado', %L)$c$, efc));
  if m is null then raise exception 'FALHA 1.B1: inspeção em quadro SLZ com unidade EFC forjada foi aceita'; end if;
  m := pg_temp.recusa(format($c$insert into public.nonconformities (panel_id, descricao, severidade, origem, unidade_operacional_id)
         values ('36400000-0000-4000-a000-000000000002', 'forja', 'baixa', 'manual', %L)$c$, efc));
  if m is null then raise exception 'FALHA 1.B2: NC em quadro SLZ com unidade EFC forjada foi aceita'; end if;
  m := pg_temp.recusa($c$insert into public.nonconformities (panel_id, descricao, severidade, origem)
         values ('36400000-0000-4000-a000-000000000002', 'forja', 'baixa', 'manual')$c$);
  if m is null then raise exception 'FALHA 1.B3: NC em quadro SLZ (sem unidade) foi aceita'; end if;
  m := pg_temp.recusa(format($c$insert into public.actions (nonconformity_id, descricao, status, unidade_operacional_id)
         values ('36700000-0000-4000-a000-000000000002', 'forja', 'em_andamento', %L)$c$, efc));
  if m is null then raise exception 'FALHA 1.B4: ação sob NC SLZ com unidade EFC forjada foi aceita'; end if;
  m := pg_temp.recusa(format($c$insert into public.inspection_responses (inspection_id, resposta, unidade_operacional_id)
         values ('36500000-0000-4000-a000-000000000002', 'conforme', %L)$c$, efc));
  if m is null then raise exception 'FALHA 1.B5: resposta em inspeção SLZ forjada foi aceita'; end if;
  m := pg_temp.recusa(format($c$insert into public.measurements (panel_id, categoria, unidade, unidade_operacional_id)
         values ('36400000-0000-4000-a000-000000000002', 'x', 'V', %L)$c$, efc));
  if m is null then raise exception 'FALHA 1.B6: medição em quadro SLZ forjada foi aceita'; end if;
  m := pg_temp.recusa(format($c$insert into public.thermography_points (inspection_id, unidade_operacional_id)
         values ('36500000-0000-4000-a000-000000000002', %L)$c$, efc));
  if m is null then raise exception 'FALHA 1.B7: termografia em inspeção SLZ forjada foi aceita'; end if;
  m := pg_temp.recusa(format($c$insert into public.analysis_flags (panel_id, tipo, severidade, unidade_operacional_id)
         values ('36400000-0000-4000-a000-000000000002', 'x', 'baixa', %L)$c$, efc));
  if m is null then raise exception 'FALHA 1.B8: flag em quadro SLZ forjada foi aceita'; end if;
  m := pg_temp.recusa(format($c$insert into public.panel_attachments (panel_id, file_url, unidade_operacional_id)
         values ('36400000-0000-4000-a000-000000000002', 'x', %L)$c$, efc));
  if m is null then raise exception 'FALHA 1.B9: anexo em quadro SLZ forjado foi aceito'; end if;
  m := pg_temp.recusa(format($c$insert into public.panel_condition_history (panel_id, unidade_operacional_id)
         values ('36400000-0000-4000-a000-000000000002', %L)$c$, efc));
  if m is null then raise exception 'FALHA 1.B10: histórico de condição em quadro SLZ forjado foi aceito'; end if;
  m := pg_temp.recusa(format($c$insert into public.panel_location_history (panel_id, unidade_operacional_id)
         values ('36400000-0000-4000-a000-000000000002', %L)$c$, efc));
  if m is null then raise exception 'FALHA 1.B11: histórico de localização em quadro SLZ forjado foi aceito'; end if;

  -- 1.C Associar registros de unidades diferentes.
  m := pg_temp.recusa($c$insert into public.nonconformities (panel_id, inspection_id, descricao, severidade, origem)
         values ('36400000-0000-4000-a000-000000000001', '36500000-0000-4000-a000-000000000002', 'mistura', 'baixa', 'inspecao')$c$);
  if m is null then raise exception 'FALHA 1.C1: NC com quadro EFC e inspeção SLZ foi aceita'; end if;
  m := pg_temp.recusa($c$insert into public.actions (nonconformity_id, panel_id, descricao)
         values ('36700000-0000-4000-a000-000000000002', '36400000-0000-4000-a000-000000000001', 'mistura')$c$);
  if m is null then raise exception 'FALHA 1.C2: ação com NC SLZ e quadro EFC foi aceita'; end if;

  -- 1.D Alterar vínculo / unidade de registros existentes.
  m := pg_temp.recusa($c$update public.nonconformities set panel_id = '36400000-0000-4000-a000-000000000002'
         where id = '36700000-0000-4000-a000-000000000001'$c$);
  if m is null then
    raise exception 'FALHA 1.D1: NC da EFC re-vinculada a quadro SLZ';
  end if;
  m := pg_temp.recusa(format($c$update public.nonconformities set unidade_operacional_id = %L
         where id = '36700000-0000-4000-a000-000000000001'$c$, slz));
  if m is null then raise exception 'FALHA 1.D2: unidade da NC (com quadro) alterada pela API'; end if;
  m := pg_temp.recusa(format($c$update public.nonconformities set unidade_operacional_id = %L
         where id = '36700000-0000-4000-a000-000000000003'$c$, slz));
  if m is null then raise exception 'FALHA 1.D3: unidade da NC manual (sem quadro) alterada pela API'; end if;
  m := pg_temp.recusa($c$update public.actions set nonconformity_id = '36700000-0000-4000-a000-000000000002', panel_id = null
         where id = '36800000-0000-4000-a000-000000000001'$c$);
  if m is null then
    raise exception 'FALHA 1.D4: ação da EFC re-vinculada a NC de SLZ';
  end if;
  m := pg_temp.recusa(format($c$update public.inspections set unidade_operacional_id = %L
         where id = '36500000-0000-4000-a000-000000000001'$c$, slz));
  if m is null then raise exception 'FALHA 1.D5: unidade da inspeção alterada pela API'; end if;

  -- 1.E Localização do quadro.
  m := pg_temp.recusa($c$update public.electrical_panels set local_id = '36200000-0000-4000-a000-000000000002'
         where id = '36400000-0000-4000-a000-000000000001'$c$);
  if m is null then raise exception 'FALHA 1.E1: quadro da EFC com prédio de SLZ foi aceito'; end if;
  update public.electrical_panels set local_id = '36200000-0000-4000-a000-000000000003', sublocal_id = null
   where id = '36400000-0000-4000-a000-000000000001';
  if not found then raise exception 'FALHA 1.E2: troca de prédio dentro da mesma cidade da EFC recusada'; end if;
  m := pg_temp.recusa($c$update public.electrical_panels set sublocal_id = '36300000-0000-4000-a000-000000000001'
         where id = '36400000-0000-4000-a000-000000000001'$c$);
  if m is null then raise exception 'FALHA 1.E3: sublocal de outro prédio aceito'; end if;
  -- Cidade sem o prédio correspondente (TAG da EFC leva a sigla da cidade).
  m := pg_temp.recusa($c$update public.electrical_panels set localidade_id = '36100000-0000-4000-a000-000000000003'
         where id = '36400000-0000-4000-a000-000000000001'$c$);
  if m is null then raise exception 'FALHA 1.E4: cidade diferente da do prédio aceita'; end if;

  -- 1.F Exclusão de NC pela API: editor não exclui (só admin).
  delete from public.nonconformities where id = '36700000-0000-4000-a000-000000000001';
  if found then raise exception 'FALHA 1.F: editor excluiu NC pela API'; end if;

  -- 1.G Nada de São Luís é visível nem gravável.
  update public.electrical_panels set notes = 'x' where id = '36400000-0000-4000-a000-000000000002';
  if found then raise exception 'FALHA 1.G: editor EFC alterou quadro SLZ'; end if;
end $$;
reset role;

-- A NC e a ação de SLZ não mudaram de status por causa das tentativas (0027).
do $$ begin
  if (select status from public.nonconformities where id = '36700000-0000-4000-a000-000000000002') <> 'aberta' then
    raise exception 'FALHA 1.H: status da NC de SLZ mudou por ação forjada';
  end if;
end $$;

-- --- 2. EDITOR DE SÃO LUÍS (simétrico; vale já hoje, com a EFC somente leitura) ---
select set_config('request.jwt.claims', '{"sub":"36000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  efc text := current_setting('t36.efc');
  slz text := current_setting('t36.slz');
  m text;
  v_insp uuid; v_nc uuid;
begin
  m := pg_temp.recusa(format($c$insert into public.nonconformities (panel_id, descricao, severidade, origem, unidade_operacional_id)
         values ('36400000-0000-4000-a000-000000000001', 'forja', 'baixa', 'manual', %L)$c$, slz));
  if m is null then raise exception 'FALHA 2.1: editor SLZ criou NC em quadro EFC com unidade forjada'; end if;
  m := pg_temp.recusa(format($c$insert into public.actions (nonconformity_id, descricao, status, numero_nota, om, unidade_operacional_id)
         values ('36700000-0000-4000-a000-000000000001', 'forja', 'em_andamento', '1', '1', %L)$c$, slz));
  if m is null then raise exception 'FALHA 2.2: editor SLZ criou ação sob NC da EFC'; end if;
  m := pg_temp.recusa(format($c$insert into public.inspections (panel_id, panel_ref_id, inspection_date, inspector_name, overall_result, unidade_operacional_id)
         values ('36400000-0000-4000-a000-000000000001', '36400000-0000-4000-a000-000000000001', current_date, 'forja', 'aprovado', %L)$c$, slz));
  if m is null then raise exception 'FALHA 2.3: editor SLZ criou inspeção em quadro EFC'; end if;
  m := pg_temp.recusa(format($c$insert into public.inspection_responses (inspection_id, resposta, unidade_operacional_id)
         values ('36500000-0000-4000-a000-000000000001', 'conforme', %L)$c$, slz));
  if m is null then raise exception 'FALHA 2.4: editor SLZ criou resposta em inspeção EFC'; end if;
  m := pg_temp.recusa(format($c$insert into public.panel_attachments (panel_id, file_url, unidade_operacional_id)
         values ('36400000-0000-4000-a000-000000000001', 'x', %L)$c$, slz));
  if m is null then raise exception 'FALHA 2.5: editor SLZ criou anexo em quadro EFC'; end if;
  update public.electrical_panels set notes = 'x' where id = '36400000-0000-4000-a000-000000000001';
  if found then raise exception 'FALHA 2.6: editor SLZ alterou quadro EFC'; end if;

  -- São Luís continua funcionando: checklist + NC + ação em execução (NC segue a ação, 0027).
  insert into public.inspections (panel_id, panel_ref_id, inspection_date, inspector_name, overall_result, status)
  values ('36400000-0000-4000-a000-000000000002', '36400000-0000-4000-a000-000000000002', current_date, 't36', 'reprovado', 'executada')
  returning id into v_insp;
  insert into public.inspection_responses (inspection_id, resposta) values (v_insp, 'nao_conforme');
  insert into public.nonconformities (panel_id, inspection_id, descricao, severidade, origem)
  values ('36400000-0000-4000-a000-000000000002', v_insp, 'T36 NC nova SLZ', 'alta', 'inspecao') returning id into v_nc;
  insert into public.actions (nonconformity_id, panel_id, descricao, status, numero_nota, om)
  values (v_nc, '36400000-0000-4000-a000-000000000002', 'T36 ação SLZ em execução', 'em_andamento', '1', '1');
  if (select status from public.nonconformities where id = v_nc) <> 'em_tratamento' then
    raise exception 'FALHA 2.7: NC de SLZ não acompanhou a ação (0027)';
  end if;
  insert into public.nonconformities (descricao, severidade, origem, unidade_operacional_id)
  values ('T36 NC manual SLZ sem quadro', 'baixa', 'manual', slz::uuid);
  update public.electrical_panels set notes = 'T36 SLZ ok' where id = '36400000-0000-4000-a000-000000000002';
  if not found then raise exception 'FALHA 2.8: editor SLZ não grava mais quadro SLZ'; end if;
  delete from public.nonconformities where id = v_nc;
  if found then raise exception 'FALHA 2.9: editor SLZ excluiu NC pela API'; end if;
end $$;
reset role;

do $$ begin
  if (select status from public.nonconformities where id = '36700000-0000-4000-a000-000000000001') <> 'aberta' then
    raise exception 'FALHA 2.10: status da NC da EFC mudou por ação forjada de SLZ (0027 definer)';
  end if;
end $$;

-- --- 3. INSPETOR DA EFC: tratamento de ação continua --------------------------
select set_config('request.jwt.claims', '{"sub":"36000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  update public.actions set status = 'em_andamento', numero_nota = '123', om = '456'
   where id = '36800000-0000-4000-a000-000000000001';
  if not found then raise exception 'FALHA 3.1: inspetor da EFC não iniciou o tratamento'; end if;
  if (select status from public.nonconformities where id = '36700000-0000-4000-a000-000000000001') <> 'em_tratamento' then
    raise exception 'FALHA 3.2: NC da EFC não acompanhou a ação tratada pelo inspetor';
  end if;
  update public.actions set numero_nota = 'x' where id = '36800000-0000-4000-a000-000000000002';
  if found then raise exception 'FALHA 3.3: inspetor da EFC tratou ação de SLZ'; end if;
  delete from public.nonconformities where id = '36700000-0000-4000-a000-000000000003';
  if found then raise exception 'FALHA 3.4: inspetor excluiu NC'; end if;
end $$;
reset role;

-- --- 4. VIEWER DA EFC: nada grava ---------------------------------------------
select set_config('request.jwt.claims', '{"sub":"36000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  delete from public.nonconformities where id = '36700000-0000-4000-a000-000000000003';
  if found then raise exception 'FALHA 4.1: viewer excluiu NC'; end if;
  if pg_temp.recusa($c$insert into public.nonconformities (panel_id, descricao, severidade, origem)
       values ('36400000-0000-4000-a000-000000000001', 'x', 'baixa', 'manual')$c$) is null then
    raise exception 'FALHA 4.2: viewer criou NC';
  end if;
end $$;
reset role;

-- --- 5. ADMINISTRADOR LOCAL DA EFC --------------------------------------------
select set_config('request.jwt.claims', '{"sub":"36000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
declare m text;
begin
  update public.actions set responsavel_id = '36000000-0000-4000-a000-000000000005'
   where id = '36800000-0000-4000-a000-000000000001';
  if not found then raise exception 'FALHA 5.1: admin local não atribuiu responsável na EFC'; end if;
  delete from public.nonconformities where id = '36700000-0000-4000-a000-000000000003';
  if not found then raise exception 'FALHA 5.2: admin local não excluiu NC da EFC'; end if;
  delete from public.nonconformities where id = '36700000-0000-4000-a000-000000000002';
  if found then raise exception 'FALHA 5.3: admin local da EFC excluiu NC de SLZ'; end if;
  m := pg_temp.recusa(format($c$update public.nonconformities set unidade_operacional_id = %L
         where id = '36700000-0000-4000-a000-000000000001'$c$, current_setting('t36.slz')));
  if m is null then raise exception 'FALHA 5.4: admin local mudou a unidade de uma NC'; end if;
  m := pg_temp.recusa($c$update public.localidades set unidade_operacional_id = (select id from public.unidades_operacionais where codigo = 'SLZ')
         where id = '36100000-0000-4000-a000-000000000001'$c$);
  if m is null then
    raise exception 'FALHA 5.5: admin local moveu cidade da EFC para SLZ';
  end if;
end $$;
reset role;

-- --- 6. ADMINISTRADOR GERAL ----------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"36000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  efc uuid := current_setting('t36.efc')::uuid;
  slz uuid := current_setting('t36.slz')::uuid;
  m text;
  v_nc uuid; v_act uuid;
begin
  -- Forja continua recusada até para o admin geral (a unidade é a da cadeia).
  m := pg_temp.recusa(format($c$insert into public.nonconformities (panel_id, descricao, severidade, origem, unidade_operacional_id)
         values ('36400000-0000-4000-a000-000000000001', 'forja', 'baixa', 'manual', %L)$c$, slz));
  if m is null then raise exception 'FALHA 6.1: admin geral gravou NC com unidade divergente do quadro'; end if;
  -- Re-vínculo legítimo: a unidade acompanha o novo quadro.
  insert into public.nonconformities (panel_id, descricao, severidade, origem)
  values ('36400000-0000-4000-a000-000000000001', 'T36 NC a re-vincular', 'baixa', 'manual') returning id into v_nc;
  insert into public.actions (nonconformity_id, descricao) values (v_nc, 'T36 ação sem quadro') returning id into v_act;
  update public.nonconformities set panel_id = '36400000-0000-4000-a000-000000000002' where id = v_nc;
  if (select unidade_operacional_id from public.nonconformities where id = v_nc) <> slz then
    raise exception 'FALHA 6.2: unidade da NC não acompanhou o re-vínculo do admin geral';
  end if;
  -- Ação filha (sem panel_id) acompanha a NC (cascade_unidade_filhos).
  if (select unidade_operacional_id from public.actions where id = v_act) <> slz then
    raise exception 'FALHA 6.3: ação não acompanhou a NC re-vinculada';
  end if;
  -- NC com ação presa a quadro da unidade antiga: re-vínculo recusado (cadeia ficaria inconsistente).
  insert into public.nonconformities (panel_id, descricao, severidade, origem)
  values ('36400000-0000-4000-a000-000000000003', 'T36 NC com ação de quadro', 'baixa', 'manual') returning id into v_nc;
  insert into public.actions (nonconformity_id, panel_id, descricao) values (v_nc, '36400000-0000-4000-a000-000000000003', 'T36 ação com quadro');
  m := pg_temp.recusa(format($c$update public.nonconformities set panel_id = '36400000-0000-4000-a000-000000000002' where id = %L$c$, v_nc));
  if m is null then raise exception 'FALHA 6.3b: re-vínculo deixou ação com quadro de outra unidade sob a NC'; end if;
  -- NC manual sem quadro: admin geral pode reclassificar.
  insert into public.nonconformities (descricao, severidade, origem, unidade_operacional_id)
  values ('T36 NC a reclassificar', 'baixa', 'manual', efc) returning id into v_nc;
  update public.nonconformities set unidade_operacional_id = slz where id = v_nc;
  if not found then raise exception 'FALHA 6.4: admin geral não reclassificou NC sem quadro'; end if;
  -- NC pendente de classificação (sem unidade): ação filha também sem unidade.
  insert into public.nonconformities (descricao, severidade, origem) values ('T36 NC pendente', 'baixa', 'manual') returning id into v_nc;
  insert into public.actions (nonconformity_id, descricao, unidade_operacional_id) values (v_nc, 'T36 ação pendente', efc) returning id into v_act;
  if (select unidade_operacional_id from public.actions where id = v_act) is not null then
    raise exception 'FALHA 6.5: ação de NC sem unidade recebeu unidade';
  end if;
  -- Mover quadro de unidade: toda a cadeia acompanha (inclusive NC ligada só pela inspeção e ação ligada só pela NC).
  insert into public.nonconformities (inspection_id, descricao, severidade, origem)
  values ('36500000-0000-4000-a000-000000000001', 'T36 NC só pela inspeção', 'baixa', 'inspecao') returning id into v_nc;
  insert into public.actions (nonconformity_id, descricao) values (v_nc, 'T36 ação só pela NC') returning id into v_act;
  update public.electrical_panels
     set unidade_operacional_id = slz, site = 'oficina', localidade_id = '36100000-0000-4000-a000-000000000002',
         local_id = '36200000-0000-4000-a000-000000000002', sublocal_id = null
   where id = '36400000-0000-4000-a000-000000000001';
  if exists (select 1 from (
        select unidade_operacional_id u from public.inspections where panel_id = '36400000-0000-4000-a000-000000000001' union all
        select r.unidade_operacional_id from public.inspection_responses r join public.inspections i on i.id = r.inspection_id
         where i.panel_id = '36400000-0000-4000-a000-000000000001' union all
        select unidade_operacional_id from public.nonconformities where id = v_nc union all
        select unidade_operacional_id from public.actions where id = v_act union all
        select unidade_operacional_id from public.nonconformities where panel_id = '36400000-0000-4000-a000-000000000001' union all
        select unidade_operacional_id from public.actions where panel_id = '36400000-0000-4000-a000-000000000001') x
      where u is distinct from slz) then
    raise exception 'FALHA 6.6: cascata incompleta ao mover o quadro de unidade';
  end if;
  -- Exclui NC (admin).
  delete from public.nonconformities where descricao = 'T36 NC a reclassificar';
  if not found then raise exception 'FALHA 6.7: admin geral não excluiu NC'; end if;
end $$;
reset role;

-- --- 7. Registros pré-existentes intactos (fora os alterados de propósito) ------
do $$
declare n int; lista text;
begin
  select count(*), string_agg(a.t || ':' || a.id, ', ') into n, lista
    from t36_antes a
    left join lateral (
      select md5(to_jsonb(x)::text) h from public.inspections x where a.t = 'inspections' and x.id = a.id union all
      select md5(to_jsonb(x)::text) from public.inspection_responses x where a.t = 'inspection_responses' and x.id = a.id union all
      select md5(to_jsonb(x)::text) from public.nonconformities x where a.t = 'nonconformities' and x.id = a.id union all
      select md5(to_jsonb(x)::text) from public.actions x where a.t = 'actions' and x.id = a.id union all
      select md5(to_jsonb(x)::text) from public.analysis_flags x where a.t = 'analysis_flags' and x.id = a.id union all
      select md5(to_jsonb(x)::text) from public.electrical_panels x where a.t = 'electrical_panels' and x.id = a.id
    ) d on true
   where d.h is distinct from a.h
     -- alterados de propósito pelos testes positivos (e pela cascata do bloco 6):
     and a.id not in ('36400000-0000-4000-a000-000000000001', '36400000-0000-4000-a000-000000000002',
                      '36500000-0000-4000-a000-000000000001', '36700000-0000-4000-a000-000000000001',
                      '36700000-0000-4000-a000-000000000003', '36800000-0000-4000-a000-000000000001')
     and not (a.t = 'inspection_responses' and exists (select 1 from public.inspection_responses r
              where r.id = a.id and r.inspection_id = '36500000-0000-4000-a000-000000000001'));
  if n > 0 then raise exception 'FALHA 7: % registro(s) existente(s) alterado(s): %', n, left(lista, 400); end if;
  if (select status from public.nonconformities where id = '36700000-0000-4000-a000-000000000002') <> 'aberta'
     or (select status from public.actions where id = '36800000-0000-4000-a000-000000000002') <> 'aberta' then
    raise exception 'FALHA 7.2: NC/ação de SLZ mudaram';
  end if;
end $$;

select 'OK 0036' as resultado;
rollback;
