-- Закрытый бакет мастеров: создание и проверка.
--
-- Предыдущая версия (0008) создавала бакет через insert ... on conflict do nothing,
-- но если запуск прервался на ошибке в более раннем блоке, бакет не появлялся,
-- и вся загрузка бита падала с «Bucket not found». Здесь создание вынесено в
-- начало, сделано принудительно приватным и завершено проверкой.

-- 1. Бакет мастеров. public = false: файлы не должны быть видны по прямой ссылке.
insert into storage.buckets (id, name, public)
values ('masters', 'masters', false)
on conflict (id) do update set public = false;

-- 2. Права: папка первого уровня равна user_id, поэтому автор видит только свои файлы.
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

-- 3. Проверка: в результате должно быть masters | f.
-- Если строки нет — миграция выполнена не полностью.
select id, public from storage.buckets where id = 'masters';
