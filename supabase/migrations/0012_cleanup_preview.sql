-- Шаг 1 из 2: посмотреть, что попадёт под чистку.
--
-- Запусти этот файл ПЕРВЫМ и посмотри результат. Только убедившись, что
-- в списке нет настоящих ников, запускай 0013_cleanup_test_accounts.sql.
--
-- Отбор строго по почте на домене @studio.ru: его использовали только
-- автотесты, настоящих аккаунтов на нём нет.

select
  p.username,
  u.email,
  u.created_at,
  (select count(*) from public.beats b where b.owner_id = u.id) as beats,
  (select count(*) from public.posts s where s.author_id = u.id) as posts
from auth.users u
left join public.profiles p on p.id = u.id
where u.email like '%@studio.ru'
order by u.created_at;

-- Сколько останется, если удалить всех из списка выше.
select count(*) as users_left from auth.users where email not like '%@studio.ru';
