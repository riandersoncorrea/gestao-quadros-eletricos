-- ============================================================================
-- Assinatura do inspetor na finalização da inspeção
-- ============================================================================
-- Aditiva: nova coluna opcional em inspections. O app grava aqui a URL da
-- imagem (PNG) da assinatura capturada em canvas na aba "Finalizar",
-- enviada ao mesmo bucket de storage já usado para evidências/termografia.
-- ============================================================================

alter table public.inspections
  add column if not exists assinatura_url text;
