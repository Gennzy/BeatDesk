-- Корзина снова добавляет позиции.
--
-- Применяется после 0062.
--
-- ---------------------------------------------------------------------------
-- ЧТО СЛОМАЛОСЬ
--
-- В 0060 ограничение cart_items_unique_beat (user_id, beat_id) было заменено на
-- индекс по выражению (user_id, coalesce(beat_id, product_id)) — чтобы одна
-- позиция не схлопывалась ни с битом, ни с товаром.
--
-- А код корзины делает upsert с onConflict: "user_id,beat_id". Под выражение
-- upsert не умеет, и под него больше не было НИЧЕГО: обычное ограничение
-- удалили, выражение для upsert не подходит.
--
-- Итог: POST /api/cart отвечал 400 «Не удалось добавить в корзину» всем
-- подряд. Добавить в корзину было невозможно, а покупка — невозможна.
--
-- ---------------------------------------------------------------------------
-- КАК ПРАВИЛЬНО
--
-- Два обычных ограничения вместо одного на выражение.
--
-- В колонке либо beat_id, либо product_id, а вторая пустая. Пустые значения
-- в уникальных ограничениях не конфликтуют между собой — поэтому позиция с
-- битом не мешает позиции с товаром, а два одинаковых бита по-прежнему
-- схлопываются в одну.
--
-- И обычное ограничение, в отличие от выражения, подходит для upsert.

alter table public.cart_items
  drop constraint if exists cart_items_unique_beat;

drop index if exists cart_items_unique_subject;

alter table public.cart_items
  add constraint cart_items_unique_beat unique (user_id, beat_id);

alter table public.cart_items
  add constraint cart_items_unique_product unique (user_id, product_id);

comment on constraint cart_items_unique_beat on public.cart_items is
  'Одна позиция на бит: повторное добавление меняет уровень, а не плодит строки. Пустой product_id не конфликтует, поэтому позиция с битом и позиция с товаром уживаются рядом.';

comment on constraint cart_items_unique_product on public.cart_items is
  'Одна позиция на товар. Пустой beat_id не конфликтует, поэтому бит и товар в корзине не мешают друг другу.';
