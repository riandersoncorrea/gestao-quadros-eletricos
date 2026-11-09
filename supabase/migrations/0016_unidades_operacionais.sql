-- ============================================================================
-- Unidades operacionais (São Luís, EFC)
-- ============================================================================
-- *** JÁ APLICADA EM PRODUÇÃO EM 2026-10-01 — NÃO PRECISA SER EXECUTADA ***
--
-- Arquivo RECONSTITUÍDO em 2026-11-08 a partir do catálogo do banco de
-- produção (information_schema / pg_constraint / pg_policies / pg_trigger /
-- pg_indexes). O original foi escrito na branch feature/efc-minimo
-- (commit e88707c), que foi removida sem merge — por isso o número 0016
-- faltava no repositório.
--
-- As migrations deste projeto são aplicadas manualmente pelo SQL Editor
-- (não há Supabase CLI nem tabela de controle sendo usada); este arquivo
-- existe para o repositório voltar a descrever o banco real e para
-- reconstruir um ambiente do zero.
--
-- Idempotente e sem efeito no banco de produção: cada objeto só é criado se
-- ainda não existir — nada é recriado, alterado ou removido, e os ids SLZ /
-- EFC existentes são mantidos.
--
-- Estado reconstituído:
--   * public.unidades_operacionais (id, codigo, nome, ativo, created_at,
--     updated_at) — codigo único e no formato ^[A-Z0-9_]{2,20}$, nome único;
--   * registros SLZ (São Luís) e EFC (EFC);
--   * RLS: autenticados leem; admin gerencia;
--   * triggers trg_audit e trg_unidades_operacionais_updated_at;
--   * electrical_panels.unidade_operacional_id uuid NOT NULL, default = id
--     da SLZ, FK ON DELETE RESTRICT, índice idx_panels_unidade_operacional.
-- ============================================================================

begin;

create table if not exists public.unidades_operacionais (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^[A-Z0-9_]{2,20}$'),
  nome text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.unidades_operacionais (codigo, nome) values
  ('SLZ', 'São Luís'),
  ('EFC', 'EFC')
on conflict (codigo) do nothing;

alter table public.unidades_operacionais enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'unidades_operacionais'
                   and policyname = 'Autenticados leem unidades operacionais') then
    create policy "Autenticados leem unidades operacionais" on public.unidades_operacionais
      for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'unidades_operacionais'
                   and policyname = 'Admins gerenciam unidades operacionais') then
    create policy "Admins gerenciam unidades operacionais" on public.unidades_operacionais
      for all to authenticated
      using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
  end if;

  if not exists (select 1 from pg_trigger where tgrelid = 'public.unidades_operacionais'::regclass
                   and tgname = 'trg_unidades_operacionais_updated_at') then
    create trigger trg_unidades_operacionais_updated_at before update on public.unidades_operacionais
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.unidades_operacionais'::regclass
                   and tgname = 'trg_audit') then
    create trigger trg_audit after insert or update or delete on public.unidades_operacionais
      for each row execute function public.audit_trigger();
  end if;
end $$;

-- Quadro -> unidade. Default = SLZ: todo cadastro existente/atual continua
-- sendo de São Luís sem nenhuma mudança no app.
do $$
declare v_slz uuid;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                   and table_name = 'electrical_panels' and column_name = 'unidade_operacional_id') then
    select id into v_slz from public.unidades_operacionais where codigo = 'SLZ';
    execute format(
      'alter table public.electrical_panels add column unidade_operacional_id uuid not null default %L::uuid '
      'references public.unidades_operacionais(id) on delete restrict', v_slz);
  end if;
end $$;

create index if not exists idx_panels_unidade_operacional on public.electrical_panels(unidade_operacional_id);

commit;
