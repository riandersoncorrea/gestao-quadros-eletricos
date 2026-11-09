-- Rollback da 0032: devolve as policies do bucket `uploads` ao texto de schema.sql.
drop policy if exists "Authenticated users can upload files" on storage.objects;
create policy "Authenticated users can upload files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'uploads');

drop policy if exists "Authenticated users can update their uploads" on storage.objects;
create policy "Authenticated users can update their uploads"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'uploads');

drop policy if exists "Authenticated users can delete uploads" on storage.objects;
create policy "Authenticated users can delete uploads"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'uploads');
