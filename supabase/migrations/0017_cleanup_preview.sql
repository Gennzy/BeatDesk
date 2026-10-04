-- Шаг 1 из 2: посмотреть, что попадёт под чистку.
--
-- ВНИМАНИЕ: запусти ПЕРВЫМ. Удаление выполняй только после того, как
-- убедишься, что в первой таблице нет настоящих ников, а во второй
-- твои биты и посты на месте.
--
-- Отбор строго по домену @studio.ru: его использовали только автотесты.

-- 1. Кто удаляется: аккаунты и всё, что им принадлежит.
select
  p.username,
  u.email,
  u.created_at,
  (select count(*) from public.beats b where b.owner_id = u.id)   as beats,
  (select count(*) from public.posts s where s.author_id = u.id)  as posts,
  (select count(*) from public.post_likes l where l.user_id = u.id) as likes
from auth.users u
left join public.profiles p on p.id = u.id
where u.email like '%@studio.ru'
order by u.created_at;

-- 2. Кого удаление НЕ тронет. Если здесь пусто — что-то пошло не так,
--    и удалять нельзя: под нож могли попасть настоящие данные.
select
  u.email,
  p.username,
  (select count(*) from public.beats b where b.owner_id = u.id)  as beats,
  (select count(*) from public.posts s where s.author_id = u.id) as posts
from auth.users u
left join public.profiles p on p.id = u.id
where u.email not like '%@studio.ru'
order by u.created_at;

-- 3. Счётчики для сверки: эти числа должны совпасть с итогом после чистки.
select
  (select count(*) from auth.users)                                        as users,
  (select count(*) from public.profiles)                                   as profiles,
  (select count(*) from public.beats)                                      as beats,
  (select count(*) from public.posts)                                      as posts,
  (select count(*) from public.post_likes)                                 as likes,
  (select count(*) from public.follows)                                    as follows,
  (select count(*) from public.notifications)                             as notifications;

-- 4. Осиротевшие файлы в хранилище: они не связаны ни с одним битом
--    и не видны ни в ленте, ни в каталоге. Прямое удаление закрыто
--    политикой прав, поэтому чистить их стоит папками в кабинете Supabase.
select bucket_id, count(*) as orphan_objects
from storage.objects
where (storage.foldername(name))[1] not in (select id::text from public.profiles)
group by bucket_id
order by orphan_objects desc;
