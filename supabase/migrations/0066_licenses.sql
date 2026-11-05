-- BeatDesk: настраиваемые условия лицензии по уровням
--
-- Раньше у бита были только цены (prices) по уровням mp3/bundle/trackout/exclusive,
-- а условия лицензии были неявными. Теперь продавец задаёт текст условий для
-- каждого уровня; пусто — значит «стандартные условия площадки».

alter table public.beats
  add column if not exists license_terms jsonb not null default '{}'::jsonb;

comment on column public.beats.license_terms is
  'Условия лицензии по уровням: {mp3, bundle, trackout, exclusive} -> текст. Пусто = стандартные условия.';

-- RLS уже включён на beats; новая колонка наследует политики таблицы.