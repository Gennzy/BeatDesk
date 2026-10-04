-- Шаг 2 из 2: удалить тестовые аккаунты.
--
-- ВНИМАНИЕ: одноразовый файл. Когда в проекте появятся настоящие
-- пользователи на домене @studio.ru, его выполнять уже нельзя.
--
-- Сначала прогони 0017_cleanup_preview.sql и убедись, что:
--   * в первой таблице только тестовые ники;
--   * во второй таблице есть твой настоящий аккаунт и его биты.
--
-- Файлы из storage.objects здесь не трогаем: они не привязаны к битам
-- внешним ключом, удалять их нужно папками в кабинете Supabase.

begin;

-- Страховка от тихой пустоты: если автотесты давно не запускались и
-- удалять нечего, лучше узнать об этом сейчас, а не после delete в 0 строк.
do $$
declare
  target integer;
  real_users integer;
begin
  select count(*) into target from auth.users where email like '%@studio.ru';
  select count(*) into real_users from auth.users where email not like '%@studio.ru';

  if target = 0 then
    raise exception 'Нечего удалять: нет ни одного аккаунта @studio.ru. Проверь, что запускаешь нужный файл.';
  end if;

  if real_users = 0 then
    raise exception 'Останавливаюсь: в базе нет ни одного настоящего аккаунта. Похоже, что-то уже удалили.';
  end if;

  raise notice 'К удалению: % тестовых аккаунтов. Остаётся: % настоящих.', target, real_users;
end $$;

-- profiles, beats, posts, post_likes, follows и notifications исчезают
-- каскадом по внешним ключам. Уведомления настоящих пользователей о
-- лайках и ответах на тестовые посты тоже уйдут вместе с постами —
-- это правильно, ведь поста, на который они ссылаются, больше нет.
delete from auth.users where email like '%@studio.ru';

commit;

-- Проверка: остаться должны только настоящие. Числа совпадают со счётчиками
-- из пункта 3 предпросмотра, если тестовых битов и постов не было сверх них.
select
  (select count(*) from auth.users)            as users_left,
  (select count(*) from public.profiles)       as profiles_left,
  (select count(*) from public.beats)          as beats_left,
  (select count(*) from public.posts)          as posts_left,
  (select count(*) from public.post_likes)     as likes_left,
  (select count(*) from public.follows)        as follows_left,
  (select count(*) from public.notifications) as notifications_left;

-- Что именно осталось: это должны быть твои данные.
select
  u.email,
  p.username,
  (select count(*) from public.beats b where b.owner_id = u.id)  as beats,
  (select count(*) from public.posts s where s.author_id = u.id) as posts
from auth.users u
left join public.profiles p on p.id = u.id
where u.email not like '%@studio.ru'
order by u.created_at;
