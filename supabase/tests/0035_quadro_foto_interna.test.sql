-- ============================================================================
-- Teste da 0035 (foto interna do quadro) — BEGIN/ROLLBACK, nada fica.
-- ============================================================================
-- Rodar DEPOIS da 0035, inteiro, no SQL Editor. Sucesso = 'OK' no fim e
-- nenhum erro "FALHA".
-- ============================================================================

begin;

do $$
begin
  -- 1. Coluna existe, texto, opcional
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'electrical_panels'
                    and column_name = 'photo_interna_url' and data_type = 'text' and is_nullable = 'YES') then
    raise exception 'FALHA 1: electrical_panels.photo_interna_url ausente ou com tipo errado';
  end if;

  -- 2. Não exposta no QR público
  if pg_get_functiondef('public.get_public_panel(uuid)'::regprocedure) like '%photo_interna_url%' then
    raise exception 'FALHA 2: get_public_panel expõe a foto interna';
  end if;

  -- 3. authenticated pode gravar a coluna (RLS decide a linha)
  if not has_column_privilege('authenticated', 'public.electrical_panels', 'photo_interna_url', 'UPDATE') then
    raise exception 'FALHA 3: authenticated sem UPDATE na coluna';
  end if;
end $$;

rollback;

select 'OK' as resultado;
