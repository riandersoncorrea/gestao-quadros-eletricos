-- ============================================================================
-- Gestão da Integridade de Quadros Elétricos BT
-- FASE 0 — Modelo de dados (evolução aditiva sobre o schema atual)
-- ============================================================================
-- Preserva TODOS os dados existentes: nenhum DROP de tabela/coluna, nenhum
-- UPDATE destrutivo. Idempotente — pode rodar mais de uma vez sem efeito extra.
--
-- COMO VALIDAR SEM APLICAR (rode isto no SQL Editor do Supabase):
--     begin;
--       \i este_arquivo   -- ou cole o conteúdo inteiro
--     rollback;
-- O Postgres executa tudo, acusa qualquer erro e desfaz sem deixar rastro
-- (DDL é transacional). Só rode sem o begin/rollback quando aprovado.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 0. HELPERS COMPARTILHADOS
-- ============================================================================

-- public.set_updated_at() e public.current_role() já existem (schema.sql) e são
-- reaproveitados abaixo.

-- --- Auditoria genérica: 1 linha por campo alterado (seção 38) -----------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id uuid,
  acao text not null check (acao in ('insert', 'update', 'delete')),
  campo text,
  valor_anterior text,
  valor_novo text,
  usuario_id uuid,
  usuario_email text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_log_registro on public.audit_log(tabela, registro_id);
create index if not exists idx_audit_log_created on public.audit_log(created_at desc);

alter table public.audit_log enable row level security;
drop policy if exists "Admins leem auditoria" on public.audit_log;
create policy "Admins leem auditoria"
  on public.audit_log for select to authenticated
  using (public.current_role() = 'admin');
-- Sem policy de escrita: gravado apenas pelos triggers (security definer).

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text;
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_rid uuid;
  v_ignore text[] := array['updated_at', 'health_index_updated_at'];
begin
  select email into v_email from public.profiles where id = auth.uid();

  if (tg_op = 'DELETE') then
    insert into public.audit_log(tabela, registro_id, acao, usuario_id, usuario_email)
    values (tg_table_name, (to_jsonb(old) ->> 'id')::uuid, 'delete', auth.uid(), v_email);
    return old;

  elsif (tg_op = 'INSERT') then
    insert into public.audit_log(tabela, registro_id, acao, usuario_id, usuario_email)
    values (tg_table_name, (to_jsonb(new) ->> 'id')::uuid, 'insert', auth.uid(), v_email);
    return new;

  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_rid := (v_new ->> 'id')::uuid;
    for v_key in select jsonb_object_keys(v_new) loop
      if not (v_key = any(v_ignore))
         and (v_old ->> v_key) is distinct from (v_new ->> v_key) then
        insert into public.audit_log
          (tabela, registro_id, acao, campo, valor_anterior, valor_novo, usuario_id, usuario_email)
        values
          (tg_table_name, v_rid, 'update', v_key, v_old ->> v_key, v_new ->> v_key, auth.uid(), v_email);
      end if;
    end loop;
    return new;
  end if;
end;
$$;

-- ============================================================================
-- 1. HIERARQUIA DE LOCALIZAÇÃO (seções 4, 5, 41)
--    Estrutura criada aqui; DADOS entram na Fase 1 a partir do arquivo oficial.
-- ============================================================================

