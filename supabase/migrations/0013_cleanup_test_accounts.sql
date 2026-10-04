-- Шаг 2 из 2: удалить тестовые аккаунты.
--
-- ВНИМАНИЕ: одноразовый файл. После первого запуска его нельзя выполнять
-- заново, когда в проекте появятся настоящие пользователи.
--
-- Сначала прогони 0012_cleanup_preview.sql и убедись, что в списке нет
-- настоящих ников.

begin;

create temporary table cleanup_users on commit drop as
-- Ника в auth.users нет: он лежит в public.profiles. Удалять надо
-- именно auth.users, иначе каскад в профиль не сработает.
select u.id
from auth.users u
where u.email like '%@studio.ru';

-- Файлы лежат по папкам <user_id>/<beat_id>/файл. Чистим до удаления
-- пользователей, пока их id ещё можно получить.
delete from storage.objects
where bucket_id in ('beats', 'covers', 'masters')
  and (storage.foldername(name))[1] in (select id::text from cleanup_users);

-- posts, post_likes, follows, notifications и beats удалятся каскадом
-- через profiles.
delete from auth.users where id in (select id from cleanup_users);

commit;

-- Проверка: остаться должны только настоящие.
select (select count(*) from auth.users) as users_left,
       (select count(*) from public.profiles) as profiles_left,
       (select count(*) from public.beats) as beats_left,
       (select count(*) from public.posts) as posts_left;
