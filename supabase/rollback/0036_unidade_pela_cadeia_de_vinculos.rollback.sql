-- ============================================================================
-- ROLLBACK da 0036 — volta exatamente ao comportamento da 0029
-- ============================================================================
-- Restaura herdar_unidade (SECURITY INVOKER) e os triggers aa_herdar_unidade
-- com as colunas da 0029, a cascade_panel_unidade da 0029, remove a checagem
-- de localização (inclusive a trava de cidade em unidade sem site), a função
-- unidade_do_vinculo, as policies de exclusão só admin (NC, ação, respostas,
-- medições, termografia), a auditoria de panel_attachments, e restaura a
-- audit_trigger da 0001 (exclusão volta a guardar só o id).
-- Nenhuma linha de dados é alterada (o audit_log já gravado fica). ATENÇÃO:
-- reabre a falha de forja de unidade descrita na 0036.
-- ============================================================================

begin;

drop policy if exists "nc: exclusão só admin" on public.nonconformities;
drop policy if exists "ação: exclusão só admin" on public.actions;
drop policy if exists "checklist: exclusão só admin" on public.inspection_responses;
drop policy if exists "checklist: exclusão só admin" on public.measurements;
drop policy if exists "checklist: exclusão só admin" on public.thermography_points;

drop trigger if exists trg_audit on public.panel_attachments;

-- (texto idêntico ao da 0001)
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

drop trigger if exists trg_cascade_unidade_filhos on public.inspections;
drop trigger if exists trg_cascade_unidade_filhos on public.nonconformities;
drop function if exists public.cascade_unidade_filhos();

drop trigger if exists trg_localizacao_unidade on public.electrical_panels;
drop trigger if exists trg_localizacao_unidade on public.localidades;
drop trigger if exists trg_localizacao_unidade on public.locais;
drop trigger if exists trg_localizacao_unidade on public.sublocais;
drop trigger if exists trg_check_localizacao_unidade on public.electrical_panels;  -- nome de rascunho
drop function if exists public.check_localizacao_unidade();

-- (texto idêntico ao da 0029)
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


-- (texto idêntico ao da 0029)
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

-- A 0029 não revogava EXECUTE de herdar_unidade (padrão do schema public).
grant execute on function public.herdar_unidade() to public;

drop function if exists public.unidade_do_vinculo(text, uuid);

commit;
