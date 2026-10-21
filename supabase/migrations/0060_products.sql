-- Товары: луп-киты, драм-киты, вокал-пресеты и услуги.
--
-- Применяется после 0059.
--
-- ---------------------------------------------------------------------------
-- ЧТО ЭТО ТАКОЕ
--
-- Бит — товар особый: у него четыре уровня (MP3, MP3+WAV, Track Out,
-- Эксклюзив), у каждого своё содержимое, свои цены и своя лицензия. Всё
-- это переустраивать в общую сущность — значит переписать ленту, избранное,
-- счётчики, комментарии и выдачу покупок. Ради китов это невыгодно.
--
-- Остальные товары проще: у луп-кита одна цена и один файл, у пресета то же,
-- у услуги файла нет вообще — есть работа. Их общая черта: это НЕ бит, и
-- продавать их может любой битмейкер, а не только тот, у кого есть биты.
--
-- Поэтому биты остаются битами, а рядом появляется products. Корзина и
-- заказ учатся работать с обоими видами — иначе получились бы две корзины и
-- два заказа, и человек с китом и битом в одном оплачивании не смог бы
-- купить их вместе.
--
-- ---------------------------------------------------------------------------
-- ЧТО ЗДЕСЬ ВАЖНО
--
-- Услуга — тоже товар в корзине: её можно оплатить вместе с битом, и она
-- видна в истории заказов. Отдельной «заявки» не заводим: это завело бы
-- вторую очередь, вторые статусы и вторые уведомления, а выигрыш был бы
-- только в одном — «услуга не файл». Это можно выразить в самом товаре.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  -- Что это за товар. От типа зависят и цена, и выдача.
  kind text not null check (kind in ('kit', 'preset', 'service')),
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  -- Одна цена. У бита их четыре по уровням, у кита — одна: комплект либо
  -- куплен, либо нет.
  price_minor integer not null check (price_minor >= 0),
  currency text not null default 'RUB' check (currency in ('RUB', 'USD', 'EUR')),
  -- Файлы: у кита архив, у пресета набор, у услуги пусто.
  files jsonb not null default '{}'::jsonb,
  cover_url text,
  -- Жанр: по нему товары находятся, и он же определяет, где они лежат в
  -- каталоге.
  genre text,
  -- Показывается ли товар. Черновик есть у всех, и он не виден.
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.products is
  'Товары, кроме битов: луп-киты, драм-киты, вокал-пресеты и услуги. Продаёт любой битмейкер. У битов своя модель с четырьмя уровнями, и она здесь не трогается.';

comment on column public.products.kind is
  'kit — луп- или драм-кит, preset — вокальный пресет, service — услуга. У услуги файла нет: это работа.';

comment on column public.products.price_minor is
  'Цена в копейках. Одна на товар: у комплекта нет уровней, а покупатель
   либо берёт его целиком, либо не берёт.';

create index if not exists products_owner_idx on public.products (owner_id, created_at desc);
create index if not exists products_public_idx on public.products (is_public, created_at desc);
create index if not exists products_kind_idx on public.products (kind, is_public);

alter table public.products enable row level security;

-- Товар виден всем, пока он опубликован. Это витрина, и закрывать её от
-- просмотра незачем: покупатель должен увидеть, что продавец вообще такое
-- делает.
create policy "public reads published products"
  on public.products for select
  using (is_public);

-- Писать может только владелец.
create policy "owner manages own products"
  on public.products for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- Корзина: бит или товар
--
-- Позиция корзины теперь умеет быть либо позицией бита, либо позицией
-- товара. Раньше beat_id был обязательным, и добавить киты в корзину было
-- нечем.
--
-- Ограничение «ровно одно из двух» сделано проверкой, а не внешним ключом с
-- двумя колонками: два nullable-поля с проверкой «заполнено ровно одно»
-- выражают это прямо и не дают появиться позиции без предмета.
--
-- tier остаётся обязательным: у товара своя цена, и уровня у него нет.
-- Значение 'product' говорит выдаче, что уровень не применяется.

alter table public.cart_items
  add column if not exists product_id uuid references public.products on delete cascade;

alter table public.cart_items
  drop constraint if exists cart_items_beat_id_not_null;

alter table public.cart_items
  add constraint cart_items_one_subject check (
    (beat_id is not null and product_id is null) or (beat_id is null and product_id is not null)
  );

-- Прежнее уникальное ограничение было по биту, и два товара от разных
-- продавцов схлопывались бы в один. Теперь уникальность по обоим предметам.
alter table public.cart_items drop constraint if exists cart_items_unique_beat;

create unique index if not exists cart_items_unique_subject
  on public.cart_items (user_id, coalesce(beat_id, product_id));

comment on column public.cart_items.product_id is
  'Товар вместо бита: луп-кит, пресет или услуга. Заполнено ровно одно из двух — beat_id или product_id.';

-- ---------------------------------------------------------------------------
-- Позиции заказа
--
-- То же самое: позиция заказа — это либо уровень бита, либо товар.

alter table public.order_items
  add column if not exists product_id uuid references public.products on delete set null;

alter table public.order_items
  add column if not exists product_kind text;

alter table public.order_items
  add column if not exists product_title text;

comment on column public.order_items.product_id is
  'Товар, если позиция заказа не бит. Уровень бита и товар не смешиваются в одной позиции.';

-- ---------------------------------------------------------------------------
-- Выдача
--
-- Покупка бита выдаёт файлы по уровню, покупка товара — его файл целиком.
-- Разделено на две функции намеренно: у бита уровень, у товара его нет, и
-- общая функция с веткой внутри означала бы, что правило выдачи живёт в двух
-- местах.
--
-- Услуга файлов не имеет: её выдача — это отметка о выполнении, и её
-- ставит продавец. Оплата прошла, а работы ещё нет.

create or replace function public.product_files(p_product_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(p.files, '{}'::jsonb) from public.products p where p.id = p_product_id;
$$;

grant execute on function public.product_files(uuid) to authenticated;

comment on function public.product_files is
  'Файлы товара: архив кита или набор пресетов. У услуги пусто — её выдаёт продавец, а не база.';
