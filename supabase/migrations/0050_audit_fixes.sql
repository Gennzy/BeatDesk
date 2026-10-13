-- Пост-аудит: снятие придержания, закрытие лишних прав, кап счётчика веток.
--
-- Применяется после 0049, порядок внутри файла значения не имеет.

-- ---------------------------------------------------------------------------
-- 1. Отмена заказа снова освобождает бит.
--
-- Ошибка: статус для решения «снимать придержание?» читался из строки ПОСЛЕ
-- обновления, где он уже новый (cancelled/failed/refunded) и никогда
-- не pending. Отмена висящего заказа молча оставляла бит в reserved
-- навсегда: продать его повторно было нельзя.
-- ---------------------------------------------------------------------------
create or replace function public.close_order(
  p_order_id uuid,
  p_status text,
  p_manual_reason text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_caller uuid := auth.uid();
  v_is_seller boolean;
  v_was_pending boolean;
begin
  if p_status not in ('cancelled', 'failed', 'refunded') then
    raise exception 'Закрыть заказ можно только как cancelled, failed или refunded';
  end if;

  select exists (
    select 1
      from public.order_items i
      join public.beats b on b.id = i.beat_id
     where i.order_id = p_order_id
       and b.owner_id = v_caller
  ) into v_is_seller;

  /*
   * Возврат — только оператору. Он отдаёт покупателю деньги и снимает их
   * продавцу с баланса; продавец, отменяя заказ сам, мог бы снимать
   * средства со своего же начисления.
   */
  if p_status = 'refunded' and not public.is_operator() then
    raise exception 'Возврат средств может сделать только оператор площадки';
  end if;

  /*
   * Отмену неоплаченного заказа может продавец — она ничего не стоит.
   * Оплаченный заказ отменой не закрывается: это уже возврат.
   */
  if p_status <> 'refunded' and not v_is_seller and not public.is_operator() then
    raise exception 'Закрыть заказ может только продавец бита из заказа или оператор';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if v_order.id is null then
    raise exception 'Заказ не найден';
  end if;

  if v_order.status = 'paid' and p_status = 'cancelled' then
    raise exception 'Оплаченный заказ отменой не закрывается: нужен возврат';
  end if;

  -- Статус запоминаем ДО обновления: после него строка уже новая.
  v_was_pending := v_order.status = 'pending';

  update public.orders
     set status = p_status, closed_at = now(), manual_reason = coalesce(p_manual_reason, manual_reason)
   where id = p_order_id
   returning * into v_order;

  if v_was_pending then
    update public.beats b
       set sale_state = 'on_sale', reserved_until = null, reserved_by_order = null
     where b.id in (select beat_id from public.order_items where order_id = p_order_id)
       and b.sale_state = 'reserved'
       and b.reserved_by_order = p_order_id;
  end if;

  if p_status = 'refunded' then
    update public.licenses set revoked_at = now()
     where order_item_id in (select id from public.order_items where order_id = p_order_id)
       and revoked_at is null;

    /*
     * Откат начисления живёт здесь же, а не в маршруте возврата: возврат
     * отнимает деньги у покупателя и оставляет их у продавца, если про
     * списание забыть. Отдельная функция вызывалась бы из кода, который
     * рано или поздно перепишут и про неё забудут.
     */
    insert into public.seller_transactions (
      seller_id, kind, amount_minor, gross_minor, commission_minor,
      commission_bps, currency, order_id, note
    )
    select
      s.seller_id,
      'refund',
      -s.amount_minor,
      -s.gross_minor,
      -s.commission_minor,
      s.commission_bps,
      s.currency,
      s.order_id,
      'Отзыв начисления: возврат заказа ' || p_order_id::text
    from public.seller_transactions s
    where s.order_id = p_order_id
      and s.kind = 'sale'
      and not exists (
        select 1 from public.seller_transactions r
         where r.order_id = p_order_id and r.kind = 'refund'
      )
    on conflict do nothing;
  end if;

  return v_order;
end;
$$;

grant execute on function public.close_order(uuid, text, text) to authenticated;
revoke execute on function public.close_order(uuid, text, text) from anon;

-- ---------------------------------------------------------------------------
-- 2. Денежные и уровневые функции — только служебному ключу.
--
-- recalc_seller_level, payout_amount_minor и seller_balance_minor были
-- открыты любому вошедшему: первый позволял переписать чужой уровень,
-- остальные — прочитать чужую выручку. Приложение их не вызывает
-- (уровень считает триггер, деньги — прямые запросы журнала), поэтому
-- права урезаются без потери функциональности.
-- ---------------------------------------------------------------------------
revoke all on function public.recalc_seller_level(uuid) from authenticated, anon, public;
grant execute on function public.recalc_seller_level(uuid) to service_role;

revoke all on function public.payout_amount_minor(uuid, timestamptz, timestamptz) from authenticated, anon, public;
grant execute on function public.payout_amount_minor(uuid, timestamptz, timestamptz) to service_role;

revoke all on function public.seller_balance_minor(uuid) from authenticated, anon, public;
grant execute on function public.seller_balance_minor(uuid) to service_role;

-- Чистка резерваций никем из приложения не вызывается (возможный будущий
-- крон), гостю дёргать массовый update не положено.
revoke all on function public.release_expired_reservations() from anon, authenticated, public;
grant execute on function public.release_expired_reservations() to service_role;

-- Счётчик кликов и так закрыт для входа; добираем public для полноты.
revoke all on function public.bump_short_link(text) from anon, authenticated, public;

-- Владелец удаляет свою короткую ссылку: политики на удаление не было,
-- и кнопка в интерфейсе упиралась в RLS.
drop policy if exists "own links delete" on public.short_links;
create policy "own links delete"
  on public.short_links
  for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Счётчик веток: кап на вход и UNION ALL.
--
-- Страница шлёт не больше двух десятков корней, сотни здесь — либо ошибка,
-- либо перебор. Режем вход до сотни, чтобы один вызов не загонял рекурсию
-- по всей таблице. UNION меняем на UNION ALL: у поста один родитель,
-- дубликатов быть не может, а distinct на каждом уровне рекурсии дорог.
-- ---------------------------------------------------------------------------
create or replace function public.branch_counts(p_ids uuid[])
returns table (root_id uuid, total bigint)
language sql
security definer
set search_path = public
as $$
  with recursive tree(root, id) as (
    select t.id, t.id
    from public.posts t
    where t.id = any (p_ids[1:100])
    union all
    select tree.root, p.id
    from public.posts p
    join tree on p.parent_id = tree.id
  ) cycle id set is_cycle using path
  select tree.root as root_id, count(*) filter (where tree.id <> tree.root)
  from tree
  group by tree.root;
$$;

comment on function public.branch_counts(uuid[]) is 'Число ответов в ветке целиком для каждого запрошенного корня';

-- ---------------------------------------------------------------------------
-- 4. Никнеймы уникальны без учёта регистра.
--
-- Колонка username уникальна как текст: «Beat» и «beat» — разные ники с
-- точки зрения базы и одинаковые с точки зрения человека. Идеальная
-- мимикрия под продавца. Индекс по lower закрывает её на уровне базы,
-- проверка в маршруте — на уровне интерфейса.
-- ---------------------------------------------------------------------------
create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username));
