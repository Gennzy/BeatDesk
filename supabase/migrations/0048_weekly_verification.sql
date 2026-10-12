-- Проверка продавца по заданиям недели.
--
-- Значок «Проверен» горит, пока с понедельника закрыты три из четырёх:
-- 3 загруженных бита, 3 поста в ленту, 1 оплаченная продажа, 300
-- прослушиваний. Пороги и смысл — в src/lib/sales/weekly.ts, здесь только
-- то же самое числом, чтобы витрина могла спросить одним вызовом.
--
-- Функция от имени владельца, а не читателя: значок видят и гости, а гости
-- чужие черновики и заказы читать не должны. Считаются только факты,
-- никаких сумм и содержимого наружу не выходит — один бит «да/нет».
--
-- Неделя — понедельник 00:00 UTC: date_trunc('week') так и считает, и у
-- продавца в коде то же самое (weekStartMonday). Если разойдутся, значок
-- на витрине и счётчик в кабинете покажут разное.

create or replace function public.weekly_verified(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  start_of_week timestamptz := date_trunc('week', now());
  done_count integer := 0;
begin
  if (select count(*) from public.beats where owner_id = p_user and created_at >= start_of_week) >= 3 then
    done_count := done_count + 1;
  end if;

  if (select count(*) from public.posts where author_id = p_user and created_at >= start_of_week) >= 3 then
    done_count := done_count + 1;
  end if;

  if (
    select count(distinct oi.order_id)
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.beat_owner_id = p_user
      and o.status = 'paid'
      and coalesce(o.paid_at, o.created_at) >= start_of_week
  ) >= 1 then
    done_count := done_count + 1;
  end if;

  if (
    select count(*)
    from public.beat_plays bp
    join public.beats b on b.id = bp.beat_id
    where b.owner_id = p_user
      and bp.played_at >= start_of_week
  ) >= 300 then
    done_count := done_count + 1;
  end if;

  return done_count >= 3;
end;
$$;

comment on function public.weekly_verified(uuid) is 'Значок проверки: с понедельника закрыты 3 из 4 заданий недели';
