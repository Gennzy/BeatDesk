-- Шаг 2 из 2: удалить тестовые аккаунты.
--
-- ВНИМАНИЕ: одноразовый файл. После первого запуска его нельзя выполнять
-- заново, когда в проекте появятся настоящие пользователи.
--
-- Сначала прогони 0012_cleanup_preview.sql и убедись, что в списке нет
-- настоящих ников.
--
-- Файлы из storage.objects здесь НЕ трогаем: Supabase закрыл прямое
-- удаление триггером protect_delete, и отключать эту защиту ради уборки
-- неправильно. Осиротевшие файлы безвредны — они не связаны ни с одним
-- битом и не попадают ни в ленту, ни в каталог. Сколько их осталось,
-- показывает последний запрос.

begin;

create temporary table cleanup_users on commit drop as
-- Ника в auth.users нет: он лежит в public.profiles. Удалять надо
-- именно auth.users, иначе каскад в профиль не сработает.
select u.id
from auth.users u
where u.email like '%@studio.ru';

-- Сколько именно удаляем.
select count(*) as accounts_to_delete from cleanup_users;

-- profiles, beats, posts, post_likes, follows и notifications исчезают
-- каскадом по внешним ключам.
delete from auth.users where id in (select id from cleanup_users);

commit;

-- Проверка: остаться должны только настоящие.
select (select count(*) from auth.users) as users_left,
       (select count(*) from public.profiles) as profiles_left,
       (select count(*) from public.beats) as beats_left,
       (select count(*) from public.posts) as posts_left;

-- Осиротевшие файлы: не мешают, но посмотреть полезно. Удалить можно
-- в кабинете Supabase → Storage, папками.
select bucket_id, count(*) as orphan_objects
from storage.objects
where (storage.foldername(name))[1] not in (select id::text from public.profiles)
group by bucket_id
order by orphan_objects desc;
