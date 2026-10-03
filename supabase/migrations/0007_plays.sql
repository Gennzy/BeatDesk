-- Счётчик прослушиваний и отметка об изменении бита.

alter table public.beats add column if not exists updated_at timestamptz;

create or replace function public.touch_beats_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists beats_touch_updated_at on public.beats;
create trigger beats_touch_updated_at
  before update on public.beats
  for each row execute function public.touch_beats_updated_at();

-- Прослушивание может прийти от гостя, поэтому функция security definer:
-- RLS на прямую запись не даёт, а счётчик посчитать надо.
create or replace function public.increment_plays(beat_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.beats set plays = plays + 1 where id = beat_id;
$$;

revoke all on function public.increment_plays(uuid) from public;
grant execute on function public.increment_plays(uuid) to anon, authenticated;