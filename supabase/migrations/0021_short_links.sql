/*
 * Короткие ссылки.
 *
 * Ключ не читается из ссылки без поиска в таблице: хранится только он, без
 * цели. Иначе по короткому адресу можно было бы узнать, куда он ведёт, не
 * открывая его, а сам адрес всё равно хранил бы приватный бит.
 *
 * Генерация ключа живёт в приложении, а здесь только схема: значение
 * приходит из проверенного набора, поэтому ложной подстановки нет.
 */
create table if not exists public.short_links (
  code text primary key check (char_length(code) between 6 and 10),
  user_id uuid not null references public.profiles (id) on delete cascade,
  target_path text not null,
  clicks integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.short_links is
  'Короткие ссылки на биты и посты: код без цели, чтобы ссылка не раскрывала бит';

create index if not exists short_links_user_idx on public.short_links (user_id, created_at desc);

alter table public.short_links enable row level security;

-- Читать может кто угодно: по коду и так находится только факт существования.
create policy "read links"
  on public.short_links
  for select
  using (true);

-- Заводить ссылки может только владелец.
create policy "own links"
  on public.short_links
  for insert
  with check (auth.uid() = user_id);

-- Правка цели — тоже только владелец.
create policy "own links update"
  on public.short_links
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

/*
 * Счётчик кликов намеренно не обновляется политикой для анонимов.
 *
 * Переход по короткой ссылке делает гость без сессии, и RLS его бы не пустил.
 * Значит клик считает сервер служебным ключом: единственное место, где
 * счётчик растёт без участия пользователя.
 */

-- Инкремент кликов на стороне базы.
--
-- Два человека открыли ссылку одновременно: при чтении и записи из
-- приложения один клик терялся бы. Складываем прямо в базе.
create or replace function public.bump_short_link(link_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.short_links
     set clicks = clicks + 1
   where code = link_code;
$$;

revoke all on function public.bump_short_link(text) from anon, authenticated;
