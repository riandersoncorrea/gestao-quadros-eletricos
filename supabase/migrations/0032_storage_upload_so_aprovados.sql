-- ============================================================================
-- Storage: só usuário APROVADO envia, altera ou apaga arquivos
-- ============================================================================
-- Problema (SECURITY_REVIEW §10.1, pendência do Storage): as policies de
-- INSERT/UPDATE/DELETE do bucket `uploads` (schema.sql) valem para qualquer
-- conta autenticada — inclusive uma conta recém-criada, ainda pendente de
-- aprovação, que nem consegue usar o app. Com a EFC recebendo usuários novos,
-- qualquer cadastro aberto poderia enviar arquivos ao bucket pela API.
--
-- Correção: as três policies passam a exigir public.current_role() não nulo,
-- isto é, perfil APROVADO (migration 0006; mesma regra das tabelas).
--   * INSERT: só aprovado envia;
--   * UPDATE/DELETE: só aprovado — e continua valendo a policy de SELECT da
--     0018 (cada um só enxerga, e portanto só altera/apaga, o que enviou).
-- O que NÃO muda: bucket público (leitura por URL, sem RLS); nomes das
-- policies; a policy de SELECT da 0018; perfis aprovados de todas as
-- unidades continuam enviando fotos, PDFs, diagramas e avatar como antes.
--
-- Aditiva e idempotente. Validar sem aplicar: begin; <conteúdo> rollback;
-- Teste: supabase/tests/0032_storage_upload_so_aprovados.test.sql
-- ROLLBACK: supabase/rollback/0032_storage_upload_so_aprovados.rollback.sql
-- ============================================================================

drop policy if exists "Authenticated users can upload files" on storage.objects;
create policy "Authenticated users can upload files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'uploads' and public.current_role() is not null);

drop policy if exists "Authenticated users can update their uploads" on storage.objects;
create policy "Authenticated users can update their uploads"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'uploads' and public.current_role() is not null)
  with check (bucket_id = 'uploads' and public.current_role() is not null);

drop policy if exists "Authenticated users can delete uploads" on storage.objects;
create policy "Authenticated users can delete uploads"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'uploads' and public.current_role() is not null);
