-- BeatDesk: уведомления соавторам при продаже
--
-- notify_sale раньше уведомлял только владельца бита. Теперь, если у бита есть
-- соавторы, каждый из них тоже получает уведомление о продаже (кроме покупателя
-- и владельца, который уже уведомлён выше).

create or replace function public.notify_sale(
  p_order_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_collab record;
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
    if v_item.beat_owner_id = v_order.buyer_id then
      continue;
    end if;

    insert into public.notifications (user_id, kind, actor_id, beat_id, order_id)
    values (v_item.beat_owner_id, 'sale', v_order.buyer_id, v_item.beat_id, v_order.id)
    on conflict do nothing;
  end loop;

  -- Соавторам: каждому, кто не владелец и не покупатель.
  for v_item in
    select distinct i.beat_id, i.beat_owner_id, b.collaborators
      from public.order_items i
      join public.beats b on b.id = i.beat_id
     where i.order_id = v_order.id
  loop
    if v_item.collaborators is null or jsonb_typeof(v_item.collaborators) <> 'array' then
      continue;
    end if;

    for v_collab in
      select (e->>'user_id')::uuid as user_id
        from jsonb_array_elements(v_item.collaborators) e
    loop
      if v_collab.user_id is null then
        continue;
      end if;
      if v_collab.user_id = v_order.buyer_id then
        continue;
      end if;
      if v_collab.user_id = v_item.beat_owner_id then
        continue;
      end if;

      insert into public.notifications (user_id, kind, actor_id, beat_id, order_id)
      values (v_collab.user_id, 'sale', v_order.buyer_id, v_item.beat_id, v_order.id)
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.notify_sale(uuid) from public, anon, authenticated;
grant execute on function public.notify_sale(uuid) to service_role;