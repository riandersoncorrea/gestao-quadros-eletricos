-- ============================================================================
-- 0029 — Segurança por unidade operacional (RLS) + aprovação obrigatória
-- ============================================================================
-- Ordem: 0028 -> 0029 -> 0030 (QR público) -> deploy do frontend -> validação
-- -> 0031 (importação da EFC). A 0031 se recusa a rodar sem esta migration.
--
-- PROBLEMA (diagnóstico 2026-11-08):
--   * As policies de SELECT usam `using (true)` para qualquer autenticado —
--     inclusive contas NÃO aprovadas (cadastro aberto, sem confirmação de
--     e-mail): qualquer conta recém-criada lê todos os dados pela API.
--   * Nenhuma policy considera a unidade: o isolamento São Luís / EFC era só
--     de interface. A escrita também não (um editor gravaria na EFC pela API).
--   * Registros filhos (inspeções, NCs, ações...) não têm unidade própria:
--     NC/ação de quadro excluído (panel_id -> null) ficava "sem unidade".
--
-- ABORDAGEM — aditiva, sem tocar nas regras de perfil existentes:
--   As policies atuais (admin/editor/viewer/inspetor, triggers 0020/0025/
--   0026, e a 0027 da outra branch) continuam EXATAMENTE como estão. Esta
--   migration acrescenta policies RESTRITIVAS (AS RESTRICTIVE), que o
--   Postgres combina com AND: para ler/gravar é preciso passar na regra de
--   perfil de hoje E na regra de unidade/aprovação. Nenhuma policy existente
--   é removida ou alterada.
--
-- MODELO DE ACESSO:
--   * profiles.acesso_todas_unidades (boolean): acesso a todas as unidades.
--     Administrador geral = role 'admin' + acesso_todas_unidades.
--     Backfill: todo admin existente vira administrador geral (comportamento
--     de hoje preservado).
--   * public.profile_unidades (profile_id, unidade_operacional_id): unidades
--     autorizadas de cada usuário. Backfill: todo usuário APROVADO não-admin
--     recebe São Luís (é o acesso que ele tem hoje). Contas pendentes não
--     recebem nada: ao aprovar, o administrador geral atribui a(s) unidade(s).
--     Administrador local = role 'admin' sem acesso_todas_unidades, com
--     unidades em profile_unidades.
--   * Só administrador geral concede unidades, acesso global ou o perfil
--     admin (trigger em profiles + RLS de profile_unidades). Ninguém escolhe
--     a própria unidade.
--   * unidades_operacionais.permite_escrita: unidade somente leitura no banco
--     (a EFC fica false nesta etapa — configuração, não regra de código).
--
-- REGISTROS FILHOS: coluna unidade_operacional_id em inspections,
--   inspection_responses, measurements, thermography_points, nonconformities,
--   actions, analysis_flags, panel_condition_history, panel_location_history,
--   sap_orders, panel_attachments. Preenchida pelo trigger
--   trg_herdar_unidade (quadro -> registro pai). Sem quadro e sem pai, fica
--   com a unidade informada explicitamente ou NULL — NUNCA São Luís por
--   padrão. Linha com unidade NULL só é visível/gravável pelo administrador
--   geral (pendente de classificação). Quando o quadro é excluído
--   (panel_id -> null), a unidade já gravada é mantida.
--   Backfill: deriva a unidade do quadro/pai com os triggers de usuário
--   DESLIGADOS durante o UPDATE (não muda updated_at, não gera auditoria nem
--   dispara as regras de status de NC/ação). O que não tiver quadro nem pai
--   continua NULL e é listado no NOTICE final — classificar manualmente.
--
-- O QUE MUDA PARA SÃO LUÍS: nada nas telas para usuários aprovados (todos
--   recebem SLZ; admins viram gerais). Únicas mudanças em linhas existentes:
--   preenchimento da coluna nova unidade_operacional_id nos registros
--   filhos, acesso_todas_unidades = true nos admins, linhas novas em
--   profile_unidades e permite_escrita = false na EFC.
--   Mudança de comportamento intencional: conta NÃO aprovada deixa de ler
--   dados; conta aprovada sem unidade não vê dados até receber uma.
--
-- SECURITY DEFINER: só as funções de leitura do acesso do próprio usuário
--   (minhas_unidades, minhas_unidades_gravaveis, is_approved,
--   is_global_admin) e a cascata de unidade do quadro; todas com
--   search_path = '' e nomes qualificados; EXECUTE revogado de PUBLIC/anon.
--
-- Testes: supabase/tests/0029_seguranca_por_unidade.test.sql (BEGIN/ROLLBACK)
-- ROLLBACK: supabase/rollback/0029_seguranca_por_unidade.rollback.sql
-- ============================================================================

