-- Ветки битмейкеров: посты, ответы, лайки, подписки, уведомления.
--
-- Отдельной таблицы комментариев нет: parent_id ссылается на саму posts,
-- поэтому разветвление получается одной таблицей.
--
-- Правила, которые нельзя вынести в код клиента, живут здесь триггерами:
-- бит в посте обязан принадлежать автору, счётчики пересчитываются,
-- уведомления создаются автоматически. Клиент про это ничего не знает и
-- обойти не может.

-- 1. Таблицы ------------------------------------------------------------

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles on delete cascade,
  parent_id uuid references public.posts on delete cascade,
  beat_id uuid references public.beats on delete set null,
  body text not null default '',
  like_count integer not null default 0,
  reply_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_reply_at timestamptz,
  constraint "post is not empty" check (length(trim(body)) > 0 or beat_id is not null),
  constraint "no self reply" check (parent_id is null or parent_id <> id)
);

comment on column public.posts.body is 'Текст поста. Может быть пустым, если прикреплён бит.';
comment on column public.posts.last_reply_at is 'Время последнего ответа в ветке. По нему ветка стоит в ленте, чтобы активная не уезжала вниз.';

create table if not exists public.post_likes (
  post_id uuid not null references public.posts on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles on delete cascade,
  following_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint "no self follow" check (follower_id <> following_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  actor_id uuid references public.profiles on delete set null,
  post_id uuid references public.posts on delete cascade,
  kind text not null check (kind in ('reply', 'like', 'follow')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Частичная уникальность: один и тот же человек не спамит десятью
-- одинаковыми уведомлениями на один и тот же пост.
create unique index if not exists notifications_once_per_actor
  on public.notifications (user_id, kind, coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists posts_feed_idx on public.posts (created_at desc);
create index if not exists posts_root_idx on public.posts (parent_id, created_at);
create index if not exists posts_author_idx on public.posts (author_id, created_at desc);
create index if not exists posts_roots_activity_idx on public.posts (last_reply_at desc nulls last, created_at desc) where parent_id is null;
create index if not exists follows_following_idx on public.follows (following_id);
create index if not exists notifications_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

-- 2. Владение битом проверяет база --------------------------------------
-- Это единственное место, где правило «в пост можно прикрепить только
-- свой бит» вообще существует. Проверка в приложении была бы обходима.

create or replace function public.post_beat_belongs_to_author() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  if new.beat_id is null then
    return new;
  end if;

  select owner_id into owner from public.beats where id = new.beat_id;

  if owner is null then
    raise exception 'бит не найден';
  end if;

  if owner <> new.author_id then
    raise exception 'в пост можно прикрепить только свой бит';
  end if;

  -- Прикреплённый бит обязан быть публичным: иначе пост покажет его
  -- название всем, а сам бит скрыт. Это та же дыра, что с мастерами.
  if not exists (select 1 from public.beats where id = new.beat_id and is_public) then
    raise exception 'прикреплённый бит должен быть публичным';
  end if;

  return new;
end $$;

drop trigger if exists post_beat_owner on public.posts;
create trigger post_beat_owner
  before insert or update of beat_id, author_id on public.posts
  for each row execute function public.post_beat_belongs_to_author();

-- 3. Счётчики и время последнего ответа ---------------------------------

-- Поднимает last_reply_at по всей ветке, иначе активная ветка уезжает
-- вниз ленты вслед за последним ответом в глубоком ответе.
create or replace function public.touch_ancestors(target uuid) returns void
language sql security definer set search_path = public as $$
  with recursive chain as (
    select id, parent_id from public.posts where id = target
    union all
    select p.id, p.parent_id from public.posts p join chain c on p.id = c.parent_id
  )
  update public.posts p
     set last_reply_at = now()
   where p.id in (select id from chain)
     and p.last_reply_at is distinct from now();
$$;

create or replace function public.on_reply_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.posts set reply_count = reply_count + 1 where id = new.parent_id;
  perform public.touch_ancestors(new.parent_id);
  return null;
end $$;

create or replace function public.on_reply_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.posts set reply_count = greatest(reply_count - 1, 0) where id = old.parent_id;
  return null;
end $$;

-- insert и delete считают по-разному, поэтому триггера два
drop trigger if exists post_reply_count_ins on public.posts;
create trigger post_reply_count_ins
  after insert on public.posts
  for each row when (new.parent_id is not null)
  execute function public.on_reply_insert();

drop trigger if exists post_reply_count_del on public.posts;
create trigger post_reply_count_del
  after delete on public.posts
  for each row when (old.parent_id is not null)
  execute function public.on_reply_delete();

create or replace function public.recount_likes(target uuid) returns void
language sql security definer set search_path = public as $$
  update public.posts
     set like_count = (select count(*) from public.post_likes where post_id = target)
   where id = target;
$$;

create or replace function public.on_like_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recount_likes(coalesce(new.post_id, old.post_id));
  return null;
end $$;

drop trigger if exists post_like_count on public.post_likes;
create trigger post_like_count
  after insert or delete on public.post_likes
  for each row execute function public.on_like_change();

-- 4. Уведомления --------------------------------------------------------
-- Вставки идут только из триггеров с security definer. Политики на insert
-- у пользователя нет, поэтому из приложения уведомление не подделать.

create or replace function public.notify() returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, actor_id, post_id, kind)
  select recipient, actor, target_post, target_kind
  from (values ($1::uuid, $2::uuid, $3::uuid, $4::text)) as v(recipient, actor, target_post, target_kind)
  where recipient is not null and recipient <> actor
  on conflict do nothing;
$$;

create or replace function public.notify_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner_id uuid;
begin
  select author_id into owner_id from public.posts where id = new.parent_id;
  perform public.notify(owner_id, new.author_id, new.id, 'reply');
  return null;
end $$;

create or replace function public.notify_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner_id uuid;
begin
  select author_id into owner_id from public.posts where id = new.post_id;
  perform public.notify(owner_id, new.user_id, new.post_id, 'like');
  return null;
end $$;

create or replace function public.notify_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(new.following_id, new.follower_id, null, 'follow');
  return null;
end $$;

drop trigger if exists post_notify_reply on public.posts;
create trigger post_notify_reply
  after insert on public.posts
  for each row when (new.parent_id is not null)
  execute function public.notify_reply();

drop trigger if exists post_notify_like on public.post_likes;
create trigger post_notify_like
  after insert on public.post_likes
  for each row execute function public.notify_like();

drop trigger if exists follow_notify on public.follows;
create trigger follow_notify
  after insert on public.follows
  for each row execute function public.notify_follow();

-- 5. Права ---------------------------------------------------------------

alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;

-- Посты и ветки читают все: это публичная площадка.
drop policy if exists "posts are viewable" on public.posts;
create policy "posts are viewable" on public.posts for select using (true);

drop policy if exists "posts are written by author" on public.posts;
create policy "posts are written by author" on public.posts for insert
  with check (auth.uid() = author_id);

drop policy if exists "posts are edited by author" on public.posts;
create policy "posts are edited by author" on public.posts for update
  using (auth.uid() = author_id) with check (auth.uid() = author_id);

drop policy if exists "posts are deleted by author" on public.posts;
create policy "posts are deleted by author" on public.posts for delete
  using (auth.uid() = author_id);

drop policy if exists "likes are viewable" on public.post_likes;
create policy "likes are viewable" on public.post_likes for select using (true);

drop policy if exists "likes are written by user" on public.post_likes;
create policy "likes are written by user" on public.post_likes for insert
  with check (auth.uid() = user_id);

drop policy if exists "likes are removed by user" on public.post_likes;
create policy "likes are removed by user" on public.post_likes for delete
  using (auth.uid() = user_id);

drop policy if exists "follows are viewable" on public.follows;
create policy "follows are viewable" on public.follows for select using (true);

drop policy if exists "follows are written by follower" on public.follows;
create policy "follows are written by follower" on public.follows for insert
  with check (auth.uid() = follower_id);

drop policy if exists "follows are removed by follower" on public.follows;
create policy "follows are removed by follower" on public.follows for delete
  using (auth.uid() = follower_id);

-- Уведомления видит только их владелец. Политики на insert нет намеренно.
drop policy if exists "notifications are private" on public.notifications;
create policy "notifications are private" on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "notifications are read by owner" on public.notifications;
create policy "notifications are read by owner" on public.notifications for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 6. Первые посты --------------------------------------------------------
-- Без этого лента постов открылась бы пустой, а старые биты выглядели бы
-- несуществующими. Идемпотентно: у каждого публичного бита не больше одного
-- поста.

insert into public.posts (author_id, beat_id, body, created_at)
select b.owner_id, b.id, '', b.created_at
from public.beats b
where b.is_public
  and not exists (select 1 from public.posts p where p.beat_id = b.id and p.parent_id is null);

-- 7. Сверка счётчиков ----------------------------------------------------
-- Счётчики живут в триггерах и со временем могут разъехаться.
-- Этот запрос должен возвращать ноль строк.
select p.id, p.like_count, p.reply_count
from public.posts p
where p.like_count <> (select count(*) from public.post_likes where post_id = p.id)
   or (p.parent_id is not null and p.reply_count <> (
        select count(*) from public.posts c where c.parent_id = p.id));