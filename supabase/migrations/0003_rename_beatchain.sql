-- Переименование BitChain → BeatChain в ключе links.
-- Ключ поменялся с "bitchain" на "beatchain", данные существующих профилей мигрируются.

alter table public.profiles
  alter column links set default '{"beatchain":"","youtube":"","vk":"","telegram":"","instagram":""}'::jsonb;

update public.profiles
set links = jsonb_build_object(
  'beatchain', coalesce(links ->> 'bitchain', ''),
  'youtube', coalesce(links ->> 'youtube', ''),
  'vk', coalesce(links ->> 'vk', ''),
  'telegram', coalesce(links ->> 'telegram', ''),
  'instagram', coalesce(links ->> 'instagram', '')
)
where links ? 'bitchain';

comment on column public.profiles.links is 'Ссылки на площадки: beatchain, youtube, vk, telegram, instagram';