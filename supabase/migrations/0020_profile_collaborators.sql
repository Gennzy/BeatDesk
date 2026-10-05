/*
 * Артисты, с которыми работал битмейкер.
 *
 * Для артиста это главный признак доверия: бит с именем известного артиста в
 * подписи весит больше, чем любые слова автора о себе. Поле живёт в профиле,
 * потому что список относится к битмейкеру, а не к отдельному биту: один
 * артист мог появиться на десяти битах.
 */
create table if not exists public.profile_collaborators (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  position int not null default 0,
  primary key (profile_id, name)
);

comment on table public.profile_collaborators is
  'Артисты, с которыми работал битмейкер: для доверия артистов';

create index if not exists profile_collaborators_order_idx
  on public.profile_collaborators (profile_id, position);

alter table public.profile_collaborators enable row level security;

-- Профиль публичный целиком, и список артистов тоже: он и есть доказательство.
create policy "read collaborators"
  on public.profile_collaborators
  for select
  using (true);

-- Писать может только владелец профиля.
create policy "own collaborators"
  on public.profile_collaborators
  for all
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);
