-- 0032. Новый бит у того, на кого подписан -----------------------------
--
-- Подписка давала только пассивную ленту: чтобы увидеть новый бит, надо было
-- самому зайти на вкладку «Подписки». Без напоминания человек не заходит, и
-- подписка становится кнопкой без последствий.
--
-- Уведомление замыкает цикл: подписался → увидел новый бит → послушал →
-- отреагировал → автор выложил ещё.

-- 1. Вид уведомления ----------------------------------------------------
--
-- Проверка меняется под блокировкой ACCESS EXCLUSIVE, а любой запрос
-- уведомлений держит ACCESS SHARE. Одна команда вместо двух, короткое
-- ожидание и три попытки — тот же приём, что в 0031: иначе миграция падает
-- случайно, если кто-то в этот момент открыл страницу уведомлений.

do $$
declare
  v_done boolean := false;
begin
  perform set_config('lock_timeout', '2s', true);

  for attempt in 1..3 loop
    begin
      alter table public.notifications
        drop constraint if exists notifications_kind_check,
        add constraint notifications_kind_check
        check (kind in (
          'reply', 'like', 'follow',
          'sale', 'achievement',
          'beat_uploaded', 'beat_failed', 'beat_published',
          'review', 'order_ready', 'beat_comment',
          'follow_beat'
        ));

      v_done := true;
      exit;
    exception
      when lock_not_available then
        raise notice 'notifications занята, попытка % из 3', attempt;
        perform pg_sleep(0.5);
    end;
  end loop;

  if not v_done then
    raise exception 'notifications занята дольше 6 секунд — закрой страницу уведомлений и повтори';
  end if;
end;
$$;

-- 2. Подписчики получают новый бит -------------------------------------

/*
 * Работа вынесена отдельной функцией, потому что дорог к «бит стал публичным»
 * две: загрузка сразу публичного и публикация уже загруженного. Вызвать
 * триггерную функцию из триггерной нельзя — она ждёт NEW и OLD, — поэтому
 * общая часть живёт здесь.
 */
create or replace function public.notify_new_beat(p_beat uuid, p_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_follower uuid;
begin
  for v_follower in
    select follower_id from public.follows where following_id = p_owner
  loop
    perform public.notify_user(v_follower, 'follow_beat', p_owner, p_beat);
  end loop;
end;
$$;

revoke execute on function public.notify_new_beat(uuid, uuid) from public, anon, authenticated;
grant execute on function public.notify_new_beat(uuid, uuid) to service_role;

-- Загрузка сразу публичного бита.
create or replace function public.beats_notify_followers_on_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  /*
   * Уведомляем только о том, что видно в ленте. Черновик — рабочая заготовка:
   * подписчик не должен получать уведомление о бите, который нельзя открыть.
   */
  if new.is_public then
    perform public.notify_new_beat(new.id, new.owner_id);
  end if;

  return new;
end;
$$;

drop trigger if exists beats_notify_followers on public.beats;

create trigger beats_notify_followers
  after insert on public.beats
  for each row execute function public.beats_notify_followers_on_insert();

-- Публикация уже загруженного бита.
create or replace function public.beats_notify_followers_on_publish() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_public and not old.is_public then
    perform public.notify_new_beat(new.id, new.owner_id);
  end if;

  return new;
end;
$$;

drop trigger if exists beats_notify_followers_published on public.beats;

create trigger beats_notify_followers_published
  after update on public.beats
  for each row execute function public.beats_notify_followers_on_publish();

-- 3. Один бит — одно уведомление подписчику ----------------------------
--
-- У подписчика много подписок, и без отдельного индекса уведомления о разных
-- битах одного автора схлопывались бы в одно: в индексе из 0028 от загрузок
-- ключ считается по биту, но вид follow_beat в него не входил.

create unique index if not exists notifications_once_per_follow_beat
  on public.notifications (user_id, kind, beat_id)
  where kind = 'follow_beat';

comment on index public.notifications_once_per_follow_beat is
  'Один новый бит — одно уведомление подписчику, даже если триггер сработал дважды';