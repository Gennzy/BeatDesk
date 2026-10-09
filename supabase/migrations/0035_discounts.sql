-- 0035. Скидка на бит ---------------------------------------------------
--
-- Уровни с зачёркнутой ценой есть у всех конкурентов, и это не украшение:
-- скидка даёт повод показать бит в ленте второй раз и объясняет решение
-- покупателю, который иначе просто проходит мимо.
--
-- Главный вопрос здесь — как не разойтись показу и списанию. Если витрина
-- обещает одну цену, а оформление заказа берёт другую, расхождение вылезет
-- первым же спором с покупателем.
--
-- Решение: prices хранит цену, которую надо списать, а отдельная колонка —
-- прежнюю, для зачёркивания. Тогда правило одно и оно в базе:
--
--   prices         — сколько списываем
--   prices_before  — сколько было до скидки, только для показа
--
-- Так оформление заказа не приходится трогать вовсе: оно уже читает prices,
-- и скидка попадает в списание сама. Никакой второй формулы, которую надо
-- держать в согласии с первой.

-- 1. Прежние цены -------------------------------------------------------

alter table public.beats
  add column if not exists prices_before jsonb;

comment on column public.beats.prices_before is
  'Цены до скидки, для зачёркивания на витрине. NULL — скидки нет. Списание идёт по prices';

alter table public.beats
  add column if not exists discount_percent integer not null default 0;

alter table public.beats
  drop constraint if exists beats_discount_range;

/*
 * От 0 до 90: сто процентов означали бы бесплатную раздачу каталога, а это
 * уже другая механика — подарок, а не скидка. Ноль — скидки нет.
 */
alter table public.beats
  add constraint beats_discount_range check (discount_percent between 0 and 90);

comment on column public.beats.discount_percent is
  'Скидка в процентах. Хранится для подписи «−30%» и для проверки, что цены в prices и prices_before согласованы';

-- 2. Согласованность цен ------------------------------------------------

/*
 * Скидка применяется к ценам до сохранения, а не при показе.
 *
 * Так в базе лежит ровно то число, которое уйдёт в заказ, и число со
 * зачёркиванием рядом. Проверка ниже не даёт сохранить рассогласование:
 * если в prices цена выше, чем в prices_before, — это не скидка, а ошибка.
 *
 * Заодно проверяется, что объявленный процент совпадает с фактическим:
 * иначе витрина писала бы «−30%» там, где скидка десять.
 */
create or replace function public.beats_check_discount() returns trigger
language plpgsql set search_path = public as $$
declare
  v_tier text;
  v_now numeric;
  v_before numeric;
begin
  if new.prices_before is null then
    -- Скидки нет: процент обязан быть нулевым.
    if coalesce(new.discount_percent, 0) <> 0 then
      raise exception 'Скидка % объявлена, но прежних цен нет', new.discount_percent;
    end if;

    return new;
  end if;

  if coalesce(new.discount_percent, 0) = 0 then
    raise exception 'Есть прежние цены, но скидка не объявлена';
  end if;

  -- Сверяем каждый уровень, который продаётся: по ним и считает заказ.
  foreach v_tier in array array['mp3', 'bundle', 'trackout', 'exclusive'] loop
    v_before := (new.prices_before ->> v_tier)::numeric;
    v_now := (new.prices ->> v_tier)::numeric;

    if v_before is null then
      continue;
    end if;

    if v_now is null then
      raise exception 'Уровень % был в продаже, а со скидкой исчез', v_tier;
    end if;

    if v_now > v_before then
      raise exception 'Цена со скидкой выше прежней на уровне % (% против %)', v_tier, v_now, v_before;
    end if;

    -- floor, а не round: округление вниз и есть обещание «скидка не меньше
    -- заявленной». Round здесь округлял бы половину вверх (105 при скидке 50
    -- дал бы 53 вместо 52), и форма, считающая так же, как сейчас, сохранение
    -- отвергло бы. Правило одно на обеих сторонах.
    if floor(v_before * (100 - new.discount_percent) / 100) <> v_now then
      raise exception 'Цена уровня % не совпадает со скидкой %: ожидалось %',
        v_tier, new.discount_percent, floor(v_before * (100 - new.discount_percent) / 100);
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists beats_check_discount on public.beats;

create trigger beats_check_discount
  before insert or update of prices, prices_before, discount_percent on public.beats
  for each row execute function public.beats_check_discount();

-- 3. Индекс для витрины -------------------------------------------------
--
-- Скидочные биты показываются отдельной лентой, и по ним идёт выборка.

create index if not exists beats_discount_idx on public.beats (discount_percent desc)
  where discount_percent > 0 and is_public;