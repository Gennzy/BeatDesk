/*
 * Каналы, куда бот отправляет посты.
 *
 * Бот узнаёт номер канала в момент, когда его добавляют администратором, и
 * больше в сам канал ничего не пишет: номер канала не должен попадать в
 * публичную ленту.
 *
 * Ключ — телеграм-аккаунт человека, который добавил бота: именно он потом
 * спрашивает номер в личной переписке.
 */
create table if not exists public.telegram_channels (
  owner_telegram_id bigint primary key,
  chat_id bigint not null,
  title text,
  added_at timestamptz not null default now()
);

comment on table public.telegram_channels is
  'Каналы Telegram, подключённые к аккаунтам BeatDesk: владелец Telegram и канал';

alter table public.telegram_channels enable row level security;

-- Читать и писать может только служебный ключ: адресат известен только боту,
-- а пользователи сайта сюда не ходят.
revoke all on public.telegram_channels from anon, authenticated;

create index if not exists telegram_channels_chat_id_idx
  on public.telegram_channels (chat_id);