create table if not exists public.localidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.locais (
  id uuid primary key default gen_random_uuid(),
  localidade_id uuid not null references public.localidades(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now(),
  unique (localidade_id, nome)
);
create index if not exists idx_locais_localidade on public.locais(localidade_id);

create table if not exists public.sublocais (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locais(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now(),
  unique (local_id, nome)
);
create index if not exists idx_sublocais_local on public.sublocais(local_id);

alter table public.localidades enable row level security;
alter table public.locais enable row level security;
alter table public.sublocais enable row level security;

drop policy if exists "Autenticados leem localidades" on public.localidades;
create policy "Autenticados leem localidades" on public.localidades
  for select to authenticated using (true);
drop policy if exists "Admins gerenciam localidades" on public.localidades;
create policy "Admins gerenciam localidades" on public.localidades
  for all to authenticated
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

drop policy if exists "Autenticados leem locais" on public.locais;
create policy "Autenticados leem locais" on public.locais
  for select to authenticated using (true);
drop policy if exists "Admins gerenciam locais" on public.locais;
create policy "Admins gerenciam locais" on public.locais
  for all to authenticated
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

drop policy if exists "Autenticados leem sublocais" on public.sublocais;
create policy "Autenticados leem sublocais" on public.sublocais
  for select to authenticated using (true);
drop policy if exists "Admins gerenciam sublocais" on public.sublocais;
create policy "Admins gerenciam sublocais" on public.sublocais
  for all to authenticated
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- ============================================================================
-- 2. INVENTÁRIO MESTRE — EXPANSÃO (seções 6, 7)
--    Colunas novas, todas anuláveis: registros atuais continuam válidos.
-- ============================================================================

alter table public.electrical_panels
  add column if not exists nomenclatura_oficial text,
  add column if not exists criticality text check (criticality in ('A', 'B', 'C', 'D')),
  add column if not exists manufacturer text,
  add column if not exists model text,
  add column if not exists serial_number text,
  add column if not exists frequency_hz text,
  add column if not exists power_supply text,
  add column if not exists coordinate text,
  add column if not exists localidade_id uuid references public.localidades(id) on delete set null,
  add column if not exists local_id uuid references public.locais(id) on delete set null,
  add column if not exists sublocal_id uuid references public.sublocais(id) on delete set null,
  add column if not exists health_index numeric check (health_index >= 0 and health_index <= 100),
  add column if not exists health_index_updated_at timestamptz;

create index if not exists idx_panels_localidade on public.electrical_panels(localidade_id);
create index if not exists idx_panels_local on public.electrical_panels(local_id);
create index if not exists idx_panels_sublocal on public.electrical_panels(sublocal_id);
create index if not exists idx_panels_criticality on public.electrical_panels(criticality);
create index if not exists idx_panels_health on public.electrical_panels(health_index);

-- ============================================================================
-- 3. HISTÓRICO DE LOCALIZAÇÃO E DE CONDIÇÃO (seções 33, 34)
-- ============================================================================

create table if not exists public.panel_location_history (
  id uuid primary key default gen_random_uuid(),
  panel_id uuid not null references public.electrical_panels(id) on delete cascade,
  latitude double precision,
  longitude double precision,
  coordinate text,
  localidade_id uuid references public.localidades(id) on delete set null,
  local_id uuid references public.locais(id) on delete set null,
  sublocal_id uuid references public.sublocais(id) on delete set null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  nota text
);
create index if not exists idx_loc_hist_panel on public.panel_location_history(panel_id, changed_at desc);

alter table public.panel_location_history enable row level security;
drop policy if exists "Autenticados leem histórico de localização" on public.panel_location_history;
create policy "Autenticados leem histórico de localização" on public.panel_location_history
  for select to authenticated using (true);
-- Escrita apenas via trigger (security definer).

create or replace function public.track_panel_location()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (new.latitude is distinct from old.latitude)
     or (new.longitude is distinct from old.longitude)
     or (new.coordinate is distinct from old.coordinate)
     or (new.localidade_id is distinct from old.localidade_id)
     or (new.local_id is distinct from old.local_id)
     or (new.sublocal_id is distinct from old.sublocal_id) then
    insert into public.panel_location_history
      (panel_id, latitude, longitude, coordinate, localidade_id, local_id, sublocal_id, changed_by)
    values
      (old.id, old.latitude, old.longitude, old.coordinate,
       old.localidade_id, old.local_id, old.sublocal_id, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_track_panel_location on public.electrical_panels;
create trigger trg_track_panel_location
  before update on public.electrical_panels
  for each row execute function public.track_panel_location();

create table if not exists public.panel_condition_history (
  id uuid primary key default gen_random_uuid(),
  panel_id uuid not null references public.electrical_panels(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  health_index numeric,
  status text,
  criticality text,
  nc_abertas integer not null default 0,
  nc_criticas integer not null default 0,
  nc_altas integer not null default 0,
  acoes_abertas integer not null default 0,
  acoes_atrasadas integer not null default 0,
  latitude double precision,
  longitude double precision,
  localidade_id uuid references public.localidades(id) on delete set null,
  source text check (source in ('inspecao_validada', 'recalculo', 'manual', 'importacao'))
);
create index if not exists idx_cond_hist_panel on public.panel_condition_history(panel_id, snapshot_at desc);

alter table public.panel_condition_history enable row level security;
drop policy if exists "Autenticados leem histórico de condição" on public.panel_condition_history;
create policy "Autenticados leem histórico de condição" on public.panel_condition_history
  for select to authenticated using (true);
drop policy if exists "Editores gravam histórico de condição" on public.panel_condition_history;
create policy "Editores gravam histórico de condição" on public.panel_condition_history
  for insert to authenticated with check (public.current_role() in ('admin', 'editor'));

-- ============================================================================
-- 4. IMPORTAÇÃO DO PLANO SAP (seções 2, 8, 9, 10)
-- ============================================================================

create table if not exists public.sap_import_batches (
  id uuid primary key default gen_random_uuid(),
  filename text,
  column_mapping jsonb,
  total_rows integer not null default 0,
  new_count integer not null default 0,
  existing_count integer not null default 0,
  unlinked_count integer not null default 0,
  error_count integer not null default 0,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'validado', 'importado', 'cancelado')),
  notes text,
  imported_by uuid references auth.users(id),
  imported_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sap_orders (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.sap_import_batches(id) on delete set null,
  ordem text,
  nota text,
  plano text,
  item text,
  tag text,
  equipamento text,
  local_texto text,
  data_planejada date,
  frequencia text,
  centro_trabalho text,
  sap_status text,
  raw_row jsonb,
  panel_id uuid references public.electrical_panels(id) on delete set null,
  link_status text not null default 'pendente'
    check (link_status in ('auto', 'manual', 'pendente', 'sem_correspondencia')),
  linked_by uuid references auth.users(id),
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_sap_orders_batch on public.sap_orders(batch_id);
create index if not exists idx_sap_orders_panel on public.sap_orders(panel_id);
create index if not exists idx_sap_orders_tag on public.sap_orders(tag);
create index if not exists idx_sap_orders_link on public.sap_orders(link_status);
create index if not exists idx_sap_orders_data on public.sap_orders(data_planejada);
create unique index if not exists uq_sap_orders_ordem_item
  on public.sap_orders(ordem, item) where ordem is not null;

drop trigger if exists trg_sap_orders_updated on public.sap_orders;
create trigger trg_sap_orders_updated before update on public.sap_orders
  for each row execute function public.set_updated_at();

alter table public.sap_import_batches enable row level security;
alter table public.sap_orders enable row level security;

drop policy if exists "Autenticados leem lotes SAP" on public.sap_import_batches;
create policy "Autenticados leem lotes SAP" on public.sap_import_batches
  for select to authenticated using (true);
drop policy if exists "Editores gerenciam lotes SAP" on public.sap_import_batches;
create policy "Editores gerenciam lotes SAP" on public.sap_import_batches
  for all to authenticated
  using (public.current_role() in ('admin', 'editor'))
  with check (public.current_role() in ('admin', 'editor'));

drop policy if exists "Autenticados leem ordens SAP" on public.sap_orders;
create policy "Autenticados leem ordens SAP" on public.sap_orders
  for select to authenticated using (true);
drop policy if exists "Editores gerenciam ordens SAP" on public.sap_orders;
create policy "Editores gerenciam ordens SAP" on public.sap_orders
  for all to authenticated
  using (public.current_role() in ('admin', 'editor'))
  with check (public.current_role() in ('admin', 'editor'));

-- ============================================================================
-- 5. CHECKLIST — TEMPLATES, ITENS, RESPOSTAS, STATUS (seções 11, 12, 13)
-- ============================================================================

create table if not exists public.inspection_templates (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  versao integer not null default 1,
  escopo text not null default 'BT',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (nome, versao)
);

create table if not exists public.inspection_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.inspection_templates(id) on delete cascade,
  modulo integer not null,
  modulo_nome text not null,
  ordem integer not null default 0,
  codigo text,
  titulo text not null,
  descricao text,
  obrigatorio boolean not null default true,
  gera_nc_automatica boolean not null default true,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_tpl_items_template
  on public.inspection_template_items(template_id, modulo, ordem);

alter table public.inspections
  add column if not exists template_id uuid references public.inspection_templates(id) on delete set null,
  add column if not exists status text not null default 'executada'
    check (status in ('planejada', 'disponivel', 'em_execucao', 'executada',
                      'aguardando_validacao', 'validada', 'devolvida', 'vencida',
                      'cancelada', 'extraordinaria')),
  add column if not exists sap_order_id uuid references public.sap_orders(id) on delete set null,
  add column if not exists panel_ref_id uuid references public.electrical_panels(id) on delete set null,
  add column if not exists semana text,
  add column if not exists health_index_resultado numeric
    check (health_index_resultado >= 0 and health_index_resultado <= 100),
  add column if not exists validated_by uuid references auth.users(id),
  add column if not exists validated_at timestamptz,
  add column if not exists devolvida_motivo text,
  add column if not exists updated_at timestamptz not null default now();

-- panel_ref_id: FK real para electrical_panels. A coluna antiga `panel_id` é
-- text (id do quadro em formato string) e continua preenchida pelo app atual;
-- a nova preenche a partir da Fase 3 para permitir joins/índices confiáveis.

drop trigger if exists trg_inspections_updated on public.inspections;
create trigger trg_inspections_updated before update on public.inspections
  for each row execute function public.set_updated_at();

create index if not exists idx_inspections_status on public.inspections(status);
create index if not exists idx_inspections_sap_order on public.inspections(sap_order_id);
create index if not exists idx_inspections_semana on public.inspections(semana);
create index if not exists idx_inspections_panel_ref on public.inspections(panel_ref_id);

create table if not exists public.inspection_responses (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  template_item_id uuid references public.inspection_template_items(id) on delete set null,
  modulo integer,
  titulo text,
  resposta text check (resposta in ('conforme', 'nao_conforme', 'nao_aplicavel', 'nao_verificado')),
  justificativa text,   -- obrigatória p/ nao_aplicavel (validado no app)
  motivo text,          -- obrigatório p/ nao_verificado (validado no app)
  observacao text,
  evidencia_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_id, template_item_id)
);
create index if not exists idx_responses_inspection on public.inspection_responses(inspection_id);

drop trigger if exists trg_responses_updated on public.inspection_responses;
create trigger trg_responses_updated before update on public.inspection_responses
  for each row execute function public.set_updated_at();

alter table public.inspection_templates enable row level security;
alter table public.inspection_template_items enable row level security;
alter table public.inspection_responses enable row level security;

drop policy if exists "Autenticados leem templates" on public.inspection_templates;
create policy "Autenticados leem templates" on public.inspection_templates
  for select to authenticated using (true);
drop policy if exists "Admins gerenciam templates" on public.inspection_templates;
create policy "Admins gerenciam templates" on public.inspection_templates
  for all to authenticated
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

drop policy if exists "Autenticados leem itens de template" on public.inspection_template_items;
create policy "Autenticados leem itens de template" on public.inspection_template_items
  for select to authenticated using (true);
drop policy if exists "Admins gerenciam itens de template" on public.inspection_template_items;
create policy "Admins gerenciam itens de template" on public.inspection_template_items
  for all to authenticated
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

drop policy if exists "Autenticados leem respostas" on public.inspection_responses;
create policy "Autenticados leem respostas" on public.inspection_responses
  for select to authenticated using (true);
drop policy if exists "Editores gerenciam respostas" on public.inspection_responses;
create policy "Editores gerenciam respostas" on public.inspection_responses
  for all to authenticated
  using (public.current_role() in ('admin', 'editor'))
  with check (public.current_role() in ('admin', 'editor'));

-- --- Seed: template padrão + módulos 1..7 e 10 -------------------------------
-- Módulos 8 (Medições), 9 (Termografia), 11 (NCs), 12 (Evidências),
-- 13 (Diagnóstico), 14 (Resultado), 15 (Validação) são etapas do processo,
-- tratadas por tabelas/telas próprias — não precisam de itens de checklist.
-- O catálogo definitivo de itens será refinado com você na Fase 3.
do $$
declare v_tpl uuid;
begin
  insert into public.inspection_templates (nome, versao, escopo, ativo)
  values ('Checklist Padrão BT', 1, 'BT', true)
  on conflict (nome, versao) do nothing;

  select id into v_tpl from public.inspection_templates
  where nome = 'Checklist Padrão BT' and versao = 1;

  if not exists (select 1 from public.inspection_template_items where template_id = v_tpl) then
    insert into public.inspection_template_items
      (template_id, modulo, modulo_nome, ordem, codigo, titulo)
    values
      (v_tpl, 1, 'Identificação', 1, 'ID-01', 'Identificação de circuitos e disjuntores clara e atualizada'),
      (v_tpl, 1, 'Identificação', 2, 'ID-02', 'Placa de identificação do quadro presente e legível'),

      (v_tpl, 2, 'Segurança', 1, 'SEG-01', 'Sinalização e placas de advertência presentes e visíveis'),
      (v_tpl, 2, 'Segurança', 2, 'SEG-02', 'Ausência de partes vivas expostas / risco de contato direto'),
      (v_tpl, 2, 'Segurança', 3, 'SEG-03', 'Grau de proteção (IP) adequado ao ambiente de instalação'),
      (v_tpl, 2, 'Segurança', 4, 'SEG-04', 'Espaço de trabalho e acesso ao quadro desobstruídos'),

      (v_tpl, 3, 'Integridade física', 1, 'INT-01', 'Integridade do invólucro (sem corrosão, amassados, furos)'),
      (v_tpl, 3, 'Integridade física', 2, 'INT-02', 'Fechamento de portas, tampas e selos'),
      (v_tpl, 3, 'Integridade física', 3, 'INT-03', 'Limpeza interna e externa'),
      (v_tpl, 3, 'Integridade física', 4, 'INT-04', 'Ausência de umidade ou poeira excessiva'),

      (v_tpl, 4, 'Proteções', 1, 'PRO-01', 'DR — teste funcional (botão de teste)'),
      (v_tpl, 4, 'Proteções', 2, 'PRO-02', 'DPS — inspeção visual (sem indicação de fim de vida / atuação)'),
      (v_tpl, 4, 'Proteções', 3, 'PRO-03', 'Disjuntor geral compatível com a instalação'),
      (v_tpl, 4, 'Proteções', 4, 'PRO-04', 'Disjuntores de circuito sem sinais de atuação térmica repetida'),

      (v_tpl, 5, 'Barramentos e conexões', 1, 'BAR-01', 'Conexões sem sinais de superaquecimento ou carbonização'),
      (v_tpl, 5, 'Barramentos e conexões', 2, 'BAR-02', 'Barramentos firmes, sem folga, oxidação ou deformação'),
      (v_tpl, 5, 'Barramentos e conexões', 3, 'BAR-03', 'Torque das conexões principais verificado'),

      (v_tpl, 6, 'Cabos e isolação', 1, 'CAB-01', 'Organização, fixação e roteamento dos cabos'),
      (v_tpl, 6, 'Cabos e isolação', 2, 'CAB-02', 'Isolação dos condutores íntegra (sem ressecamento / dano)'),
      (v_tpl, 6, 'Cabos e isolação', 3, 'CAB-03', 'Bitola dos condutores compatível com a proteção'),

      (v_tpl, 7, 'Aterramento', 1, 'ATR-01', 'Condutor de proteção (PE) presente e conectado'),
      (v_tpl, 7, 'Aterramento', 2, 'ATR-02', 'Continuidade do aterramento verificada'),
      (v_tpl, 7, 'Aterramento', 3, 'ATR-03', 'Barramento de terra identificado e íntegro'),

      (v_tpl, 10, 'Documentação', 1, 'DOC-01', 'Diagrama unifilar presente e atualizado'),
      (v_tpl, 10, 'Documentação', 2, 'DOC-02', 'Registro da última inspeção disponível');
  end if;
end $$;

-- ============================================================================
-- 6. MEDIÇÕES (seção 15)
-- ============================================================================

create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references public.inspections(id) on delete cascade,
  panel_id uuid references public.electrical_panels(id) on delete set null,
  categoria text not null
    check (categoria in ('tensao', 'corrente', 'corrente_fuga',
                         'resistencia_aterramento', 'isolacao', 'outro')),
  parametro text,
  fase text,
  valor numeric,
  unidade text not null,
  instrumento text,
  instrumento_serie text,
  instrumento_calibracao date,
  limite_min numeric,
  limite_max numeric,
  resultado text check (resultado in ('conforme', 'fora_limite', 'nao_aplicavel')),
  observacao text,
  created_at timestamptz not null default now(),
  -- Corrente de fuga em unidade de corrente, nunca em Volts (seção 15).
  constraint chk_corrente_fuga_unidade
    check (categoria <> 'corrente_fuga' or unidade in ('A', 'mA', 'µA', 'uA'))
);
create index if not exists idx_measurements_inspection on public.measurements(inspection_id);
create index if not exists idx_measurements_panel on public.measurements(panel_id);

alter table public.measurements enable row level security;
drop policy if exists "Autenticados leem medições" on public.measurements;
create policy "Autenticados leem medições" on public.measurements
  for select to authenticated using (true);
drop policy if exists "Editores gerenciam medições" on public.measurements;
create policy "Editores gerenciam medições" on public.measurements
  for all to authenticated
  using (public.current_role() in ('admin', 'editor'))
  with check (public.current_role() in ('admin', 'editor'));

-- ============================================================================
-- 7. TERMOGRAFIA (seção 16)
-- ============================================================================

create table if not exists public.thermography_points (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references public.inspections(id) on delete cascade,
  panel_id uuid references public.electrical_panels(id) on delete set null,
  equipamento text,
  ponto text,
  temperatura numeric,
  temperatura_ambiente numeric,
  delta_t numeric,
  instrumento text,
  instrumento_calibracao date,
  imagem_url text,
  imagem_termografica_url text,
  observacao text,
  diagnostico text,
  criticidade text check (criticidade in ('A', 'B', 'C', 'D')),
  created_at timestamptz not null default now()
);
create index if not exists idx_thermo_inspection on public.thermography_points(inspection_id);
create index if not exists idx_thermo_panel on public.thermography_points(panel_id);

alter table public.thermography_points enable row level security;
drop policy if exists "Autenticados leem termografia" on public.thermography_points;
create policy "Autenticados leem termografia" on public.thermography_points
  for select to authenticated using (true);
drop policy if exists "Editores gerenciam termografia" on public.thermography_points;
create policy "Editores gerenciam termografia" on public.thermography_points
  for all to authenticated
  using (public.current_role() in ('admin', 'editor'))
  with check (public.current_role() in ('admin', 'editor'));

-- ============================================================================
-- 8. NÃO CONFORMIDADES (seção 17)
-- ============================================================================

create table if not exists public.nonconformities (
  id uuid primary key default gen_random_uuid(),
  panel_id uuid references public.electrical_panels(id) on delete set null,
  tag text,
  inspection_id uuid references public.inspections(id) on delete set null,
  sap_order_id uuid references public.sap_orders(id) on delete set null,
  template_item_id uuid references public.inspection_template_items(id) on delete set null,
  categoria text,
  descricao text not null,
  evidencia_url text,
  severidade text not null default 'media'
    check (severidade in ('baixa', 'media', 'alta', 'critica')),
  criticidade text check (criticidade in ('A', 'B', 'C', 'D')),
  recomendacao text,
  status text not null default 'aberta'
    check (status in ('aberta', 'em_tratamento', 'concluida', 'cancelada')),
  origem text not null default 'inspecao'
    check (origem in ('inspecao', 'termografia', 'medicao', 'manual')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_nc_panel on public.nonconformities(panel_id);
create index if not exists idx_nc_inspection on public.nonconformities(inspection_id);
create index if not exists idx_nc_status on public.nonconformities(status);
create index if not exists idx_nc_severidade on public.nonconformities(severidade);
create index if not exists idx_nc_categoria on public.nonconformities(categoria);

drop trigger if exists trg_nc_updated on public.nonconformities;
create trigger trg_nc_updated before update on public.nonconformities
  for each row execute function public.set_updated_at();

alter table public.nonconformities enable row level security;
drop policy if exists "Autenticados leem NCs" on public.nonconformities;
create policy "Autenticados leem NCs" on public.nonconformities
  for select to authenticated using (true);
drop policy if exists "Editores gerenciam NCs" on public.nonconformities;
create policy "Editores gerenciam NCs" on public.nonconformities
  for all to authenticated
  using (public.current_role() in ('admin', 'editor'))
  with check (public.current_role() in ('admin', 'editor'));

-- ============================================================================
-- 9. AÇÕES (seções 13, 17)
-- ============================================================================

create table if not exists public.actions (
  id uuid primary key default gen_random_uuid(),
  nonconformity_id uuid references public.nonconformities(id) on delete cascade,
  panel_id uuid references public.electrical_panels(id) on delete set null,
  descricao text not null,
  responsavel text,
  prazo date,
  status text not null default 'aberta'
    check (status in ('aberta', 'em_andamento', 'concluida', 'cancelada')),
  concluida_em date,
  evidencia_url text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_actions_nc on public.actions(nonconformity_id);
create index if not exists idx_actions_panel on public.actions(panel_id);
create index if not exists idx_actions_status on public.actions(status);
create index if not exists idx_actions_prazo on public.actions(prazo);

drop trigger if exists trg_actions_updated on public.actions;
create trigger trg_actions_updated before update on public.actions
  for each row execute function public.set_updated_at();

alter table public.actions enable row level security;
drop policy if exists "Autenticados leem ações" on public.actions;
create policy "Autenticados leem ações" on public.actions
  for select to authenticated using (true);
drop policy if exists "Editores gerenciam ações" on public.actions;
create policy "Editores gerenciam ações" on public.actions
  for all to authenticated
  using (public.current_role() in ('admin', 'editor'))
  with check (public.current_role() in ('admin', 'editor'));

-- "Atrasada" é derivado (não armazenado): status em aberto e prazo vencido.
create or replace view public.v_actions as
  select a.*,
    (a.status in ('aberta', 'em_andamento')
      and a.prazo is not null
      and a.prazo < current_date) as atrasada
  from public.actions a;
alter view public.v_actions set (security_invoker = on);

-- ============================================================================
-- 10. MOTOR DE ANÁLISE — flags persistidas (seção 14)
--     As regras (DR NC -> alerta, carbonização -> crítico, etc.) ficam na
--     lógica do app (Fase 4). Esta tabela guarda o resultado da análise.
-- ============================================================================

create table if not exists public.analysis_flags (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references public.inspections(id) on delete cascade,
  panel_id uuid references public.electrical_panels(id) on delete set null,
  tipo text not null,
  categoria text,
  severidade text check (severidade in ('info', 'baixa', 'media', 'alta', 'critica')),
  mensagem text,
  resolvido boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_flags_panel on public.analysis_flags(panel_id);
create index if not exists idx_flags_inspection on public.analysis_flags(inspection_id);

alter table public.analysis_flags enable row level security;
drop policy if exists "Autenticados leem flags" on public.analysis_flags;
create policy "Autenticados leem flags" on public.analysis_flags
  for select to authenticated using (true);
drop policy if exists "Editores gerenciam flags" on public.analysis_flags;
create policy "Editores gerenciam flags" on public.analysis_flags
  for all to authenticated
  using (public.current_role() in ('admin', 'editor'))
  with check (public.current_role() in ('admin', 'editor'));

-- ============================================================================
-- 11. HEALTH INDEX — pesos configuráveis (seção 18)
-- ============================================================================

create table if not exists public.health_index_config (
  id uuid primary key default gen_random_uuid(),
  dimensao text not null unique,
  rotulo text not null,
  peso numeric not null check (peso >= 0 and peso <= 100),
  ordem integer not null default 0,
  ativo boolean not null default true,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.health_index_config (dimensao, rotulo, peso, ordem) values
  ('seguranca',           'Segurança',                20, 1),
  ('integridade_fisica',  'Integridade física',       15, 2),
  ('conexoes_barramentos','Conexões / barramentos',   15, 3),
  ('protecoes',           'Proteções',                15, 4),
  ('aterramento',         'Aterramento',              10, 5),
  ('medicoes',            'Medições',                 10, 6),
  ('termografia',         'Termografia',              10, 7),
  ('documentacao',        'Documentação',              5, 8)
on conflict (dimensao) do nothing;

drop trigger if exists trg_hi_config_updated on public.health_index_config;
create trigger trg_hi_config_updated before update on public.health_index_config
  for each row execute function public.set_updated_at();

alter table public.health_index_config enable row level security;
drop policy if exists "Autenticados leem pesos do Health Index" on public.health_index_config;
create policy "Autenticados leem pesos do Health Index" on public.health_index_config
  for select to authenticated using (true);
drop policy if exists "Admins configuram Health Index" on public.health_index_config;
create policy "Admins configuram Health Index" on public.health_index_config
  for all to authenticated
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- ============================================================================
-- 12. AUDITORIA — anexar o trigger genérico às tabelas relevantes (seção 38)
-- ============================================================================

drop trigger if exists trg_audit on public.electrical_panels;
create trigger trg_audit after insert or update or delete on public.electrical_panels
  for each row execute function public.audit_trigger();

drop trigger if exists trg_audit on public.localidades;
create trigger trg_audit after insert or update or delete on public.localidades
  for each row execute function public.audit_trigger();

drop trigger if exists trg_audit on public.locais;
create trigger trg_audit after insert or update or delete on public.locais
  for each row execute function public.audit_trigger();

drop trigger if exists trg_audit on public.sublocais;
create trigger trg_audit after insert or update or delete on public.sublocais
  for each row execute function public.audit_trigger();

drop trigger if exists trg_audit on public.sap_import_batches;
create trigger trg_audit after insert or update or delete on public.sap_import_batches
  for each row execute function public.audit_trigger();

drop trigger if exists trg_audit on public.sap_orders;
create trigger trg_audit after insert or update or delete on public.sap_orders
  for each row execute function public.audit_trigger();

drop trigger if exists trg_audit on public.inspections;
create trigger trg_audit after insert or update or delete on public.inspections
  for each row execute function public.audit_trigger();

drop trigger if exists trg_audit on public.inspection_responses;
create trigger trg_audit after insert or update or delete on public.inspection_responses
  for each row execute function public.audit_trigger();

drop trigger if exists trg_audit on public.nonconformities;
create trigger trg_audit after insert or update or delete on public.nonconformities
  for each row execute function public.audit_trigger();

drop trigger if exists trg_audit on public.actions;
create trigger trg_audit after insert or update or delete on public.actions
  for each row execute function public.audit_trigger();

drop trigger if exists trg_audit on public.health_index_config;
create trigger trg_audit after insert or update or delete on public.health_index_config
  for each row execute function public.audit_trigger();

drop trigger if exists trg_audit on public.profiles;
create trigger trg_audit after insert or update or delete on public.profiles
  for each row execute function public.audit_trigger();

-- ============================================================================
-- FIM DA FASE 0
-- Armazenamento de evidências/imagens: continua no bucket `uploads` (público,
-- nomes por UUID) já existente — sem mudança de schema necessária.
-- ============================================================================
