-- 0034. Роль в профиле: продавец или покупатель -------------------------
--
-- Площадка одна на две очень разные задачи. Покупатель пришёл выбрать бит и
-- уйти; битмейкер работает: загружает, ставит цены, следит за заказами и
-- выручкой. Показывать обоим одно и то же меню — значит мешать каждому:
-- покупателю мешает кабинет, битмейкеру — витрина вместо рабочего места.
--
-- Роль хранится в профиле и переключается в любой момент. Это не тип
-- аккаунта: продавать может любой, кто загрузил бит, а покупать — любой
-- продавец. Роль меняет только то, что показывается по умолчанию.

alter table public.profiles
  add column if not exists mode text not null default 'buyer';

alter table public.profiles
  drop constraint if exists profiles_mode_check;

alter table public.profiles
  add constraint profiles_mode_check check (mode in ('buyer', 'seller'));

comment on column public.profiles.mode is
  'Что человек делает на площадке по умолчанию. Не запрет: продавец может покупать, покупатель — выложить бит';

-- У кого уже есть выложенные биты, тот явно продавец: включать ему режим
-- покупателя значило бы спрятать то, чем он уже пользуется.
update public.profiles p
   set mode = 'seller'
 where mode = 'buyer'
   and exists (select 1 from public.beats b where b.owner_id = p.id);

-- Продавцу нужен список покупателей по заказам: почта для доставки и связи.
-- Имени в заказе нет — только адрес, и обращаться к человеку больше не по
-- чему, поэтому это не оплошность, а всё, что у нас есть.
create index if not exists order_items_seller_status_idx
  on public.order_items (beat_owner_id, order_id);