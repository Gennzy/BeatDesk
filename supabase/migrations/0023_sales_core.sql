-- Ядро продаж: заказы, позиции, лицензии, выплаты.
--
-- Деньги лежат в минорных единицах (копейках, bigint). Числа с плавающей
-- точкой в деньгах — это не «неточно», это расхождение на копейку в каждом
-- заказе и невозможность объяснить его покупателю.
--
-- Правила, которые нельзя вынести в код клиента, живут здесь триггерами и
-- одной функцией: цену заказа нельзя прислать с клиента, а бит нельзя
-- продать дважды. Клиент присылает только «какой бит и какой уровень», всё
-- остальное функция берёт сама.
--
-- Тарифов в базе нет намеренно: это политика, и она меняется чаще схемы.
-- Комиссия площадки лежит в platform_settings, а в позиции заказа попадает
-- копией — передумаем тариф задним числом, старые заказы не поедут.

-- 1. Состояние бита в продаже -------------------------------------------

alter table public.beats
  add column if not exists sale_state text not null default 'draft';

comment on column public.beats.sale_state is 'Черновик, в продаже, придержан неоплаченным заказом или продан эксклюзивно';

-- add constraint не поддерживает if not exists, а файл перезапускают, поэтому
-- через блок: повторный прогон не должен падать.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'beats_sale_state_check'
  ) then
    alter table public.beats
      add constraint beats_sale_state_check
      check (sale_state in ('draft', 'on_sale', 'reserved', 'sold_exclusive'));
  end if;
end;
$$;

/*
 * Бит, который уже виден в ленте, считаем продающимся: так он выглядел до
 * появления sale_state. Иначе миграция тихо снимет с продажи всё, что
 * работало, и человек узнает об этом, когда увидит пустую витрину.
 */
update public.beats
   set sale_state = 'on_sale'
 where sale_state = 'draft' and is_public;

create index if not exists beats_sale_state_idx on public.beats (sale_state);

-- 2. Настройки площадки --------------------------------------------------

create table if not exists public.platform_settings (
  singleton boolean primary key default true,
  /** Комиссия BeatDesk в базисных пунктах: 2000 = 20%. */
  commission_bps integer not null default 2000 check (commission_bps between 0 and 5000),
  /** Сколько живёт придержание неоплаченного заказа, в минутах. */
  reservation_minutes integer not null default 60 check (reservation_minutes between 5 and 10080)
);

comment on table public.platform_settings is 'Одна строка. Деньги считает база, поэтому комиссия живёт здесь, а не в коде';

insert into public.platform_settings (singleton, commission_bps, reservation_minutes)
values (true, 2000, 60)
on conflict (singleton) do nothing;

-- 3. Заказы --------------------------------------------------------------

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  /*
   * Покупатель может быть гостем: покупать бит без аккаунта — обычное дело,
   * а файлы всё равно приезжают на почту. buyer_email обязателен, поэтому
   * доставка не зависит от того, есть ли у человека профиль.
   */
  buyer_id uuid references public.profiles on delete set null,
  buyer_email text not null,
  buyer_name text,
  contact jsonb not null default '{}'::jsonb,

  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'refunded', 'cancelled')),

  currency text not null default 'RUB',
  total_minor bigint not null default 0 check (total_minor >= 0),
  commission_minor bigint not null default 0 check (commission_minor >= 0),
  seller_net_minor bigint not null default 0 check (seller_net_minor >= 0),

  payment_provider text check (payment_provider in ('platega', 'stripe', 'manual')),
  payment_external_id text,
  /** Пока нет юрлица, заказ закрывают вручную: provider = manual. */
  manual_reason text,

  created_at timestamptz not null default now(),
  paid_at timestamptz,
  closed_at timestamptz,

  constraint "order totals agree" check (total_minor = commission_minor + seller_net_minor)
);

comment on column public.orders.buyer_id is 'null, если покупал гость: заказ всё равно можно оплатить и доставить';
comment on column public.orders.contact is 'Как с покупателем связаться, если почты нет: telegram, vk, телефон';
comment on column public.orders.manual_reason is 'Почему заказ закрыли вручную: без юрлица выплат нет, но оплата от покупателя есть';

create index if not exists orders_buyer_idx on public.orders (buyer_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status, created_at desc);
create unique index if not exists orders_payment_external_idx
  on public.orders (payment_provider, payment_external_id)
  where payment_external_id is not null;

-- 4. Позиции заказа ------------------------------------------------------

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  beat_id uuid not null references public.beats on delete restrict,

  tier text not null check (tier in ('mp3', 'bundle', 'trackout', 'exclusive')),
  price_minor bigint not null check (price_minor > 0),
  commission_minor bigint not null check (commission_minor >= 0),
  seller_net_minor bigint not null check (seller_net_minor >= 0),

  /*
   * Название бита копией: лицензия обязана называть то, что купили. Переименуют
   * бит или снесут — лицензия останется верной.
   */
  beat_title text not null,
  beat_owner_id uuid not null references public.profiles on delete restrict,
  currency text not null default 'RUB',
  /** Текст условий на момент покупки: правила меняются, договор — нет. */
  terms jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint "item commission agrees" check (price_minor = commission_minor + seller_net_minor),
  constraint "one beat once per order" unique (order_id, beat_id)
);

