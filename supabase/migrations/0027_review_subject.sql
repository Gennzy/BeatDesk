-- 0027. Адресат отзыва проставляет позиция заказа -----------------------
--
-- 0025 проверяет, что subject_id совпадает с автором позиции, но не
-- подставляет его: колонка NOT NULL, а форма отправляет только позицию,
-- оценку и текст. Отзыв без адресата не проходит проверку колонки, и
-- покупатель видел бы ошибку вместо работающей формы.
--
-- Запрет отзыва о себе раньше жил в отдельном триггере с FOLLOWS, но база
-- его не принимает: FOLLOWS/PRECEDES появились в PostgreSQL 12, а здесь
-- движок такой синтаксис не знает (42601 у «follows»). Поэтому обе
-- проверки живут в одной функции — заодно исчезает вопрос о порядке
-- срабатывания, который иначе пришлось бы решать порядком имён.
--
-- Отдельно от 0025 эта миграция потому, что 0025 уже применена, а правка
-- файла её не перезапускает.

create or replace function public.review_requires_paid_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_item public.order_items%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_item from public.order_items where id = new.order_item_id;

  if v_item.id is null then
    raise exception 'Позиция заказа не найдена';
  end if;

  select * into v_order from public.orders where id = v_item.order_id;

  if v_order.status <> 'paid' then
    raise exception 'Отзыв можно оставить только по оплаченному заказу';
  end if;

  -- Отзыв о битмейкере, а не о бите: адресат берётся из позиции, иначе
  -- можно было бы хвалить чужой профиль, купив дешёвый бит.
  new.subject_id := v_item.beat_owner_id;
  new.beat_id := v_item.beat_id;
  new.author_id := coalesce(v_order.buyer_id, new.author_id);

  -- Свою покупку похвалить нельзя. Форма продавцу и не показывается, но
  -- проверка обязана быть и в базе: правило одно на всех дорогах входа.
  if new.author_id is not null and new.author_id = new.subject_id then
    raise exception 'Отзыв о себе оставить нельзя';
  end if;

  return new;
end;
$$;

-- Отдельный триггер с FOLLOWS из ранней редакции этой миграции мог остаться
-- в базе, если её запускали частично. Убираем, иначе он продолжит падать.
drop trigger if exists reviews_reject_self on public.reviews;