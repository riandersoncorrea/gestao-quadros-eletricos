-- ============================================================================
-- Testes da migration 0019_nonconformity_concluida_em.sql
-- ============================================================================
-- Rodar DEPOIS da migration, inteiro. Tudo dentro de begin/rollback.
-- Sucesso = nenhum erro "FALHA".
-- ============================================================================

begin;

-- 1. Nenhuma NC concluída sem data; nenhuma não concluída com data ----------
do $$
begin
  if exists (select 1 from public.nonconformities where status = 'concluida' and concluida_em is null) then
    raise exception 'FALHA 1: NC concluída sem concluida_em';
  end if;
  if exists (select 1 from public.nonconformities where status <> 'concluida' and concluida_em is not null) then
    raise exception 'FALHA 1: NC não concluída com concluida_em';
  end if;
  raise notice 'OK 1: datas coerentes com o status';
end $$;

-- 2. Ciclo de vida: abrir → concluir → editar → reabrir → concluir -----------
do $$
declare v_id uuid; v1 timestamptz; v2 timestamptz;
begin
  insert into public.nonconformities (descricao, origem) values ('TESTE 0019', 'manual') returning id into v_id;
  if (select concluida_em from public.nonconformities where id = v_id) is not null then
    raise exception 'FALHA 2: NC aberta nasceu com data';
  end if;

  update public.nonconformities set status = 'concluida' where id = v_id;
  select concluida_em into v1 from public.nonconformities where id = v_id;
  if v1 is null then raise exception 'FALHA 2: concluir não gravou a data'; end if;

  update public.nonconformities set severidade = 'alta' where id = v_id;
  if (select concluida_em from public.nonconformities where id = v_id) is distinct from v1 then
    raise exception 'FALHA 2: edição comum alterou a data';
  end if;

  update public.nonconformities set status = 'em_tratamento' where id = v_id;
  if (select concluida_em from public.nonconformities where id = v_id) is not null then
    raise exception 'FALHA 2: reabrir não limpou a data';
  end if;

  update public.nonconformities set status = 'concluida' where id = v_id;
  select concluida_em into v2 from public.nonconformities where id = v_id;
  if v2 is null then raise exception 'FALHA 2: nova conclusão sem data'; end if;
  raise notice 'OK 2: data gravada na conclusão, mantida em edições, limpa ao reabrir';
end $$;

-- 3. Inserir já concluída recebe data; cancelada não ----------------------------
do $$
declare v_id uuid;
begin
  insert into public.nonconformities (descricao, origem, status) values ('TESTE 0019 b', 'manual', 'concluida') returning id into v_id;
  if (select concluida_em from public.nonconformities where id = v_id) is null then
    raise exception 'FALHA 3: insert concluída sem data';
  end if;
  update public.nonconformities set status = 'cancelada' where id = v_id;
  if (select concluida_em from public.nonconformities where id = v_id) is not null then
    raise exception 'FALHA 3: cancelada manteve data';
  end if;
  raise notice 'OK 3: insert concluída e cancelamento corretos';
end $$;

-- 4. Triggers de updated_at e auditoria voltaram a funcionar -------------------
do $$
declare v_id uuid;
begin
  insert into public.nonconformities (descricao, origem) values ('TESTE 0019 c', 'manual') returning id into v_id;
  -- set_updated_at sobrescreve updated_at em todo UPDATE: se o valor antigo
  -- "pegar", o trigger está desligado.
  update public.nonconformities set descricao = 'TESTE 0019 c2', updated_at = '2000-01-01' where id = v_id;
  if (select updated_at from public.nonconformities where id = v_id) = '2000-01-01'::timestamptz then
    raise exception 'FALHA 4: trigger de updated_at ficou desligado';
  end if;
  if not exists (select 1 from public.audit_log where tabela = 'nonconformities' and registro_id = v_id and campo = 'descricao') then
    raise exception 'FALHA 4: trigger de auditoria ficou desligado';
  end if;
  raise notice 'OK 4: updated_at e auditoria ativos';
end $$;

rollback;
