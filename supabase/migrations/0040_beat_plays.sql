-- Журнал прослушиваний.
--
-- Счётчик beats.plays хранит только итог: сколько раз послушали за всю
-- жизнь бита. По нему нельзя отличить бит, который слушают steadily, от
-- того, который набрал прослушивания за один день и с тех пор мёртв.
-- Раздел «Набирают обороты» без истории событий пришлось бы придумывать
-- или показывать два бита под заголовком про движение.
--
-- Историю нельзя восстановить задним числом: счётчик уже сожрал разницу
-- между «вчера» и «год назад». Поэтому журнал заводится сейчас, пока
-- событий мало, а не когда их накопится.
--
-- Таблица растёт вместе с трафиком. Поэтому:
--   * индекс только по (beat_id, played_at) — ровно то, что читает выборка
--     за окно, остальные колонки в индекс не берутся;
--   * отдельные строки на каждое событие, без агрегатов — агрегаты считаются
--     на чтении, двойной источник правды тут не нужен.

create table if not exists public.beat_plays (
  id uuid primary key default gen_random_uuid(),
  beat_id uuid not null references public.beats (id) on delete cascade,
  played_at timestamptz not null default now()
);

create index if not exists beat_plays_beat_played_at_idx
  on public.beat_plays (beat_id, played_at desc);

-- Прослушивания публичны ровно настолько, насколько публичен сам бит.
-- Писать может только функция счётчика, из приложения напрямую нельзя:
-- иначе кто угодно накрутит себе счётчик, в том числе свой собственный бит.
alter table public.beat_plays enable row level security;

drop policy if exists "beat_plays are readable" on public.beat_plays;
create policy "beat_plays are readable"
  on public.beat_plays
  for select
  using (true);

-- Событие пишется из той же функции, что и счётчик. Раньше increment_plays
-- только увеличивала число на единицу, поэтому история терялась в момент
-- запроса. Теперь счётчик и журнал всегда расходятся максимум на ноль.
create or replace function public.increment_plays(beat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hit uuid;
begin
  update public.beats set plays = plays + 1 where id = beat_id returning id into hit;

  /*
   * Журналим только когда бит правда существует. Раньше функция на
   * несуществующий id просто ничего не делала, и вызывающий код это
   * знал. Без проверки вставка по внешнему ключу упала бы на чужом или
   * выдуманном id, и прослушивание бита, которого уже нет, стало бы
   * ошибкой вместо тишины.
   */
  if hit is not null then
    insert into public.beat_plays (beat_id) values (hit);
  end if;
end;
$$;

revoke all on function public.increment_plays(uuid) from public;
grant execute on function public.increment_plays(uuid) to anon, authenticated;
