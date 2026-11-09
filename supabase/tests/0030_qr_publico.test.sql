-- ============================================================================
-- Testes da migration 0030 (QR Code público: consulta individual)
-- ============================================================================
-- Rodar DEPOIS da 0030 (como postgres). BEGIN/ROLLBACK. Sucesso = nenhum
-- "FALHA" e 'OK' no fim. Simula o visitante sem login (role anon).
-- ============================================================================

begin;

select set_config('t30.panel', (select id::text from public.electrical_panels where tag = 'PRT_QD_0001'), true);
select set_config('t30.tag', 'PRT_QD_0001', true);

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare
  v jsonb;
begin
  -- 1. Um quadro pelo id do QR: devolve o objeto, com a unidade.
  v := public.get_public_panel(current_setting('t30.panel')::uuid);
  if v is null or v ->> 'tag' <> current_setting('t30.tag') then
    raise exception 'FALHA: consulta individual do QR não devolveu o quadro';
  end if;
  if jsonb_typeof(v) <> 'object' then raise exception 'FALHA: retorno deveria ser um único objeto'; end if;
  if v ->> 'unidade_nome' is null then raise exception 'FALHA: QR sem a unidade do quadro'; end if;
  if v ? 'health_index' or v ? 'notes' or v ? 'created_by' then
    raise exception 'FALHA: QR expõe coluna fora da whitelist';
  end if;

  -- 2. Id inexistente / nulo: nada (sem erro que revele algo).
  if public.get_public_panel(gen_random_uuid()) is not null then raise exception 'FALHA: id inexistente devolveu dados'; end if;
  if public.get_public_panel(null) is not null then raise exception 'FALHA: id nulo devolveu dados'; end if;

  -- 3. Não há como listar: view e tabelas fechadas para anon.
  begin
    perform count(*) from public.panel_public_info;
    raise exception 'FALHA: anon ainda lista a view panel_public_info';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.electrical_panels;
    raise exception 'FALHA: anon lê electrical_panels';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
begin
  if not has_function_privilege('anon', 'public.get_public_panel(uuid)', 'execute') then
    raise exception 'FALHA: anon sem EXECUTE na consulta do QR';
  end if;
  if has_table_privilege('anon', 'public.panel_public_info', 'select')
     or has_table_privilege('authenticated', 'public.panel_public_info', 'select') then
    raise exception 'FALHA: view panel_public_info ainda acessível pela API';
  end if;
  if has_function_privilege('anon', 'public.minhas_unidades()', 'execute') then
    raise exception 'FALHA: anon com EXECUTE em função de acesso';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.get_public_panel(uuid)'::regprocedure) is not true
     or not exists (select 1 from pg_proc where oid = 'public.get_public_panel(uuid)'::regprocedure
                      and proconfig @> array['search_path=""']) then
    raise exception 'FALHA: get_public_panel deveria ser SECURITY DEFINER com search_path fixo';
  end if;
end $$;

select 'OK' as resultado;

rollback;
