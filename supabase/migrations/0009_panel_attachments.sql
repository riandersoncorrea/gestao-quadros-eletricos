-- ============================================================================
-- Múltiplos diagramas unifilares por quadro (até 5)
-- ============================================================================
-- Aditiva e não destrutiva. NÃO remove nem toca em
-- `electrical_panels.diagram_url` — esse campo continua existindo e sendo
-- lido normalmente para quadros antigos (diagrama "legado"). Novos
-- diagramas passam a ser gravados nesta tabela nova, em relação 1:N com o
-- quadro. O limite de 5 é validado na aplicação (service), não no banco.
--
-- Segue o mesmo padrão das tabelas de histórico do quadro (ver migration
-- 0001: panel_location_history, panel_condition_history) e das tabelas de
-- conteúdo gerenciável por editor/admin (nonconformities, actions): FK com
-- on delete cascade, índice por panel_id, RLS com leitura para todo
-- autenticado e escrita restrita a admin/editor.
-- ============================================================================

create table if not exists public.panel_attachments (
  id uuid primary key default gen_random_uuid(),
  panel_id uuid not null references public.electrical_panels(id) on delete cascade,
  tipo text not null default 'diagrama_unifilar'
    check (tipo in ('diagrama_unifilar')),
  file_url text not null,
  file_name text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_panel_attachments_panel on public.panel_attachments(panel_id, created_at);

alter table public.panel_attachments enable row level security;

drop policy if exists "Autenticados leem anexos do quadro" on public.panel_attachments;
create policy "Autenticados leem anexos do quadro" on public.panel_attachments
  for select to authenticated using (true);

drop policy if exists "Editores gerenciam anexos do quadro" on public.panel_attachments;
create policy "Editores gerenciam anexos do quadro" on public.panel_attachments
  for all to authenticated
  using (public.current_role() in ('admin', 'editor'))
  with check (public.current_role() in ('admin', 'editor'));
