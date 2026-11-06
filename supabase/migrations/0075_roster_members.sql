-- BeatDesk: команда битмейкера (roster)
--
-- Битмейкер может вести несколько артистов/проектов под одним аккаунтом:
-- каждый со своим именем, аватаром и био. Хранится массивом на профиле,
-- чтобы не плодить отдельные аккаунты и не ломать RLS.
--
-- Форма элемента: { name, avatar_url?, bio? }.

alter table public.profiles
  add column if not exists roster jsonb not null default '[]'::jsonb;