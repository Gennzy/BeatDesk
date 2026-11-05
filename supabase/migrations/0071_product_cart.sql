-- BeatDesk: товары в корзине и заказах
--
-- Корзина и заказ раньше были завязаны только на биты: cart_items.beat_id
-- и order_items.beat_id обязательны, а уровень (tier) — часть позиции.
-- Товар (кит/пресет/услуга) не имеет уровней и не бит, поэтому добавляем
-- параллельную ссылку product_id и делаем beat_id необязательным.
--
-- Позиция — либо бит, либо товар: ровно один из двух.

alter table public.cart_items
  add column if not exists product_id uuid references public.products on delete cascade;

alter table public.cart_items
  alter column beat_id drop not null;

alter table public.cart_items
  drop constraint if exists cart_items_unique_beat;

-- Уникальность: один бит или один товар — одна позиция.
create unique index if not exists cart_items_unique_beat
  on public.cart_items (user_id, beat_id) where beat_id is not null;
create unique index if not exists cart_items_unique_product
  on public.cart_items (user_id, product_id) where product_id is not null;

alter table public.cart_items drop constraint if exists cart_items_one_subject;
alter table public.cart_items
  add constraint cart_items_one_subject check (
    (beat_id is not null and product_id is null) or
    (beat_id is null and product_id is not null)
  );

-- order_items
alter table public.order_items
  add column if not exists product_id uuid references public.products on delete restrict;

alter table public.order_items
  alter column beat_id drop not null;

alter table public.order_items
  alter column tier drop not null;

alter table public.order_items drop constraint if exists order_items_one_subject;
alter table public.order_items
  add constraint order_items_one_subject check (
    (beat_id is not null and product_id is null) or
    (beat_id is null and product_id is not null)
  );