-- BeatDesk: выдача файлов товара
-- licenses.tier становится необязательным: у товара нет уровней. (кит/пресет/услуга)
--
-- Лицензия и журнал выдачи раньше были завязаны на бит: licenses.beat_id и
-- order_downloads.beat_id обязательны. Для товара бита нет, поэтому обе
-- колонки становятся необязательными, а в licenses добавляется product_id.

alter table public.licenses
  alter column beat_id drop not null;

alter table public.licenses
  alter column tier drop not null;

alter table public.licenses
  add column if not exists product_id uuid references public.products on delete restrict;

alter table public.licenses
  add constraint licenses_one_subject check (
    (beat_id is not null and product_id is null) or
    (beat_id is null and product_id is not null)
  );

alter table public.order_downloads
  alter column beat_id drop not null;

alter table public.order_downloads
  add column if not exists product_id uuid references public.products on delete cascade;

-- kind расширяется: товар выдаётся как product.
alter table public.order_downloads drop constraint if exists order_downloads_kind_check;
alter table public.order_downloads add constraint order_downloads_kind_check check (kind in ('mp3', 'wav', 'trackout', 'exclusive', 'product'));

-- mark_order_paid: лицензия создаётся и для товара.
-- Переопределяем функцию целиком (копия из 0072 + product_id).
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
  if v_caller is null or not exists (
    select 1
      from public.order_items i
      left join public.beats b on b.id = i.beat_id
      left join public.products p on p.id = i.product_id
     where i.order_id = p_order_id
       and coalesce(b.owner_id, p.owner_id) = v_caller
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

  -- sale_state только для битов.
  update public.beats b
     set sale_state = case when exists (
           select 1 from public.order_items i
            where i.order_id = p_order_id and i.beat_id = b.id and i.tier = 'exclusive'
         ) then 'sold_exclusive' else 'on_sale' end,
         reserved_until = null,
         reserved_by_order = null
   where b.id in (select beat_id from public.order_items where order_id = p_order_id and beat_id is not null);

  -- Начисления (уже поддерживает соавторов и товары через 0068).
  insert into public.seller_transactions (
    seller_id, kind, amount_minor, gross_minor, commission_minor,
    commission_bps, currency, order_id, note
  )
  select
    coalesce((collab->>'user_id')::uuid, coalesce(b.owner_id, p.owner_id)),
    'sale',
    (i.seller_net_minor * coalesce((collab->>'share_bps')::bigint, 10000) / 10000)::bigint,
    (i.price_minor * coalesce((collab->>'share_bps')::bigint, 10000) / 10000)::bigint,
    (i.commission_minor * coalesce((collab->>'share_bps')::bigint, 10000) / 10000)::bigint,
    case when i.price_minor > 0
         then (i.commission_minor * 10000 / i.price_minor)
         else null end,
    i.currency,
    p_order_id,
    'Заказ ' || p_order_id::text
  from public.order_items i
  left join public.beats b on b.id = i.beat_id
  left join public.products p on p.id = i.product_id
  cross join lateral (
    select case
      when b.id is not null and jsonb_typeof(b.collaborators) = 'array'
           and jsonb_array_length(b.collaborators) > 0
           and (select coalesce(sum((e->>'share_bps')::bigint), 0)
                  from jsonb_array_elements(b.collaborators) e) = 10000
      then b.collaborators
      else jsonb_build_array(jsonb_build_object('user_id', coalesce(b.owner_id, p.owner_id), 'share_bps', 10000))
    end as collabs
  ) c
  cross join lateral jsonb_array_elements(c.collabs) as collab
  where i.order_id = p_order_id
    and i.seller_net_minor > 0
    and (i.seller_net_minor * coalesce((collab->>'share_bps')::bigint, 10000) / 10000) > 0
  on conflict (order_id, seller_id) where kind = 'sale' do nothing;

  -- Лицензия на каждую позицию.
  insert into public.licenses (
    order_item_id, license_key, beat_id, product_id, buyer_id, buyer_email, tier, terms
  )
  select i.id,
         encode(gen_random_bytes(16), 'hex'),
         i.beat_id,
         i.product_id,
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