-- Дыры в денежном контуре: оператор, валюта, повторная скидка, чужие файлы.
--
-- Применяется после 0064.
--
-- ---------------------------------------------------------------------------
-- 1. ОПЕРАТОР НЕ ВИДЕЛ ЗАКАЗЫ
--
-- На orders были только две политики: покупатель и продавец. Оператор не
-- покупатель и не продавец, поэтому чтение его клиентом возвращало пусто, а
-- маршрут подтверждения оплаты отвечал 404 «Заказ не найден».
--
-- Итог был такой: подтвердить оплату нельзя, лицензии не выдаются,
-- начисления продавца не появляются, баланс всегда нулевой, выплаты
-- невозможны. Весь контур продаж был мёртв.
--
-- Политика для оператора нужна и в интерфейсе, и в маршрутах: страница
-- оператора читала заказы служебным клиентом, а маршрут — пользовательским, и
-- из-за этого расходились.

create policy "operator reads all orders"
  on public.orders for select
  using (public.is_operator());

create policy "operator reads all order items"
  on public.order_items for select
  using (public.is_operator());

-- ---------------------------------------------------------------------------
-- 2. ВАЛЮТА ЗАКАЗА НЕ СВЕРЯЛАСЬ С БИТОМ
--
-- Проверка «заказ в одной валюте» стояла в маршруте, а функцию можно было
-- вызвать напрямую через PostgREST с любой валютой. create_order брала цену из
-- бита (доллары) и штамповала валюту из запроса (рубли). Покупатель платил
-- двадцать пять рублей за бит за двадцать пять долларов, и столько же
-- уходило продавцу на баланс.
--
-- Валюта берётся из бита, а не из запроса: бит стоит в одной валюте, и
-- заказать его в другой нельзя.

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
  v_tier text;
  v_price numeric;
  v_commission numeric;
  v_seller numeric;
  v_total numeric := 0;
  v_commission_total numeric := 0;
  v_seller_total numeric := 0;
  v_currency text;
  v_buyer uuid := auth.uid();
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
    v_tier := v_item ->> 'tier';

    /*
     * Бит берётся с блокировкой строки.
     *
     * Без FOR UPDATE два параллельных заказа успевали прочитать одно и то же
     * состояние «в продаже» и оба придержать бит: два заказа на один
     * эксклюзив, две лицензии, две оплаты.
     */
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

    /*
     * Валюта — из бита.
     *
     * Раньше она бралась из запроса, и покупатель мог заплатить двадцать
     * пять рублей за долларовый бит. Сверка: у всех битов в заказе одна
     * валюта, иначе сумма в рублях считалась бы от долларов.
     */
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

-- ---------------------------------------------------------------------------
-- 3. ОПЛАТУ НЕЛЬЗЯ ЗАКРЫТЬ КАК FAILED
--
-- close_order разрешал 'failed' для оплаченного заказа. Отзыв лицензии и
-- откат начисления делаются только при 'refunded', поэтому после 'failed'
-- покупатель оставался с оплаченным заказом, из которого файл не выдаётся
-- (выдача смотрит на статус), а деньги оставались у продавца.
--
-- Статус 'failed' теперь означает «заказ не состоялся» и допустим только
-- для неоплаченного.

