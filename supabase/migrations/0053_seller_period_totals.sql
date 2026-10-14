-- Итоги по зака��ам продавца считает база, а не страница.
--
-- Применяется после 0052.
--
-- Страница кабинета собирала выручку так: выкачивала ВСЕ позиции продавца
-- за всю историю, затем брала идентификаторы заказов и одним запросом
-- спрашивала их статусы.
--
-- Такая схема ломается на второй сотне заказов, а не на миллионной:
-- список идентификаторов уезжает в адрес запроса, PostgREST обрезает его,
-- и страница перестаёт открываться. Считается это в тот самый момент,
-- когда у продавца больше всего заказов, то есть когда он сюда и ходит.
--
-- Здесь итоги считаются в базе: сколько заработано за период в каждой
-- валюте, сколько позиций оплачено и сколько заказов ждёт подтверждения.
-- Функция берёт суммы из позиций продавца, а не из суммы заказа: в заказе
-- могут быть биты разных авторов, и сумма заказа продавцу не принадлежит.
--
-- Период задаётся числом дней; null — вся история. Отсчёт идёт от времени
-- оплаты, а падая на время создания заказа: неоплаченный заказ, созданный
-- вчера и оплаченный сегодня, должен попасть в сегодняшний заработок.

create or replace function public.seller_period_totals(p_days integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_currencies jsonb;
  v_pending bigint;
begin
  if v_uid is null then
    raise exception 'Нужно войти';
  end if;

  /*
   * Продавец спрашивает итоги только по себе. Идентификатор не принимается:
   * функция объявлена security definer, и продавец с правом вызова смог бы
   * подставить чужой uuid и увидеть чужую выручку.
   */
  with paid as (
    select i.currency,
           sum(i.seller_net_minor)::bigint as amount_minor,
           count(*)::bigint as items
      from public.order_items i
      join public.orders o on o.id = i.order_id
     where i.beat_owner_id = v_uid
       and o.status in ('paid', 'delivered')
       and (
         p_days is null
         or coalesce(o.paid_at, o.created_at) >= now() - make_interval(days => p_days)
       )
     group by i.currency
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object('currency', currency, 'amount_minor', amount_minor, 'items', items)
             order by currency
           ),
           '[]'::jsonb
         )
    into v_currencies
    from paid;

  /*
   * Ждущие заказы считаются отдельно и не зависят от периода: вкладка
   * «всё время» и «за неделю» показывают одно и то же число неоплаченного,
   * иначе переключение периода молча меняло бы очередь работы оператора.
   */
  select count(distinct o.id)::bigint
    into v_pending
    from public.orders o
   where o.status = 'pending'
     and exists (
       select 1
         from public.order_items i
        where i.order_id = o.id
          and i.beat_owner_id = v_uid
     );

  return jsonb_build_object('currencies', v_currencies, 'pending_orders', v_pending);
end;
$$;

grant execute on function public.seller_period_totals(integer) to authenticated;
revoke execute on function public.seller_period_totals(integer) from anon;

comment on function public.seller_period_totals(integer) is
  'Итоги продавца за период в каждой валюте, число оплаченных позиций и число заказов в ожидании подтверждения. Считает только по текущему пользователю: чужую выручку так не увидеть.';
