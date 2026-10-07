-- 0026. Уведомления о продажах и достижениях ---------------------------
--
-- Уведомления были заточены под посты: reply, like, follow. Для битмейкера
-- главное событие -- продажа бита -- в списке отсутствовало, а бонусные
-- покупки не зависели от конкретного бита, поэтому unique-индекс из 0011
-- для них не годился: одна и та же пара (пользователь, вид) схлопывалась
-- навсегда.
--
-- Что меняется:
--   1. CHECK на kind расширен видами sale и achievement.
--   2. Появляется beat_id: без связи уведомление о продаже не знало бы,
--      какой бит продали.
--   3. Отдельные частичные индексы: на корень заказа для продаж и на пару
--      (пользователь, вид) для достижений.

-- 1. Новые виды --------------------------------------------------------

alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('reply', 'like', 'follow', 'sale', 'achievement'));

-- 2. Связи --------------------------------------------------------------

alter table public.notifications
  add column if not exists beat_id uuid references public.beats on delete cascade;

alter table public.notifications
  add column if not exists order_id uuid references public.orders on delete cascade;

-- 3. Индексы ------------------------------------------------------------
--
-- Старый индекс notifications_once_per_actor жилёт на выражении и не умеет
-- различать две разные продажи. Частичные индексы дешевле и точнее: в
-- уведомлениях о постах order_id всегда null, а у достижений beat_id null.

drop index if exists public.notifications_once_per_actor;

create unique index if not exists notifications_once_per_post
  on public.notifications (user_id, kind, coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid), post_id)
  where post_id is not null;

create unique index if not exists notifications_once_per_actor_follow
  on public.notifications (user_id, kind, coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where post_id is null and beat_id is null;

-- Одна продажа -- одно уведомление: повторный вызов функции не должен
-- превращаться в два одинаковых баннера.
create unique index if not exists notifications_once_per_sale
  on public.notifications (user_id, kind, order_id)
  where order_id is not null;

-- Уведомление о продаже продавцу, о покупке -- покупателю.
-- Отдельная функция, а не триггер на orders: уведомление о продаже должно
-- приходить в момент подтверждения оплаты, а не в момент создания заказа.
create or replace function public.notify_sale(
  p_order_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_item record;
begin
  select * into v_order from public.orders where id = p_order_id;

  if v_order.id is null then
    return;
  end if;

  -- Покупателю: биты теперь его.
  insert into public.notifications (user_id, kind, beat_id, order_id)
  values (v_order.buyer_id, 'sale', null, v_order.id)
  on conflict do nothing;

  -- Продавцу: по одному уведомлению на каждый бит в заказе.
  for v_item in
    select distinct beat_owner_id, beat_id
      from public.order_items
     where order_id = v_order.id
       and beat_owner_id is not null
  loop
    -- Свою покупку продавцу не показываем.
    if v_item.beat_owner_id = v_order.buyer_id then
      continue;
    end if;

    insert into public.notifications (user_id, kind, actor_id, beat_id, order_id)
    values (v_item.beat_owner_id, 'sale', v_order.buyer_id, v_item.beat_id, v_order.id)
    on conflict do nothing;
  end loop;
end;
$$;

revoke execute on function public.notify_sale(uuid) from public, anon, authenticated;
grant execute on function public.notify_sale(uuid) to service_role;

-- 5. Когда звать -------------------------------------------------------
--
-- mark_order_paid из 0024 намеренно не переопределяется: там проверка
-- прав продавца, и её копия в миграции разошлась бы с оригиналом при
-- первом же изменении. Уведомление отправляет маршрут подтверждения оплаты
-- (/api/orders/[id]/paid) через service_role сразу после успешного вызова
-- функции: под этим же ролью придёт и платёжный вебхук.
