-- ============================================================================
-- Dados SINTÉTICOS de São Luís para o banco LOCAL descartável
-- ============================================================================
-- Simula o estado de produção antes da 0028: só São Luís, usuários de todos
-- os perfis (inclusive uma conta pendente), inspeções, respostas, NCs (uma
-- manual sem quadro), ações (uma sem panel_id, só com a NC), ordens SAP (uma
-- sem quadro), flags e históricos. Os 313 quadros vêm da própria 0002.
-- NUNCA rodar no Supabase.
-- ============================================================================

-- Usuários (o trigger handle_new_user cria os profiles como viewer).
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-a000-000000000001', 'admin@teste.local', '{"full_name":"Admin Atual"}'),
  ('a0000000-0000-4000-a000-000000000002', 'editor@teste.local', '{"full_name":"Editor SLZ"}'),
  ('a0000000-0000-4000-a000-000000000003', 'viewer@teste.local', '{"full_name":"Viewer SLZ"}'),
  ('a0000000-0000-4000-a000-000000000004', 'inspetor@teste.local', '{"full_name":"Inspetor SLZ"}'),
  ('a0000000-0000-4000-a000-000000000005', 'pendente@teste.local', '{"full_name":"Conta Pendente"}');

update public.profiles set role = 'admin', approved = true where id = 'a0000000-0000-4000-a000-000000000001';
update public.profiles set role = 'editor', approved = true where id = 'a0000000-0000-4000-a000-000000000002';
update public.profiles set role = 'viewer', approved = true where id = 'a0000000-0000-4000-a000-000000000003';
update public.profiles set role = 'inspetor', approved = true where id = 'a0000000-0000-4000-a000-000000000004';
update public.profiles set role = 'viewer', approved = false where id = 'a0000000-0000-4000-a000-000000000005';

-- Inspeções em dois quadros de São Luís.
insert into public.inspections (id, panel_id, panel_ref_id, inspection_date, inspector_name, overall_result)
select ('b0000000-0000-4000-a000-00000000000' || n)::uuid, p.id, p.id, date '2026-10-01' + n, 'inspetor@teste.local', 'reprovado'
  from (values (1, 'PRT_QD_0001'), (2, 'OFC_QD_0001')) as v(n, tag)
  join public.electrical_panels p on p.tag = v.tag;

insert into public.inspection_responses (inspection_id, resposta)
select i.id, r from public.inspections i, unnest(array['conforme', 'nao_conforme']) r;

-- NCs: duas de inspeção e uma manual SEM quadro.
insert into public.nonconformities (id, descricao, origem, panel_id, inspection_id, severidade)
select ('c0000000-0000-4000-a000-00000000000' || right(i.id::text, 1))::uuid, 'NC SLZ ' || i.id, 'inspecao', i.panel_id, i.id, 'alta'
  from public.inspections i;
insert into public.nonconformities (id, descricao, origem, severidade)
values ('c0000000-0000-4000-a000-000000000009', 'NC manual sem quadro (SLZ, histórico)', 'manual', 'baixa');

-- Ações: uma com panel_id, uma só com a NC, uma da NC sem quadro.
insert into public.actions (id, descricao, nonconformity_id, panel_id, status)
select ('d0000000-0000-4000-a000-00000000000' || right(n.id::text, 1))::uuid, 'Ação ' || n.id, n.id, n.panel_id, 'aberta'
  from public.nonconformities n where n.panel_id is not null;
insert into public.actions (id, descricao, nonconformity_id, status)
values ('d0000000-0000-4000-a000-000000000008', 'Ação sem panel_id (segue a NC)', 'c0000000-0000-4000-a000-000000000001', 'aberta'),
       ('d0000000-0000-4000-a000-000000000009', 'Ação da NC sem quadro', 'c0000000-0000-4000-a000-000000000009', 'aberta');

-- Ordens SAP: uma vinculada, uma sem quadro.
insert into public.sap_orders (id, ordem, panel_id, data_planejada, link_status)
select 'e0000000-0000-4000-a000-000000000001', '4001', p.id, date '2026-10-01', 'auto'
  from public.electrical_panels p where p.tag = 'PRT_QD_0001';
insert into public.sap_orders (id, ordem, data_planejada, link_status)
values ('e0000000-0000-4000-a000-000000000002', '4002', date '2026-10-05', 'sem_correspondencia');

-- Flag e históricos.
insert into public.analysis_flags (tipo, severidade, panel_id, inspection_id)
select 'teste', 'critica', i.panel_id, i.id from public.inspections i;
insert into public.panel_condition_history (panel_id) select p.id from public.electrical_panels p where p.tag = 'PRT_QD_0001';
insert into public.panel_location_history (panel_id) select p.id from public.electrical_panels p where p.tag = 'PRT_QD_0001';
