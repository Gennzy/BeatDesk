-- Начисление продавцу при подтверждении оплаты.
--
-- Раньше mark_order_paid выдавал лицензию и на этом заканчивал: деньги
-- продавцу не начислялись нигде, таблица payouts оставалась пустой, а
-- покупатель платил продавцу напрямую. Теперь покупатель платит
-- площадке, площадка удерживает комиссию, остаток падает на баланс
-- продавца и выводится по заявке.
--
-- Функция переопределяет mark_order_paid, а не добавляет новую: вызов
-- один и тот же — из маршрута /api/orders/[id]/paid. Две функции на
-- одно действие означали бы, что рано или поздно вызовут не ту.
--
-- Что здесь принципиально:
--
--   * commission_bps читается из настроек и записывается в запись
--     вместе с суммой комиссии. Позже ставку можно будет менять, и
--     старые продажи не пересчитаются задним числом.
--
--   * Начисление по позициям, а не по заказу: комиссия считается от
--     суммы заказа, но продавцу каждого бита достаётся своя часть. В
--     заказе могут быть биты разных продавцов.
--
--   * on conflict do nothing по (order_id) там, где kind = 'sale':
--     функцию вызывают повторно при повторной оплате, и второе
--     начисление было бы двойной выплатой продавцу.

create or replace function public.mark_order_paid(
  p_order_id uuid,
  p_provider text default 'manual',
  p_external_id text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_caller uuid := auth.uid();
begin
  /*
   * Проверка прав возвращена после того, как её потеряли.
   *
   * Миграция 0024 объявляла эту функцию с проверкой «подтвердить может
   * только продавец бита из заказа». Переопределение функции в 0044
   * обошло её: остались только service_role, а продавец подтверждает
   * оплату своей сессией и получил бы отказ. А стоило вернуть выдачу
   * authenticated как была — и подтвердить оплату любого заказа мог бы
   * кто угодно, а вместе с начислением это значило бы начислить себе
   * деньги.
   *
   * Функция объявлена security definer, поэтому auth.uid() здесь —
   * вызывающий, а не владелец таблицы.
   */
  if v_caller is null or not exists (
    select 1
      from public.order_items i
      join public.beats b on b.id = i.beat_id
     where i.order_id = p_order_id
       and b.owner_id = v_caller
  ) then
    raise exception 'Подтвердить оплату может только продавец бита из заказа';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if v_order.id is null then
    raise exception 'Заказ не найден';
  end if;

  /*
   * Заказ уже оплачен — возвращаем как есть и начислений не делаем.
   * Идемпотентность здесь не удобство: повторная оплата от одного
   * покупателя не должна превращаться в две выплаты продавцу.
   */
  if v_order.status = 'paid' then
    return v_order;
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Заказ в статусе %, оплату не принять', v_order.status;
  end if;

  update public.orders
     set status = 'paid', paid_at = now(), closed_at = now(),
         payment_provider = p_provider, payment_external_id = p_external_id
   where id = p_order_id
   returning * into v_order;

  update public.beats b
     set sale_state = case when exists (
           select 1 from public.order_items i
            where i.order_id = p_order_id and i.beat_id = b.id and i.tier = 'exclusive'
         ) then 'sold_exclusive' else 'on_sale' end,
         reserved_until = null,
         reserved_by_order = null
   where b.id in (select beat_id from public.order_items where order_id = p_order_id);

  /*
   * Начисление продавцу за каждую позицию своего бита.
   *
   * Комиссию здесь НЕ считаем. Она уже посчитана при создании заказа и
   * лежит в позиции: price_minor = commission_minor + seller_net_minor,
   * и это закреплено ограничением таблицы. Повторный расчёт взял бы её
   * второй раз уже с net-суммы, и продавец получил бы на 10% меньше, чем
   * показывал интерфейс при оформлении.
   *
   * Начисление равно ровно seller_net_minor — столько, сколько по условиям
   * заказа причитается продавцу. Ставку записываем фактическую, а не
   * текущую из настроек: она считается обратным счётом от суммы позиции,
   * и потому переживает изменение настройки задним числом.
   */
  insert into public.seller_transactions (
    seller_id, kind, amount_minor, gross_minor, commission_minor,
    commission_bps, currency, order_id, note
  )
  select
    i.beat_owner_id,
    'sale',
    i.seller_net_minor,
    i.price_minor,
    i.commission_minor,
    case when i.price_minor > 0
         then (i.commission_minor * 10000 / i.price_minor)
         else null end,
    i.currency,
    p_order_id,
    'Заказ ' || p_order_id::text
  from public.order_items i
  where i.order_id = p_order_id
    and i.seller_net_minor > 0
  on conflict do nothing;

  -- Лицензия выдаётся на каждую позицию: это и есть доказательство покупки.
  insert into public.licenses (
    order_item_id, license_key, beat_id, buyer_id, buyer_email, tier, terms
  )
  select i.id,
         encode(gen_random_bytes(16), 'hex'),
         i.beat_id,
         v_order.buyer_id,
         v_order.buyer_email,
         i.tier,
         i.terms
    from public.order_items i
   where i.order_id = p_order_id
  on conflict (order_item_id) do nothing;

  return v_order;
end;
$$;

grant execute on function public.mark_order_paid(uuid, text, text) to authenticated;
revoke execute on function public.mark_order_paid(uuid, text, text) from anon;

-- Баланс продавца. Считается из журнала, а не хранится полем.
create or replace function public.seller_balance_minor(p_seller_id uuid)
returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount_minor), 0)::bigint
    from public.seller_transactions
   where seller_id = p_seller_id;
$$;

grant execute on function public.seller_balance_minor(uuid) to authenticated;

comment on function public.seller_balance_minor(uuid) is
  'Баланс продавца в копейках. Считается из журнала seller_transactions, поэтому баланс без записей получить невозможно.';

/*
 * Отката начисления здесь нет и быть не должно. Отдельная функция
 * revoke_order_payout вызывалась бы из маршрута возврата — лишнее звено
 * между «заказ вернули» и «продавцу сняли деньги». Такие звенья теряются:
 * маршрут переписали, про откат забыли, и площадка осталась должна
 * продавцу за отменённый товар. Поэтому откат живёт внутри close_order,
 * см. миграцию 0045.
 */
