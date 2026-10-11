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
  v_bps integer;
  v_gross bigint;
  v_commission bigint;
begin
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

  -- Комиссия площадки. Настройка может быть не выставлена при первом
  -- запуске: тогда берём нулевую, но не падаем — заказ уже оплачен, и
  -- ронять оплаченный заказ из-за настройки нельзя.
  select coalesce(commission_bps, 0) into v_bps from public.platform_settings limit 1;
  v_bps := coalesce(v_bps, 0);

  /*
   * Начисление продавцу за каждую позицию своего бита.
   *
   * seller_net_minor в позиции — это сумма, которую получает продавец
   * по условиям заказа. Комиссию берём от этой суммы, а не от цены в
   * рублях: позиция уже приведена к минорным единицам и не зависит от
   * того, списана скидка или нет.
   */
  insert into public.seller_transactions (
    seller_id, kind, amount_minor, gross_minor, commission_minor,
    commission_bps, currency, order_id, note
  )
  select
    i.beat_owner_id,
    'sale',
    -- округление вниз, как и у скидки: копейка не должна уходить назад
    -- продавцу из-за округления комиссии платформой
    (i.seller_net_minor - ((i.seller_net_minor * v_bps) / 10000))::bigint,
    i.seller_net_minor::bigint,
    ((i.seller_net_minor * v_bps) / 10000)::bigint,
    v_bps,
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

grant execute on function public.mark_order_paid(uuid, text, text) to service_role;

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
