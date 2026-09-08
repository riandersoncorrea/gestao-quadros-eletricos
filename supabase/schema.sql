-- Gestão de Quadros Elétricos — schema Supabase
-- Rode este script inteiro no SQL Editor do seu projeto Supabase (uma vez).

create extension if not exists pgcrypto;

-- =========================================================================
-- profiles (role de cada usuário: admin / editor / viewer)
-- =========================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- Cria automaticamente um profile (role 'viewer') a cada novo usuário do Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper usado nas políticas de RLS abaixo.
create or replace function public.current_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- =========================================================================
-- electrical_panels
-- =========================================================================

create table if not exists public.electrical_panels (
  id uuid primary key default gen_random_uuid(),
  tag text unique,
  name text not null,
  site text not null check (site in ('porto', 'pelotizacao', 'oficina')),
  installation_location text,
  location_floor text,
  location_room text,
  panel_type text check (panel_type in ('QDL', 'QDF', 'QDC', 'QGBT', 'QTA', 'QF', 'outro')),
  panel_type_custom text,
  voltage_nominal text,
  current_nominal text,
  main_breaker_type text,
  main_breaker_capacity text,
  main_breaker_brand text,
  phases text check (phases in ('monofasico', 'bifasico', 'trifasico')),
  circuit_count integer,
  has_dr boolean not null default false,
  has_dps boolean not null default false,
  has_grounding boolean not null default false,
  diagram_status text not null default 'inexistente' check (diagram_status in ('atualizado', 'desatualizado', 'inexistente')),
  diagram_url text,
  photo_url text,
  installation_date date,
  last_inspection_date date,
  next_inspection_date date,
  inspection_frequency text check (inspection_frequency in ('mensal', 'trimestral', 'semestral', 'anual')),
  latitude double precision,
  longitude double precision,
  status text not null default 'ativo' check (status in ('ativo', 'inativo', 'manutencao')),
  responsible_engineer text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_electrical_panels_site on public.electrical_panels(site);
create index if not exists idx_electrical_panels_status on public.electrical_panels(status);

alter table public.electrical_panels enable row level security;

create policy "Authenticated users can view panels"
  on public.electrical_panels for select
  to authenticated
  using (true);

create policy "Editors and admins can insert panels"
  on public.electrical_panels for insert
  to authenticated
  with check (public.current_role() in ('admin', 'editor'));

create policy "Editors and admins can update panels"
  on public.electrical_panels for update
  to authenticated
  using (public.current_role() in ('admin', 'editor'))
  with check (public.current_role() in ('admin', 'editor'));

create policy "Admins can delete panels"
  on public.electrical_panels for delete
  to authenticated
  using (public.current_role() = 'admin');

-- Geração automática da Tag (ex: POR_QUADRO_0001) com base no Site, feita no
-- banco para evitar a condição de corrida do cálculo "maior número + 1" no
-- cliente quando dois usuários cadastram ao mesmo tempo.
create sequence if not exists panel_tag_seq_porto;
create sequence if not exists panel_tag_seq_pelotizacao;
create sequence if not exists panel_tag_seq_oficina;

create or replace function public.next_panel_tag(p_site text)
returns text
language plpgsql
as $$
declare
  v_prefix text;
  v_next bigint;
begin
  case p_site
    when 'porto' then
      v_prefix := 'POR';
      v_next := nextval('panel_tag_seq_porto');
    when 'pelotizacao' then
      v_prefix := 'PEL';
      v_next := nextval('panel_tag_seq_pelotizacao');
    when 'oficina' then
      v_prefix := 'OFC';
      v_next := nextval('panel_tag_seq_oficina');
    else
      raise exception 'Site desconhecido: %', p_site;
  end case;
  return v_prefix || '_QUADRO_' || lpad(v_next::text, 4, '0');
end;
$$;

create or replace function public.set_panel_tag()
returns trigger
language plpgsql
as $$
begin
  if new.tag is null then
    new.tag := public.next_panel_tag(new.site);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_panel_tag on public.electrical_panels;
create trigger trg_set_panel_tag
  before insert on public.electrical_panels
  for each row execute function public.set_panel_tag();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_electrical_panels_updated_at on public.electrical_panels;
create trigger trg_electrical_panels_updated_at
  before update on public.electrical_panels
  for each row execute function public.set_updated_at();

-- =========================================================================
-- inspections
-- =========================================================================

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  panel_id uuid not null references public.electrical_panels(id) on delete cascade,
  panel_name text,
  inspection_date date not null,
  inspector_name text not null,
  frequency text check (frequency in ('mensal', 'trimestral', 'semestral', 'anual')),
  next_inspection date,
  overall_result text not null check (overall_result in ('aprovado', 'aprovado_ressalvas', 'reprovado')),
  estado_geral_involucro text check (estado_geral_involucro in ('ok', 'nao_conforme', 'nao_aplicavel')),
  fechamento_portas_selos text check (fechamento_portas_selos in ('ok', 'nao_conforme', 'nao_aplicavel')),
  limpeza_interna_externa text check (limpeza_interna_externa in ('ok', 'nao_conforme', 'nao_aplicavel')),
  ausencia_umidade_poeira text check (ausencia_umidade_poeira in ('ok', 'nao_conforme', 'nao_aplicavel')),
  identificacao_circuitos text check (identificacao_circuitos in ('ok', 'nao_conforme', 'nao_aplicavel')),
  conexoes_superaquecimento text check (conexoes_superaquecimento in ('ok', 'nao_conforme', 'nao_aplicavel')),
  dispositivos_dr_dps text check (dispositivos_dr_dps in ('ok', 'nao_conforme', 'nao_aplicavel')),
  fiacao_cabos text check (fiacao_cabos in ('ok', 'nao_conforme', 'nao_aplicavel')),
  sinalizacao_seguranca text check (sinalizacao_seguranca in ('ok', 'nao_conforme', 'nao_aplicavel')),
  termografia_realizada boolean not null default false,
  termografia_resultado text check (termografia_resultado in ('normal', 'pontos_quentes', 'nao_realizada')),
  diagrama_atualizado text check (diagrama_atualizado in ('sim', 'nao', 'nao_aplicavel')),
  observacoes text,
  photo_url text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_inspections_panel_id on public.inspections(panel_id);
create index if not exists idx_inspections_inspection_date on public.inspections(inspection_date);

alter table public.inspections enable row level security;

create policy "Authenticated users can view inspections"
  on public.inspections for select
  to authenticated
  using (true);

create policy "Editors and admins can insert inspections"
  on public.inspections for insert
  to authenticated
  with check (public.current_role() in ('admin', 'editor'));

create policy "Editors and admins can update inspections"
  on public.inspections for update
  to authenticated
  using (public.current_role() in ('admin', 'editor'))
  with check (public.current_role() in ('admin', 'editor'));

create policy "Admins can delete inspections"
  on public.inspections for delete
  to authenticated
  using (public.current_role() = 'admin');

-- =========================================================================
-- Storage (fotos de quadros/inspeções e diagramas unifilares)
-- =========================================================================

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

-- No SELECT policy on storage.objects: the bucket is public, so Supabase
-- serves object URLs directly without checking RLS. A public SELECT policy
-- here would additionally let anyone list every file in the bucket via the
-- API (not just fetch a URL they already have), which Supabase itself flags
-- as a risk — so it's intentionally omitted.

create policy "Authenticated users can upload files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'uploads');

create policy "Authenticated users can update their uploads"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'uploads');

create policy "Authenticated users can delete uploads"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'uploads');
