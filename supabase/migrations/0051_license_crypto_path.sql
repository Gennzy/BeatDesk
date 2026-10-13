-- Лицензии не выдавались: gen_random_bytes не виден из функций.
--
-- pgcrypto в Supabase живёт в схеме extensions, а денежные функции закрыты
-- через set search_path = public. Табличные default на gen_random_uuid при
-- этом работали всегда, поэтому отсутствие расширения заметили только
-- сейчас — первым же вызовом mark_order_paid: e2e впервые довёл заказ до
-- оплаты, и лицензия не собралась с «function gen_random_bytes does not
-- exist». До этого ни один заказ в новой модели оплачен не был.
--
-- Чинится в двух местах: расширение ставится явно (идемпотентно), а вызов
-- квалифицируется схемой, чтобы не зависеть от search_path вообще.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.mark_order_paid(
  p_order_id uuid,
  p_provider text default 'manual',
  p_external_id text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  /*
   * Проверка прав возвращена по существу, а не по форме.
   *
   * До смены модели подтверждал продавец: он видел деньги на своём счёте и
   * мог их увидеть. Теперь деньги приходят на счёт площадки, и продавец
   * подтвердить поступление не может — только оператор, чей это счёт.
   *
   * Если бы проверки не было, продавец нажимал бы кнопку по неоплаченному
   * заказу и получал лицензию и начисление. Дальше это выводилось бы с
   * баланса: кнопка печатала бы деньги.
   */
  if not public.is_operator() then
    raise exception 'Подтвердить оплату может только оператор площадки';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if v_order.id is null then
    raise exception 'Заказ не найден';
  end if;

  /*
   * Уже оплачен — возвращаем как есть. Идемпотентность здесь не удобство:
   * повторное нажатие не должно превращаться в две выплаты продавцу.
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
   * Начисление равно ровно seller_net_minor: комиссия уже посчитана при
   * создании заказа и лежит в позиции (price = commission + seller_net).
   * Повторный расчёт взял бы её второй раз уже с net-суммы, и продавец
   * получил бы меньше, чем показывал интерфейс при оформлении.
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

  insert into public.licenses (
    order_item_id, license_key, beat_id, buyer_id, buyer_email, tier, terms
  )
  select i.id,
         encode(extensions.gen_random_bytes(16), 'hex'),
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
