-- ============================================================================
-- 0036 — Unidade dos registros filhos determinada pelo banco (sem forja)
-- ============================================================================
-- Ordem: depois da 0035. Antes de liberar a escrita da EFC.
--
-- PROBLEMA (auditoria de prontidão da EFC, 2026-11-11, reproduzido no banco
-- local):
--   O trigger aa_herdar_unidade (0029) era SECURITY INVOKER: a busca do
--   quadro / registro pai respeitava a RLS de quem grava. Quando o pai é de
--   OUTRA unidade, o usuário não o enxerga, a busca volta vazia e o trigger
--   mantinha a unidade informada no payload. A policy restritiva aprovava,
--   porque a unidade (forjada) era a do próprio usuário. Resultado:
--     * editor de São Luís criava NC / inspeção / ação / resposta / anexo
--       apontando para quadro, NC ou inspeção da EFC (e vice-versa depois da
--       liberação), com unidade_operacional_id = a sua;
--     * uma ação forjada sob uma NC da EFC mudava o STATUS dessa NC, porque o
--       trigger da 0027 (sync_nc_status_from_actions) é SECURITY DEFINER;
--     * uma NC existente podia ser re-vinculada a quadro de outra unidade
--       mantendo a unidade antiga;
--     * o trigger não disparava em UPDATE só da coluna unidade_operacional_id.
--
-- CORREÇÃO:
--   1. public.unidade_do_vinculo(tabela, id): leitura mínima, SECURITY
--      DEFINER, da unidade de um quadro / inspeção / NC / ordem SAP. EXECUTE
--      revogado de todos (só o trigger, que roda como o dono, a usa) — não
--      vira oráculo pela API.
--   2. herdar_unidade passa a SECURITY DEFINER e a unidade de todo registro
--      com vínculo é SEMPRE a da cadeia real (quadro, inspeção, NC). Regras:
--        * vínculos de unidades diferentes no mesmo registro (ex.: NC com
--          quadro de uma unidade e inspeção de outra) -> recusado;
--        * unidade informada explicitamente e diferente da cadeia (INSERT com
--          valor, ou UPDATE que muda a coluna) -> recusado (42501);
--        * re-vínculo (UPDATE de panel_id etc.) -> a unidade acompanha o novo
--          pai; a policy restritiva (WITH CHECK) então só aceita se o usuário
--          pode gravar na unidade de destino;
--        * pai sem unidade (NC pendente de classificação) -> filho também sem
--          unidade (só o administrador geral grava);
--        * registro SEM vínculo (NC manual sem quadro): mantém a unidade
--          informada no INSERT; depois disso, só o administrador geral (ou o
--          SQL Editor) muda a unidade.
--      O trigger também dispara em UPDATE de unidade_operacional_id e de
--      sap_order_id.
--      Ordens SAP legadas sem unidade (sap_orders sem quadro) não definem nem
--      bloqueiam a unidade de quem as referencia (comportamento atual).
--   2b. cascade_unidade_filhos: inspeção ou NC que muda de unidade leva os
--      filhos junto (respostas, medições, NCs da inspeção; ações da NC).
--   3. cascade_panel_unidade (mudança de unidade de um quadro — só admin
--      geral) passa a levar junto também os registros ligados ao quadro só
--      pela inspeção ou pela NC (antes ficavam com a unidade antiga).
--   4. Localização: prédio / sublocal de um quadro precisam ser da mesma
--      unidade do quadro e formar a cadeia cidade -> prédio -> sublocal
--      quando a localização muda; mover cidade/prédio/sublocal para outra
--      unidade só pelo administrador geral. Quadros legados não são
--      revalidados (só quando o vínculo muda).
--   5. Exclusão de NC: só administrador (geral ou local, na sua unidade),
--      como a tela já faz. A policy de perfil "Editores gerenciam NCs" é
--      FOR ALL e deixava o editor excluir pela API.
--   6. Exclusão de AÇÃO e de registros do checklist (respostas, medições,
--      termografia): só administrador (decisão D3, 22/11/2026). As policies
--      de perfil "Editores gerenciam …" são FOR ALL e deixavam o editor
--      excluir pela API — e excluir uma ação muda o status da NC (0027).
--      Nenhuma tela do editor exclui esses registros; a exclusão da inspeção
--      (já só admin) leva os filhos pela FK, como antes. Anexos do quadro
--      continuam excluíveis pelo editor (a edição do quadro remove diagrama),
--      agora com auditoria. analysis_flags não muda (o recálculo do índice,
--      feito por quem finaliza o checklist, apaga e regrava as flags).
--   7. Cidade do quadro em unidade SEM site (EFC e futuras): a TAG leva a
--      sigla da cidade, então trocar a cidade/localidade de um quadro já
--      classificado é só do administrador geral (ou SQL Editor). Unidade com
--      site (São Luís): sem mudança.
--   8. Auditoria: a exclusão passa a guardar o registro inteiro (JSON em
--      audit_log.valor_anterior; antes só o id) — o histórico de uma ação ou
--      NC excluída não se perde. panel_attachments passa a ser auditada.
--      A migration ABORTA se audit_trigger em produção não for o texto da
--      0001 (não sobrescreve versão desconhecida).
--
-- FUNÇÕES SECURITY DEFINER REVISTAS (nenhuma contorna a validação):
--   herdar_unidade / unidade_do_vinculo (esta migration): só LEEM a unidade;
--     a gravação continua passando pela policy restritiva de quem grava.
--   sync_nc_status_from_actions (0027): altera a NC da ação; com o item 2 a
--     ação nunca fica sob NC de outra unidade.
--   cascade_panel_unidade (0029/esta): só roda quando o quadro muda de
--     unidade, o que só o administrador geral consegue.
--   track_panel_location, audit_trigger: gravam histórico/auditoria do
--     próprio registro; o histórico herda a unidade do quadro (item 2).
--   audit_trigger (0001/esta): só grava no audit_log; o item 8 acrescenta o
--     registro excluído (valor_anterior). Leitura do audit_log segue só admin geral.
--   minhas_unidades*, is_*, current_role, responsaveis_atribuiveis,
--     admin_local_pode_gerenciar, get_public_panel: só leitura.
--
-- O QUE MUDA PARA SÃO LUÍS: nada nos fluxos da tela (todos já gravam a
--   unidade da cadeia). Pela API, o editor deixa de excluir ação, resposta,
--   medição e termografia (nenhuma tela dele fazia isso) e as exclusões
--   auditadas guardam o registro. Nenhuma linha existente é alterada por esta
--   migration. Antes de trocar o trigger, a migration ABORTA se já existir
--   registro filho com unidade diferente da do seu vínculo (lista as
--   contagens): nesse caso, classificar manualmente antes.
--
-- Testes: supabase/tests/0036_unidade_pela_cadeia_de_vinculos.test.sql
--         supabase/tests/0036_exclusoes_e_cidade_do_quadro.test.sql (itens 6–8)
-- Conferência só leitura (rodar ANTES em produção):
--   supabase/tests/0036_vinculos_entre_unidades.check.sql
-- ROLLBACK: supabase/rollback/0036_unidade_pela_cadeia_de_vinculos.rollback.sql
-- ============================================================================

