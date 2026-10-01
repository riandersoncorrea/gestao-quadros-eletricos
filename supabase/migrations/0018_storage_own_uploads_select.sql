-- ============================================================================
-- Storage: cada usuário enxerga (e portanto consegue apagar) só o que enviou
-- ============================================================================
-- Problema: o bucket `uploads` não tem nenhuma policy de SELECT em
-- storage.objects (omitida de propósito em schema.sql, para ninguém listar
-- todos os arquivos do bucket). Só que a exclusão da API do Storage
-- (`remove`) faz um DELETE com WHERE/RETURNING sobre storage.objects — e,
-- no Postgres, isso também exige passar pela policy de SELECT. Sem nenhuma
-- policy de SELECT, o DELETE não encontra linha nenhuma e "dá certo" sem
-- apagar nada (a API devolve lista vazia, sem erro). Resultado: fotos
-- removidas da ação e PDFs descartados ficavam órfãos no bucket.
--
-- Correção mínima: SELECT só nas linhas do próprio usuário (owner_id =
-- quem fez o upload). Com isso:
--   * cada usuário consegue listar/apagar apenas os arquivos que ELE enviou;
--   * continua impossível listar os arquivos dos outros;
--   * a leitura pública por URL (bucket público) não muda — ela não passa
--     por RLS;
--   * as policies existentes de INSERT/UPDATE/DELETE não são alteradas.
-- Limitação conhecida: um arquivo enviado pelo usuário A e removido da
-- ação pelo usuário B continua no bucket (B não o enxerga) — a ação é
-- atualizada normalmente, só o arquivo fica órfão, como antes.
--
-- Aditiva e idempotente. Validar sem aplicar: begin; <conteúdo> rollback;
-- ROLLBACK: drop policy if exists "Authenticated users can read own uploads" on storage.objects;
-- ============================================================================

drop policy if exists "Authenticated users can read own uploads" on storage.objects;
create policy "Authenticated users can read own uploads"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'uploads' and owner_id = (select auth.uid())::text);
