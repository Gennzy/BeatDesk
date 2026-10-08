-- 0029. Ранжирование: реакции, уровень продавца, скор бита ---------------
--
-- Пока лента умела только «новые» и «по прослушиваниям». Второе не работает
-- как задумано: у нового бита ноль прослушиваний, поэтому он не показывался
-- вообще, сколько бы хорош ни был, и загружать биты без причины.
--
-- Здесь появляется скор с двумя свойствами, которых не было:
--
--   1. Затухание по времени. Скор бита делится пополам каждые трое суток,
--      поэтому старый бит с тысячей прослушиваний не висит вечно, а новый с
--      первыми прослушиваниями сразу встаёт рядом с ним.
--
--   2. Вклад продавца. Уровень даёт множитель, но ограниченный сверху: он
--      поднимает бит, а не делает его главным на площадке навсегда.
--
-- Скор считает функция, а не код приложения: во-первых, он нужен ленте,
--      фильтрам и кабинету одновременно, во-вторых, пересчёт по крону не
--      должен будить приложение.

-- 1. Реакции на биты ---------------------------------------------------
--
-- Лайк и сохранение — разные вещи: лайк означает «послушал», сохранение
-- «вернусь и куплю». В скоре сохранение весит втрое, потому что оно ближе
-- к покупке.

create table if not exists public.beat_reactions (
  beat_id uuid not null references public.beats on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  kind text not null check (kind in ('like', 'save')),
  created_at timestamptz not null default now(),
  primary key (beat_id, user_id, kind)
);

create index if not exists beat_reactions_beat_idx on public.beat_reactions (beat_id, kind);
create index if not exists beat_reactions_user_idx on public.beat_reactions (user_id, kind, created_at desc);

alter table public.beat_reactions enable row level security;

-- Свои реакции видны все, чужие лайки тоже: это публичная витрина. Писать
-- может только человек, который смотрит.
create policy "beat reactions are viewable by everyone"
  on public.beat_reactions for select
  using (true);

create policy "own reactions only"
  on public.beat_reactions for insert
  with check (auth.uid() = user_id);

create policy "own reactions can be removed"
  on public.beat_reactions for delete
  using (auth.uid() = user_id);

-- Свой бит лайкать нельзя: счётчик влияет на скор, и иначе можно было бы
-- подняться в ленте, ни разу не выложив ничего.
create or replace function public.beat_reaction_no_self() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.beats
     where id = new.beat_id and owner_id = new.user_id
  ) then
    raise exception 'Свой бит реагировать нельзя';
  end if;

  return new;
end;
$$;

drop trigger if exists beat_reactions_no_self on public.beat_reactions;

create trigger beat_reactions_no_self
  before insert on public.beat_reactions
  for each row execute function public.beat_reaction_no_self();

-- 2. Уровень продавца --------------------------------------------------

alter table public.profiles
  add column if not exists level integer not null default 1,
  add column if not exists level_score numeric not null default 0;

comment on column public.profiles.level is
  'Уровень 1..10 по реальной активности. Поднимает биты в ленте, но ограниченно.';

-- /*
--  Уровень считается из того, что человек делает руками: продал, выложил,
--  выдержал работу до конца. Подписчики и прослушивания не в счёт��ле — иначе
--  уровень растёт от чужого интереса, а не от своей работы.
--
--  Пороги подобраны так, чтобы десятый уровень требовал настоящей
--  истории: пятнадцать продаж и двадцать выложенных битов.
-- */
create or replace function public.seller_level_score(p_user uuid)
returns numeric language sql stable set search_path = public as $$
  with stats as (
    select
      (select count(*) from public.beats where owner_id = p_user and is_public) as beats,
      (
        select count(distinct oi.order_id)
          from public.order_items oi
          join public.orders o on o.id = oi.order_id
         where oi.beat_owner_id = p_user
           and o.status in ('paid', 'delivered')
      ) as sales,
      (select coalesce(sum(plays), 0) from public.beats where owner_id = p_user) as plays
  )
  -- ln(...) вместо степеней: вклад растёт, но никогда не перевешивает всё
  -- остальное вместе взятое.
  select round((
      least(40, 8 * ln(coalesce(beats, 0) + 1))
    + least(40, 14 * ln(coalesce(sales, 0) + 1))
    + least(20, 4 * ln(coalesce(plays, 0) + 1))
  )::numeric, 2)
  from stats;
$$;

create or replace function public.level_for_score(p_score numeric)
returns integer language sql immutable set search_path = public as $$
  select least(10, greatest(1, 1 + floor(p_score / 12.0))::integer);
$$;

