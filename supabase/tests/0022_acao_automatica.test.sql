-- ============================================================================
-- Testes da migration 0022_acao_automatica.sql
-- ============================================================================
-- Rodar DEPOIS da migration, inteiro, no SQL Editor. Tudo dentro de
-- begin/rollback: NC e ações de teste não ficam no banco.
-- Sucesso = nenhum erro "FALHA".
-- ============================================================================

begin;

insert into public.nonconformities (id, descricao, origem)
values ('00000000-0000-4000-a000-0000000022c1', 'TESTE 0022', 'inspecao');

-- 1. Ações existentes/manuais ficam 'manual' por padrão ----------------------------
insert into public.actions (id, nonconformity_id, descricao)
values ('00000000-0000-4000-a000-0000000022a1', '00000000-0000-4000-a000-0000000022c1', 'TESTE 0022 manual');
do $$
begin
  if (select origem from public.actions where id = '00000000-0000-4000-a000-0000000022a1') <> 'manual' then
    raise exception 'FALHA 1: origem padrão não é manual';
  end if;
  raise notice 'OK 1: origem padrão manual';
end;
$$;

-- 2. Uma ação automática por NC; a segunda é rejeitada -----------------------------
insert into public.actions (nonconformity_id, descricao, origem)
values ('00000000-0000-4000-a000-0000000022c1', 'TESTE 0022 auto', 'automatica');
do $$
begin
  begin
    insert into public.actions (nonconformity_id, descricao, origem)
    values ('00000000-0000-4000-a000-0000000022c1', 'TESTE 0022 auto duplicada', 'automatica');
    raise exception 'FALHA 2: ação automática duplicada aceita';
  exception when unique_violation then null;
  end;
  raise notice 'OK 2: ação automática duplicada rejeitada';
end;
$$;

-- 3. Ação manual adicional na mesma NC continua permitida -------------------------
insert into public.actions (nonconformity_id, descricao)
values ('00000000-0000-4000-a000-0000000022c1', 'TESTE 0022 manual 2');

-- 4. Origem inválida rejeitada ------------------------------------------------------
do $$
begin
  begin
    insert into public.actions (nonconformity_id, descricao, origem)
    values ('00000000-0000-4000-a000-0000000022c1', 'TESTE 0022 origem', 'outra');
    raise exception 'FALHA 4: origem inválida aceita';
  exception when check_violation then null;
  end;
  raise notice 'OK 3/4: manual adicional aceita, origem inválida rejeitada';
end;
$$;

-- 5. v_actions expõe as colunas novas e o campo atrasada ---------------------------
do $$
begin
  if (select count(*) from public.v_actions
       where nonconformity_id = '00000000-0000-4000-a000-0000000022c1'
         and origem is not null and atrasada is not null) <> 3 then
    raise exception 'FALHA 5: v_actions sem as colunas novas';
  end if;
  perform responsavel_id from public.v_actions limit 1;
  raise notice 'OK 5: v_actions com origem/responsavel_id/atrasada';
end;
$$;

rollback;
