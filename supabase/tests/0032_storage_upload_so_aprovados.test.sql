-- ============================================================================
-- Teste da 0032 (Storage só para aprovados) — BEGIN/ROLLBACK, nada fica.
-- ============================================================================
-- Rodar DEPOIS da 0032, inteiro, no SQL Editor. Sucesso = 'OK' no fim e
-- nenhum erro "FALHA". Os "arquivos" de teste são só linhas em
-- storage.objects dentro da transação (nenhum arquivo é enviado).
-- ============================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-0000003200a1', 't32-aprovado@example.invalid', '{}'),
  ('00000000-0000-4000-a000-0000003200a2', 't32-pendente@example.invalid', '{}');
insert into public.profiles (id, email)
select id, email from auth.users where email like 't32-%' on conflict (id) do nothing;
update public.profiles set role = 'viewer', approved = true  where id = '00000000-0000-4000-a000-0000003200a1';
update public.profiles set role = 'viewer', approved = false where id = '00000000-0000-4000-a000-0000003200a2';

-- 1. Policies com a exigência de aprovação ----------------------------------------
do $$
begin
  if (select count(*) from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and policyname in ('Authenticated users can upload files',
                            'Authenticated users can update their uploads',
                            'Authenticated users can delete uploads')
         and coalesce(with_check, '') || coalesce(qual, '') like '%current_role%') <> 3 then
    raise exception 'FALHA 1: policies de INSERT/UPDATE/DELETE sem exigir aprovação';
  end if;
end $$;

-- 2. Pendente NÃO envia --------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000003200a2","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-0000003200a2', true);
do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner_id)
    values ('uploads', 't32/pendente.txt', '00000000-0000-4000-a000-0000003200a2');
    raise exception 'FALHA 2: conta pendente enviou arquivo';
  exception when insufficient_privilege then
    null; -- esperado: RLS recusa (42501)
  end;
end $$;
reset role;

-- 3. Aprovado envia, enxerga e apaga o próprio arquivo -------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000003200a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-0000003200a1', true);
do $$
declare n int;
begin
  insert into storage.objects (bucket_id, name, owner_id)
  values ('uploads', 't32/aprovado.txt', '00000000-0000-4000-a000-0000003200a1');
  select count(*) into n from storage.objects where bucket_id = 'uploads' and name = 't32/aprovado.txt';
  if n <> 1 then raise exception 'FALHA 3: aprovado não enxerga o próprio arquivo'; end if;
  -- No Supabase, storage.protect_delete() barra QUALQUER delete direto em
  -- storage.objects (só a API do Storage apaga) — independente das policies.
  -- Lá o DELETE fica coberto pela conferência do texto da policy (passo 1);
  -- no banco local (sem essa proteção) o delete é exercitado de fato.
  begin
    delete from storage.objects where bucket_id = 'uploads' and name = 't32/aprovado.txt';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FALHA 3b: aprovado não apagou o próprio arquivo'; end if;
  exception when insufficient_privilege then
    if sqlerrm not like 'Direct deletion from storage tables is not allowed%' then raise; end if;
  end;
end $$;
reset role;

rollback;

select 'OK' as resultado;
