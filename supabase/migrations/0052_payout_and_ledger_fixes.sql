-- Деньги продавца: знак возврата выплаты, начисление нескольким продавцам,
-- гонка баланса при выводе.
--
-- Применяется после 0051.
--
-- Все три ошибки из этого файла относятся к деньгам, и все три молчат:
-- интерфейс показывает правдоподобные числа, а порча видна только в журнале.
--
-- 1. Неудачная выплата списывала деньги продавца ВТОРОЙ раз вместо возврата.
-- 2. Заказ с битами двух продавцов платил только первому.
-- 3. Две одновременные заявки на вывод проходили одну и ту же проверку баланса.

-- ---------------------------------------------------------------------------
-- 1. Начисление и возврат — по паре «заказ + продавец», а не по заказу.
--
-- Индекс был unique (order_id) where kind = 'sale'. Начисление пишется
-- insert-select'ом по позициям заказа, то есть столько строк, сколько у
-- заказа продавцов. На втором продавце вставка натыкалась на нарушение
-- уникальности, и `on conflict do nothing` молча её пропускал: заказ из двух
-- битов разных авторов оплачивался целиком, а деньги получал только один.
--
-- Вторая продавцу принадлежит вся сумма за его позицию: начисление равно
-- seller_net_minor из order_items, и оно не делится ни с кем.
--
-- Индекс на refund не трогаем: возврат закрывает весь заказ целиком, он и
-- должен быть один на заказ, а не на позицию.
-- ---------------------------------------------------------------------------
drop index if exists public.seller_transactions_sale_once;

create unique index if not exists seller_transactions_sale_once
  on public.seller_transactions (order_id, seller_id) where kind = 'sale';

comment on index public.seller_transactions_sale_once is
  'Начисление не может повториться для одной пары «заказ, продавец». Уникальность по одному заказу была ошибкой: заказ с битами двух авторов платил только первому.';

-- ---------------------------------------------------------------------------
-- Починка начислений, потерянных на старом индексе.
--
-- Если такой заказ уже оплачен, деньги второго продавца не начислились
-- никогда: повторный вызов mark_order_paid увидит статус paid и выйдет
-- раньше, чем дойдёт до начисления. Восстанавливаем такие строки напрямую,
-- по той же формуле, что и сама функция.
--
-- Отбор строгий: столько начислений, сколько позиций с ненулевой суммой.
-- Расхождение больше нуля означает ровно то, что начисление потерялось.
-- ---------------------------------------------------------------------------
insert into public.seller_transactions (
  seller_id, kind, amount_minor, gross_minor, commission_minor,
  commission_bps, currency, order_id, note
)
select
  i.beat_owner_id,
  'sale',
  i.seller_net_minor,
  i.price_minor,
  i.commission_minor,
  case when i.price_minor > 0
       then (i.commission_minor * 10000 / i.price_minor)
       else null end,
  i.currency,
  o.id,
  'Восстановлено начисление по заказу ' || o.id::text
from public.orders o
join public.order_items i on i.order_id = o.id
where o.status = 'paid'
  and i.seller_net_minor > 0
  and (
    select count(*) from public.seller_transactions s
     where s.order_id = o.id and s.kind = 'sale'
  ) < (
    select count(*) from public.order_items i2
     where i2.order_id = o.id and i2.seller_net_minor > 0
  )
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Возврат выплаты возвращает деньги, а не списывает их второй раз.
--
-- Ошибка: в payout_back писалось `amount_minor` из строки payout, а в
-- payout-строке сумма отрицательная. Неудачный перевод не возвращал
-- продавцу деньги, а вычитал их повторно: баланс после неудачной попытки
-- становился меньше, чем до неё, и запросить эти деньги снова было уже
-- нельзя. Отменённая выплата стоила продавцу реальной суммы.
--
-- Знак меняем на противоположный, а уникальный индекс делает повторный
-- возврат невозможным: без него `on conflict do nothing` не на что было
-- опереться и не мешал ничего.
-- ---------------------------------------------------------------------------
create unique index if not exists seller_transactions_payout_back_once
  on public.seller_transactions (payout_id) where kind = 'payout_back';

-- Уже записанные неправильные возвраты чиним на месте: сумма возврата
-- равна минусу списания по той же заявке. Строка с верным знаком не
-- трогается — условие отбирает только совпадающие знаки.
update public.seller_transactions b
   set amount_minor = -p.amount_minor
  from public.seller_transactions p
 where p.payout_id = b.payout_id
   and p.kind = 'payout'
   and b.kind = 'payout_back'
   and b.amount_minor = p.amount_minor;

create or replace function public.complete_payout(
  p_payout_id uuid,
  p_paid boolean
) returns public.payouts
language plpgsql security definer set search_path = public as $$
declare
  v_payout public.payouts;
