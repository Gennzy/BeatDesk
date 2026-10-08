-- 0030. Счётчики показов, жанр и проверка продавца -----------------------
--
-- У конкурентов на странице бита три числа: прослушивания, просмотры и показы.
-- У нас было только прослушивание, и по нему нельзя было понять, работает ли
-- бит вообще: его могли открыть и смотреть обложку, ни разу не включив.
--
-- Просмотр — открытие страницы бита. Показ — появление карточки в ленте.
-- Разница нужна: высокие показы при низких прослушиваниях означают, что
-- обложку видят и не открывают, и это видно сразу.

-- 1. Счётчики -----------------------------------------------------------

alter table public.beats
  add column if not exists views integer not null default 0,
  add column if not exists impressions integer not null default 0;

comment on column public.beats.views is 'Открытия страницы бита';
comment on column public.beats.impressions is 'Показы карточки в ленте';

-- Жанр отдельной колонкой, а не тегом: по жанру фильтруют, и в тегах он
-- терялся среди имён артистов.
alter table public.beats
  add column if not exists genre text;

create index if not exists beats_genre_idx on public.beats (genre)
  where is_public;

-- 2. Счётчики без конкуренции ------------------------------------------
--
-- Прямое увеличение колонки из двух параллельных вкладок теряло часть
-- прибавлений. pg_catalog уже умеет инкремент атомарно, и результат сразу
-- отдаётся вызывающему — приложению не нужен отдельный SELECT.

create or replace function public.bump_beat_counter(
  p_beat_id uuid,
  p_column text
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_value integer;
begin
  if p_column = 'views' then
    update public.beats set views = views + 1 where id = p_beat_id returning views into v_value;
  elsif p_column = 'impressions' then
    update public.beats set impressions = impressions + 1 where id = p_beat_id returning impressions into v_value;
  else
    raise exception 'Неизвестный счётчик: %', p_column;
  end if;

  -- Счётчик на бит не влияет на ранг: иначе открытие страницы ради счётчика
  -- поднимало бы бит в ленте, и продавец накручивал бы его себе.
  return coalesce(v_value, 0);
end;
$$;

revoke execute on function public.bump_beat_counter(uuid, text) from public, anon;
grant execute on function public.bump_beat_counter(uuid, text) to anon, authenticated, service_role;

-- 3. Проверка продавца ---------------------------------------------------
--
-- Значок у продавца должен означать что-то проверяемое, а не «так красивее».
-- Условие жёсткое: минимум три состоявшиеся продажи и четвёртый уровень.
-- Без продаж значок не выдаётся никому, включая автора.

create or replace function public.is_verified_seller(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  /*
   * FROM обязателен: без него псевдоним p не существует, и PostgreSQL отвечает
   * 42P01. Профиль берётся сам, а не предполагается — если его нет, строк не
   * будет и ответ выйдет пустым, то есть «не проверен».
   */
  select coalesce(p.level, 1) >= 4
     and (
       select count(distinct oi.order_id)
         from public.order_items oi
         join public.orders o on o.id = oi.order_id
        where oi.beat_owner_id = p_user
          and o.status in ('paid', 'delivered')
     ) >= 3
    from public.profiles p
   where p.id = p_user;
$$;

grant execute on function public.is_verified_seller(uuid) to anon, authenticated;

-- 4. Жанры ---------------------------------------------------------------
--
-- Словарь закрытый: свободный ввод превращает фильтр в кашу из «трейп»,
-- «trap», «Trap» и «тrаp» (последнее — с кириллическими буквами).

create table if not exists public.genres (
  slug text primary key,
  title_ru text not null,
  title_en text not null,
  position integer not null default 100
);

insert into public.genres (slug, title_ru, title_en, position) values
  ('trap', 'Трейп', 'Trap', 10),
  ('hip-hop', 'Хип-хоп', 'Hip-Hop', 20),
  ('opium', 'Опиум', 'Opium', 30),
  ('dark', 'Дарк', 'Dark', 40),
  ('drill', 'Дрилл', 'Drill', 50),
  ('rage', 'Рейдж', 'Rage', 60),
  ('jerk', 'Джерк', 'Jerk', 70),
  ('boom-bap', 'Бум-бап', 'Boom Bap', 80),
  ('ambient', 'Эмбиент', 'Ambient', 90),
  ('rock', 'Рок', 'Rock', 100),
  ('pop', 'Поп', 'Pop', 110),
  ('other', 'Другое', 'Other', 999)
on conflict (slug) do update
  set title_ru = excluded.title_ru,
      title_en = excluded.title_en,
      position = excluded.position;

alter table public.genres enable row level security;

-- Словарь читают все, правят только через миграции.
create policy "genres are viewable by everyone"
  on public.genres for select
  using (true);

revoke insert, update, delete on public.genres from anon, authenticated;

create or replace function public.beat_genres()
returns table (slug text, title_ru text, title_en text, amount bigint)
language sql stable security definer set search_path = public as $$
  select g.slug, g.title_ru, g.title_en, count(b.id) as amount
    from public.genres g
    left join public.beats b on b.genre = g.slug and b.is_public
   group by g.slug, g.title_ru, g.title_en, g.position
   order by g.position;
$$;

grant execute on function public.beat_genres() to anon, authenticated;