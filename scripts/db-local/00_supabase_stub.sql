-- ============================================================================
-- Esqueleto mínimo do Supabase para um Postgres LOCAL e DESCARTÁVEL
-- ============================================================================
-- Usado só por scripts/db-local/run.sh para reconstruir o schema a partir
-- das migrations do repositório e rodar os testes de RLS. NUNCA rodar no
-- Supabase (lá estes objetos já existem e são gerenciados pela plataforma).
--
-- Reproduz o que importa para RLS:
--   * papéis anon / authenticated / service_role (nologin), como no Supabase;
--   * auth.users, auth.uid(), auth.role(), auth.jwt() lendo
--     request.jwt.claims (mesmo mecanismo do PostgREST);
--   * privilégios padrão do Supabase: anon e authenticated recebem todos os
--     privilégios de tabela no schema public (quem protege é a RLS) e
--     EXECUTE em funções (PUBLIC);
--   * storage.buckets / storage.objects (stub) para as migrations que criam
--     bucket e policies de Storage.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  ), '')::uuid
$$;

create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claim.role', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )
$$;

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  owner_id text,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;

grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

-- Privilégios padrão do Supabase no schema public.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- supabase/schema.sql usa public.current_role() numa policy (linha 30) antes
-- de defini-la (linha 58) — em produção o arquivo foi executado em partes.
-- Versão provisória (plpgsql: corpo não é validado agora), substituída pela
-- definição real do próprio schema.sql e depois pela da 0006.
create or replace function public.current_role() returns text language plpgsql stable as $$
begin
  return null;
end;
$$;
