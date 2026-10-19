-- Уровень нельзя продать, если файла нет: покупатель платит и получает 404.
--
-- Применяется после 0055.
--
-- ---------------------------------------------------------------------------
-- ЧТО БЫЛО НЕ ТАК
--
-- create_order проверял, что бит найден, не свой, не продан эксклюзивно, не
-- придержан, не черновик, и что у уровня есть цена. Файла он не проверял
-- вообще, и в базе о требованиях к файлам ничего не было.
--
-- Проверка готовности существует только в интерфейсе (src/lib/audio/hygiene.ts
-- и SellReadiness), и она ничего не решает: это подсказка на странице, её
-- легко обойти. Более того, она врала: снятый файл оставался в jsonb, и
-- проверка рапортовала «всё на месте» ровно тогда, когда файла не было.
--
-- Итог был такой: продавец ставил цену на Track Out без архива дорожек, и
-- бит уходил в продажу. Покупатель платил, получал заказ, нажимал «скачать
-- архив» и получал «Файл не загружен: напиши битмейкеру». Деньги уплачены,
-- товар не выдан, спор.
--
-- ---------------------------------------------------------------------------
-- ПОЧЕМУ ПРОВЕРКА В БАЗЕ, А НЕ В КОДЕ
--
-- create_order была выдана и anon, и authenticated. Значит её можно вызвать
-- напрямую через PostgREST, минуя Next.js, и любой проверки в маршруте
-- недостаточно: правило, которое можно обойти одним POST, не является
-- правилом.
--
-- Поэтому проверка добавлена отдельной функцией create_order_checked, а
-- доступ к create_order отозван. Функцию не переписываем целиком: в ней
-- около ста пятидесяти строк с деньгами, и пересборка её текста ради
-- одного if — лишний риск. Обёртка проверяет файлы ДО создания заказа, и
-- только потом зовёт create_order.
--
-- ---------------------------------------------------------------------------
-- КАКОЙ ФАЙЛ ОБЯЗАТЕЛЕН ДЛЯ УРОВНЯ
--
-- Проверяется главный файл уровня, а не все сразу:
--
--   mp3       — превью (mp3_url);
--   bundle    — мастер WAV;
--   trackout  — архив дорожек;
--   exclusive — архив дорожек.
--
-- Требовать все три файла у Track Out было бы слишком: продавец, который
-- залил только архив дорожек, продал бы уровень, покупатель получил бы
-- архив, а мастер в WAV не нашёлся бы. Лишние файлы — бонус, а не условие
-- сделки: главное, чтобы покупатель получил то, что купил.
--
-- Пустое значение в jsonb считается отсутствием: jsonb_typeof проверяет, что
-- это именно объект, а не «null», записанный ранее.

create or replace function public.beat_has_tier_file(p_beat_id uuid, p_tier text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.beats b
     where b.id = p_beat_id
       and case p_tier
         when 'mp3' then b.mp3_url is not null and length(trim(b.mp3_url)) > 0
         when 'bundle' then jsonb_typeof(b.files -> 'wav') = 'object'
         when 'trackout' then jsonb_typeof(b.files -> 'zip') = 'object'
                        or jsonb_typeof(b.files -> 'rar') = 'object'
         when 'exclusive' then jsonb_typeof(b.files -> 'zip') = 'object'
                            or jsonb_typeof(b.files -> 'rar') = 'object'
         else false
       end
  );
$$;

comment on function public.beat_has_tier_file(uuid, text) is
  'Есть ли главный файл уровня: превью для MP3, мастер для MP3+WAV, архив дорожек для Track Out и Эксклюзива. Пустое значение в files считается отсутствием.';

-- ---------------------------------------------------------------------------
-- Заказ с проверкой файлов
--
-- Порядок важен: сначала проверка, потом create_order. Иначе заказ создался
-- бы, придержание занялось, и только потом выяснилось бы, что файла нет, —
-- а откатывать придержание пришлось бы вручную.

create or replace function public.create_order_checked(
  p_items jsonb,
  p_currency text default 'RUB',
  p_buyer_email text default auth.jwt() ->> 'email',
  p_contact jsonb default '{}'::jsonb
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_beat_id uuid;
  v_tier text;
  v_title text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Заказ пустой';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_beat_id := (v_item ->> 'beat_id')::uuid;
    v_tier := v_item ->> 'tier';

    select b.title into v_title from public.beats b where b.id = v_beat_id;

    if v_title is null then
      raise exception 'Бит не найден: %', v_item ->> 'beat_id';
    end if;

    if not public.beat_has_tier_file(v_beat_id, v_tier) then
      /*
       * Текст видит покупатель, и он должен читаться как «продавец не догрузил
       * файл», а не как «ошибка базы». Человек пойдёт к продавцу и скажет
       * конкретное: не хватает архива дорожек.
       */
      raise exception 'Файл уровня «%» не загружен битмейкером: %', v_tier, v_title;
    end if;
  end loop;

  return public.create_order(p_items, p_currency, p_buyer_email, p_contact);
end;
$$;

grant execute on function public.create_order_checked(jsonb, text, text, jsonb) to authenticated;
revoke execute on function public.create_order_checked(jsonb, text, text, jsonb) from anon;

-- Прямой вызов без проверки больше невозможен: иначе обход состоял бы в
-- одном POST к create_order.
revoke execute on function public.create_order(jsonb, text, text, jsonb) from anon, authenticated;

comment on function public.create_order_checked is
  'Создаёт заказ, предварительно убедившись, что файлы каждого уровня есть. Без этого покупатель платил за уровень, файла не было, и заканчивалось 404 «Файл не загружен».';
