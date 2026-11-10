-- ============================================================================
-- 0035 — Segunda foto do quadro: parte interna
-- ============================================================================
-- O quadro tinha uma única foto (electrical_panels.photo_url, a externa). Os
-- checklists da EFC (ValeForms) trazem duas fotos por quadro — externa e
-- interna — e as duas passam a ficar no inventário.
--
--   electrical_panels.photo_interna_url text (nullable; nada existente muda).
--
-- Fica só no app autenticado: NÃO entra em get_public_panel (0030) — a página
-- pública do QR continua mostrando só a foto externa.
-- Privilégios: os grants de electrical_panels são de tabela (cobrem a coluna
-- nova); RLS e triggers de unidade (0028/0029) valem para ela como para as
-- demais colunas.
--
-- Teste:    supabase/tests/0035_quadro_foto_interna.test.sql
-- Rollback: supabase/rollback/0035_quadro_foto_interna.rollback.sql
-- ============================================================================

begin;

alter table public.electrical_panels
  add column if not exists photo_interna_url text;

comment on column public.electrical_panels.photo_interna_url is
  'Foto da parte interna do quadro (a externa é photo_url). Não exposta no QR público.';

commit;
