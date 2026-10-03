-- BeatDesk: бакеты и политики storage.
-- Отдельным шагом, потому что в 0001 эта часть не применилась.

insert into storage.buckets (id, name, public) values
  ('beats', 'beats', true),
  ('covers', 'covers', true)
on conflict (id) do nothing;

-- mp3: читают все, пишет владелец файла (первая папка пути = user_id)
drop policy if exists "beat audio is publicly readable" on storage.objects;
create policy "beat audio is publicly readable"
  on storage.objects for select
  using (bucket_id = 'beats');

drop policy if exists "users manage own beat audio" on storage.objects;
create policy "users manage own beat audio"
  on storage.objects for insert
  with check (bucket_id = 'beats' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "users update own beat audio" on storage.objects;
create policy "users update own beat audio"
  on storage.objects for update
  using (bucket_id = 'beats' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "users delete own beat audio" on storage.objects;
create policy "users delete own beat audio"
  on storage.objects for delete
  using (bucket_id = 'beats' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- обложки и аватары: то же самое
drop policy if exists "covers are publicly readable" on storage.objects;
create policy "covers are publicly readable"
  on storage.objects for select
  using (bucket_id = 'covers');

drop policy if exists "users manage own covers" on storage.objects;
create policy "users manage own covers"
  on storage.objects for insert
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "users update own covers" on storage.objects;
create policy "users update own covers"
  on storage.objects for update
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "users delete own covers" on storage.objects;
create policy "users delete own covers"
  on storage.objects for delete
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid()::text));