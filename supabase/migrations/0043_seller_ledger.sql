-- Начисления продавцу и баланс.
--
-- Модель площадки меняется на принятую у всех маркетплейсов: покупатель
-- платит площадке, площадка удерживает комиссию, остаток падает на
-- баланс продавца, продавец выводит его по заявке. Раньше покупатель
-- переводил продавцу напрямую, и площадка в деньгах не участвовала.
--
-- ---------------------------------------------------------------------
-- ПОЧЕМУ ЖУРНАЛ, А НЕ ОДНА ЦИФРА В ПРОФИЛЕ
--
-- Баланс — это сумма журнала, а не поле. Поле в профиле нельзя было бы
-- ни проверить, ни откатить: отмена заказа, возврат и выплата меняют
-- деньги, и каждое изменение обязано остаться видимым. Журнал даёт и
-- баланс, и историю, из которой человек может понять, откуда взялась
-- сумма.
--
-- Баланс никогда не пишется напрямую. Он всегда sum(amount_minor) по
-- журналу, поэтому нельзя получить баланс, не объяснимый записями.
--
-- ---------------------------------------------------------------------
-- УСЛОВИЯ, КОТОРЫЕ ЗАКРЫВАЮТ ДЫРЫ
--
-- Суммы — в минорных единицах (копейках). Деньги в рублях с плавающей
-- точкой расходятся на копейку, и расхождение накапливается.
--
-- amount_minor со знаком: начисление положительное, выплата отрицательная.
-- Одно поле вместо пары «сумма/тип» не даёт посчитать баланс неверно.
--
-- Комиссия хранится рядом с начислением, а не берётся из настройки при
-- чтении. Настройку потом можно будет менять, и старые продажи не
-- пересчитаются задним числом.

create table if not exists public.seller_transactions (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete cascade,

  /**
   * Тип движения:
   *   sale       — начисление за оплаченный заказ;
   *   payout     — выплата по заявке (отрицательное);
   *   payout_back — откат выплаты, если провайдер её не провёл;
   *   refund     — отзыв начисления при возврате заказа;
   *   adjustment — ручная правка оператора.
   */
  kind text not null check (kind in ('sale', 'payout', 'payout_back', 'refund', 'adjustment')),

  /** Знаковая сумма в копейках: начисление плюс, выплата минус. */
  amount_minor bigint not null check (amount_minor <> 0),

  /** Сколько пришло покупателю целиком. Для продажи равно |amount| + комиссия. */
  gross_minor bigint not null default 0,
  /** Комиссия площадки по этой операции. */
  commission_minor bigint not null default 0,
  /** Ставка на момент операции в базисных пунктах, чтобы не пересчитывать задним числом. */
  commission_bps integer,

  currency text not null default 'RUB',

  order_id uuid references public.orders (id) on delete cascade,
  payout_id uuid references public.payouts (id) on delete set null,

  note text,
  created_at timestamptz not null default now(),

  /**
   * Продажа всегда ссылается на заказ, а отзыв продажи — на ту же самую
   * продажу. Без этого можно было бы отозвать начисление, которого нет,
   * и баланс уехал бы в минус по несуществующей операции.
   */
  constraint "sale needs an order" check (kind <> 'sale' or order_id is not null),
  constraint "refund needs an order" check (kind <> 'refund' or order_id is not null)
);

-- Баланс считают по продавцу и по времени: «сколько заработал за период»
-- и «сколько выведено» — два главных вопроса кабинета.
create index if not exists seller_transactions_seller_idx
  on public.seller_transactions (seller_id, created_at desc);

-- Один заказ не может начислиться дважды: подтверждение оплаты иногда
-- вызывают повторно, а начисление за одну и ту же продажу должно быть одно.
create unique index if not exists seller_transactions_sale_once
  on public.seller_transactions (order_id) where kind = 'sale';

-- Выплата не может быть двумя движениями по одному заявке.
create unique index if not exists seller_transactions_payout_once
  on public.seller_transactions (payout_id) where kind = 'payout';

alter table public.seller_transactions enable row level security;

-- Продавец видит свой журнал и ничего чужого.
drop policy if exists "sellers read own ledger" on public.seller_transactions;
create policy "sellers read own ledger"
  on public.seller_transactions
  for select
  using (auth.uid() = seller_id);

revoke insert on public.seller_transactions from anon, authenticated;

comment on table public.seller_transactions is
  'Журнал денег продавца. Баланс — это sum(amount_minor), а не отдельное поле: число, за которым не стоит ни одной записи, получить нельзя.';