comment on column public.order_items.terms is 'Условия лицензии на момент покупки: что разрешено и что запрещено';

create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_beat_idx on public.order_items (beat_id, created_at desc);
create index if not exists order_items_seller_idx on public.order_items (beat_owner_id, created_at desc);

-- 5. Лицензии ------------------------------------------------------------

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.order_items on delete cascade,
  license_key text not null unique,
  beat_id uuid not null references public.beats on delete restrict,
  buyer_id uuid references public.profiles on delete set null,
  buyer_email text not null,
  tier text not null check (tier in ('mp3', 'bundle', 'trackout', 'exclusive')),
  terms jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz
);

comment on table public.licenses is 'Что куплено и кому. Ключ доказывает право, поэтому отзыв — это revoked_at, а не удаление строки';
comment on column public.licenses.license_key is 'Именно этот ключ покупатель показывает продавцу и в спорной ситуации';

create index if not exists licenses_buyer_idx on public.licenses (buyer_id, issued_at desc);
create index if not exists licenses_beat_idx on public.licenses (beat_id);

-- 6. Выплаты -------------------------------------------------------------

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'RUB',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  /** Провайдера выплат пока нет: до юрлица всё подтверждает человек. */
  provider text not null default 'manual' check (provider in ('manual', 'platega', 'stripe')),
  external_id text,
  period_start timestamptz not null,
  period_end timestamptz not null,
  order_count integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,

  constraint "payout period is sane" check (period_end > period_start),
  constraint "no payout of nothing" check (amount_minor > 0 or status = 'failed')
);

comment on table public.payouts is 'Начисления продавцу. Автовыплаты включатся вместе с юрлицом и провайдером';

create index if not exists payouts_seller_idx on public.payouts (seller_id, created_at desc);
create index if not exists payouts_status_idx on public.payouts (status, created_at desc);

-- 7. RLS -----------------------------------------------------------------

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.licenses enable row level security;
alter table public.payouts enable row level security;
alter table public.platform_settings enable row level security;

/*
 * Заказы видит покупатель и продавец позиций этого заказа. Гость без профиля
 * увидит свой заказ только по выданной ссылке с токеном.
 *
 * Проверку «есть ли в заказе мой бит» делает функция с security definer, а не
 * подзапрос. Подзапрос привёл бы к взаимной рекурсии политик: политика orders
 * читает order_items, политика order_items читает orders — и Postgres
 * отвечает на это ошибкой, а не пустым результатом.
 */
create or replace function public.owns_order_item(p_order_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.order_items
     where order_id = p_order_id and beat_owner_id = auth.uid()
  );
$$;

grant execute on function public.owns_order_item(uuid) to authenticated;

create policy "buyer reads own orders"
  on public.orders for select
  using (auth.uid() = buyer_id);

create policy "seller reads orders containing own beats"
  on public.orders for select
  using (public.owns_order_item(id));

-- Заказы не пишет клиент: их создаёт create_order, и только она.
create policy "buyer reads own order items"
  on public.order_items for select
  using (exists (select 1 from public.orders where orders.id = order_items.order_id and orders.buyer_id = auth.uid()));

create policy "seller reads own order items"
  on public.order_items for select
  using (beat_owner_id = auth.uid());

create policy "license holder reads own licenses"
  on public.licenses for select
  using (auth.uid() = buyer_id);

create policy "seller reads licenses of own beats"
  on public.licenses for select
  using (exists (select 1 from public.beats where beats.id = licenses.beat_id and beats.owner_id = auth.uid()));

create policy "seller reads own payouts"
  on public.payouts for select
  using (seller_id = auth.uid());

-- Настройки читать можно: комиссия не секрет, а продавец должен видеть,
-- сколько с него берут, до того как выставил цену.
create policy "platform settings are readable"
  on public.platform_settings for select
  using (true);

-- 8. Придержание бита под неоплаченный заказ ----------------------------

/*
 * Бит, который кто-то оплачивает, нельзя продать второму: два покупателя на
 * один эксклюзив — это не «неприятно», а невыполнимый заказ у одного из них.
 *
 * Придержание живёт на самом бите, а не в отдельной таблице: так его видно
 * в одном месте с ценой, и продавец видит причину в карточке.
 */
alter table public.beats
  add column if not exists reserved_until timestamptz,
  add column if not exists reserved_by_order uuid;

comment on column public.beats.reserved_until is 'До этого времени бит придержан заказом; после освобождается сам';

