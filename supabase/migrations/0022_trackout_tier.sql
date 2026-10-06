/*
 * Уровень Track Out: те же стемы, отдельная лицензия.
 *
 * Колонка bundle остаётся: в ней лежит уровень WAV, названный так исторически,
 * и переименовывать его — значит потерять все старые биты. Новый уровень
 * получает свою колонку, а пустое в ней читается как «не продаётся».
 */
alter table public.beats
  add column if not exists trackout_url text;

comment on column public.beats.trackout_url is 'Архив со стемами (дорожками), необязательно';

update public.beats
   set prices = prices || '{"mp3":null,"bundle":null,"trackout":null,"exclusive":null}'::jsonb
 where not (prices ? 'trackout');