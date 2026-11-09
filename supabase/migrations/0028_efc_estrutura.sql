-- ============================================================================
-- 0028 — Estrutura de unidades nas localidades (genérica, multiunidade)
-- ============================================================================
-- Ordem de execução: 0028 -> 0029 (segurança por unidade) -> 0030 (QR
-- público) -> deploy do frontend -> validação -> 0031 (importação da EFC).
-- Pré-requisito: 0016 (unidades_operacionais) — já aplicada em produção.
--
-- Problema: electrical_panels.site é NOT NULL e só aceita porto/pelotizacao/
-- oficina — subdivisões de São Luís. Quadros de outras unidades não têm site.
-- E localidades (raiz da hierarquia Localidade -> Prédio -> Sublocal) não tem
-- unidade, então as cidades da EFC não teriam como ser separadas.
--
-- O que muda:
--   1. unidades_operacionais.usa_site (boolean, default false): configuração
--      POR UNIDADE de quem usa electrical_panels.site. Só São Luís usa
--      (único UPDATE desta migration: marca usa_site = true na SLZ).
--      Nenhuma regra fica presa ao código "SLZ" ou "EFC".
--   2. localidades ganha unidade_operacional_id (NOT NULL) e sigla (opcional;
--      sigla da cidade nas TAGs, ex. ACD; única dentro da unidade). As 3
--      localidades existentes (Porto, Oficina, Pelotização) recebem a unidade
--      SLZ pelo default da coluna nova (sem UPDATE de linha); em seguida o
--      default é REMOVIDO: localidade nova precisa informar a unidade —
--      nada é classificado como São Luís implicitamente.
--   3. electrical_panels.site deixa de ser NOT NULL; trg_panel_unidade_rules:
--        * unidade com usa_site e quadro sem site -> erro (como o NOT NULL);
--        * unidade sem usa_site e quadro com site -> erro;
--        * localidade de outra unidade -> erro (não mistura unidades).
--      O CHECK de valores de site não muda.
--
-- O que NÃO muda: valores de site/tag/localidade/quadro; next_panel_tag /
-- set_panel_tag (TAG PRT/OFC/PEL); RLS (vem na 0029); o default SLZ de
-- electrical_panels.unidade_operacional_id (0016) — mantido por
-- compatibilidade com o frontend em produção; o frontend novo passa a
-- enviar a unidade explicitamente.
--
-- Testes: supabase/tests/0028_efc_estrutura.test.sql
-- ROLLBACK (manual, só sem quadros/localidades de outras unidades):
--   drop trigger trg_panel_unidade_rules on public.electrical_panels;
--   drop function public.check_panel_unidade_rules();
--   alter table public.electrical_panels alter column site set not null;
--   alter table public.localidades drop constraint localidades_unidade_sigla_key,
--     drop constraint localidades_sigla_check, drop column sigla, drop column unidade_operacional_id;
--   alter table public.unidades_operacionais drop column usa_site;
-- ============================================================================

begin;

-- --- 1. Configuração por unidade: quem usa "site" ---------------------------
alter table public.unidades_operacionais add column if not exists usa_site boolean not null default false;
update public.unidades_operacionais set usa_site = true where codigo = 'SLZ' and not usa_site;

-- --- 2. Localidade -> unidade + sigla -----------------------------------------
do $$
declare v_slz uuid;
begin
  select id into v_slz from public.unidades_operacionais where codigo = 'SLZ';
  if v_slz is null then
    raise exception 'Unidade SLZ não encontrada — aplique a 0016 antes';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                   and table_name = 'localidades' and column_name = 'unidade_operacional_id') then
    -- O default só existe durante este ALTER, para preencher as localidades
    -- já existentes (todas de São Luís); é removido logo abaixo.
    execute format(
      'alter table public.localidades add column unidade_operacional_id uuid not null default %L::uuid '
      'references public.unidades_operacionais(id) on delete restrict', v_slz);
  end if;
end $$;
alter table public.localidades alter column unidade_operacional_id drop default;

create index if not exists idx_localidades_unidade on public.localidades(unidade_operacional_id);

alter table public.localidades add column if not exists sigla text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'localidades_sigla_check') then
    alter table public.localidades
      add constraint localidades_sigla_check check (sigla is null or sigla ~ '^[A-Z][A-Z0-9]{1,9}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'localidades_unidade_sigla_key') then
    alter table public.localidades
      add constraint localidades_unidade_sigla_key unique (unidade_operacional_id, sigla);
  end if;
end $$;

-- --- 3. site obrigatório/proibido conforme a unidade -------------------------
alter table public.electrical_panels alter column site drop not null;

create or replace function public.check_panel_unidade_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_unidade record;
  v_loc_unidade uuid;
begin
  select codigo, usa_site into v_unidade
    from public.unidades_operacionais where id = new.unidade_operacional_id;

  if coalesce(v_unidade.usa_site, false) and new.site is null then
    raise exception using errcode = '23502',
      message = format('site é obrigatório para quadros da unidade %s', v_unidade.codigo);
  end if;

  if not coalesce(v_unidade.usa_site, false) and new.site is not null then
    raise exception using errcode = '23514',
      message = format('a unidade %s não usa site (site informado: %s)', coalesce(v_unidade.codigo, '?'), new.site);
  end if;

  if new.localidade_id is not null then
    select unidade_operacional_id into v_loc_unidade from public.localidades where id = new.localidade_id;
    if v_loc_unidade is distinct from new.unidade_operacional_id then
      raise exception using errcode = '23514',
        message = 'A localidade do quadro pertence a outra unidade operacional';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_panel_unidade_rules on public.electrical_panels;
create trigger trg_panel_unidade_rules
  before insert or update of site, unidade_operacional_id, localidade_id on public.electrical_panels
  for each row execute function public.check_panel_unidade_rules();

commit;