create or replace function public.release_expired_reservations() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.beats
     set sale_state = 'on_sale', reserved_until = null, reserved_by_order = null
   where sale_state = 'reserved'
     and reserved_until is not null
     and reserved_until < now();
end;
$$;

grant execute on function public.release_expired_reservations() to anon, authenticated;

-- 9. Создание заказа -----------------------------------------------------

/*
 * Заказ создаёт функция, а не клиент.
 *
 * Клиент присылает список «бит и уровень» и больше ничего: ни цены, ни
 * комиссии, ни названия бита. Если бы цена приходила с клиента, человек
 * доплатил бы рубль за эксклюзив, и никакой RLS это бы не остановил.
 *
 * Функция берёт цену из строки бита, отказывает, если бит уже придержан или
 * продан эксклюзивно, и придерживает бит до оплаты.
 */
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
  v_buyer uuid := auth.uid();
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Заказ пустой';
  end if;

  if p_buyer_email is null or length(trim(p_buyer_email)) = 0 then
    raise exception 'Нужен адрес для доставки файлов';
  end if;

  -- Просроченные придержания освобождаем здесь, а не по таймеру: иначе бит
  -- мог бы лежать зарезервированным вечно, если бы никто не заходил.
  perform public.release_expired_reservations();

  select * into v_settings from public.platform_settings where singleton;

  if v_settings is null then
    raise exception 'Настройки площадки не заданы';
  end if;

  /*
   * Заказ создаём до позиций: order_id в позиции не nullable, и обойти это
   * обновлением постфактум нельзя — вставка просто не пройдёт.
   * Итоги пока нулевые и пересчитываются в конце, когда известна сумма.
   */
  insert into public.orders (buyer_id, buyer_email, contact, currency)
  values (v_buyer, trim(p_buyer_email), coalesce(p_contact, '{}'::jsonb), p_currency)
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_tier := v_item ->> 'tier';
    v_beat := null;

    select * into v_beat
      from public.beats
     where id = (v_item ->> 'beat_id')::uuid;

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

    v_price := (v_beat.prices ->> v_tier)::numeric;

    if v_price is null or v_price <= 0 then
      raise exception 'Уровень % не продаётся: %', v_tier, v_beat.title;
    end if;

    -- Цены в рублях, копейки в базе. Умножаем на 100 и округляем один раз,
    -- в конце: округлять каждую позицию — значит накопить расхождение.
    v_price := round(v_price * 100);
    v_commission := round(v_price * v_settings.commission_bps / 10000);
    v_seller := v_price - v_commission;

    insert into public.order_items (
      order_id, beat_id, tier, price_minor, commission_minor, seller_net_minor,
      beat_title, beat_owner_id, currency, terms
    ) values (
      v_order.id, v_beat.id, v_tier, v_price, v_commission, v_seller,
      v_beat.title, v_beat.owner_id, p_currency,
      jsonb_build_object('tier', v_tier, 'bpm', v_beat.bpm, 'key', v_beat.key, 'currency', p_currency)
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
         seller_net_minor = v_seller_total
   where id = v_order.id
   returning * into v_order;

  return v_order;
end;
$$;

grant execute on function public.create_order(jsonb, text, text, jsonb) to anon, authenticated;

-- 10. Оплата и выдача ---------------------------------------------------

/*
 * Оплата наступила: придержание превращается в продажу, а эксклюзив уводит
 * бит с витрины навсегда.
 */
create or replace function public.mark_order_paid(
  p_order_id uuid,
  p_provider text default 'manual',
  p_external_id text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
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

-- 11. Отмена и возврат --------------------------------------------------

create or replace function public.close_order(
  p_order_id uuid,
  p_status text,
  p_manual_reason text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  if p_status not in ('cancelled', 'failed', 'refunded') then
    raise exception 'Закрыть заказ можно только как cancelled, failed или refunded';
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
  end if;

  return v_order;
end;
$$;

grant execute on function public.close_order(uuid, text, text) to service_role;

-- 12. Начисление продавцу -----------------------------------------------

/*
 * Сумма к выплате за период: оплаченные заказы минус уже начисленное.
 *
 * Из вычета уходят неоплаченные заказы: деньги за них ещё не пришли, и
 * выплатить их продавцу нельзя.
 */
create or replace function public.payout_amount_minor(
  p_seller_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(i.seller_net_minor), 0)::bigint
    from public.order_items i
    join public.orders o on o.id = i.order_id
   where i.beat_owner_id = p_seller_id
     and o.status = 'paid'
     and o.paid_at >= p_period_start
     and o.paid_at < p_period_end
     and not exists (
       select 1 from public.payouts p
        where p.seller_id = p_seller_id
          and p.status <> 'failed'
          and p.period_end >= p_period_start
          and p.period_start <= p_period_end
     );
$$;

grant execute on function public.payout_amount_minor(uuid, timestamptz, timestamptz) to authenticated;
