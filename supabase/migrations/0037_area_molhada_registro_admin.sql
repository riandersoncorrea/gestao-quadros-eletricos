-- ============================================================================
-- 0037 — Registro da área molhada (PRO-01) pelo administrador, com auditoria
-- ============================================================================
-- Ordem: depois da 0036.
--
-- CONTEXTO (pendência B1 da EFC, diagnóstico 22/11/2026): pela regra atual de
-- risco de interdição (desde 29/09/2026), PRO-01 "Não conforme" só é risco
-- com área molhada = Sim. Os checklists históricos da EFC (ValeForms) não
-- tinham a pergunta, então essas NCs ficam fora do relatório de risco. Não há
-- edição de checklist gravado, e preencher por suposição está fora de questão.
--
-- O QUE FAZ:
--   1. inspection_responses ganha os metadados do registro posterior:
--      area_molhada_registrada_por / _em / _justificativa.
--   2. public.registrar_area_molhada(resposta, sim/não, justificativa):
--      SECURITY INVOKER (passa pela RLS de quem chama: unidade autorizada e
--      com escrita liberada — na EFC, só depois da liberação). Exige perfil
--      admin (geral ou local), resposta de PRO-01 "Não conforme", área
--      molhada AINDA não respondida e justificativa (mín. 10 caracteres).
--      Grava só esses 4 campos; o trigger de auditoria existente registra
--      cada campo (antes -> depois, quem, quando).
--   3. Trava: num checklist já gravado, área molhada e metadados só mudam por
--      essa função (ou pelo SQL Editor). No INSERT do checklist a resposta
--      continua vindo do formulário, como hoje.
--
-- O QUE NÃO FAZ: não altera nenhuma linha existente; não muda a regra de
--   risco; não libera a escrita da EFC.
--
-- São Luís: o formulário de checklist não muda (só INSERT). O registro
-- posterior passa a existir também para checklists de São Luís com PRO-01
-- sem a resposta, pelo mesmo caminho (admin + justificativa + auditoria).
--
-- Testes: supabase/tests/0037_area_molhada_registro_admin.test.sql
-- ROLLBACK: supabase/rollback/0037_area_molhada_registro_admin.rollback.sql
-- ============================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'unidade_do_vinculo' and pronamespace = 'public'::regnamespace) then
    raise exception 'Aplique a 0036 antes da 0037';
  end if;
end $$;

-- --- 1. Metadados do registro posterior ---------------------------------------
alter table public.inspection_responses
  add column if not exists area_molhada_registrada_por uuid references public.profiles(id) on delete set null,
  add column if not exists area_molhada_registrada_em timestamptz,
  add column if not exists area_molhada_justificativa text;

comment on column public.inspection_responses.area_molhada_registrada_por is
  'Quem registrou a área molhada depois do checklist (registrar_area_molhada, 0037). Null = respondida no próprio checklist.';
comment on column public.inspection_responses.area_molhada_justificativa is
  'Fonte/justificativa do registro posterior da área molhada (ex.: confirmação em campo em dd/mm, por quem).';

-- --- 2. Registro pelo administrador --------------------------------------------
create or replace function public.registrar_area_molhada(p_resposta_id uuid, p_area_molhada boolean, p_justificativa text)
returns public.inspection_responses
language plpgsql security invoker set search_path = '' as $$
declare
  r public.inspection_responses;
  v_codigo text;
  v_just text := btrim(coalesce(p_justificativa, ''));
  v_linhas int;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Registro de área molhada exige usuário autenticado';
  end if;
  if public.current_role() is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'Somente administradores registram a área molhada de um checklist gravado';
  end if;
  if p_area_molhada is null then
    raise exception using errcode = '22023', message = 'Informe Sim ou Não para a área molhada';
  end if;
  if length(v_just) < 10 then
    raise exception using errcode = '22023', message = 'Justificativa obrigatória (mínimo de 10 caracteres): informe a fonte da informação';
  end if;

  -- Leitura pela RLS de quem chama: fora das suas unidades = não encontrada.
  select * into r from public.inspection_responses where id = p_resposta_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Resposta do checklist não encontrada';
  end if;
  select t.codigo into v_codigo from public.inspection_template_items t where t.id = r.template_item_id;
  if v_codigo is distinct from 'PRO-01' then
    raise exception using errcode = '22023', message = 'A área molhada só se aplica ao item PRO-01';
  end if;
  if r.resposta is distinct from 'nao_conforme' then
    raise exception using errcode = '22023', message = 'A área molhada só se aplica a PRO-01 "Não conforme"';
  end if;
  if r.area_molhada is not null then
    raise exception using errcode = '22023', message = 'A área molhada desta resposta já foi informada';
  end if;

  perform set_config('app.registro_area_molhada', 'on', true);
  update public.inspection_responses
     set area_molhada = p_area_molhada,
         area_molhada_registrada_por = auth.uid(),
         area_molhada_registrada_em = now(),
         area_molhada_justificativa = v_just
   where id = p_resposta_id
  returning * into r;
  get diagnostics v_linhas = row_count;   -- antes do PERFORM, que muda FOUND
  perform set_config('app.registro_area_molhada', 'off', true);
  if v_linhas = 0 then
    -- RLS de gravação: unidade sem escrita liberada (ex.: EFC antes da liberação).
    raise exception using errcode = '42501', message = 'Sem permissão de gravação na unidade deste checklist';
  end if;
  return r;
end;
$$;
revoke all on function public.registrar_area_molhada(uuid, boolean, text) from public, anon;
grant execute on function public.registrar_area_molhada(uuid, boolean, text) to authenticated, service_role;

-- --- 3. Trava: checklist gravado só muda a área molhada pela função ----------
create or replace function public.check_area_molhada_registro()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;  -- SQL Editor / service role
  end if;
  if tg_op = 'INSERT' then
    if new.area_molhada_registrada_por is not null or new.area_molhada_registrada_em is not null
       or new.area_molhada_justificativa is not null then
      raise exception using errcode = '42501',
        message = 'Metadados de registro posterior da área molhada só são gravados por registrar_area_molhada';
    end if;
    return new;
  end if;
  if (new.area_molhada is distinct from old.area_molhada
      or new.area_molhada_registrada_por is distinct from old.area_molhada_registrada_por
      or new.area_molhada_registrada_em is distinct from old.area_molhada_registrada_em
      or new.area_molhada_justificativa is distinct from old.area_molhada_justificativa)
     and coalesce(current_setting('app.registro_area_molhada', true), '') <> 'on' then
    raise exception using errcode = '42501',
      message = 'A área molhada de um checklist gravado só é registrada pelo administrador, com justificativa';
  end if;
  return new;
end;
$$;
revoke all on function public.check_area_molhada_registro() from public, anon, authenticated;

drop trigger if exists trg_area_molhada_registro on public.inspection_responses;
create trigger trg_area_molhada_registro
  before insert or update on public.inspection_responses
  for each row execute function public.check_area_molhada_registro();

commit;