create or replace function public.close_order(
  p_order_id uuid,
  p_status text,
  p_manual_reason text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_buyer uuid := auth.uid();
  v_seller boolean := false;
  v_beat public.beats%rowtype;
  v_refund bigint;
begin
  if v_buyer is null then
    raise exception 'Нужно войти';
  end if;

  select * into v_order from public.orders where id = p_order_id;

  if v_order.id is null then
    raise exception 'Заказ не найден';
  end if;

  if v_order.status = 'paid' and p_status = 'cancelled' then
    raise exception 'Оплаченный заказ отменяется только возвратом';
  end if;

  /*
   * Оплаченный заказ нельзя объявить несостоявшимся.
   *
   * Возврат лицензии и откат начисления делаются только при 'refunded', так
   * что после 'failed' покупатель остался бы с оплаченным, но невыдаваемым
   * заказом, а деньги — у продавца.
   */
  if v_order.status = 'paid' and p_status = 'failed' then
    raise exception 'Оплаченный заказ закрывается только возвратом';
  end if;

  update public.orders
     set status = p_status,
         manual_reason = coalesce(p_manual_reason, v_order.manual_reason),
         closed_at = now()
   where id = p_order_id
   returning * into v_order;

  if p_status = 'refunded' and v_order.status = 'refunded' then
    for v_beat in
      select b.* from public.beats b
       where b.id in (select beat_id from public.order_items where order_id = p_order_id)
    loop
      update public.beats
         set sale_state = case when b.sale_state = 'sold_exclusive' then 'sold_exclusive' else 'on_sale' end,
             reserved_until = null,
             reserved_by_order = null
       where b.id = v_beat.id;
    end loop;
  end if;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. ЧУЖИЕ ФАЙЛЫ ПРИ СОЗДАНИИ БИТА
--
-- Проверка assetsBelongTo живёт в маршрутах, а прямая вставка через
-- PostgREST её обходила: в созданный бит можно было вписать путь к мастеру
-- чужого бита, и покупатель уровня «MP3 + WAV» получал подписанную ссылку на
-- чужой мастер из закрытого бакета.
--
-- Триггер: его нельзя обойти ни одним запросом.

create or replace function public.beats_check_owned_files()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_key text;
  v_path text;
  v_part text;
begin
  for v_key in select jsonb_object_keys(coalesce(new.files, '{}'::jsonb)) loop
    v_path := coalesce(new.files -> v_key ->> 'path', '');
    v_part := coalesce(new.files -> v_key -> 'parts' -> 0 ->> 'path', '');

    if v_path <> '' and v_path not like new.owner_id::text || '/%' then
      raise exception 'Файл не принадлежит этому биту';
    end if;

    if v_part <> '' and v_part not like new.owner_id::text || '/%' then
      raise exception 'Файл не принадлежит этому биту';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists beats_check_owned_files on public.beats;

create trigger beats_check_owned_files
  before insert or update on public.beats
  for each row
  execute function public.beats_check_owned_files();

comment on function public.beats_check_owned_files() is
  'Проверяет, что файлы бита лежат в папке владельца. Без этого в созданный
   бит можно было вписать путь к мастеру чужого бита, и покупатель получил бы
   подписанную ссылку на чужой мастер из закрытого бакета.';

-- ---------------------------------------------------------------------------
-- 5. ФАЙЛ ПРОВЕРЯЕТСЯ И ПРИ ОПЛАТЕ
--
-- Файл проверялся при создании заказа, но не при подтверждении оплаты. За это
-- время продавец успевал заменить или убрать мастер, и покупатель получал
-- 404 на скачивании уже оплаченного заказа.

create or replace function public.mark_order_paid(
  p_order_id uuid,
  p_provider text default 'manual'
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_beat public.beats%rowtype;
  v_license public.licenses%rowtype;
  v_total numeric := 0;
begin
  if not public.is_operator() then
    raise exception 'Подтверждать оплату может только оператор';
  end if;

  select * into v_order from public.orders where id = p_order_id;

  if v_order.id is null then
    raise exception 'Заказ не найден';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Заказ уже не ожидает оплаты';
  end if;

  /*
   * Файлы проверяются здесь, а не только при создании заказа.
   *
   * Между заказом и оплатой продавец успевает заменить мастер, и покупатель
   * получал 404 на уже оплаченном заказе.
   */
  for v_item in select * from public.order_items where order_id = p_order_id loop
    select * into v_beat from public.beats where id = v_item.beat_id;

    if v_beat.id is null then
      raise exception 'Бит больше не существует: %', v_item.beat_title;
    end if;

    if v_item.tier = 'mp3' then
      if v_beat.mp3_url is null or length(trim(v_beat.mp3_url)) = 0 then
        raise exception 'У бита «%» нет превью, а заказ оплачен', v_beat.title;
      end if;
    elsif v_item.tier = 'bundle' then
      if jsonb_typeof(v_beat.files -> 'wav') <> 'object' then
        raise exception 'У бита «%» нет мастера WAV, а заказ оплачен', v_beat.title;
      end if;
    else
      if jsonb_typeof(v_beat.files -> 'zip') <> 'object' and jsonb_typeof(v_beat.files -> 'rar') <> 'object' then
        raise exception 'У бита «%» нет архива дорожек, а заказ оплачен', v_beat.title;
      end if;
    end if;
  end loop;

  for v_item in select * from public.order_items where order_id = p_order_id loop
    select * into v_beat from public.beats where id = v_item.beat_id;

    insert into public.licenses (
      user_id, beat_id, order_id, tier, price_minor, currency, terms
    ) values (
      v_item.beat_id, v_item.beat_id, p_order_id, v_item.tier, v_item.price_minor, v_item.currency, v_item.terms
    )
    on conflict (user_id, beat_id, tier) do update
      set order_id = p_order_id,
          price_minor = excluded.price_minor,
          currency = excluded.currency,
          terms = excluded.terms;

    insert into public.seller_transactions (seller_id, beat_id, order_id, kind, amount_minor, currency)
    values (
      v_item.beat_owner_id, v_item.beat_id, p_order_id, 'sale', v_item.seller_net_minor, v_item.currency
    );

    v_total := v_total + v_item.seller_net_minor;
  end loop;

  update public.orders
     set status = 'paid',
         paid_at = now(),
         provider = p_provider,
         seller_net_minor = v_total
   where id = p_order_id
   returning * into v_order;

  return v_order;
end;
$$;

comment on function public.mark_order_paid is
  'Подтверждает оплату: выдаёт лицензию, начисляет продавцу и закрывает заказ. Проверяет, что файлы уровня на месте: между заказом и оплатой продавец успевает заменить мастер, и покупатель получал 404 на оплаченном заказе.';
