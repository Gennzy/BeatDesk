-- Посты и лайки видны только авторизованным: лента закрыта от гостей
-- не только в интерфейсе, но и на уровне базы.

drop policy if exists "posts are viewable" on public.posts;
create policy "posts are viewable by members" on public.posts for select
  using (auth.uid() is not null);

drop policy if exists "likes are viewable" on public.post_likes;
create policy "likes are viewable by members" on public.post_likes for select
  using (auth.uid() is not null);

-- Счётчики лайков на постах обновляет триггер, он работает от владельца таблицы.