begin;

-- --- 0. Pré-requisitos ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                   and table_name = 'localidades' and column_name = 'unidade_operacional_id') then
    raise exception 'Aplique a 0028 antes da 0029';
  end if;
end $$;

-- --- 1. Configuração das unidades: somente leitura no banco -------------------
alter table public.unidades_operacionais add column if not exists permite_escrita boolean not null default true;
-- Configuração desta etapa: EFC somente leitura (reverter com um UPDATE quando
-- o formulário/checklist da EFC existir — nenhum código muda).
update public.unidades_operacionais set permite_escrita = false where codigo = 'EFC' and permite_escrita;

-- --- 2. Acesso dos usuários às unidades --------------------------------------
alter table public.profiles add column if not exists acesso_todas_unidades boolean not null default false;
update public.profiles set acesso_todas_unidades = true where role = 'admin' and not acesso_todas_unidades;

create table if not exists public.profile_unidades (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  unidade_operacional_id uuid not null references public.unidades_operacionais(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (profile_id, unidade_operacional_id)
);
create index if not exists idx_profile_unidades_unidade on public.profile_unidades(unidade_operacional_id);

insert into public.profile_unidades (profile_id, unidade_operacional_id)
select p.id, u.id
  from public.profiles p
  join public.unidades_operacionais u on u.codigo = 'SLZ'
 where p.approved and p.role <> 'admin'
on conflict do nothing;

-- --- 3. Funções de acesso do usuário corrente (SECURITY DEFINER, mínimas) -----
create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.approved from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.is_global_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.approved and p.role = 'admin' and p.acesso_todas_unidades
                     from public.profiles p where p.id = auth.uid()), false)
$$;

-- Unidades que o usuário corrente pode LER ('{}' se não aprovado / sem unidade).
create or replace function public.minhas_unidades()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select case
    when p.id is null or not p.approved then '{}'::uuid[]
    when p.acesso_todas_unidades then
      coalesce((select array_agg(u.id) from public.unidades_operacionais u), '{}'::uuid[])
    else
      coalesce((select array_agg(pu.unidade_operacional_id) from public.profile_unidades pu
                 where pu.profile_id = p.id), '{}'::uuid[])
  end
  from (select auth.uid() as uid) a
  left join public.profiles p on p.id = a.uid
$$;

-- Unidades em que o usuário corrente pode GRAVAR (lidas + permite_escrita + ativa).
create or replace function public.minhas_unidades_gravaveis()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(u.id), '{}'::uuid[])
    from public.unidades_operacionais u
   where u.id = any (public.minhas_unidades()) and u.permite_escrita and u.ativo
$$;

revoke all on function public.is_approved(), public.is_global_admin(),
  public.minhas_unidades(), public.minhas_unidades_gravaveis() from public, anon;
grant execute on function public.is_approved(), public.is_global_admin(),
  public.minhas_unidades(), public.minhas_unidades_gravaveis() to authenticated, service_role;

-- --- 4. Proteção contra autoatribuição em profiles ---------------------------
create or replace function public.check_profile_access_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- SQL Editor / service role (sem usuário na requisição) e admin geral: livre.
  if auth.uid() is null or public.is_global_admin() then
    return new;
  end if;
  if new.acesso_todas_unidades is distinct from old.acesso_todas_unidades then
    raise exception using errcode = '42501',
      message = 'Somente um administrador geral concede ou retira o acesso a todas as unidades';
  end if;
  if new.role is distinct from old.role and (old.role = 'admin' or new.role = 'admin') then
    raise exception using errcode = '42501',
      message = 'Somente um administrador geral concede ou retira o perfil de administrador';
  end if;
  if old.acesso_todas_unidades and old.id <> auth.uid()
     and (new.role, new.approved) is distinct from (old.role, old.approved) then
    raise exception using errcode = '42501',
      message = 'Somente um administrador geral altera o perfil de um administrador geral';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_profile_access_changes on public.profiles;
create trigger trg_check_profile_access_changes
  before update on public.profiles
  for each row execute function public.check_profile_access_changes();

alter table public.profile_unidades enable row level security;
drop policy if exists "Usuário lê as próprias unidades" on public.profile_unidades;
create policy "Usuário lê as próprias unidades" on public.profile_unidades
  for select to authenticated
  using (profile_id = auth.uid() or (select public.is_global_admin()));
