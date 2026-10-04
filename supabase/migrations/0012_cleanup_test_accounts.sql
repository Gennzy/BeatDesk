-- Уборка тестовых аккаунтов после разработки.
--
-- ВНИМАНИЕ: файл одноразовый. После первого запуска его нельзя выполнять
-- заново, когда в проекте появятся настоящие пользователи.
--
-- Удаляем строго по почте на домене @studio.ru: его использовали только
-- автотесты. Настоящий аккаунт на studio.ru не заводился, поэтому
-- под домен попадают тестовые записи, а не люди.
--
-- Порядок важен: сначала складываем id в временную таблицу, потом чистим
-- хранилище. Если удалить auth.users раньше, id уже не откуда взять.
--
-- Перед DELETE выполни SELECT из блока «что будет удалено» и убедись, что
-- в списке нет настоящих ников.

begin;

create temporary table cleanup_users on commit drop as
select id, username, email from auth.users where email like '%@studio.ru';

-- Что будет удалено: проверь глазами перед тем, как идти дальше.
select username, email, created_at from cleanup_users order by created_at;

-- Файлы из публичного бакета лежат по папкам <user_id>/<beat_id>/файл.
delete from storage.objects
where bucket_id in ('beats', 'covers')
  and (storage.foldername(name))[1] in (select id::text from cleanup_users);

-- posts/post_likes/follows/notifications/beats удалятся каскадом вместе
-- с auth.users через profiles.
delete from auth.users where id in (select id from cleanup_users);

commit;

-- Проверка: остаться должно только то, что не попадает под домен.
select (select count(*) from auth.users) as users_left,
       (select count(*) from profiles) as profiles_left,
       (select count(*) from posts) as posts_left;
