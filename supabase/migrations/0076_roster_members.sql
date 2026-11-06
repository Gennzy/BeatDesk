-- BeatDesk: отдельные профили артистов (roster)
--
-- Битмейкер может вести несколько артистов/проектов под одним аккаунтом.
-- Каждый артист — отдельная сущность со своим именем, аватаром и био,
-- но владелец у них один (owner_id). Позже к артисту можно привязать
-- биты, посты и заказы.

create table if not exists public.roster_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  slug text not null,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint roster_members_owner_slug_unique unique (owner_id, slug)
);

comment on table public.roster_members is
  'Артисты/проекты битмейкера: отдельные профили под одним аккаунтом.';

create index if not exists roster_members_owner_idx on public.roster_members (owner_id);

alter table public.roster_members enable row level security;

-- Читать может кто угодно: артисты публичны.
drop policy if exists "roster members are viewable by everyone" on public.roster_members;
create policy "roster members are viewable by everyone"
  on public.roster_members for select
  using (true);

-- Писать может только владелец.
drop policy if exists "owner manages roster" on public.roster_members;
create policy "owner manages roster"
  on public.roster_members for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);