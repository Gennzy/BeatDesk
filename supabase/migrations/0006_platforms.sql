-- Публикация бита на внешние площадки.
-- Подключения (токены/ссылки) хранятся в зашифрованном виде, история публикаций — открытая.

create table if not exists public.platform_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  platform text not null,
  label text,
  access_token_cipher text,
  refresh_token_cipher text,
  expires_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, platform)
);

comment on column public.platform_connections.access_token_cipher is 'AES-256-GCM, ключ в PLATFORM_TOKEN_SECRET';
comment on column public.platform_connections.meta is 'Данные площадки: group_id, chat_id, channel_title и т.п.';

create table if not exists public.platform_posts (
  id uuid primary key default gen_random_uuid(),
  beat_id uuid not null references public.beats on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  platform text not null,
  connection_id uuid references public.platform_connections on delete set null,
  status text not null default 'pending' check (status in ('pending', 'published', 'failed')),
  external_url text,
  error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_posts_beat_idx on public.platform_posts (beat_id, created_at desc);
create index if not exists platform_posts_user_idx on public.platform_posts (user_id, created_at desc);

alter table public.platform_connections enable row level security;
alter table public.platform_posts enable row level security;

drop policy if exists "connections are private" on public.platform_connections;
create policy "connections are private"
  on public.platform_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "posts are visible to owner" on public.platform_posts;
create policy "posts are visible to owner"
  on public.platform_posts for select
  using (auth.uid() = user_id);

drop policy if exists "posts are written by owner" on public.platform_posts;
create policy "posts are written by owner"
  on public.platform_posts for insert
  with check (auth.uid() = user_id);

drop policy if exists "posts are updated by owner" on public.platform_posts;
create policy "posts are updated by owner"
  on public.platform_posts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);