-- BeatDesk: чтение журнала продавца через RPC, а не через service role
--
-- Раньше страница баланса читала seller_transactions служебным клиентом, потому
-- что RLS не давал продавцу видеть свои строки (или давал, но с ограничениями).
-- Теперь есть security definer функция, которая возвращает журнал только
-- вызывающему: продавец видит только свои записи, оператор — любые.

create or replace function public.get_seller_ledger(p_seller_id uuid)
returns table (
  id uuid,
  kind text,
  amount_minor bigint,
  gross_minor bigint,
  commission_minor bigint,
  commission_bps integer,
  currency text,
  created_at timestamptz,
  order_id uuid
)
language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_is_operator boolean := false;
begin
  if v_caller is null then
    raise exception 'Нужно войти';
  end if;

  select coalesce(is_operator, false) into v_is_operator
    from public.profiles where id = v_caller;

  -- Продавец видит только свой журнал; оператор — любой.
  if v_caller <> p_seller_id and not v_is_operator then
    raise exception 'Нет доступа к этому журналу';
  end if;

  return query
    select t.id, t.kind, t.amount_minor, t.gross_minor, t.commission_minor,
           t.commission_bps, t.currency, t.created_at, t.order_id
      from public.seller_transactions t
     where t.seller_id = p_seller_id
     order by t.created_at desc;
end;
$$;

grant execute on function public.get_seller_ledger(uuid) to authenticated;
revoke execute on function public.get_seller_ledger(uuid) from anon;