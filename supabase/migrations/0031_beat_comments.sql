-- 0031. Комментарии к битам -------------------------------------------
--
-- Лента битов была витриной без обратной связи: послушал, и всё. Интерес
-- к чужому биту некуда было деть, кроме лайка, а лайк ничего не говорит
-- автору. Комментарий — это и обратная связь, и повод вернуться: автор
-- получает уведомление и отвечает.
--
-- Структура повторяет посты: parent_id позволяет отвечать на ответ, без
-- отдельной таблицы для веток.

-- 1. Вид уведомления ----------------------------------------------------

/*
 * Проверка на kind меняется под блокировкой ACCESS EXCLUSIVE, а любой запрос
 * уведомлений держит на таблице ACCESS SHARE. Пока сайт живой, обычный ALTER
 * упирается в ожидание, а два ожидающих друг друга процесса дают 40P01.
 *
 * Поэтому: одна команда вместо двух (замок берётся один раз, а не два), с
 * коротким lock_timeout и тремя попытками. Иначе миграция падает случайно —
 * в зависимости от того, открыл ли кто-нибудь страницу уведомлений.
 */
do $$
declare
  v_done boolean := false;
begin
  /*
   * Без предельного времени ожидания ALTER ждал бы вечно, и два запроса,
   * ждущих друг друга, по-прежнему дали бы 40P01. Две секунды — достаточно,
   * чтобы взять замок на пустой таблице, и достаточно мало, чтобы не висеть.
   */
  perform set_config('lock_timeout', '2s', true);

  for attempt in 1..3 loop
    begin
      alter table public.notifications
        drop constraint if exists notifications_kind_check,
        add constraint notifications_kind_check
        check (kind in (
          'reply', 'like', 'follow',
          'sale', 'achievement',
          'beat_uploaded', 'beat_failed', 'beat_published',
          'review', 'order_ready', 'beat_comment'
        ));

      v_done := true;
      exit;
    exception
      when lock_not_available then
        -- Живой запрос держит таблицу. Ждём и пробуем снова.
        raise notice 'notifications занята, попытка % из 3', attempt;
        perform pg_sleep(0.5);
    end;
  end loop;

  -- Молчаливый выход был бы хуже ошибки: миграция отметилась бы успешной, а
  -- вид beat_comment остался бы недопустимым, и комментарий падал бы уже в
  -- приложении с непонятным сообщением.
  if not v_done then
    raise exception 'notifications занята дольше 6 секунд — закрой страницу уведомлений и повтори';
  end if;
end;
$$;

-- 2. Комментарии --------------------------------------------------------

create table if not exists public.beat_comments (
  id uuid primary key default gen_random_uuid(),
  beat_id uuid not null references public.beats on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  parent_id uuid references public.beat_comments on delete cascade,
  body text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists beat_comments_beat_idx on public.beat_comments (beat_id, created_at);
create index if not exists beat_comments_parent_idx on public.beat_comments (parent_id) where parent_id is not null;

comment on table public.beat_comments is 'Обсуждение под битом. Ответ на ответ хранится в parent_id';

alter table public.beat_comments enable row level security;

-- Обсуждение под битом открытое: артист выбирает бит, читая мнения.
create policy "beat comments are viewable by everyone"
  on public.beat_comments for select
  using (true);

create policy "authors insert own beat comments"
  on public.beat_comments for insert
  with check (auth.uid() = author_id);

create policy "authors delete own beat comments"
  on public.beat_comments for delete
  using (auth.uid() = author_id);

-- 3. Что проверяет база, а не клиент -----------------------------------

-- Ответ должен быть на комментарий к тому же биту: иначе ветка из другого
-- бита приклеивалась бы сюда через parent_id.
create or replace function public.beat_comment_same_beat() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_parent_beat uuid;
  v_parent_author uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select beat_id, author_id into v_parent_beat, v_parent_author
    from public.beat_comments
   where id = new.parent_id;

  if v_parent_beat is null then
    raise exception 'Комментарий, на который отвечают, не найден';
  end if;

  if v_parent_beat <> new.beat_id then
    raise exception 'Ответ должен быть в том же бите';
  end if;

  -- Ответ не может быть глубже одного уровня: иначе ветка превращается в
  -- список и читать её невозможно.
  if exists (select 1 from public.beat_comments where id = new.parent_id and parent_id is not null) then
    raise exception 'Отвечать на ответ нельзя, отвечай на исходный комментарий';
  end if;

  -- Автору бита отвечать себе же незачем, но и запрещать не будем: иногда
  -- это уточнение своего же объяснения. Проверка ниже только на свои права.

  return new;
end;
$$;

drop trigger if exists beat_comments_same_beat on public.beat_comments;

create trigger beat_comments_same_beat
  before insert on public.beat_comments
  for each row execute function public.beat_comment_same_beat();

-- 4. Уведомление автору бита и автору комментария -----------------------

create or replace function public.notify_beat_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_replied_to uuid;
begin
  select owner_id into v_owner from public.beats where id = new.beat_id;

  -- Автору бита: главный получатель, ему важен отклик на его работу.
  if v_owner is not null and v_owner <> new.author_id then
    perform public.notify_user(v_owner, 'beat_comment', new.author_id, new.beat_id);
  end if;

  -- Тому, на кого ответили: иначе ветка обрывается молча.
  if new.parent_id is not null then
    select author_id into v_replied_to from public.beat_comments where id = new.parent_id;

    if v_replied_to is not null and v_replied_to <> new.author_id then
      perform public.notify_user(v_replied_to, 'reply', new.author_id, new.beat_id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists beat_comments_notify on public.beat_comments;

create trigger beat_comments_notify
  after insert on public.beat_comments
  for each row execute function public.notify_beat_comment();

-- 5. Один комментарий человека на комментарий ---------------------------
--
-- Без этого двойное нажатие Enter создавало две одинаковые строки.

create unique index if not exists beat_comments_once_per_parent
  on public.beat_comments (author_id, parent_id)
  where parent_id is not null;

comment on index public.beat_comments_once_per_parent is
  'Один ответ человека на один комментарий: двойное нажатие не плодит строки';