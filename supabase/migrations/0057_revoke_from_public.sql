-- create_order закрыт по-настоящему: отзыв от PUBLIC, а не от ролей.
--
-- Применяется после 0056.
--
-- ---------------------------------------------------------------------------
-- ЧТО БЫЛО СДЕЛАНО НЕ ТАК
--
-- В 0056 стояло:
--
--   revoke execute on function public.create_order(jsonb, text, text, jsonb)
--     from anon, authenticated;
--
-- и это ничего не отменяло. У функции в PostgreSQL есть EXECUTE у роли PUBLIC
-- по умолчанию, и anon с authenticated — участники PUBLIC. Отзыв от них
-- убирал явный грант, но грант PUBLIC оставался, и функция продолжала
-- вызываться: проверено живым запросом обычным пользовательским токеном.
--
-- Правильный отзыв — от public. Он снимает право у всех, включая анонимов,
-- а кому нужно, тому выдаётся точечно.
--
-- ---------------------------------------------------------------------------
-- ПОЧЕМУ ЭТО БЫЛО ОПАСНО
--
-- create_order была выдана и anon. Гость мог вызвать её напрямую через
-- PostgREST: auth.uid() у анонима пуст, заказ создавался без покупателя, а
-- бит занимал придержание на полчаса. Продавец не мог продать свой бит
-- кому-то другому, потому что бит числился оплачиваемым. Гость повторял
-- это сколько угодно — и никто не платил.
--
-- Теперь заказ создаёт только create_order_checked, а та доступна вошедшим.

-- PUBLIC отнимает право у всех, кто не назван отдельно.
revoke execute on function public.create_order(jsonb, text, text, jsonb) from public;

-- Проверяющая обёртка: вход нужен, анониму нельзя.
revoke execute on function public.create_order_checked(jsonb, text, text, jsonb) from public;
grant execute on function public.create_order_checked(jsonb, text, text, jsonb) to authenticated;

-- Справка по файлу уровня: тоже только для вошедших. Сама по себе она
-- ничего не меняет и читает одно поле, но открытой функции с именем бита
-- в каталоге быть не должно.
revoke execute on function public.beat_has_tier_file(uuid, text) from public;
grant execute on function public.beat_has_tier_file(uuid, text) to authenticated;

comment on function public.create_order is
  'Создаёт заказ. Вызывать должна только create_order_checked: она проверяет, что файлы уровней есть, до создания заказа. Право execute отозвано у PUBLIC, поэтому напрямую из PostgREST функция недоступна.';

comment on function public.create_order_checked is
  'Создаёт заказ, предварительно убедившись, что файлы каждого уровня есть. Без этого покупатель платил за уровень, файла не было, и заканчивалось 404 «Файл не загружен».';