drop policy if exists "Admin geral gerencia unidades dos usuários" on public.profile_unidades;
create policy "Admin geral gerencia unidades dos usuários" on public.profile_unidades
  for all to authenticated
  using ((select public.is_global_admin()))
  with check ((select public.is_global_admin()));
revoke all on public.profile_unidades from anon;

-- --- 5. Unidade nos registros filhos -----------------------------------------
do $$
declare t text;
begin
  foreach t in array array['inspections', 'inspection_responses', 'measurements', 'thermography_points',
    'nonconformities', 'actions', 'analysis_flags', 'panel_condition_history', 'panel_location_history',
    'sap_orders', 'panel_attachments']
  loop
    execute format('alter table public.%I add column if not exists unidade_operacional_id uuid '
                   'references public.unidades_operacionais(id) on delete restrict', t);
    execute format('create index if not exists %I on public.%I(unidade_operacional_id)', 'idx_' || t || '_unidade', t);
  end loop;
end $$;

-- Herança: quadro do registro -> registro pai -> unidade informada (ou NULL).
-- SECURITY INVOKER de propósito: a busca do quadro/pai respeita a RLS de
-- quem grava (não revela a unidade de um quadro que o usuário não vê).
create or replace function public.herdar_unidade()
returns trigger language plpgsql set search_path = '' as $$
declare
  v uuid;
begin
  if tg_table_name = 'inspections' then
    select p.unidade_operacional_id into v from public.electrical_panels p
     where p.id = coalesce(new.panel_ref_id, new.panel_id);
  elsif tg_table_name in ('measurements', 'thermography_points', 'nonconformities', 'actions', 'analysis_flags',
                          'panel_condition_history', 'panel_location_history', 'sap_orders', 'panel_attachments') then
    if new.panel_id is not null then
      select p.unidade_operacional_id into v from public.electrical_panels p where p.id = new.panel_id;
    end if;
  end if;

  if v is null then
    if tg_table_name in ('inspection_responses', 'measurements', 'thermography_points', 'analysis_flags', 'nonconformities') then
      if new.inspection_id is not null then
        select i.unidade_operacional_id into v from public.inspections i where i.id = new.inspection_id;
      end if;
    elsif tg_table_name = 'actions' then
      if new.nonconformity_id is not null then
        select n.unidade_operacional_id into v from public.nonconformities n where n.id = new.nonconformity_id;
      end if;
    end if;
  end if;

  -- Com vínculo, a unidade é sempre a herdada; sem vínculo, mantém a
  -- informada (ou a já gravada, se o quadro foi excluído). Nunca um padrão.
  if v is not null then
    new.unidade_operacional_id := v;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
  cols text;
begin
  for t, cols in select * from (values
      ('inspections', 'panel_id, panel_ref_id'),
      ('inspection_responses', 'inspection_id'),
      ('measurements', 'panel_id, inspection_id'),
      ('thermography_points', 'panel_id, inspection_id'),
      ('nonconformities', 'panel_id, inspection_id'),
      ('actions', 'panel_id, nonconformity_id'),
      ('analysis_flags', 'panel_id, inspection_id'),
      ('panel_condition_history', 'panel_id'),
      ('panel_location_history', 'panel_id'),
      ('sap_orders', 'panel_id'),
      ('panel_attachments', 'panel_id')) as x(t, cols)
  loop
    execute format('drop trigger if exists trg_herdar_unidade on public.%I', t);
    -- "aa_" no nome: roda antes dos demais triggers BEFORE (ordem alfabética).
    execute format('drop trigger if exists aa_herdar_unidade on public.%I', t);
    execute format('create trigger aa_herdar_unidade before insert or update of %s on public.%I '
                   'for each row execute function public.herdar_unidade()', cols, t);
  end loop;
end $$;

-- Backfill com os triggers de usuário desligados (sem efeitos colaterais).
do $$
declare
  t text;
  pendentes text := '';
  n bigint;
