-- Разовая уборка тестовых учёток, накопленных прогонами e2e.
--
-- Скрипт прогонял регистрацию по боевой базе, и каждая регистрация
-- оставляла профиль навсегда. Состояние на момент написания:
--
--     профилей всего        280
--     из них тестовых       248   (username начинается с "e2e")
--     постов в ленте      1191
--     битов                   2
--
-- Настоящих продавцов двое, и оба бита их. Всё остальное — мусор.
--
-- С ноября прогоны убирают за собой учётки сами (cleanupCreatedUsers в
-- e2e/smoke.mjs), поэтому мусор больше не копится. Этот файл — только
-- для уже накопленного.
--
-- ---------------------------------------------------------------------------
-- Сначала посмотрите, что будет удалено:
--
--     select id, username, email from public.profiles
--     where username like 'e2e%' order by username;
--
-- Затем выполняйте шаги по порядку. Порядок задан внешними ключами, а не
-- удобством: licenses.beat_owner_id и order_items.beat_id объявлены с
-- `on delete restrict`, поэтому покупки и выданные лицензии обязаны уйти
-- раньше битов и профилей. Переставьте шаги — удаление упадёт на середине
-- и оставит ровно то, ради чего этот файл написан.
-- ---------------------------------------------------------------------------

-- Шаг 1. Биты тестовых продавцов.  Ожидается: 0 строк.
delete from public.beats
where owner_id in (select id from public.profiles where username like 'e2e%');

-- Шаг 2. Выданные лицензии.  До шага 3: обязателен, ограничение restrict.
delete from public.licenses
where beat_owner_id in (select id from public.profiles where username like 'e2e%');

-- Шаг 3. Позиции заказов.  До шага 4: обязателен, ограничение restrict.
delete from public.order_items
where buyer_id in (select id from public.profiles where username like 'e2e%');

-- Шаг 4. Заказы.  Ожидается: 0 строк.
delete from public.orders
where buyer_id in (select id from public.profiles where username like 'e2e%');

-- Шаг 5. Отзывы.  Ожидается: 0 строк.
delete from public.reviews
where author_id in (select id from public.profiles where username like 'e2e%');

-- Шаг 6. Комментарии и лайки.  Ожидается: несколько сотен и единицы.
delete from public.beat_comments
where author_id in (select id from public.profiles where username like 'e2e%');

delete from public.post_likes
where user_id in (select id from public.profiles where username like 'e2e%');

-- Шаг 7. Подписки — и как подписчик, и как тот, на кого подписались.
-- Ожидается: 0 строк.
delete from public.follows
where follower_id in (select id from public.profiles where username like 'e2e%')
   or following_id in (select id from public.profiles where username like 'e2e%');

-- Шаг 8. Корзины.  Ожидается: 0 строк.
delete from public.cart_items
where user_id in (select id from public.profiles where username like 'e2e%');

-- Шаг 9. Уведомления.  Ожидается: единицы.
delete from public.notifications
where user_id in (select id from public.profiles where username like 'e2e%')
   or actor_id in (select id from public.profiles where username like 'e2e%');

-- Шаг 10. Посты в ленте.  Ожидается: около 1190 строк — главная масса мусора.
delete from public.posts
where author_id in (select id from public.profiles where username like 'e2e%');

-- Шаг 11. Собственно учётки.  Ожидается: 248 строк.
--
-- auth.users владеет каскадом вниз, в profiles — вниз же от auth.users.
-- Поэтому удаление идёт отсюда: удалить profiles.id напрямую нельзя,
-- на него ссылаются ограничения restrict.
delete from auth.users
where id in (select id from public.profiles where username like 'e2e%');

-- ---------------------------------------------------------------------------
-- Проверка: должно остаться 32 профиля, постов — единицы, битов — 2.
--
--     select count(*) from public.profiles;   -- ожидается 32
--     select count(*) from public.posts;      -- ожидается единицы
--     select count(*) from public.beats;      -- ожидается 2
-- ---------------------------------------------------------------------------