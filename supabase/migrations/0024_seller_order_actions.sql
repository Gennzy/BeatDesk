-- Право продавца закрыть заказ вручную.
--
-- 0023 выдала mark_order_paid и close_order только service_role: так было
-- безопасно, но неработоспособно — автовыплат и вебхуков провайдера ещё нет,
-- оплата приходит битмейкеру на карту, и подтвердить её некому, кроме него.
-- Текст в заказе обещает «битмейкер закроёт заказ», а механизма не было:
-- каждый заказ навсегда оставался бы «ожидает оплаты».
--
-- Право проверяет сама функция, а не RLS: она security definer и выполняется
-- от владельца схемы, политики на неё не действуют. Продавец — тот, у кого в
-- заказе лежит его бит; покупатель подтвердить оплату за себя не может.

-- 1. Оплата ---------------------------------------------------------------

create or replace function public.mark_order_paid(
  p_order_id uuid,
  p_provider text default 'manual',
  p_external_id text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_caller uuid := auth.uid();
  v_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  /*
   * service_role пускаем без вопросов: под ним придёт вебхук платёжного
   * провайдера, у него в токене нет пользователя. Всем остальным — только
   * продавцу бита из этого заказа.
   */
  if v_role <> 'service_role' and (
    v_caller is null or not exists (
      select 1 from public.order_items i
       where i.order_id = p_order_id
         and i.beat_owner_id = v_caller
    )
  ) then
    raise exception 'Подтвердить оплату может только продавец бита из заказа';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if v_order.id is null then
    raise exception 'Заказ не найден';
  end if;

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

-- 2. Отмена ---------------------------------------------------------------

create or replace function public.close_order(
  p_order_id uuid,
  p_status text,
  p_manual_reason text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_caller uuid := auth.uid();
  v_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  if p_status not in ('cancelled', 'failed', 'refunded') then
    raise exception 'Закрыть заказ можно только как cancelled, failed или refunded';
  end if;

  /*
   * Возврат продавцом не закрыть: он снимает деньги со счёта площадки и
   * отзывает лицензию. Это решение платёжного контура, а не одного
   * битмейкера — до провайдера возврат остаётся недоступен.
   */
  if v_role <> 'service_role' then
    if v_caller is null or not exists (
      select 1 from public.order_items i
       where i.order_id = p_order_id
         and i.beat_owner_id = v_caller
    ) then
      raise exception 'Закрыть заказ может только продавец бита из заказа';
    end if;

    if p_status = 'refunded' then
      raise exception 'Возврат без платёжного провайдера недоступен';
    end if;
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
  end if;

  return v_order;
end;
$$;

grant execute on function public.close_order(uuid, text, text) to authenticated;
