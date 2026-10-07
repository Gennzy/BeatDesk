/*
 * Уровень Track Out: те же стемы, отдельная лицензия.
 *
 * Колонка bundle остаётся: в ней лежит уровень WAV, названный так исторически,
 * и переименовывать его — значит потерять все старые биты. Новый уровень
 * получает ключ в prices, а пустое в нём читается как «не продаётся».
 *
 * Отдельной колонки trackout_url не заводим: файлы живут в jsonb-поле files,
 * дорожки лежат там же под ключами zip и rar. Мёртвая колонка только путает.
 */
alter table public.beats
  alter column prices
    set default '{"mp3":null,"bundle":null,"trackout":null,"exclusive":null}'::jsonb;

/*
 * Дописываем недостающие ключи, сохраняя уже выставленные цены.
 *
 * Раньше здесь было prices = prices || '{"mp3":null,...}' — при мердже jsonb
 * правая сторона побеждает, и биты без ключа trackout теряли все цены
 * целиком. jsonb_build_object берёт каждое значение из текущего объекта,
 * поэтому отсутствующий ключ становится null, а существующий остаётся как был.
 */
update public.beats
   set prices = coalesce(prices, '{}'::jsonb)
                || jsonb_build_object('mp3', prices -> 'mp3')
                || jsonb_build_object('bundle', prices -> 'bundle')
                || jsonb_build_object('trackout', prices -> 'trackout')
                || jsonb_build_object('exclusive', prices -> 'exclusive')
 where not (prices ?& array['mp3', 'bundle', 'trackout', 'exclusive']);
