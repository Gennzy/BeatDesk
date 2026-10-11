-- Раздел «Набирают обороты».
--
-- Раньше в базе был только счётчик plays — итог за всю жизнь бита. По
-- итогу нельзя отличить бит, который слушают steadily, от того, что
-- набрал всё за один день и с тех пор мёртв: у обоих одинаковое число.
-- Миграция 0040 завела журнал beat_plays, и теперь окно считается.
--
-- Подсчёт идёт в базе, а не в приложении. Событий будет становиться
-- больше с каждым прослушиванием, и вытаскивать их в Node, чтобы сложить
-- в кучу, — значит тащить в память всё, что накопилось за неделю.
--
-- security invoker (по умолчанию), а не definer: функция видит ровно те
-- биты, которые читателю положено видеть по RLS. Объявленная security
-- definer обошла бы правила и отдала бы то, что гостю не показывают.

create or replace function public.trending_beats(p_days integer default 7, p_limit integer default 4)
returns table (
  beat_id uuid,
  plays_last integer,
  last_played_at timestamptz
)
language sql
stable
as $$
  select
    pl.beat_id,
    count(*)::integer,
    max(pl.played_at)
  from public.beat_plays pl
  join public.beats b on b.id = pl.beat_id
  where pl.played_at >= now() - make_interval(days => greatest(p_days, 1))
    and b.is_public
  group by pl.beat_id
  order by count(*) desc, max(pl.played_at) desc
  limit greatest(p_limit, 1);
$$;

revoke all on function public.trending_beats(integer, integer) from public;
grant execute on function public.trending_beats(integer, integer) to anon, authenticated;

comment on function public.trending_beats(integer, integer) is
  'Биты, которые слушали за последние p_days дней. Пустой результат — честный ответ: за окно ничего не слушали, и раздел показывает это, а не добивает список старыми битами.';