-- Заявка продавца на вывод.
--
-- Деньги у продавца лежат на балансе, но он не может забрать их сам:
-- перевод делает площадка, и для этого нужен человек, который её делает.
-- Функция создаёт заявку и сразу уменьшает баланс.
--
-- Баланс уменьшается сразу, а не при выплате, и это главное в её смысле.
-- Если бы списание происходило после перевода, одни и те же деньги можно
-- было бы запросять дважды: деньги на балансе ещё есть, а перевод уже
-- отправлен. Двойная выплата продавцу — это наши деньги, выданные дважды.
--
-- Заявка и списание создаются в одной транзакции: если не проходит
-- списание, не должна появляться и заявка.

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

  select coalesce(sum(amount_minor), 0)::bigint
    into v_balance
    from public.seller_transactions
   where seller_id = p_seller_id;

  /*
   * Проверка баланса по журналу, а не по полю в профиле: баланс всегда
   * равен сумме записей, и это единственное число, которому можно
   * верить при выдаче денег.
   */
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
  'Заявка продавца на вывод. Баланс уменьшается сразу: иначе те же деньги можно запросить дважды. Проверяет, что выводят себе, и сверяет сумму с журналом.';

-- ---------------------------------------------------------------------------
-- Отметка выплаты выполненной.
--
-- Выплату делает человек, а не провайдер. Функция нужна, чтобы «заявка
-- закрыта, деньги ушли» записывалось в журнал продавца, а не оставалось
-- записью в таблице payouts без следа в истории денег.
--
-- Закрывает заявку оператор, а не продавец: деньги он отправляет своими
-- руками, и «заявка закрыта» без его действия — просто ложь в интерфейсе.
-- Продавец может только создать заявку; отметить её выполненной он не
-- может, иначе нажал бы кнопку и решил, что деньги придут.
--
-- Выдача только service_role: функцию зовёт сервер оператора, а не браузер.
-- Если бы execute был у authenticated, продавец сам себе отмечал выплату
-- и закрывал заявку без перевода.
-- ---------------------------------------------------------------------------
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

  insert into public.seller_transactions (
    seller_id, kind, amount_minor, currency, payout_id, note
  )
  select
    seller_id,
    'payout_back',
    amount_minor,
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