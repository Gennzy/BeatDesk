-- Бесплатное скачивание и защита бита.
--
-- Применяется после 0060.
--
-- ---------------------------------------------------------------------------
-- ЗАЧЕМ
--
-- Битмейкер может разрешить скачивать бит бесплатно: это работает как
-- Content ID у YouTube, только наоборот. Пока бит лежит у нас, его крадут и
-- выкладывают трек на площадки — а покупатель для этого обязан был взять
-- лицензию.
--
-- Чтобы поймать слив, нужно знать две вещи:
--
--   1. кто именно скачивал бит — журнал скачиваний;
--   2. чей это файл на площадке — сверка отпечатка.
--
-- Вместе они и дают ответ: «этот треп на Spotify состоит из бита, который
-- скачал Геннадий 12 марта».
--
-- ---------------------------------------------------------------------------
-- ЧЕСТНОЕ ОГРАНИЧЕНИЕ
--
-- Отпечаток мастера не совпадёт с отпечатком слитого трепа: в трепе к биту
-- добавлен вокал и аранжировка, и звук другой. Поэтому сверка идёт не с
-- мастером, а с тем файлом, который площадка отдаёт как превью, и — главное —
-- с тем, что мы отдавали конкретным скачавшим.
--
-- Скан по метаданным (название бита, артист) ловит кандидатов, а сверка по
-- звуку подтверждает. Без платной службы распознавания (ACRCloud, Audible
-- Magic) аудио из YouTube недоступно, и это ограничение не обойти.

-- Разрешено ли бит скачивать бесплатно. Решение битмейкера.
alter table public.beats
  add column if not exists free_download boolean not null default false;

comment on column public.beats.free_download is
  'Разрешено ли скачивать бит бесплатно. Включает бесплатное скачивание и
   регистрирует бит под защиту: мы запоминаем, кто и когда его брал, и при
   жалобе на слив говорим, чей это файл.';

-- Журнал скачиваний: кто брал бит и что ему отдали.
create table if not exists public.beat_downloads (
  id uuid primary key default gen_random_uuid(),
  beat_id uuid not null references public.beats on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  -- Отпечаток выданного файла: по нему сверяется слитый треп.
  envelope text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.beat_downloads is
  'Кто и когда скачал бит бесплатно. Это и есть ответ на вопрос «чей это треп
   на площадке»: сверка идёт с отпечатком выданного файла, а не с мастером —
   слитый треп отличается от бита, и сверять с ним мастер бессмысленно.';

create index if not exists beat_downloads_beat_idx on public.beat_downloads (beat_id, created_at desc);
create index if not exists beat_downloads_user_idx on public.beat_downloads (user_id, created_at desc);

-- Зарегистрированные под защиту биты: их отпечатки ищутся на площадках.
create table if not exists public.beat_protections (
  beat_id uuid primary key references public.beats on delete cascade,
  owner_id uuid not null references public.profiles on delete cascade,
  -- Отпечаток мастера: им помечается сам бит.
  envelope text not null default '',
  -- Кто нашёл слитый треп и где: для разбирательства, а не для жалобы.
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.beat_protections is
  'Биты, зарегистрированные под защиту. Отпечаток мастера нужен, чтобы отличать
   наш бит от чужого при разборе слитого трепа; сам отпечаток слитого трепа
   сверяется с журналом скачиваний.';

create index if not exists beat_protections_owner_idx on public.beat_protections (owner_id);

alter table public.beat_downloads enable row level security;
alter table public.beat_protections enable row level security;

-- Скачавший видит свой журнал: свой, и только свой.
create policy "downloader reads own downloads"
  on public.beat_downloads for select
  using (auth.uid() = user_id);

-- Писать в журнал может только сервер: запись идёт при выдаче файла, и клиент
-- не должен уметь вписать чужую скачку.
revoke insert, update, delete on public.beat_downloads from anon, authenticated;

-- Защита видна владельцу бита.
create policy "owner reads own protections"
  on public.beat_protections for select
  using (auth.uid() = owner_id);

create policy "owner manages own protections"
  on public.beat_protections for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- Серверная выдача
--
-- Скачивание бесплатное, но не анонимное: без входа нельзя ни взять файл, ни
-- записать, кто его взял. Гость увидит предложение войти — иначе журнал
-- был бы дырой, через которую проходит любой слив.
create or replace function public.record_beat_download(
  p_beat_id uuid,
  p_envelope text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_beat public.beats%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Нужно войти';
  end if;

  select * into v_beat from public.beats where id = p_beat_id;

  if v_beat.id is null then
    raise exception 'Бит не найден';
  end if;

  if v_beat.owner_id = v_uid then
    raise exception 'Свой бит скачивать нечего';
  end if;

  if not v_beat.free_download then
    raise exception 'Бит нельзя скачать бесплатно';
  end if;

  insert into public.beat_downloads (beat_id, user_id, envelope)
  values (p_beat_id, v_uid, coalesce(p_envelope, ''))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.record_beat_download(uuid, text) to authenticated;
revoke execute on function public.record_beat_download(uuid, text) from anon;

comment on function public.record_beat_download is
  'Записывает бесплатное скачивание бита и возвращает идентификатор записи.
   Считает, кто и когда взял файл: это и есть ответ на вопрос «чей это треп
   на площадке».';
