-- 0037. Закреплённый бит --------------------------------------------
--
-- У каждого продавца есть бит, который он хочет продать первым. Без
-- закрепления витрина профиля отсортирована по свежести, и этот бит
-- уезжает вниз через день после загрузки — независимо от того, что он
-- лучший. Продавцу приходится заливать его заново, чтобы вернуть наверх,
-- и в ленте появляются дубли одного и того же.
--
-- Закрепление решает именно это: один бит всегда сверху, независимо от
-- возраста.
--
-- Важно, что закрепить можно только свой бит. Проверка живёт в триггере,
-- а не только в сервере: колонка — это просто uuid, и без проверки на
-- уровне базы её можно было бы заполнить чужим битом и поставить чужой
-- товар наверх своего профиля.

-- 1. Колонка ----------------------------------------------------------

alter table public.profiles
  add column if not exists pinned_beat_id uuid;

comment on column public.profiles.pinned_beat_id is
  'Бит, закреплённый наверху витрины. NULL — витрина по свежести. Только свой бит, проверяется триггером';

alter table public.profiles
  drop constraint if exists profiles_pinned_beat_fk;

-- set null, а не cascade: удаление бита не должен уносить профиль.
-- Витрина просто теряет закрепление и возвращается к порядку по дате.
alter table public.profiles
  add constraint profiles_pinned_beat_fk
  foreign key (pinned_beat_id) references public.beats (id) on delete set null;

-- 2. Только свой бит --------------------------------------------------

create or replace function public.profiles_check_pinned_beat() returns trigger
language plpgsql set search_path = public as $$
declare
  v_owner uuid;
begin
  if new.pinned_beat_id is null then
    return new;
  end if;

  select owner_id into v_owner from public.beats where id = new.pinned_beat_id;

  if v_owner is null then
    raise exception 'Бит для закрепления не найден';
  end if;

  /*
   * Своего бита приколоть можно, чужого — нет. Без этой проверки профиль
   * продавца становился витриной чужого товара: бит, который никто не
   * продаёт, поставленный наверх чужой страницы.
   */
  if v_owner <> new.id then
    raise exception 'Закрепить можно только свой бит';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_check_pinned_beat on public.profiles;

create trigger profiles_check_pinned_beat
  before insert or update of pinned_beat_id on public.profiles
  for each row execute function public.profiles_check_pinned_beat();

-- 3. Выборка витрины --------------------------------------------------
--
-- Закреплённый бит показывается наверху и отдельно от остальных, поэтому
-- запрос сортирует его первым, а не фильтрует по нему. Фильтр отсёк бы
-- бит из списка целиком: человек увидел бы четыре бита и не понял бы, где
-- пятый.

create index if not exists profiles_pinned_beat_idx on public.profiles (pinned_beat_id)
  where pinned_beat_id is not null;