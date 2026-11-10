-- Rollback da 0035: remove a foto interna do quadro.
-- ATENÇÃO: apaga as URLs gravadas nessa coluna (os arquivos no Storage ficam).
alter table public.electrical_panels drop column if exists photo_interna_url;
