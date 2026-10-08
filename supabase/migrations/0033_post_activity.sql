-- 0033. Новый пост без ответов не тонет в ленте -------------------------
--
-- Лента корней сортируется по last_reply_at, чтобы активная ветка не уезжала
-- вниз. Но поле заполнялось только при появлении ответа, а у свежего поста
-- ответов нет — значит там NULL. Индекс объявлен nulls last, и любой новый
-- пост вставал в самый конец: автор публиковал запись, обновлял страницу и
-- не находил её. Это и выглядело как «пост пропадает».
--
-- Правильное значение для поста без ответов — время его создания: свежесть
-- записи и есть её последняя активность.

-- 1. Значение по умолчанию ----------------------------------------------

alter table public.posts
  alter column last_reply_at set default now();

comment on column public.posts.last_reply_at is
  'Время последней активности ветки: создания поста или последнего ответа. Новый пост без ответов не должен тонуть внизу ленты';

-- 2. Заполняем уже созданные --------------------------------------------
--
-- У существующих постов без ответов поле пустое — их тоже надо поднять,
-- иначе они останутся внизу навсегда.

update public.posts
   set last_reply_at = created_at
 where last_reply_at is null;

-- 3. Застраховываем вставку ---------------------------------------------
--
-- Столбец заполняется в самой строке, а не отдельным обновлением: триггер
-- после вставки оставлял бы окно, в которое пост уже виден ленте, но ещё
-- без времени активности.

create or replace function public.posts_fill_last_reply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.last_reply_at is null then
    new.last_reply_at := coalesce(new.created_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists posts_fill_last_reply on public.posts;

create trigger posts_fill_last_reply
  before insert on public.posts
  for each row execute function public.posts_fill_last_reply();