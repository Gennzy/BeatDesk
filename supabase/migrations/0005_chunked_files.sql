-- Большие файлы (WAV, ZIP, RAR) на бесплатном тарифе.
-- Лимит одного объекта в Supabase Storage — 50 МБ, и выше его не поднять,
-- поэтому файлы режем на чанки по 20 МБ и храним манифест в jsonb.

alter table public.beats add column if not exists files jsonb not null default '{}'::jsonb;

alter table public.beats drop column if exists wav_url;
alter table public.beats drop column if exists zip_url;
alter table public.beats drop column if exists rar_url;

comment on column public.beats.mp3_url is 'Основной аудиофайл для ленты: mp3, при его отсутствии wav';
comment on column public.beats.files is 'Дополнительные файлы wav, zip, rar. Либо url (файл целиком), либо parts (чанки по 20 МБ)';