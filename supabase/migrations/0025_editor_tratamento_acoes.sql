-- ============================================================================
-- Editor: tratamento de ações "Em execução" pelo Checklist
-- ============================================================================
-- O Editor não acessa a página Ações; ele trata (Nota, OM, fotos, conclusão)
-- só as ações com status 'em_andamento' ("Em andamento"/"Em execução") do
-- quadro do checklist, pela página Checklists.
--
-- Hoje a policy "Editores gerenciam ações" (0001) dá ao Editor UPDATE em
-- QUALQUER ação — a restrição estava só na interface. Este trigger, no mesmo
-- padrão do Inspetor (check_inspetor_action_update, 0020), limita o UPDATE do
-- Editor no banco a:
--   - ação que ESTAVA 'em_andamento';
--   - só os campos do tratamento (Nota, OM, fotos, PDF, conclusão);
--   - status só pode continuar 'em_andamento' ou virar 'concluida'
--     (não cancela, não reabre, não altera ação aberta/concluída/cancelada);
--   - a ação precisa ter quadro (actions.panel_id ou o da NC) — o quadro não
--     pode ser trocado, pois panel_id/nonconformity_id não são campos do
--     tratamento.
-- Os requisitos da conclusão (Nota, OM, 1–3 fotos) continuam no trigger
-- check_action_completion (0017). A comparação com "o quadro do checklist
-- aberto na tela" é feita no service (actionService.assertChecklistScope).
--
-- Não muda nada para Admin, Visualizador e Inspetor. INSERT do Editor (ações
-- automáticas do checklist, 0022) e as demais policies não mudam.
--
-- Validar sem aplicar: begin; <conteúdo> rollback;
-- ROLLBACK: drop trigger if exists trg_check_editor_action_update on public.actions;
--           drop function if exists public.check_editor_action_update();
-- ============================================================================

create or replace function public.check_editor_action_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tratamento text[] := array[
    'status', 'numero_nota', 'om', 'fotos_corretiva', 'evidencia_pdf_url',
    'concluida_em', 'concluida_por', 'updated_at'
  ];
  v_panel uuid;
begin
  if public.current_role() is distinct from 'editor' then
    return new;
  end if;

  if old.status is distinct from 'em_andamento' then
    raise exception 'Editor só pode tratar ações em execução'
      using errcode = 'insufficient_privilege';
  end if;

  if (to_jsonb(new) - v_tratamento) is distinct from (to_jsonb(old) - v_tratamento) then
    raise exception 'Editor só pode alterar o tratamento da ação (Nota, OM, fotos, conclusão)'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status not in ('em_andamento', 'concluida') then
    raise exception 'Editor só pode concluir a ação em execução'
      using errcode = 'insufficient_privilege';
  end if;

  v_panel := coalesce(
    old.panel_id,
    (select nc.panel_id from public.nonconformities nc where nc.id = old.nonconformity_id)
  );
  if v_panel is null then
    raise exception 'Ação sem quadro vinculado não pode ser tratada pelo Checklist'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_editor_action_update on public.actions;
create trigger trg_check_editor_action_update
  before update on public.actions
  for each row execute function public.check_editor_action_update();
