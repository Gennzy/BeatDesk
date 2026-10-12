-- Оператор площадки и права на деньги.
--
-- Смена модели (покупатель платит площадке, не продавцу) сделала старое
-- правило опасным. Раньше продавец видел деньги на своём счёте и
-- подтверждал оплату сам. Теперь деньги приходят на счёт площадки,
-- продавец их не видит и подтвердить не может — но кнопка у него стояла.
--
-- Что из этого получалось: продавец нажимает «подтвердить оплату» по
-- заказу, который никто не оплачивал, заказ становится оплаченным,
-- лицензия выдаётся, а на баланс падает начисление. Дальше это
-- выводится. То есть кнопка печатала деньги.
--
-- Поэтому подтверждение оплаты и возврат переходят оператору — тому,
-- чей счёт получает деньги и кто может их увидеть. Продавец оставляет
-- отмену неоплаченного заказа: там нет денег, только снятие придержания.
--
-- ---------------------------------------------------------------------
-- ПЕРВЫЙ ОПЕРАТОР НАЗНАЧАЕТСЯ ВРУЧНУЮ, ОДИН РАЗ
--
--     update public.profiles set is_operator = true where username = 'ВАШ_НИК';
--
-- Дальше оператор добавляет остальных сам из кабинета. Автоматического
-- назначения нет намеренно: право подтверждать чужие деньги не должно
-- появляться у того, кто просто зарегистрировался.
--
-- Поле, а не список в настройках: право нужно проверять в RLS на каждой
-- таблице, и список пришлось бы читать в каждой политике. Поле читается
-- одним сравнением с auth.uid().
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_operator boolean not null default false;

create index if not exists profiles_is_operator_idx
  on public.profiles (id) where is_operator;

comment on column public.profiles.is_operator is
  'Оператор площадки: видит все заказы, подтверждает оплату, возвращает деньги и закрывает выплаты. Назначается вручную, автоматического назначения нет.';

/*
 * Проверка оператора одной функцией.
 *
 * Функция, а не сравнение `is_operator = auth.uid() > false` в каждой
 * политике: правило «кто считается оператором» должно существовать в
 * одном месте. Иначе одна из политик про него забудет, и это будет
 * выглядеть как «у нас тут оператор другой».
 */
create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_operator from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_operator() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Подтверждение оплаты — только оператору.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Закрытие заказа: отмена неоплаченного — продавцу, возврат — оператору.
--
-- Разделено не из педантизма. Отмена ожидающего заказа двигает только
-- придержание бита: денег ещё нет, терять нечего, и продавцу нужно
-- освободить бит самому. Возврат же снимает деньги продавцу с баланса и
-- отдаёт их покупателю — это движение средств, и оно за оператором.
-- ---------------------------------------------------------------------------
create or replace function public.close_order(
  p_order_id uuid,
  p_status text,
  p_manual_reason text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_caller uuid := auth.uid();
  v_is_seller boolean;
begin
  if p_status not in ('cancelled', 'failed', 'refunded') then
    raise exception 'Закрыть заказ можно только как cancelled, failed или refunded';
  end if;

  select exists (
    select 1
      from public.order_items i
      join public.beats b on b.id = i.beat_id
     where i.order_id = p_order_id
       and b.owner_id = v_caller
  ) into v_is_seller;

  /*
   * Возврат — только оператору. Он отдаёт покупателю деньги и снимает их
   * продавцу с баланса; продавец, отменяя заказ сам, мог бы снимать
   * средства со своего же начисления.
   */
  if p_status = 'refunded' and not public.is_operator() then
    raise exception 'Возврат средств может сделать только оператор площадки';
  end if;

  /*
   * Отмену неоплаченного заказа может продавец — она ничего не стоит.
   * Оплаченный заказ отменой не закрывается: это уже возвра��.
   */
  if p_status <> 'refunded' and not v_is_seller and not public.is_operator() then
    raise exception 'Закрыть заказ может только продавец бита из заказа или оператор';
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

    /*
     * Откат начисления живёт здесь же, а не в маршруте возврата: возврат
     * отнимает деньги у покупателя и оставляет их у продавца, если про
     * списание забыть. Отдельная функция вызывалась бы из кода, который
     * рано или поздно перепишут и про неё забудут.
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

-- Заявки на вывод закрывает оператор: он отправляет деньги своими руками.
revoke all on function public.complete_payout(uuid, boolean) from authenticated, anon;
grant execute on function public.complete_payout(uuid, boolean) to service_role;