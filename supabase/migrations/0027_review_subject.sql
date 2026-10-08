-- 0027. Адресат отзыва проставляет позиция заказа -----------------------
--
-- 0025 проверяет, что subject_id совпадает с автором позиции, но не
-- подставляет его: колонка NOT NULL, а форма отправляет только позицию,
-- оценку и текст. Отзыв без адресата не проходит проверку колонки, и
-- покупатель видел бы ошибку вместо работающей формы.
--
-- Почему не правка в 0025: эта миграция уже применена в базе, и изменение
-- файла её не перезапускает. Функция идёт новым объявлением — на свежей
-- установке 0027 просто переопределит её, на существующей применится.

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

  return new;
end;
$$;

/*
 * Свою покупку похвалить нельзя: форма на странице заказа продавцу не
 * показывается, но проверка нужна и в базе.
 *
 * Порядок задан явно через FOLLOWS, а не именем триггеров. PostgreSQL
 * выполняет однотипные триггеры по алфавиту, и reviews_reject_self встал бы
 * перед reviews_require_paid_order — то есть до того, как адресат и автор
 * проставлены из позиции заказа, и проверка сравнивала бы пустые значения.
 */
create or replace function public.reviews_reject_self_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.author_id is not null and new.author_id = new.subject_id then
    raise exception 'Отзыв о себе оставить нельзя';
  end if;

  return new;
end;
$$;

drop trigger if exists reviews_reject_self on public.reviews;

create trigger reviews_reject_self
  before insert on public.reviews
  for each row execute function public.reviews_reject_self_review()
  follows reviews_require_paid_order;