-- Права на колонки: пользователь не выдаёт себе права и не накручивает рейтинг.
--
-- Применяется после 0063.
--
-- ---------------------------------------------------------------------------
-- ЧТО БЫЛО
--
-- RLS ограничивает СТРОКИ, а не КОЛОНКИ. Политика «users update own profile»
-- (0001:62) с условием auth.uid() = id пропускает ЛЮБУЮ колонку своей
-- строки. Проверено живьём:
--
--   PATCH /rest/v1/profiles?id=eq.<свой id>  {"is_operator": true}  →  204
--
-- То есть любой вошедший становился оператором площадки. А оператор может:
--
--   mark_order_paid  — подтвердить оплату любого заказа: лицензия выдаётся,
--                      деньги начисляются продавцу;
--   close_order с 'refunded' — вернуть деньги и отозвать лицензию.
--
-- То есть открывался весь финансовый контур. Кроме того, level и level_score
-- тоже писались свободно, а вес в ленте умножается на них: до ×1.45.
--
-- С тем же дефектом у beats: score, plays, views и impressions писались
-- владельцем напрямую, минуя пересчёт, — то есть рейтинг ленты выставлялся
-- руками.
--
-- ---------------------------------------------------------------------------
-- КАК ПРАВИЛЬНО
--
-- Права на уровне колонок: UPDATE отозван целиком, а выданы только те
-- колонки, которые человек действительно имеет право менять. Счётчики,
-- уровни и состояние продажи остаются у сервера.
--
-- sale_state тоже убран из списка: им управляет маршрут правки, где проверяются
-- цена и показ в ленте. Напрямую его можно было бы выставить в on_sale
-- биту без цены — то есть продавать то, что не выставлено на продажу.

revoke update on public.profiles from anon, authenticated;
grant update (username, avatar_url, bio, links, mode, cover_url, pinned_beat_id) on public.profiles to authenticated;

revoke update on public.beats from anon, authenticated;
grant update (
  title, type_beat_artists, bpm, key, tags, mp3_url, cover_url, prices,
  prices_before, discount_percent, currency, genre, files, is_public, free_download
) on public.beats to authenticated;

-- Счётчики и уровни пишут только служебные пути: increment_plays,
-- bump_beat_counter, refresh_beat_scores, recalc_seller_level.

comment on table public.profiles is
  'Профиль битмейкера. Права на изменение ограничены списком колонок: is_operator, level и level_score выдаёт только сервер, иначе любой вошедший становился бы оператором площадки.';

-- ---------------------------------------------------------------------------
-- Защита бита: два дефекта, из-за которых услуга не работала
--
-- 1. Журнал скачиваний был виден только скачавшему. Владелец бита, который и
--    должен искать, кто слил, своего журнала не видел: атрибуция всегда была
--    пустой, а в этом весь смысл услуги.
--
-- 2. Запись сканирования и находок была отозвана у пользователя, а маршруты
--    писали пользовательским клиентом: сканирование всегда падало с 500.
--
-- Пишем через служебный клиент, а не возвращаем права пользователю: отчёт
-- пишет сервер, и клиент не должен уметь вписать чужую находку.

create policy "beat owner reads downloads of own beats"
  on public.beat_downloads for select
  using (exists (
    select 1 from public.beats b
     where b.id = beat_downloads.beat_id
       and b.owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- Счётчики площадки
--
-- refresh_beat_scores пересчитывает всю таблицу и была выдана анонимам:
-- любой мог запускать её сотни раз в секунду. Пересчёт нужен площадке, а не
-- посетителю.

revoke execute on function public.refresh_beat_scores(integer) from anon, public;
grant execute on function public.refresh_beat_scores(integer) to authenticated, service_role;

-- notify_user и notify оставались с правом вызова у пользователей и анонимов:
-- уведомления можно было подделывать в чужой ленте. Отзыв от PUBLIC, а не
-- от anon: аноним входит в PUBLIC, и отзыв только от него ничего не меняет.

revoke execute on function public.notify(uuid, uuid, uuid, text) from public;
revoke execute on function public.notify_user(uuid, text, uuid, uuid, uuid, integer) from public;
grant execute on function public.notify_user(uuid, text, uuid, uuid, uuid, integer) to authenticated, service_role;

-- touch_ancestors поднимает ветку поста в топ ленты, и была доступна анонимам.

revoke execute on function public.touch_ancestors(uuid) from public;
grant execute on function public.touch_ancestors(uuid) to authenticated, service_role;

-- weekly_verified и branch_counts читали чужие данные в обход RLS.

revoke execute on function public.weekly_verified(uuid) from public;
grant execute on function public.weekly_verified(uuid) to authenticated, service_role;

revoke execute on function public.branch_counts(uuid[]) from public;
grant execute on function public.branch_counts(uuid[]) to authenticated, service_role;
