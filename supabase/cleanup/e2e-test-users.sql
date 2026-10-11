-- Уборка тестовых учёток, накопленных прогонами e2e.
--
-- Скрипт прогоняет регистрацию по боевой базе, и каждая регистрация
-- оставляла профиль. На момент написания в profiles было 272 профиля,
-- из них 240 — e2e. Дальше их становилось только больше.
--
-- Сначала посмотрите, что будет удалено:
--
--   select id, username, email from public.profiles
--   where username like 'e2e%' order by username;
--
-- Затем выполните удаление. Справа в скобках — сколько строк затронет
-- каждый шаг; если число отличается от ожидаемого, остановитесь.

-- Шаг 1. Убираем биты тестовых продавцов.  (2 строки)
delete from public.beats
where owner_id in (select id from public.profiles where username like 'e2e%');

-- Шаг 2. Посты в ленте.  (несколько сотен)
delete from public.posts
where author_id in (select id from public.profiles where username like 'e2e%');

-- Шаг 3. Подписки: и как подписчик, и как тот, на кого подписались.  (0)
delete from public.follows
where follower_id in (select id from public.profiles where username like 'e2e%')
   or following_id in (select id from public.profiles where username like 'e2e%');

-- Шаг 4. Корзины.  (несколько десятков)
delete from public.cart_items
where user_id in (select id from public.profiles where username like 'e2e%');

-- Шаг 5. Заказы тестовых покупателей.  (0)
delete from public.orders
where buyer_id in (select id from public.profiles where username like 'e2e%');

-- Шаг 6. Собственно учётки.  (240 строк)
--
-- auth.users удаляется каскадом из profiles, поэтому и здесь нужен
-- service_role-ключ, а не anon. В Supabase SQL Editor он уже есть.
delete from auth.users
where id in (select id from public.profiles where username like 'e2e%');

-- Проверка: должно остаться 32 профиля.
--   select count(*) from public.profiles;