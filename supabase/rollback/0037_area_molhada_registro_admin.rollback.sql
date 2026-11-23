-- ============================================================================
-- ROLLBACK da 0037 — remove a função de registro da área molhada e a trava
-- ============================================================================
-- As colunas de metadados (area_molhada_registrada_por / _em / _justificativa)
-- FICAM (sem DROP de coluna: o histórico do registro não se perde). A resposta
-- de área molhada já registrada também fica — a auditoria guarda quem/quando.
-- Para descartar as colunas vazias, decidir à parte.
-- ============================================================================

begin;

drop trigger if exists trg_area_molhada_registro on public.inspection_responses;
drop function if exists public.check_area_molhada_registro();
drop function if exists public.registrar_area_molhada(uuid, boolean, text);

commit;