begin
  foreach t in array array['inspections', 'inspection_responses', 'measurements', 'thermography_points',
    'nonconformities', 'actions', 'analysis_flags', 'panel_condition_history', 'panel_location_history',
    'sap_orders', 'panel_attachments']
  loop
    execute format('alter table public.%I disable trigger user', t);
  end loop;

  update public.inspections c set unidade_operacional_id = p.unidade_operacional_id
    from public.electrical_panels p
   where p.id = coalesce(c.panel_ref_id, c.panel_id) and c.unidade_operacional_id is null;

  update public.inspection_responses c set unidade_operacional_id = i.unidade_operacional_id
    from public.inspections i where i.id = c.inspection_id and c.unidade_operacional_id is null;

  foreach t in array array['measurements', 'thermography_points', 'analysis_flags', 'nonconformities']
  loop
    execute format('update public.%I c set unidade_operacional_id = p.unidade_operacional_id
                      from public.electrical_panels p where p.id = c.panel_id and c.unidade_operacional_id is null', t);
    execute format('update public.%I c set unidade_operacional_id = i.unidade_operacional_id
                      from public.inspections i where i.id = c.inspection_id and c.unidade_operacional_id is null', t);
  end loop;

  update public.actions c set unidade_operacional_id = p.unidade_operacional_id
    from public.electrical_panels p where p.id = c.panel_id and c.unidade_operacional_id is null;
  update public.actions c set unidade_operacional_id = n.unidade_operacional_id
    from public.nonconformities n where n.id = c.nonconformity_id and c.unidade_operacional_id is null;

  foreach t in array array['panel_condition_history', 'panel_location_history', 'sap_orders', 'panel_attachments']
  loop
    execute format('update public.%I c set unidade_operacional_id = p.unidade_operacional_id
                      from public.electrical_panels p where p.id = c.panel_id and c.unidade_operacional_id is null', t);
  end loop;

  foreach t in array array['inspections', 'inspection_responses', 'measurements', 'thermography_points',
    'nonconformities', 'actions', 'analysis_flags', 'panel_condition_history', 'panel_location_history',
    'sap_orders', 'panel_attachments']
  loop
    execute format('alter table public.%I enable trigger user', t);
    execute format('select count(*) from public.%I where unidade_operacional_id is null', t) into n;
    if n > 0 then pendentes := pendentes || format(' %s=%s', t, n); end if;
  end loop;

  if pendentes <> '' then
    raise notice 'Registros SEM quadro e sem pai (unidade NULL, visíveis só ao admin geral; classificar manualmente):%', pendentes;
  else
    raise notice 'Todos os registros filhos receberam a unidade do quadro/pai.';
  end if;
end $$;

-- Quadro mudou de unidade: só admin geral (ou SQL Editor), e os filhos acompanham.
create or replace function public.check_panel_unidade_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.unidade_operacional_id is distinct from old.unidade_operacional_id
     and auth.uid() is not null and not public.is_global_admin() then
    raise exception using errcode = '42501',
      message = 'Somente um administrador geral move um quadro de unidade operacional';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_check_panel_unidade_change on public.electrical_panels;
create trigger trg_check_panel_unidade_change
  before update of unidade_operacional_id on public.electrical_panels
  for each row execute function public.check_panel_unidade_change();

create or replace function public.cascade_panel_unidade()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  foreach t in array array['inspections', 'measurements', 'thermography_points', 'nonconformities', 'actions',
    'analysis_flags', 'panel_condition_history', 'panel_location_history', 'sap_orders', 'panel_attachments']
  loop
    execute format('update public.%I set unidade_operacional_id = $1 where panel_id = $2', t)
      using new.unidade_operacional_id, new.id;
  end loop;
  update public.inspection_responses r set unidade_operacional_id = new.unidade_operacional_id
    from public.inspections i where i.id = r.inspection_id and i.panel_id = new.id;
  return null;
end;
$$;
revoke all on function public.cascade_panel_unidade() from public, anon, authenticated;
drop trigger if exists trg_cascade_panel_unidade on public.electrical_panels;
create trigger trg_cascade_panel_unidade
  after update of unidade_operacional_id on public.electrical_panels
  for each row when (new.unidade_operacional_id is distinct from old.unidade_operacional_id)
  execute function public.cascade_panel_unidade();

-- --- 6. Policies RESTRITIVAS (AND com as policies de perfil existentes) ------
-- Tabelas com unidade própria: ler = unidade autorizada; gravar = unidade
-- autorizada E gravável. Unidade NULL: só admin geral.
do $$
declare
  t text;
  r text := '(unidade_operacional_id = any ((select public.minhas_unidades())::uuid[])
              or (unidade_operacional_id is null and (select public.is_global_admin())))';
  w text := '(unidade_operacional_id = any ((select public.minhas_unidades_gravaveis())::uuid[])
              or (unidade_operacional_id is null and (select public.is_global_admin())))';
begin
  foreach t in array array['electrical_panels', 'localidades', 'inspections', 'inspection_responses',
    'measurements', 'thermography_points', 'nonconformities', 'actions', 'analysis_flags',
    'panel_condition_history', 'panel_location_history', 'sap_orders', 'panel_attachments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "unidade: leitura" on public.%I', t);
    execute format('drop policy if exists "unidade: inclusão" on public.%I', t);
    execute format('drop policy if exists "unidade: alteração" on public.%I', t);
    execute format('drop policy if exists "unidade: exclusão" on public.%I', t);
    execute format('create policy "unidade: leitura" on public.%I as restrictive for select to anon, authenticated using %s', t, r);
    execute format('create policy "unidade: inclusão" on public.%I as restrictive for insert to anon, authenticated with check %s', t, w);
    execute format('create policy "unidade: alteração" on public.%I as restrictive for update to anon, authenticated using %s with check %s', t, w, w);
    execute format('create policy "unidade: exclusão" on public.%I as restrictive for delete to anon, authenticated using %s', t, w);
  end loop;
end $$;

-- Prédios e sublocais: unidade da localidade.
do $$
declare
  loc_r text := 'exists (select 1 from public.localidades l where l.id = localidade_id
                   and l.unidade_operacional_id = any ((select public.minhas_unidades())::uuid[]))';
  loc_w text := 'exists (select 1 from public.localidades l where l.id = localidade_id
                   and l.unidade_operacional_id = any ((select public.minhas_unidades_gravaveis())::uuid[]))';
  sub_r text := 'exists (select 1 from public.locais lc join public.localidades l on l.id = lc.localidade_id
                   where lc.id = local_id and l.unidade_operacional_id = any ((select public.minhas_unidades())::uuid[]))';
  sub_w text := 'exists (select 1 from public.locais lc join public.localidades l on l.id = lc.localidade_id
                   where lc.id = local_id and l.unidade_operacional_id = any ((select public.minhas_unidades_gravaveis())::uuid[]))';
  t text; r text; w text;