begin
  select * into v_payout from public.payouts where id = p_payout_id for update;

  if v_payout.id is null then
    raise exception 'Заявка не найдена';
  end if;

  if v_payout.status <> 'pending' then
    raise exception 'Заявка уже обработана';
  end if;

  if p_paid then
    update public.payouts set status = 'paid', paid_at = now()
     where id = p_payout_id returning * into v_payout;
    return v_payout;
  end if;

  /*
   * Выплата не прошла — деньги возвращаются на баланс. Без этого баланс
   * остался бы уменьшенным навсегда, и продавец не смог бы запросить их
   * снова: деньги были бы потеряны при неудачном переводе, который никто
   * не совершил.
   */
  update public.payouts set status = 'failed' where id = p_payout_id returning * into v_payout;

  /*
   * Возврат — это минус списания, а не само списание: сумма берётся со
   * знаком минус, иначе неудачная выплата вычла бы деньги второй раз.
   */
  insert into public.seller_transactions (
    seller_id, kind, amount_minor, currency, payout_id, note
  )
  select
    seller_id,
    'payout_back',
    -amount_minor,
    currency,
    payout_id,
    'Выплата не прошла, возврат на баланс'
  from public.seller_transactions
  where payout_id = p_payout_id and kind = 'payout'
  on conflict do nothing;

  return v_payout;
end;
$$;

grant execute on function public.complete_payout(uuid, boolean) to service_role;

comment on function public.complete_payout(uuid, boolean) is
  'Отметка выплаты выполненной оператором. Неудача возвращает на баланс сумму с обратным знаком: повторное списание при неудачном переводе стоило бы продавцу реальных денег.';

-- ---------------------------------------------------------------------------
-- 3. Две одновременные заявки на вывод не должны проходить одну проверку.
--
-- Ошибка: баланс читался обычным select и тут же сверялся с суммой. Две
-- заявки, поданные одновременно, видели одно и то же число свободных
-- денег и обе проходили: продавец выводил дважды, платформа платила дважды.
-- Окно для этого — миллисекунды, но кнопка вывода умеет и двойной клик.
--
-- Читать журнал под блокировкой нельзя: строки журнала не меняются, и
-- блокировка строк их не спасёт — два читателя честно прочтут одно и то
-- же. Нужна блокировка по продавцу, которая сериализует сами заявки.
--
-- pg_advisory_xact_lock берётся на время транзакции и отпускается при
-- commit/rollback сам: явный unlock не нужен, а зависнуть он не может.
-- Хеш от текста с префиксом, чтобы ключ не пересекался с другими
-- advisory-блокировками в этой базе.
-- ---------------------------------------------------------------------------
create or replace function public.request_payout(
  p_seller_id uuid,
  p_amount_minor bigint,
  p_note text default null
) returns public.payouts
language plpgsql security definer set search_path = public as $$
declare
  v_balance bigint;
  v_minimum constant bigint := 1000; -- 10 ₽
  v_payout public.payouts;
begin
  /*
   * Продавец запрашивает вывод только для себя. Проверка стоит здесь, а
   * не в маршруте: функция объявлена security definer и вызывается
   * серверным ключом, поэтому снаружи её auth.uid() — это владелец сессии,
   * и подделать p_seller_id можно было бы.
   */
  if auth.uid() is null or auth.uid() <> p_seller_id then
    raise exception 'Вывести можно только свой баланс';
  end if;

  if p_amount_minor <= 0 then
    raise exception 'Сумма вывода должна быть положительной';
  end if;

  if p_amount_minor < v_minimum then
    raise exception 'Минимальная сумма вывода — 10 ₽';
  end if;

  /*
   * Блокировка берётся ДО чтения баланса. Обратный порядок не имеет
   * смысла: прочитанное до блокировки число успевает устареть ровно в тех
   * двух заявках, ради которых блокировка и нужна.
   */
  perform pg_advisory_xact_lock(hashtextextended('payout:' || p_seller_id::text, 0));

  /*
   * Проверка баланса по журналу, а не по полю в профиле: баланс всегда
   * равен сумме записей, и это единственное число, которому можно
   * верить при выдаче денег.
   */
  select coalesce(sum(amount_minor), 0)::bigint
    into v_balance
    from public.seller_transactions
   where seller_id = p_seller_id;

  if p_amount_minor > v_balance then
    raise exception 'На балансе % ₽, запрошено больше', v_balance / 100;
  end if;

  insert into public.payouts (
    seller_id, amount_minor, status, provider,
    period_start, period_end, order_count, note
  )
  values (
    p_seller_id, p_amount_minor, 'pending', 'manual',
    now() - interval '30 days', now(), 0, p_note
  )
  returning * into v_payout;

  insert into public.seller_transactions (
    seller_id, kind, amount_minor, currency, payout_id, note
  )
  values (
    p_seller_id, 'payout', -p_amount_minor, 'RUB', v_payout.id,
    'Заявка на вывод ' || v_payout.id::text
  );

  return v_payout;
end;
$$;

grant execute on function public.request_payout(uuid, bigint, text) to authenticated;
revoke execute on function public.request_payout(uuid, bigint, text) from anon;

comment on function public.request_payout(uuid, bigint, text) is
  'Заявка продавца на вывод. Баланс уменьшается сразу: иначе те же деньги можно запросить дважды. Заявки одного продавца выстраиваются в очередь advisory-блокировкой, иначе две одновременные заявки выводили бы дважды.';
