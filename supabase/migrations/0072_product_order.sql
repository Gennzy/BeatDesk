-- BeatDesk: товары в заказе
--
-- create_order и create_order_checked раньше работали только с битами: каждый
-- элемент p_items обязан был содержать beat_id и tier, а бит брался с
-- блокировкой строки и резервировался. Товар (кит/пресет/услуга) не бит:
-- у него нет уровней и резервирования, цена берётся из products.
--
-- Теперь элемент может содержать product_id вместо beat_id. create_order_checked
-- для таких элементов не проверяет файлы уровней (у товара нет уровней).

-- 1. create_order: поддержка product_id
create or replace function public.create_order(
  p_items jsonb,
  p_currency text default 'RUB',
  p_buyer_email text default auth.jwt() ->> 'email',
  p_contact jsonb default '{}'::jsonb
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_settings public.platform_settings;
  v_order public.orders;
  v_item jsonb;
  v_beat public.beats%rowtype;
  v_product public.products%rowtype;
  v_tier text;
  v_price numeric;
  v_commission numeric;
  v_seller numeric;
  v_total numeric := 0;
  v_commission_total numeric := 0;
  v_seller_total numeric := 0;
  v_currency text;
  v_buyer uuid := auth.uid();
  v_product_id uuid;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Заказ пустой';
  end if;

  if p_buyer_email is null or length(trim(p_buyer_email)) = 0 then
    raise exception 'Нужен адрес для доставки файлов';
  end if;

  perform public.release_expired_reservations();

  select * into v_settings from public.platform_settings where singleton;

  if v_settings is null then
    raise exception 'Настройки площадки не заданы';
  end if;

  insert into public.orders (buyer_id, buyer_email, contact, currency)
  values (v_buyer, trim(p_buyer_email), coalesce(p_contact, '{}'::jsonb), 'RUB')
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;

    if v_product_id is not null then
      -- Товар: кит/пресет/услуга.
      select * into v_product from public.products where id = v_product_id for update;

      if v_product.id is null then
        raise exception 'Товар не найден: %', v_product_id;
      end if;

      if v_product.owner_id = v_buyer then
        raise exception 'Свой товар купить нельзя: %', v_product.title;
      end if;

      if not v_product.is_public then
        raise exception 'Товар не продаётся: %', v_product.title;
      end if;

      v_currency := v_product.currency;

      if v_currency is null or v_currency <> p_currency then
        raise exception 'Валюта заказа не совпадает с валютой товара: %', v_product.title;
      end if;

      v_price := round(v_product.price_minor::numeric);
      v_commission := round(v_price * v_settings.commission_bps / 10000);
      v_seller := v_price - v_commission;

      insert into public.order_items (
        order_id, product_id, price_minor, commission_minor, seller_net_minor,
        beat_title, beat_owner_id, currency, terms
      ) values (
        v_order.id, v_product.id, v_price, v_commission, v_seller,
        v_product.title, v_product.owner_id, v_currency,
        jsonb_build_object('kind', v_product.kind)
      );

      v_total := v_total + v_price;
      v_commission_total := v_commission_total + v_commission;
      v_seller_total := v_seller_total + v_seller;
    else
      -- Бит: как раньше.
      v_tier := v_item ->> 'tier';

      select * into v_beat
        from public.beats
       where id = (v_item ->> 'beat_id')::uuid
         for update;

      if v_beat.id is null then
        raise exception 'Бит не найден: %', v_item ->> 'beat_id';
      end if;

      if v_beat.owner_id = v_buyer then
        raise exception 'Свой бит купить нельзя: %', v_beat.title;
      end if;

      if v_beat.sale_state = 'sold_exclusive' then
        raise exception 'Бит продан эксклюзивно и больше не продаётся: %', v_beat.title;
      end if;

      if v_beat.sale_state = 'reserved' and v_beat.reserved_until > now() then
        raise exception 'Бит уже оплачивает другой покупатель: %', v_beat.title;
      end if;

      if v_beat.sale_state = 'draft' then
        raise exception 'Бит не выставлен на продажу: %', v_beat.title;
      end if;

      v_currency := v_beat.currency;

      if v_currency is null or v_currency <> p_currency then
        raise exception 'Валюта заказа не совпадает с валютой бита: %', v_beat.title;
      end if;

      v_price := (v_beat.prices ->> v_tier)::numeric;

      if v_price is null or v_price <= 0 then
        raise exception 'Уровень % не продаётся: %', v_tier, v_beat.title;
      end if;

      v_price := round(v_price * 100);
      v_commission := round(v_price * v_settings.commission_bps / 10000);
      v_seller := v_price - v_commission;

      insert into public.order_items (
        order_id, beat_id, tier, price_minor, commission_minor, seller_net_minor,
        beat_title, beat_owner_id, currency, terms
      ) values (
        v_order.id, v_beat.id, v_tier, v_price, v_commission, v_seller,
        v_beat.title, v_beat.owner_id, v_currency,
        jsonb_build_object('tier', v_tier, 'bpm', v_beat.bpm, 'key', v_beat.key, 'currency', v_currency)
      );

      v_total := v_total + v_price;
      v_commission_total := v_commission_total + v_commission;
      v_seller_total := v_seller_total + v_seller;

      update public.beats
         set sale_state = 'reserved',
             reserved_until = now() + make_interval(mins => v_settings.reservation_minutes),
             reserved_by_order = v_order.id
       where id = v_beat.id;
    end if;
  end loop;

  update public.orders
     set total_minor = v_total,
         commission_minor = v_commission_total,
         seller_net_minor = v_seller_total,
         currency = v_currency
   where id = v_order.id
   returning * into v_order;

  return v_order;
end;
$$;

grant execute on function public.create_order(jsonb, text, text, jsonb) to authenticated;
revoke execute on function public.create_order(jsonb, text, text, jsonb) from anon, public;

-- 2. create_order_checked: пропускать проверку файлов для товаров
create or replace function public.create_order_checked(
  p_items jsonb,
  p_currency text default 'RUB',
  p_buyer_email text default auth.jwt() ->> 'email',
  p_contact jsonb default '{}'::jsonb
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_beat_id uuid;
  v_tier text;
  v_title text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Заказ пустой';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Товары не проверяются на файлы уровней.
    if (v_item ->> 'product_id') is not null and (v_item ->> 'product_id') <> '' then
      continue;
    end if;

    v_beat_id := (v_item ->> 'beat_id')::uuid;
    v_tier := v_item ->> 'tier';

    select b.title into v_title from public.beats b where b.id = v_beat_id;

    if v_title is null then
      raise exception 'Бит не найден: %', v_item ->> 'beat_id';
    end if;

    if not public.beat_has_tier_file(v_beat_id, v_tier) then
      raise exception 'Файл уровня «%» не продаётся битмейкером: %', v_tier, v_title;
    end if;
  end loop;

  return public.create_order(p_items, p_currency, p_buyer_email, p_contact);
end;
$$;

grant execute on function public.create_order_checked(jsonb, text, text, jsonb) to authenticated;
revoke execute on function public.create_order_checked(jsonb, text, text, jsonb) from anon;