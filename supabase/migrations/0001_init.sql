-- BeatDesk: схема, RLS, триггер профиля, storage
-- Применить в Supabase → SQL Editor (или supabase db push)

-- 1. Профиль битмейкера ------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique,
  avatar_url text,
  bio text,
  links jsonb not null default '{"beatchain":"","youtube":"","vk":"","telegram":"","instagram":""}'::jsonb,
  created_at timestamptz not null default now()
);

comment on column public.profiles.links is 'Ссылки на площадки: beatchain, youtube, vk, telegram, instagram';

-- 2. Биты --------------------------------------------------------------
create table if not exists public.beats (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  title text not null,
  type_beat_artists text[] not null default '{}',
  bpm integer not null check (bpm between 40 and 300),
  key text not null,
  tags text[] not null default '{}',
  mp3_url text,
  cover_url text,
  prices jsonb not null default '{"mp3":null,"bundle":null,"exclusive":null}'::jsonb,
  is_public boolean not null default false,
  plays integer not null default 0,
  wav_url text,
  zip_url text,
  rar_url text,
  created_at timestamptz not null default now()
);

comment on column public.beats.prices is 'Цены в рублях: mp3, bundle, exclusive. null = не продаётся';
comment on column public.beats.mp3_url is 'Основной аудиофайл для ленты: mp3, при его отсутствии wav';
comment on column public.beats.wav_url is 'WAV без потерь, необязательно';
comment on column public.beats.zip_url is 'ZIP со стемами или бандлом, необязательно';
comment on column public.beats.rar_url is 'RAR со стемами или бандлом, необязательно';

-- 3. Индексы -----------------------------------------------------------
create index if not exists beats_public_created_idx on public.beats (is_public, created_at desc);
create index if not exists beats_owner_idx on public.beats (owner_id);
create index if not exists beats_tags_idx on public.beats using gin (tags);

-- 4. RLS ---------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.beats enable row level security;

-- профиль читают все (ник, аватар, био, ссылки), меняет только владелец
drop policy if exists "profiles are viewable by everyone" on public.profiles;
create policy "profiles are viewable by everyone"
  on public.profiles for select
  using (true);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- биты: публичные читают все, свои видят все, меняет только владелец
drop policy if exists "beats are viewable if public or own" on public.beats;
create policy "beats are viewable if public or own"
  on public.beats for select
  using (is_public or auth.uid() = owner_id);

drop policy if exists "users insert own beats" on public.beats;
create policy "users insert own beats"
  on public.beats for insert
  with check (auth.uid() = owner_id);

drop policy if exists "users update own beats" on public.beats;
create policy "users update own beats"
  on public.beats for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "users delete own beats" on public.beats;
create policy "users delete own beats"
  on public.beats for delete
  using (auth.uid() = owner_id);

-- 5. Профиль создаётся при регистрации --------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
begin
  base := lower(regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, 'user'), '@', 1)),
    '[^a-zA-Z0-9_]', '', 'g'
  ));

  if base = '' then
    base := 'user';
  end if;

  candidate := base;
  if exists (select 1 from public.profiles where username = candidate) then
    candidate := base || '_' || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;

  insert into public.profiles (id, username, avatar_url)
  values (new.id, candidate, new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6. Storage: mp3 и обложки -------------------------------------------
insert into storage.buckets (id, name, public) values
  ('beats', 'beats', true),
  ('covers', 'covers', true)
on conflict (id) do nothing;

-- файлы лежат по пути {user_id}/... — проверяем первую папку
drop policy if exists "beat audio is publicly readable" on storage.objects;
create policy "beat audio is publicly readable"
  on storage.objects for select
  using (bucket_id = 'beats');

drop policy if exists "users manage own beat audio" on storage.objects;
create policy "users manage own beat audio"
  on storage.objects for insert
  with check (bucket_id = 'beats' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "users update own beat audio" on storage.objects;
create policy "users update own beat audio"
  on storage.objects for update
  using (bucket_id = 'beats' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "users delete own beat audio" on storage.objects;
create policy "users delete own beat audio"
  on storage.objects for delete
  using (bucket_id = 'beats' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "covers are publicly readable" on storage.objects;
create policy "covers are publicly readable"
  on storage.objects for select
  using (bucket_id = 'covers');

drop policy if exists "users manage own covers" on storage.objects;
create policy "users manage own covers"
  on storage.objects for insert
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "users update own covers" on storage.objects;
create policy "users update own covers"
  on storage.objects for update
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "users delete own covers" on storage.objects;
create policy "users delete own covers"
  on storage.objects for delete
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid()::text));