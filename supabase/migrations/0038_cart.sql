-- 0038. Корзина -------------------------------------------------------
--
-- Заказы у нас требуют входа, и корзина сделана такой же: серверная, а не
-- в браузере. Корзина в localStorage теряется при выходе из аккаунта и на
-- другом устройстве, и человек обнаруживает это в худший момент — когда
-- уже выбрал, купить и ушёл со вкладки.
--
-- Позиция — это пара «бит + уровень», и на один бит позиция ровно одна.
-- Ключ (user_id, beat_id), а не (user_id, beat_id, tier): купить один бит
-- дважды нельзя, а выбрать другой уровень — можно. Иначе в корзине
-- оказывались бы MP3 и эксклюзив одного бита, и заказ собрался бы с
-- повтором.

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  beat_id uuid not null references public.beats on delete cascade,
  tier text not null,
  created_at timestamptz not null default now(),

  -- Один бит — одна позиция. Уровень меняется обновлением этой строки.
  constraint cart_items_unique_beat unique (user_id, beat_id),

  /*
   * Уровень сверяется со списком. Без проверки в корзину попадал бы любой
   * мусор, а оформление заказа потом падало бы с ошибкой — человек узнал
   * об этом только в момент оплаты.
   */
  constraint cart_items_tier_known check (tier in ('mp3', 'bundle', 'trackout', 'exclusive'))
);

comment on table public.cart_items is
  'Корзина покупателя. Позиция — бит и выбранный уровень лицензии';

alter table public.cart_items enable row level security;

-- Человек видит и правит только свою корзину, и ничего больше.
drop policy if exists "cart items are own rows" on public.cart_items;

create policy "cart items are own rows"
  on public.cart_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists cart_items_user_idx on public.cart_items (user_id, created_at desc);