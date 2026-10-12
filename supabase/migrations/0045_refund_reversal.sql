-- Откат начисления при возврате — внутри close_order.
--
-- Отдельная функция revoke_order_payout вызывалась бы из маршрута
-- возврата. Это лишнее звено между «заказ вернули» и «продавцу сняли
-- деньги», а такие звенья теряются: маршрут переписали, забыли про
-- откат, и площадка осталась должна продавцу за отменённый товар.
--
-- Поэтому откат живёт там же, где и сама смена статуса: вернуть заказ
-- и забыть снять начисление физически невозможно.
--
-- Функция close_order переопределяется целиком — её тело переезжает сюда
-- целиком. Точечная правка внутри функции в SQL невозможна, а объявление
-- второй функции с тем же именем перезапишет первую.

create or replace function public.close_order(
  p_order_id uuid,
  p_status text,
  p_manual_reason text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_caller uuid := auth.uid();
begin
  if p_status not in ('cancelled', 'failed', 'refunded') then
    raise exception 'Закрыть заказ можно только как cancelled, failed или refunded';
  end if;

  /*
   * Проверка прав возвращена по той же причине, что и в mark_order_paid:
   * переопределение функции обошло её, и закрыть чужой заказ мог бы
   * кто угодно. Возврат из этой функции снимает деньги продавцу, то
   * есть это не административное действие, а движение средств.
   */
  if v_caller is null or not exists (
    select 1
      from public.order_items i
      join public.beats b on b.id = i.beat_id
     where i.order_id = p_order_id
       and b.owner_id = v_caller
  ) then
    raise exception 'Закрыть заказ может только продавец бита из заказа';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if v_order.id is null then
    raise exception 'Заказ не найден';
  end if;

  if v_order.status = 'paid' and p_status = 'cancelled' then
    raise exception 'Оплаченный заказ отменой не закрывается: нужен возврат';
  end if;

  update public.orders
     set status = p_status, closed_at = now(), manual_reason = coalesce(p_manual_reason, manual_reason)
   where id = p_order_id
   returning * into v_order;

  -- Придержание снимаем только с неоплаченных заказов: оплаченный эксклюзив
  -- уже ушёл с витрины и возвращать его на продажу нельзя.
  if v_order.status = 'pending' then
    update public.beats b
       set sale_state = 'on_sale', reserved_until = null, reserved_by_order = null
     where b.id in (select beat_id from public.order_items where order_id = p_order_id)
       and b.sale_state = 'reserved'
       and b.reserved_by_order = p_order_id;
  end if;

  if p_status = 'refunded' then
    update public.licenses set revoked_at = now()
     where order_item_id in (select id from public.order_items where order_id = p_order_id)
       and revoked_at is null;

    /*
     * Деньги продавцу за этот заказ снимаются здесь же, а не отдельным
     * вызовом из маршрута. Иначе возврат отнимает деньги у покупателя и
     * оставляет их у продавца: заказ закрыт, а на балансе по-прежнему
     * сумма за товар, который не отдан.
     */
    insert into public.seller_transactions (
      seller_id, kind, amount_minor, gross_minor, commission_minor,
      commission_bps, currency, order_id, note
    )
    select
      s.seller_id,
      'refund',
      -s.amount_minor,
      -s.gross_minor,
      -s.commission_minor,
      s.commission_bps,
      s.currency,
      s.order_id,
      'Отзыв начисления: возврат заказа ' || p_order_id::text
    from public.seller_transactions s
    where s.order_id = p_order_id
      and s.kind = 'sale'
      and not exists (
        select 1 from public.seller_transactions r
         where r.order_id = p_order_id and r.kind = 'refund'
      )
    on conflict do nothing;
  end if;

  return v_order;
end;
$$;

grant execute on function public.close_order(uuid, text, text) to authenticated;
revoke execute on function public.close_order(uuid, text, text) from anon;

-- ---------------------------------------------------------------------------
-- Комиссия площадки: 10% вместо 20%.
--
-- 2000 базисных пунктов стояли с момента создания таблицы настроек, когда
-- выплат не существовало вовсе и ставка была выбрана на глаз. Теперь
-- выплаты появились, и 10% — рыночный уровень для маркетплейса такого
-- размера; двадцать процентов заставляют продавца уходить туда, где
-- дешевле.
--
-- Ставка читается в момент продажи и записывается рядом с суммой, поэтому
-- её изменение не пересчитывает уже состоявшиеся начисления.
-- ---------------------------------------------------------------------------
update public.platform_settings
   set commission_bps = 1000
 where singleton;

insert into public.platform_settings (singleton, commission_bps)
select true, 1000
 where not exists (select 1 from public.platform_settings);

comment on column public.platform_settings.commission_bps is
  'Комиссия площадки в базисных пунктах: 1000 = 10%. Записывается в каждое начисление продавцу, поэтому её изменение не трогает прошлые продажи.';