begin;

-- --- 0. Pré-requisitos e conferência dos dados existentes ---------------------
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'herdar_unidade' and pronamespace = 'public'::regnamespace)
     or not exists (select 1 from information_schema.columns where table_schema = 'public'
                      and table_name = 'electrical_panels' and column_name = 'photo_interna_url') then
    raise exception 'Aplique 0029 a 0035 antes da 0036';
  end if;
  -- O item 8 substitui audit_trigger: só se ela for exatamente a da 0001.
  -- (Reaplicação: aceita a versão que esta própria migration grava.)
  if not exists (select 1 from pg_proc where proname = 'audit_trigger' and pronamespace = 'public'::regnamespace
                    and (md5(prosrc) = '0cfd82d7cbf45327bbd05fea9999185e'
                         or prosrc like '%0036: a exclusão guarda o registro inteiro%')) then
    raise exception 'audit_trigger difere da versão da 0001 — conferir a definição em produção antes da 0036';
  end if;
end $$;

-- Conferência genérica (quadro / inspeção / NC) — aborta se houver divergência.
do $$
declare
  t text; col text; pai text;
  n bigint;
  divergencias text := '';
begin
  for t, col, pai in select * from (values
      ('inspections', 'panel_id', 'electrical_panels'),
      ('inspections', 'panel_ref_id', 'electrical_panels'),
      ('inspection_responses', 'inspection_id', 'inspections'),
      ('measurements', 'panel_id', 'electrical_panels'),
      ('measurements', 'inspection_id', 'inspections'),
      ('thermography_points', 'panel_id', 'electrical_panels'),
      ('thermography_points', 'inspection_id', 'inspections'),
      ('analysis_flags', 'panel_id', 'electrical_panels'),
      ('analysis_flags', 'inspection_id', 'inspections'),
      ('nonconformities', 'panel_id', 'electrical_panels'),
      ('nonconformities', 'inspection_id', 'inspections'),
      ('actions', 'panel_id', 'electrical_panels'),
      ('actions', 'nonconformity_id', 'nonconformities'),
      ('panel_condition_history', 'panel_id', 'electrical_panels'),
      ('panel_location_history', 'panel_id', 'electrical_panels'),
      ('sap_orders', 'panel_id', 'electrical_panels'),
      ('panel_attachments', 'panel_id', 'electrical_panels')) as x(t, col, pai)
  loop
    execute format('select count(*) from public.%I c join public.%I p on p.id = c.%I
                     where c.unidade_operacional_id is distinct from p.unidade_operacional_id', t, pai, col)
      into n;
    if n > 0 then divergencias := divergencias || format(' %s.%s=%s', t, col, n); end if;
  end loop;
  if divergencias <> '' then
    raise exception 'Há registros com unidade diferente da do seu vínculo (classificar antes da 0036; ver supabase/tests/0036_vinculos_entre_unidades.check.sql):%', divergencias;
  end if;
end $$;

-- Quadros cujo prédio/sublocal é de outra unidade: só aviso (não são
-- revalidados; a regra nova vale quando o vínculo muda).
do $$
declare n bigint;
begin
  select count(*) into n
    from public.electrical_panels p
    left join public.locais lc on lc.id = p.local_id
    left join public.localidades l on l.id = lc.localidade_id
   where p.local_id is not null and l.unidade_operacional_id is distinct from p.unidade_operacional_id;
  if n > 0 then raise notice 'Aviso: % quadro(s) com prédio de outra unidade (dados legados; conferir)', n; end if;
end $$;

-- --- 1. Leitura da unidade de um vínculo (só para o trigger) ------------------
create or replace function public.unidade_do_vinculo(p_tabela text, p_id uuid, out existe boolean, out unidade uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  existe := false;
  unidade := null;
  if p_id is null then return; end if;
  if p_tabela = 'electrical_panels' then
    select true, p.unidade_operacional_id into existe, unidade from public.electrical_panels p where p.id = p_id;
  elsif p_tabela = 'inspections' then
    select true, i.unidade_operacional_id into existe, unidade from public.inspections i where i.id = p_id;
  elsif p_tabela = 'nonconformities' then
    select true, n.unidade_operacional_id into existe, unidade from public.nonconformities n where n.id = p_id;
  elsif p_tabela = 'sap_orders' then
    select true, o.unidade_operacional_id into existe, unidade from public.sap_orders o where o.id = p_id;
  elsif p_tabela = 'localidades' then
    select true, l.unidade_operacional_id into existe, unidade from public.localidades l where l.id = p_id;
  elsif p_tabela = 'locais' then
    select true, l.unidade_operacional_id into existe, unidade
      from public.locais lc join public.localidades l on l.id = lc.localidade_id where lc.id = p_id;
  elsif p_tabela = 'sublocais' then
    select true, l.unidade_operacional_id into existe, unidade
      from public.sublocais s join public.locais lc on lc.id = s.local_id
      join public.localidades l on l.id = lc.localidade_id where s.id = p_id;
  else
    raise exception 'unidade_do_vinculo: tabela não suportada: %', p_tabela;
  end if;
  existe := coalesce(existe, false);
end;
$$;
revoke all on function public.unidade_do_vinculo(text, uuid) from public, anon, authenticated;

-- --- 2. Herança da unidade pela cadeia real -----------------------------------
create or replace function public.herdar_unidade()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  novo jsonb := to_jsonb(new);
  vinculos text[][];
  i int;
  ref_id uuid;
  r record;
  v uuid;                         -- unidade da cadeia
  tem_vinculo boolean := false;   -- algum pai (exceto ordem SAP sem unidade) existe
  pai_sem_unidade boolean := false;
  unidade_informada_mudou boolean;
begin
  vinculos := case tg_table_name
    when 'inspections'          then array[['panel_id','electrical_panels'],['panel_ref_id','electrical_panels'],['sap_order_id','sap_orders']]
    when 'inspection_responses' then array[['inspection_id','inspections']]
    when 'measurements'         then array[['panel_id','electrical_panels'],['inspection_id','inspections']]
    when 'thermography_points'  then array[['panel_id','electrical_panels'],['inspection_id','inspections']]
    when 'analysis_flags'       then array[['panel_id','electrical_panels'],['inspection_id','inspections']]
    when 'nonconformities'      then array[['panel_id','electrical_panels'],['inspection_id','inspections'],['sap_order_id','sap_orders']]
    when 'actions'              then array[['panel_id','electrical_panels'],['nonconformity_id','nonconformities']]
    else array[['panel_id','electrical_panels']]  -- históricos, ordens SAP, anexos
  end;

  for i in 1 .. array_length(vinculos, 1) loop
    ref_id := (novo ->> vinculos[i][1])::uuid;
    continue when ref_id is null;
    r := public.unidade_do_vinculo(vinculos[i][2], ref_id);
    continue when not r.existe;          -- inexistente: a FK recusa logo depois
    if r.unidade is null then
      -- Ordem SAP legada sem unidade: não define nem bloqueia (como hoje).
      continue when vinculos[i][2] = 'sap_orders';
      pai_sem_unidade := true;
      tem_vinculo := true;
      continue;
    end if;
    tem_vinculo := true;
    if v is null then
      v := r.unidade;
    elsif v <> r.unidade then
      raise exception using errcode = '42501',
        message = format('Registro de %s com vínculos de unidades operacionais diferentes', tg_table_name);
    end if;
  end loop;

  if v is not null and pai_sem_unidade then
    raise exception using errcode = '42501',
      message = format('Registro de %s vinculado a registro sem unidade e a registro de uma unidade', tg_table_name);
  end if;

  unidade_informada_mudou := case
    when tg_op = 'INSERT' then new.unidade_operacional_id is not null
    else new.unidade_operacional_id is distinct from old.unidade_operacional_id
  end;

  if v is not null then
    if unidade_informada_mudou and new.unidade_operacional_id is distinct from v then
      raise exception using errcode = '42501',
        message = format('A unidade de %s é a do seu vínculo (quadro/inspeção/NC); a unidade informada diverge', tg_table_name);
    end if;
    new.unidade_operacional_id := v;
  elsif pai_sem_unidade then
    new.unidade_operacional_id := null;   -- só o administrador geral grava (policy restritiva)
  elsif tg_op = 'UPDATE' and unidade_informada_mudou
        and auth.uid() is not null and not public.is_global_admin() then
    -- Sem vínculo: a unidade escolhida na criação não muda pela API.
    raise exception using errcode = '42501',
      message = format('Somente um administrador geral muda a unidade de um registro de %s sem quadro', tg_table_name);
  end if;
  -- Sem vínculo no INSERT: mantém a informada (NULL = pendente, só admin geral).
  return new;
end;
$$;
revoke all on function public.herdar_unidade() from public, anon, authenticated;

do $$
declare
  t text;
  cols text;
begin
  for t, cols in select * from (values
      ('inspections', 'panel_id, panel_ref_id, sap_order_id, unidade_operacional_id'),
      ('inspection_responses', 'inspection_id, unidade_operacional_id'),
      ('measurements', 'panel_id, inspection_id, unidade_operacional_id'),
      ('thermography_points', 'panel_id, inspection_id, unidade_operacional_id'),
      ('nonconformities', 'panel_id, inspection_id, sap_order_id, unidade_operacional_id'),
      ('actions', 'panel_id, nonconformity_id, unidade_operacional_id'),
      ('analysis_flags', 'panel_id, inspection_id, unidade_operacional_id'),
      ('panel_condition_history', 'panel_id, unidade_operacional_id'),
      ('panel_location_history', 'panel_id, unidade_operacional_id'),
      ('sap_orders', 'panel_id, unidade_operacional_id'),
      ('panel_attachments', 'panel_id, unidade_operacional_id')) as x(t, cols)
  loop
    execute format('drop trigger if exists aa_herdar_unidade on public.%I', t);
    execute format('create trigger aa_herdar_unidade before insert or update of %s on public.%I '
                   'for each row execute function public.herdar_unidade()', cols, t);
  end loop;
end $$;

-- Pai mudou de unidade (re-vínculo legítimo, só por quem grava nas duas
-- unidades, ou pela cascata do quadro): os filhos acompanham. Filho com
-- quadro próprio de outra unidade faz o herdar_unidade recusar (vínculos de
-- unidades diferentes) — re-vincular esse filho antes.
create or replace function public.cascade_unidade_filhos()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if tg_table_name = 'inspections' then
    foreach t in array array['inspection_responses', 'measurements', 'thermography_points', 'analysis_flags', 'nonconformities']
    loop
      execute format('update public.%I set unidade_operacional_id = $1
                       where inspection_id = $2 and unidade_operacional_id is distinct from $1', t)
        using new.unidade_operacional_id, new.id;
    end loop;
  elsif tg_table_name = 'nonconformities' then
    update public.actions set unidade_operacional_id = new.unidade_operacional_id
     where nonconformity_id = new.id and unidade_operacional_id is distinct from new.unidade_operacional_id;
  end if;
  return null;
end;
$$;
revoke all on function public.cascade_unidade_filhos() from public, anon, authenticated;
drop trigger if exists trg_cascade_unidade_filhos on public.inspections;
create trigger trg_cascade_unidade_filhos
  after update on public.inspections
  for each row when (new.unidade_operacional_id is distinct from old.unidade_operacional_id)
  execute function public.cascade_unidade_filhos();
drop trigger if exists trg_cascade_unidade_filhos on public.nonconformities;
create trigger trg_cascade_unidade_filhos
  after update on public.nonconformities
  for each row when (new.unidade_operacional_id is distinct from old.unidade_operacional_id)
  execute function public.cascade_unidade_filhos();

-- --- 3. Quadro mudou de unidade (só admin geral): toda a cadeia acompanha -----
create or replace function public.cascade_panel_unidade()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t text;
  u uuid := new.unidade_operacional_id;
begin
  update public.inspections set unidade_operacional_id = u
   where (panel_id = new.id or panel_ref_id = new.id) and unidade_operacional_id is distinct from u;
  update public.inspection_responses r set unidade_operacional_id = u
    from public.inspections i
   where i.id = r.inspection_id and (i.panel_id = new.id or i.panel_ref_id = new.id)
     and r.unidade_operacional_id is distinct from u;
  foreach t in array array['measurements', 'thermography_points', 'analysis_flags', 'nonconformities']
  loop
    execute format('update public.%I c set unidade_operacional_id = $1
                     where (c.panel_id = $2
                            or (c.panel_id is null and c.inspection_id in
                                (select i.id from public.inspections i where i.panel_id = $2 or i.panel_ref_id = $2)))
                       and c.unidade_operacional_id is distinct from $1', t)
      using u, new.id;
  end loop;
  update public.actions a set unidade_operacional_id = u
   where (a.panel_id = new.id
          or (a.panel_id is null and a.nonconformity_id in
              (select n.id from public.nonconformities n where n.unidade_operacional_id = u
                 and (n.panel_id = new.id or n.inspection_id in
                      (select i.id from public.inspections i where i.panel_id = new.id or i.panel_ref_id = new.id)))))
     and a.unidade_operacional_id is distinct from u;
  foreach t in array array['panel_condition_history', 'panel_location_history', 'sap_orders', 'panel_attachments']
  loop
    execute format('update public.%I set unidade_operacional_id = $1 where panel_id = $2
                      and unidade_operacional_id is distinct from $1', t)
      using u, new.id;
  end loop;
  return null;
end;
$$;
revoke all on function public.cascade_panel_unidade() from public, anon, authenticated;

-- --- 4. Localização coerente com a unidade ------------------------------------
create or replace function public.check_localizacao_unidade()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record;
  livre boolean := auth.uid() is null or public.is_global_admin();
  v_cidade_antiga uuid;
  v_cidade_nova uuid;
begin
  if tg_table_name = 'electrical_panels' then
    -- Prédio e sublocal do quadro: da mesma unidade do quadro.
    -- Só quando o vínculo muda (quadros legados não são revalidados).
    if new.local_id is not null and (tg_op = 'INSERT' or new.local_id is distinct from old.local_id
                                     or new.unidade_operacional_id is distinct from old.unidade_operacional_id) then
      r := public.unidade_do_vinculo('locais', new.local_id);
      if r.existe and r.unidade is distinct from new.unidade_operacional_id then
        raise exception using errcode = '23514', message = 'O prédio do quadro pertence a outra unidade operacional';
      end if;
    end if;
    if new.sublocal_id is not null and (tg_op = 'INSERT' or new.sublocal_id is distinct from old.sublocal_id
                                        or new.unidade_operacional_id is distinct from old.unidade_operacional_id) then
      r := public.unidade_do_vinculo('sublocais', new.sublocal_id);
      if r.existe and r.unidade is distinct from new.unidade_operacional_id then
        raise exception using errcode = '23514', message = 'O sublocal do quadro pertence a outra unidade operacional';
      end if;
    end if;
    -- Cadeia Cidade/Localidade -> Prédio -> Sublocal coerente quando muda
    -- (o formulário já grava assim; impede, pela API, cidade de um lado e
    -- prédio de outro — a TAG da EFC leva a sigla da cidade).
    if tg_op = 'INSERT' or new.localidade_id is distinct from old.localidade_id
       or new.local_id is distinct from old.local_id or new.sublocal_id is distinct from old.sublocal_id then
      if new.local_id is not null and new.localidade_id is not null
         and not exists (select 1 from public.locais lc where lc.id = new.local_id and lc.localidade_id = new.localidade_id) then
        raise exception using errcode = '23514', message = 'O prédio do quadro não pertence à cidade/localidade informada';
      end if;
      if new.sublocal_id is not null and new.local_id is not null
         and not exists (select 1 from public.sublocais s where s.id = new.sublocal_id and s.local_id = new.local_id) then
        raise exception using errcode = '23514', message = 'O sublocal do quadro não pertence ao prédio informado';
      end if;
    end if;
    -- Unidade SEM site (EFC e futuras): a TAG leva a sigla da cidade. A
    -- cidade efetiva (localidade_id ou, na falta, a do prédio) de um quadro
    -- já classificado só muda pelo administrador geral. Quadro ainda sem
    -- cidade pode recebê-la. Unidade com site (São Luís): sem mudança.
    if tg_op = 'UPDATE' and not livre then
      v_cidade_antiga := coalesce(old.localidade_id,
                                  (select lc.localidade_id from public.locais lc where lc.id = old.local_id));
      v_cidade_nova := coalesce(new.localidade_id,
                                (select lc.localidade_id from public.locais lc where lc.id = new.local_id));
      if v_cidade_antiga is not null and v_cidade_nova is distinct from v_cidade_antiga
         and not coalesce((select u.usa_site from public.unidades_operacionais u
                            where u.id = old.unidade_operacional_id), true) then
        raise exception using errcode = '42501',
          message = 'Nesta unidade a cidade compõe a TAG do quadro: somente um administrador geral altera a cidade/localidade de um quadro';
      end if;
    end if;
  elsif tg_table_name = 'localidades' then
    if tg_op = 'UPDATE' and new.unidade_operacional_id is distinct from old.unidade_operacional_id and not livre then
      raise exception using errcode = '42501', message = 'Somente um administrador geral move uma localidade de unidade operacional';
    end if;
  elsif tg_table_name = 'locais' then
    if tg_op = 'UPDATE' and new.localidade_id is distinct from old.localidade_id and not livre
       and (public.unidade_do_vinculo('localidades', new.localidade_id)).unidade
           is distinct from (public.unidade_do_vinculo('localidades', old.localidade_id)).unidade then
      raise exception using errcode = '42501', message = 'Somente um administrador geral move um prédio para outra unidade operacional';
    end if;
  elsif tg_table_name = 'sublocais' then
    if tg_op = 'UPDATE' and new.local_id is distinct from old.local_id and not livre
       and (public.unidade_do_vinculo('locais', new.local_id)).unidade
           is distinct from (public.unidade_do_vinculo('locais', old.local_id)).unidade then
      raise exception using errcode = '42501', message = 'Somente um administrador geral move um sublocal para outra unidade operacional';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.check_localizacao_unidade() from public, anon, authenticated;

-- Nome sem "check_": dispara DEPOIS de trg_check_panel_unidade_change (0029),
-- que dá a mensagem de "só admin geral move quadro de unidade".
drop trigger if exists trg_localizacao_unidade on public.electrical_panels;
create trigger trg_localizacao_unidade
  before insert or update of localidade_id, local_id, sublocal_id, unidade_operacional_id on public.electrical_panels
  for each row execute function public.check_localizacao_unidade();
drop trigger if exists trg_localizacao_unidade on public.localidades;
create trigger trg_localizacao_unidade
  before update of unidade_operacional_id on public.localidades
  for each row execute function public.check_localizacao_unidade();
drop trigger if exists trg_localizacao_unidade on public.locais;
create trigger trg_localizacao_unidade
  before update of localidade_id on public.locais
  for each row execute function public.check_localizacao_unidade();
drop trigger if exists trg_localizacao_unidade on public.sublocais;
create trigger trg_localizacao_unidade
  before update of local_id on public.sublocais
  for each row execute function public.check_localizacao_unidade();

-- --- 5. Exclusão de NC: só administrador --------------------------------------
drop policy if exists "nc: exclusão só admin" on public.nonconformities;
create policy "nc: exclusão só admin" on public.nonconformities as restrictive for delete to anon, authenticated
  using ((select public.current_role()) = 'admin');

-- --- 6. Exclusão de ação e dos registros do checklist: só administrador -------
-- (Restritivas: somam-se às de perfil e às de unidade da 0029 — o admin
-- local continua limitado à sua unidade, e só com escrita liberada.)
drop policy if exists "ação: exclusão só admin" on public.actions;
create policy "ação: exclusão só admin" on public.actions as restrictive for delete to anon, authenticated
  using ((select public.current_role()) = 'admin');
do $$
declare t text;
begin
  foreach t in array array['inspection_responses', 'measurements', 'thermography_points']
  loop
    execute format('drop policy if exists "checklist: exclusão só admin" on public.%I', t);
    execute format('create policy "checklist: exclusão só admin" on public.%I as restrictive for delete '
                   'to anon, authenticated using ((select public.current_role()) = ''admin'')', t);
  end loop;
end $$;

-- --- 8. Auditoria: exclusão guarda o registro; anexos auditados ---------------
-- Texto da 0001 com uma única diferença: no DELETE, valor_anterior recebe o
-- registro inteiro (JSON). INSERT/UPDATE inalterados.
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
    -- 0036: a exclusão guarda o registro inteiro (antes só o id).
    insert into public.audit_log(tabela, registro_id, acao, valor_anterior, usuario_id, usuario_email)
    values (tg_table_name, (to_jsonb(old) ->> 'id')::uuid, 'delete', to_jsonb(old)::text, auth.uid(), v_email);
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

drop trigger if exists trg_audit on public.panel_attachments;
create trigger trg_audit after insert or update or delete on public.panel_attachments
  for each row execute function public.audit_trigger();

commit;
