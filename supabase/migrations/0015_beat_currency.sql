-- Валюта бита выбирается при загрузке.
--
-- Раньше цены молча считались рублями, и на форме BeatStars, где цены в
-- долларах, расширение обязано было их пропускать. Теперь у бита есть
-- своя валюта, а пересчёта нет вовсе: курс меняется, а цена у трека
-- должна оставаться той, которую поставил автор.

alter table public.beats
  add column if not exists currency text not null default 'RUB';

alter table public.beats
  drop constraint if exists beats_currency_check;

alter table public.beats
  add constraint beats_currency_check check (currency in ('RUB', 'USD', 'EUR'));

comment on column public.beats.currency is 'Валюта цен этого бита: RUB, USD или EUR. Пересчёта нет, суммы хранятся как есть.';

-- Проверка: у всех битов должна быть валюта из списка.
select currency, count(*) from public.beats group by currency order by currency;
