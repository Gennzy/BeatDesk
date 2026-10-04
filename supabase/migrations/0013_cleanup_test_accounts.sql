-- Шаг 2 из 2: удалить тестовые аккаунты.
--
-- ВНИМАНИЕ: одноразовый файл. После первого запуска его нельзя выполнять
-- заново, когда в проекте появятся настоящие пользователи.
--
-- Сначала прогони 0012_cleanup_preview.sql и убедись, что в списке нет
-- настоящих ников.
--
-- Временных таблиц здесь намеренно нет: редактор Supabase выполняет
-- операции по разным соединениям, а TEMP-таблица живёт только в своём
-- соединении. Отбор прост, поэтому он просто повторяется текстом.
--
-- Файлы из storage.objects не трогаем: прямое удаление закрыто триггером
-- protect_delete, и отключать эту защиту ради уборки неправильно.
-- Осиротевшие файлы безвредны: они не связаны ни с одним битом и не
-- видны ни в ленте, ни в каталоге.

-- Сколько аккаунтов под удаление.
select count(*) as accounts_to_delete
from auth.users where email like '%@studio.ru';

begin;

-- profiles, beats, posts, post_likes, follows и notifications исчезают
-- каскадом по внешним ключам.
delete from auth.users where email like '%@studio.ru';

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
