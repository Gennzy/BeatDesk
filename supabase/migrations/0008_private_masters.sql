-- Мастера больше не лежат в публичном бакете.
--
-- Публичный бакет beats остаётся только для превью: тегированный MP3 должен
-- играться в ленте и отдаваться ссылкой в постах для Telegram, ВК и YouTube.
-- WAV, ZIP и RAR уезжают в закрытый бакет masters, откуда их может забрать
-- только автор бита.

insert into storage.buckets (id, name, public)
values ('masters', 'masters', false)
on conflict (id) do nothing;

drop policy if exists "owners read own masters" on storage.objects;
create policy "owners read own masters"
  on storage.objects for select
  using (bucket_id = 'masters' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "owners upload own masters" on storage.objects;
create policy "owners upload own masters"
  on storage.objects for insert
  with check (bucket_id = 'masters' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "owners update own masters" on storage.objects;
create policy "owners update own masters"
  on storage.objects for update
  using (bucket_id = 'masters' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "owners delete own masters" on storage.objects;
create policy "owners delete own masters"
  on storage.objects for delete
  using (bucket_id = 'masters' and (storage.foldername(name))[1] = (select auth.uid()::text));

comment on bucket 'beats' is 'Публичные превью: тегированный MP3 и обложки';
comment on bucket 'masters' is 'Приватные мастера: WAV, ZIP, RAR. Доступны только автору';