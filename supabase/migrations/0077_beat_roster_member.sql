-- BeatDesk: привязка бита к артисту из ростера
--
-- Бит может принадлежать артисту из команды битмейкера. Это не меняет
-- владельца (owner_id остаётся за битмейкером), но позволяет показать,
-- для кого написан бит, и собрать все биты артиста на его странице.

alter table public.beats
  add column if not exists roster_member_id uuid references public.roster_members (id) on delete set null;

create index if not exists beats_roster_member_idx on public.beats (roster_member_id);