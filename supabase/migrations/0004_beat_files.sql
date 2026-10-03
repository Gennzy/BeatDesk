-- Загрузка бита: MP3 + WAV + ZIP + RAR.
-- В 0001 был только mp3_url и заделы wav_url/stems_url, расширяем под реальные файлы.

alter table public.beats add column if not exists wav_url text;
alter table public.beats add column if not exists zip_url text;
alter table public.beats add column if not exists rar_url text;

alter table public.beats drop column if exists stems_url;

-- mp3_url теперь означает «основной аудиофайл для ленты»: mp3, а если его нет, wav
alter table public.beats alter column mp3_url drop not null;

comment on column public.beats.mp3_url is 'Основной аудиофайл для ленты: mp3, при его отсутствии wav';
comment on column public.beats.wav_url is 'WAV без потерь, необязательно';
comment on column public.beats.zip_url is 'ZIP со стемами или бандлом, необязательно';
comment on column public.beats.rar_url is 'RAR со стемами или бандлом, необязательно';