create or replace function public.recalc_seller_level(p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_score numeric;
  v_level integer;
begin
  v_score := public.seller_level_score(p_user);
  v_level := public.level_for_score(v_score);

  update public.profiles
     set level_score = v_score,
         level = v_level
   where id = p_user;

  return v_level;
end;
$$;

grant execute on function public.seller_level_score(uuid) to anon, authenticated;
grant execute on function public.level_for_score(numeric) to anon, authenticated;
grant execute on function public.recalc_seller_level(uuid) to authenticated, service_role;

-- 3. Скор бита ---------------------------------------------------------

alter table public.beats
  add column if not exists score numeric not null default 0,
  add column if not exists scored_at timestamptz;

comment on column public.beats.score is
  'Ранжирующий вес: реакции с затуханием по времени, с множителем уровня продавца';

create index if not exists beats_score_idx on public.beats (score desc, created_at desc)
  where is_public;

-- /*
--  Скор бита.
--
--  Затухание: половина веса каждые трое суток. Через месяц бит весит
--  примерно 2% от своего пика — не вычеркнут, но и не висит в топе.
--
--  Уровень продавца: от 1.0 до 1.45. Потолок стоит намеренно: без него
--  продавец с большим каталогом держал бы верх ленты один, и новичку
--  достался бы только второй экран.
--
--  Качество: полный набор дорожек — это товар, а не тизер за 500 рублей,
--  поэтому такой бит встаёт чуть выше. Обложка — то же самое.
-- */
create or replace function public.beat_score(p_beat_id uuid)
returns numeric language sql stable set search_path = public as $$
  with data as (
    select
      b.id,
      b.plays,
      b.created_at,
      b.cover_url,
      b.files,
      b.owner_id,
      coalesce(p.level, 1) as seller_level,
      (select count(*) from public.beat_reactions r where r.beat_id = b.id and r.kind = 'like') as likes,
      (select count(*) from public.beat_reactions r where r.beat_id = b.id and r.kind = 'save') as saves
    from public.beats b
    left join public.profiles p on p.id = b.owner_id
   where b.id = p_beat_id
  )
  select round((
      (
        coalesce(plays, 0)
        + 3 * coalesce(likes, 0)
        + 6 * coalesce(saves, 0)
      )
      -- exp(-ln(2) * возраст / 3): половина каждые трое суток.
      --
      -- Приведение к double обязательно: в PostgreSQL есть только
      -- exp(double precision), а ln() от numeric даёт numeric, и без
      -- приведения вызов не находился бы вовсе.
      * exp((-ln(2) * greatest(extract(epoch from (now() - created_at)) / 86400, 0) / 3.0)::double precision)
      -- Потолок 1.45 при десятом уровне.
      * (1 + least(45, 5 * greatest(seller_level - 1, 0)) / 100.0)
      * (
          1
          + case when jsonb_object_length(coalesce(files, '{}'::jsonb)) >= 3 then 0.15 else 0 end
          + case when cover_url is not null then 0.08 else 0 end
        )
    )::numeric, 4)
  from data;
$$;

create or replace function public.recount_beat(p_beat_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_score numeric;
begin
  v_score := public.beat_score(p_beat_id);

  update public.beats
     set score = v_score,
         scored_at = now()
   where id = p_beat_id;

  return v_score;
end;
$$;

grant execute on function public.beat_score(uuid) to anon, authenticated;
grant execute on function public.recount_beat(uuid) to service_role;

-- Пересчёт всего каталога: крон или кнопка в кабинете.
create or replace function public.recount_all_beats()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  update public.beats b
     set score = public.beat_score(b.id),
         scored_at = now();

  get diagnostics v_count = row_count;

  update public.profiles p
     set level_score = public.seller_level_score(p.id),
         level = public.level_for_score(public.seller_level_score(p.id));

  return v_count;
end;
$$;

revoke execute on function public.recount_all_beats() from public, anon, authenticated;
grant execute on function public.recount_all_beats() to service_role;

-- 4. Реакция пересчитывает бит сразу -----------------------------------

create or replace function public.recount_on_reaction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- В DELETE запись NEW пуста, поэтому бит берётся из OLD, а возвращать
  -- нужно ту строку, которая соответствует операции: coalesce на составном
  -- типе здесь не работает.
  perform public.recount_beat(case when tg_op = 'DELETE' then old.beat_id else new.beat_id end);

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists beat_reactions_recount on public.beat_reactions;

create trigger beat_reactions_recount
  after insert or delete on public.beat_reactions
  for each row execute function public.recount_on_reaction();

-- 5. Первичный пересчёт ------------------------------------------------
--
-- Функции выше созданы в этой же миграции, поэтому вызов в конце корректен.

select public.recount_all_beats();