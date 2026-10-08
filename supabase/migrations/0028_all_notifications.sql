-- 0028. Уведомления обо всех событиях площадки ---------------------------
--
-- Набор видов рос по мере надобности: сначала были reply, like, follow, потом
-- добавились sale и achievement. Каждый раз это отдельная правка CHECK, и к
-- текущему моменту половина событий площадки — загрузка бита, публикация на
-- витрине, отзыв, готовый заказ — не попадала в уведомления вовсе.
--
-- Здесь виды закрываются разом, а вставка сводится к одной функции
-- notify_user: пока у каждого места своя вставка с ON CONFLICT, правила
-- «не спамить» расходятся.

-- 1. Виды ---------------------------------------------------------------

alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
  check (kind in (
    'reply', 'like', 'follow',
    'sale', 'achievement',
    'beat_uploaded', 'beat_failed', 'beat_published',
    'review', 'order_ready'
  ));

-- 2. Номер события внутри объекта ---------------------------------------
--
-- Колонка идёт до индексов: уведомление о неудачной загрузке одно на бит, а
-- битов у битмейкера много. Без неё по beat_id сходились бы уведомления о
-- двух разных попытках, а key_index разводит их.

alter table public.notifications
  add column if not exists key_index integer;

comment on column public.notifications.key_index is
  'Номер события внутри одного объекта: различает уведомления о разных битах';

-- 3. Единая вставка -----------------------------------------------------
--
-- Всё необязательное: у события про свои биты актора нет (загрузка —
-- действие самого битмейкера), у отзыва бывает путь без заказа.

create or replace function public.notify_user(
  p_user uuid,
  p_kind text,
  p_actor uuid default null,
  p_beat uuid default null,
  p_order uuid default null,
  p_key integer default null
) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, actor_id, beat_id, order_id, key_index)
  values (p_user, p_kind, p_actor, p_beat, p_order, p_key)
  on conflict do nothing;
$$;

revoke execute on function public.notify_user(uuid, text, uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.notify_user(uuid, text, uuid, uuid, uuid, integer) to authenticated, service_role;

-- 4. Правила «не спамить» по видам --------------------------------------
--
-- Индекс из 0026 для подписок ловил и order_ready, у которого заказ есть, а
-- бит и пост нет: два разных заказа от одного продавца схлопывались в одно
-- уведомление. Поэтому он пересоздаётся с оговоркой про заказ.

drop index if exists public.notifications_once_per_actor_follow;

create unique index if not exists notifications_once_per_actor_follow
  on public.notifications (user_id, kind, coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where post_id is null and beat_id is null and order_id is null;

create unique index if not exists notifications_once_per_own_event
  on public.notifications (user_id, kind, coalesce(beat_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(key_index, 0))
  where kind in ('beat_uploaded', 'beat_failed', 'beat_published', 'achievement');

-- Отзыв: один на позицию заказа и без повторов. Разные покупатели про один
-- бит отзывы оставить обязаны, поэтому уникальность живёт на авторе.
create unique index if not exists notifications_once_per_review
  on public.notifications (user_id, kind, actor_id, beat_id)
  where kind = 'review';

-- 5. Отзыв битмейкеру ----------------------------------------------------
--
-- Отзыв пишет покупатель, а уведомление получает продавец. В приложении это
-- разные точки, поэтому триггер: забыть можно было бы в любой из двух, а
-- продавец узнал бы об отзыве из ленты вместо уведомления.

create or replace function public.notify_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_user(new.subject_id, 'review', new.author_id, new.beat_id);

  return new;
end;
$$;

drop trigger if exists reviews_notify_author on public.reviews;

create trigger reviews_notify_author
  after insert on public.reviews
  for each row execute function public.notify_review();