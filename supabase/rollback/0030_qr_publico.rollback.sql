-- ============================================================================
-- ROLLBACK da 0030 (QR público) — usar só em emergência
-- ============================================================================
-- Reabre a view panel_public_info para a API e devolve a anon os privilégios
-- padrão do Supabase. ATENÇÃO: volta a permitir que qualquer pessoa liste
-- todos os quadros sem login (o risco A1 da auditoria).
-- ============================================================================
begin;
grant select on public.panel_public_info to anon, authenticated;
grant all on all tables in schema public to anon;
grant all on all sequences in schema public to anon;
alter default privileges in schema public grant all on tables to anon;
alter default privileges in schema public grant all on sequences to anon;
-- A função get_public_panel pode ficar (o frontend novo a usa); para remover:
-- drop function public.get_public_panel(uuid);
commit;
