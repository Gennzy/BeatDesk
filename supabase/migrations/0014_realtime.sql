-- Лента постов обновляется без перезагрузки.
--
-- Realtime в Supabase работает через публикацию: пока таблица в неё не
-- добавлена, подписка молча не присылает ничего. Пользователь смотрел бы
-- на пустую ленту и не понимал, почему.

do $$
declare
  target text;
begin
  foreach target in array array['posts', 'post_likes', 'follows', 'notifications'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = target) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end $$;

-- Проверка: в списке должны быть все четыре таблицы.
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;