begin
  for t, r, w in select * from (values ('locais', loc_r, loc_w), ('sublocais', sub_r, sub_w)) as x(t, r, w)
  loop
    execute format('drop policy if exists "unidade: leitura" on public.%I', t);
    execute format('drop policy if exists "unidade: inclusão" on public.%I', t);
    execute format('drop policy if exists "unidade: alteração" on public.%I', t);
    execute format('drop policy if exists "unidade: exclusão" on public.%I', t);
    execute format('create policy "unidade: leitura" on public.%I as restrictive for select to anon, authenticated using (%s)', t, r);
    execute format('create policy "unidade: inclusão" on public.%I as restrictive for insert to anon, authenticated with check (%s)', t, w);
    execute format('create policy "unidade: alteração" on public.%I as restrictive for update to anon, authenticated using (%s) with check (%s)', t, w, w);
    execute format('create policy "unidade: exclusão" on public.%I as restrictive for delete to anon, authenticated using (%s)', t, w);
  end loop;
end $$;

-- Tabelas globais (catálogo/configuração): só usuários aprovados.
do $$
declare t text;
begin
  foreach t in array array['inspection_templates', 'inspection_template_items', 'health_index_config', 'sap_import_batches']
  loop
    execute format('drop policy if exists "aprovado: acesso" on public.%I', t);
    execute format('create policy "aprovado: acesso" on public.%I as restrictive for all to anon, authenticated '
                   'using ((select public.is_approved())) with check ((select public.is_approved()))', t);
  end loop;
end $$;

-- Unidades: cada um vê as suas; só o admin geral altera (inclusive permite_escrita).
drop policy if exists "unidade: leitura" on public.unidades_operacionais;
create policy "unidade: leitura" on public.unidades_operacionais as restrictive for select to anon, authenticated
  using (id = any ((select public.minhas_unidades())::uuid[]));
-- (por comando, e não "for all": uma restritiva "for all" também valeria
--  para o SELECT e exigiria admin geral só para ler)
drop policy if exists "unidade: inclusão só admin geral" on public.unidades_operacionais;
drop policy if exists "unidade: alteração só admin geral" on public.unidades_operacionais;
drop policy if exists "unidade: exclusão só admin geral" on public.unidades_operacionais;
create policy "unidade: inclusão só admin geral" on public.unidades_operacionais as restrictive for insert to anon, authenticated
  with check ((select public.is_global_admin()));
create policy "unidade: alteração só admin geral" on public.unidades_operacionais as restrictive for update to anon, authenticated
  using ((select public.is_global_admin())) with check ((select public.is_global_admin()));
create policy "unidade: exclusão só admin geral" on public.unidades_operacionais as restrictive for delete to anon, authenticated
  using ((select public.is_global_admin()));

-- Auditoria: contém dados de todas as unidades — só administrador geral.
drop policy if exists "auditoria: só admin geral" on public.audit_log;
create policy "auditoria: só admin geral" on public.audit_log as restrictive for select to anon, authenticated
  using ((select public.is_global_admin()));

commit;
