-- Защита бита: услуга, сканирование и отчёт о находках.
--
-- Применяется после 0061.
--
-- ---------------------------------------------------------------------------
-- ЧТО ПРОДАЁМ
--
-- Битмейкер покупает услугу «Защита бита»: мы регистрируем его бит, обходим
-- музыкальные площадки, находим релизы, где его бит звучит без лицензии, и
-- отдаём отчёт: кто, где, когда, и — главное — кто у нас этот бит брал.
--
-- Услуга продаётся как товар, а не как галочка: у неё нет файла, её
-- результат — отчёт. Ровно для этого в products есть вид service.
--
-- ---------------------------------------------------------------------------
-- ПОЧЕМУ МЫ НЕ КАК WAVESMATCH
--
-- Wavesmatch ищет по одиннадцати площадкам и находит фрагменты бита внутри
-- треков. Это умеет ACRCloud и подобные: там индекс собранного аудио и
-- отпечаток, который переживает сведение.
--
-- Свой движок — это обход площадок и индекс: работа на месяцы, а не на
-- неделю. Поэтому сначала подключаем чужой движок, а свой пишем, когда
-- упрёмся в его лимиты.
--
-- Но вот в чём наше отличие, и оно бесплатное: у Wavesmatch нет списка
-- покупателей, а у нас есть. Каждая покупка и каждое бесплатное скачивание
-- записано. Поэтому мы отвечаем не «кто использовал твой бит», а «этот
-- релиз сделал человек, который скачал твой бит у нас 12 марта бесплатно».
-- Это и есть то, за что платят.
--
-- ---------------------------------------------------------------------------
-- ЧТО ГДЕ ЛЕЖИТ
--
-- protection_scans — запуск сканирования: по биту, с результатом.
-- protection_matches — находки: площадка, трек, артист, процент совпадения.

create table if not exists public.protection_scans (
  id uuid primary key default gen_random_uuid(),
  beat_id uuid not null references public.beats on delete cascade,
  owner_id uuid not null references public.profiles on delete cascade,
  -- Услуга оплачена: без заказа сканирование не запускается.
  order_id uuid references public.orders on delete set null,
  -- Состояние: идёт, готов, ничего не найдено, ошибка.
  status text not null default 'running'
    check (status in ('running', 'done', 'empty', 'failed')),
  -- Находок в отчёте.
  matches integer not null default 0,
  -- Подробности: площадки, по которым шли, и текст ошибки.
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

comment on table public.protection_scans is
  'Запуск сканирования площадок по биту. Создаётся после оплаты услуги «Защита бита».';

create table if not exists public.protection_matches (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.protection_scans on delete cascade,
  -- Площадка: spotify, youtube, apple, soundcloud, deezer…
  platform text not null,
  -- Идентификатор трека на площадке: там, где он ищется.
  external_id text,
  -- Название релиза и артист: их показываем в отчёте.
  title text,
  artist text,
  release_date text,
  label text,
  -- UPC и ISRC: по ним видно, тот ли это релиз.
  upc text,
  isrc text,
  -- Процент совпадения, от 0 до 100.
  confidence integer not null default 0 check (confidence between 0 and 100),
  -- Ссылка на релиз.
  url text,
  -- Наш покупатель или скачавший, чей файл совпал: это ответ на вопрос
  -- «чей это релиз».
  suspect_user_id uuid references public.profiles on delete set null,
  suspect_label text,
  created_at timestamptz not null default now()
);

comment on table public.protection_matches is
  'Находка: релиз на площадке, где звучит бит. suspect_user_id — наш
   покупатель или скачавший, чей файл совпал: без этого находка говорит
   «где-то use», а с ним — «вот кто».';

create index if not exists protection_scans_beat_idx on public.protection_scans (beat_id, created_at desc);
create index if not exists protection_scans_owner_idx on public.protection_scans (owner_id, created_at desc);
create index if not exists protection_matches_scan_idx on public.protection_matches (scan_id);
create index if not exists protection_matches_suspect_idx on public.protection_matches (suspect_user_id) where suspect_user_id is not null;

alter table public.protection_scans enable row level security;
alter table public.protection_matches enable row level security;

-- Отчёт видит только владелец бита: в нём имена покупателей, и это не его
-- дело.
create policy "owner reads own scans"
  on public.protection_scans for select
  using (auth.uid() = owner_id);

create policy "owner reads matches of own scans"
  on public.protection_matches for select
  using (exists (
    select 1 from public.protection_scans s
     where s.id = protection_matches.scan_id
       and s.owner_id = auth.uid()
  ));

-- Запись ведёт сервер: клиент не должен уметь подсунуть находку.
revoke insert, update, delete on public.protection_scans from anon, authenticated;
revoke insert, update, delete on public.protection_matches from anon, authenticated;
