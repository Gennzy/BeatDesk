-- Журнал скачивания купленных файлов.
--
-- Политика возврата обещает: скачанные файлы не возвращаются, потому что
-- услуга оказана. До этой миграции площадка не писала никуда, что
-- скачивание вообще происходило, — то есть правило было заявлено, а
-- доказать его при споре было нечем. Покупатель говорил «я не качал»,
-- и у площадки не было ответа кроме «ну, у нас этого нет».
--
-- Журнал пишется только для мастеров. Превью в ленте доступно всем и
-- ничего не продаёт, поэтому его в журнал не пишем: иначе он распухнет
-- от каждого прокручивания витрины и перестанет быть доказательством
-- выдачи оплаченного.
--
-- Ссылка на лицензию: у каждой выданной лицензии своя запись о том, что
-- покупатель получил. Это и есть точка, где «услуга оказана» становится
-- проверяемым фактом.

create table if not exists public.order_downloads (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  license_id uuid references public.licenses (id) on delete set null,
  beat_id uuid not null references public.beats (id) on delete cascade,
  buyer_id uuid references public.profiles on delete set null,
  /** Какой уровень скачали: mp3, wav, trackout. */
  kind text not null check (kind in ('mp3', 'wav', 'trackout', 'exclusive')),
  downloaded_at timestamptz not null default now()
);

-- Выборка идёт по заказу: «что скачивал этот покупатель» — главный вопрос
-- при споре. Остальные колонки в индекс не берутся, иначе индекс растёт
-- на ровно тех данных, которые никогда не читаются.
create index if not exists order_downloads_order_idx
  on public.order_downloads (order_id, downloaded_at desc);

create index if not exists order_downloads_buyer_idx
  on public.order_downloads (buyer_id, downloaded_at desc);

alter table public.order_downloads enable row level security;

-- Читать может только покупатель заказа: это его история, и продавцу её
-- видеть незачем. Журнал не показываем никому извне, включая продавца.
drop policy if exists "buyers read own downloads" on public.order_downloads;
create policy "buyers read own downloads"
  on public.order_downloads
  for select
  using (auth.uid() = buyer_id);

-- Пишет только серверный код выдачи ссылки: клиенту писать в журнал нельзя,
-- иначе можно было бы «скачать» всё, не скачав.
revoke insert on public.order_downloads from anon, authenticated;

comment on table public.order_downloads is
  'Факт выдачи мастеров по оплаченной лицензии. Основание для правила «скачанное не возвращается»: без журнала правило нечем подтвердить.';