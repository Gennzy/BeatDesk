-- BeatDesk: соавторы бита и разделение доходов
--
-- Бит может иметь нескольких соавторов (продюсер, сонграйтер, вокалист),
-- каждый со своей долей. При продаже доход делится между ними согласно
-- долям. Доля владельца (owner_id) тоже указывается явно — так сумма
-- всегда ровно 100%, и нет «скрытой» доли владельца.
--
-- Доли в базисных пунктах (bps): 10000 = 100%. Так деньги не теряются
-- на округлении при делении.

alter table public.beats
  add column if not exists collaborators jsonb not null default '[]'::jsonb;

comment on column public.beats.collaborators is
  'Соавторы: [{user_id, share_bps}]. Сумма share_bps = 10000. Пусто = один владелец (100%).';

-- Индекс для поиска битов, где пользователь соавтор.
create index if not exists beats_collaborators_idx on public.beats using gin (collaborators);