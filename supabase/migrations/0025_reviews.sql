-- Отзывы о битмейкере.
--
-- Оставить отзыв может только тот, кто оплатил заказ: строка ведёт на позицию
-- заказа, а не на бит. Иначе рейтинг набирается из одной строки на телефоне.
--
-- Рейтинг не рисуем, пока отзывов нет. Пустое «4,9» из нул�� отзывов —
-- выдуманное число, и оно хуже, чем его отсутствие: человек поверит ему и
-- примет решение, которого на самом деле нет.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.order_items on delete cascade,
  beat_id uuid not null references public.beats on delete cascade,
  author_id uuid references public.profiles on delete set null,
  subject_id uuid not null references public.profiles on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text,
  created_at timestamptz not null default now(),

  -- Голый лайк без слов бесполезен: он не отвечает на вопрос «почему».
  constraint "review needs a reason" check (body is null or length(trim(body)) >= 10)
);

comment on table public.reviews is 'Отзывы покупателей о битмейкере. Один на позицию заказа: купил один раз — сказал один раз';
comment on column public.reviews.subject_id is 'О ком отзыв: профиль владельца купленного бита';
comment on column public.reviews.rating is 'Оценка от 1 до 5';

create index if not exists reviews_subject_idx on public.reviews (subject_id, created_at desc);
create index if not exists reviews_beat_idx on public.reviews (beat_id, created_at desc);

alter table public.reviews enable row level security;

/*
 * Отзыв виден всем: профиль битмейкера и его репутация — открытая часть
 * площадки, и прятать её от покупателя незачем. Имя пишет сам покупатель, но
 * показываем только ник, а не почту.
 */
create policy "reviews are viewable by everyone"
  on public.reviews for select
  using (true);

/*
 * Писать может автор отзыва, и только он же — править и удалять: отзыв
 * должен быть привязан к покупке, поэтому проверку «оплачено» делает
 * триггер, а не политика.
 */
create policy "authors insert own reviews"
  on public.reviews for insert
  with check (auth.uid() = author_id);

create policy "authors delete own reviews"
  on public.reviews for delete
  using (auth.uid() = author_id);

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

  -- Отзыв о битмейкере, а не о бите: subject_id обязан совпадать с автором
  -- позиции, иначе можно было бы хвалить чужой профиль, купив дешёвый бит.
  if v_item.beat_owner_id <> new.subject_id then
    raise exception 'Отзыв должен быть о битмейкере, который продал этот бит';
  end if;

  new.beat_id := v_item.beat_id;
  new.author_id := coalesce(v_order.buyer_id, new.author_id);

  return new;
end;
$$;

create trigger reviews_require_paid_order
  before insert on public.reviews
  for each row execute function public.review_requires_paid_order();

-- Средняя оценка считается на лету: колонка среднего протухнет первой же
-- миграцией, а список отзывов нужен целиком.
create or replace function public.reviews_summary(p_subject_id uuid)
returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'count', count(*),
    'average', case when count(*) = 0 then null else round(avg(rating)::numeric, 2) end,
    'distribution', coalesce(
      (
        select jsonb_object_agg(bucket::text, bucket_count)
          from (
            select rating as bucket, count(*) as bucket_count
              from public.reviews
             where subject_id = p_subject_id
             group by rating
          ) by_rating
      ),
      '{}'::jsonb
    )
  )
  from public.reviews
 where subject_id = p_subject_id;
$$;

grant execute on function public.reviews_summary(uuid) to anon, authenticated;