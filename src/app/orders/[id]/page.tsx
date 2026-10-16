import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrderItemDownloads } from "@/components/sales/order-item-downloads";
import { ReviewForm } from "@/components/sales/review-form";
import { SellerActions } from "@/components/sales/seller-actions";
import { Container } from "@/components/ui/container";
import { formatMoney } from "@/lib/currency";
import { getT } from "@/lib/i18n/server";
import { platformPayment } from "@/lib/payments";
import { tierLabel } from "@/lib/sales/delivery";
import { getSupabase } from "@/lib/supabase/user";

export const metadata: Metadata = {
  title: "Заказ",
  robots: { index: false, follow: false },
};

type OrderItem = {
  id: string;
  beat_id: string;
  tier: string;
  price_minor: number;
  beat_title: string;
  currency: string;
  /** Кому принадлежит бит: продавец видит заказ по этой колонке. */
  beat_owner_id: string;
};

type Order = {
  id: string;
  status: string;
  currency: string;
  total_minor: number;
  buyer_email: string;
  created_at: string;
};

type License = {
  license_key: string;
  tier: string;
  order_item_id: string;
  revoked_at: string | null;
};

/** Деньги: minor из базы — на экране рубли. */
const money = (minor: number, currency: string): string => formatMoney(minor / 100, currency);

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, supabase] = await Promise.all([getT(), getSupabase()]);

  if (!supabase) notFound();

  /*
   * Куда писать о переводе и куда переводить. Реквизиты счёта — в одном
   * месте (src/lib/payments.ts): когда появятся настоящие, их впишут туда,
   * а страница сама начнёт их показывать. Пока реквизитов нет, блок честно
   * ведёт через поддержку, а не показывает пустую строку.
   */
  const payment = platformPayment();

  /*
   * Загрузка идёт кругами, а не очередью.
   *
   * Раньше запросы стояли семью await подряд, хотя между половиной из них
   * связи не было: лицензии и отзывы ждали позиции, но уж точно не ждали
   * комиссию или того, оператор человек или нет. Страница платила за это
   * суммой всех задержек подряд — на мобильном интернете это была секунда
   * белого экрана на пустом месте перед списком покупок.
   *
   * Теперь кругов три: первый берёт то, что знает только адрес; второй —
   * всё, что зависит от позиций; третий — флаг оператора, который ждал
   * только сессию.
   */
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, currency, total_minor, buyer_email, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const typed = order as Order;

  const { data: viewer } = await supabase.auth.getUser();

  /*
   * Позиции запрашиваются один раз и целиком: раньше они читались дважды —
   * сначала для списка, потом отдельно за beat_owner_id, чтобы отличить
   * продавца от покупателя. Второй запрос отдавал одну колонку и добавлял
   * к загрузке полный круг ожидания.
   */
  const [{ data: itemRows }, { data: settings }, { data: operatorRow }] = await Promise.all([
    supabase
      .from("order_items")
      .select("id, beat_id, tier, price_minor, beat_title, currency, beat_owner_id")
      .eq("order_id", id),
    supabase.from("platform_settings").select("commission_bps").maybeSingle(),
    viewer?.user
      ? supabase.from("profiles").select("is_operator").eq("id", viewer.user.id).maybeSingle()
      : Promise.resolve({ data: null as { is_operator: boolean } | null }),
  ]);

  const rows = (itemRows ?? []) as OrderItem[];

  /*
   * Ставку комиссии показываем покупателю, а не только продавцу. Если
   * просить перевести полную сумму, не сказав, сколько уйдёт площадке,
   * человек справедливо решит, что его обманули на %.
   */
  const commissionRate =
    typeof settings?.commission_bps === "number" && settings.commission_bps > 0
      ? `${(settings.commission_bps / 100).toFixed(0)}%`
      : null;

  /*
   * У лицензии нет колонки order_id — она висит на позиции заказа.
   * Запрос по order_id падал бы пустым на каждой оплаченной покупке,
   * поэтому лицензии ищем по id позиций этого заказа.
   */
  const itemIds = rows.map((item) => item.id);

  /*
   * Отзыв оставляет покупатель по оплаченному заказу, и только один на
   * позицию. Продавцу форма не показывается, даже если он же покупал что-то
   * у себя: отзыв идёт о битмейкере, а он свой собственный.
   */
  const [{ data: licenseRows }, { data: existingReviews }] = await Promise.all([
    itemIds.length > 0
      ? supabase.from("licenses").select("license_key, tier, order_item_id, revoked_at").in("order_item_id", itemIds)
      : Promise.resolve({ data: [] as License[] }),
    itemIds.length > 0
      ? supabase.from("reviews").select("order_item_id").in("order_item_id", itemIds)
      : Promise.resolve({ data: [] as { order_item_id: string }[] }),
  ]);

  const licenses = (licenseRows ?? []) as License[];
  const licenseByItem = new Map(licenses.map((license) => [license.order_item_id, license]));

  /*
   * Видит ли этот человек кнопку продавца. RLS показывает заказ и покупателю,
   * и продавцу его бита; у покупателя позиций чужих битов нет, поэтому
   * наличие непринадлежащей ему позиции означает продавца.
   */
  const isSeller = Boolean(viewer?.user && rows.some((row) => row.beat_owner_id === viewer.user!.id));

  /*
   * Подтверждать поступление денег может оператор, не продавец: деньги
   * приходят на счёт площадки, и видит их оператор. Продавец по этой
   * кнопке нажимал бы вслепую и мог бы подтвердить заказ, который не
   * оплачен, — а кнопка выдаёт лицензию и начисляет баланс.
   */
  const isOperator = operatorRow?.is_operator === true;

  const reviewed = new Set(
    ((existingReviews ?? []) as { order_item_id: string }[]).map((row) => row.order_item_id),
  );

  const canReview = typed.status === "paid" && Boolean(viewer?.user) && !isSeller;

  return (
    <section className="py-14 lg:py-20">
      <Container>
        <div className="flex flex-col gap-6 border-b border-line pb-8">
          <span className="flex items-center gap-3">
            <span aria-hidden className="size-1.5 bg-mute/50" />
            <span className="label text-mute">{t("order.title")}</span>
          </span>
          <h1 className="font-display text-section font-semibold text-paper uppercase">{t("order.heading")}</h1>
          <p className="label text-mute">{typed.id}</p>
          <p
            className={
              typed.status === "paid"
                ? "label text-signal"
                : typed.status === "pending"
                  ? "label text-amber"
                  : "label text-mute"
            }
          >
            {t(
              (
                {
                  paid: "order.paid",
                  pending: "order.pending",
                  failed: "order.failed",
                  refunded: "order.refunded",
                  cancelled: "order.cancelled",
                } as const
              )[typed.status as "paid" | "pending" | "failed" | "refunded" | "cancelled"] ?? "order.pending",
            )}
          </p>
        </div>

        <ul className="flex flex-col gap-2 pt-8">
          {rows.map((item) => {
            const license = licenseByItem.get(item.id);

            return (
              <li
              key={item.id}
              className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
            >
                <span className="flex flex-col gap-1">
                  <span className="label text-paper">{item.beat_title}</span>
                  <span className="text-xs text-mute">{tierLabel(item.tier)}</span>
                  {typed.status === "paid" && license && !license.revoked_at ? (
                    <OrderItemDownloads orderId={typed.id} itemId={item.id} tier={item.tier} />
                  ) : null}
                  {typed.status === "paid" && license?.revoked_at ? (
                    <span className="text-xs text-amber">{t("order.revoked")}</span>
                  ) : null}
                  {canReview && !reviewed.has(item.id) ? (
                    <div className="mt-1 sm:max-w-md">
                      <ReviewForm orderItemId={item.id} beatTitle={item.beat_title} />
                    </div>
                  ) : null}
                </span>
                <span className="font-mono text-sm text-paper">{money(item.price_minor, item.currency)}</span>
              </li>
            );
          })}
        </ul>

        <div className="flex items-baseline justify-between gap-4 border-t border-line pt-6">
          <span className="label text-paper">{t("order.total")}</span>
          <span className="font-mono text-sm text-paper">{money(typed.total_minor, typed.currency)}</span>
        </div>

        <p className="pt-4 text-xs leading-relaxed text-mute">
          {t("order.deliveryNote")}: {typed.buyer_email}
        </p>

        {typed.status === "paid" && licenses.length > 0 ? (
          <div className="flex flex-col gap-3 pt-8">
            <span className="label text-paper">{t("order.licenses")}</span>
            {licenses.map((license) => (
              <code
                key={license.license_key}
                className={license.revoked_at ? "mono rounded-md border border-line bg-ink-2 px-4 py-3 text-xs text-mute line-through" : "mono rounded-md border border-line bg-ink-2 px-4 py-3 text-xs text-paper"}
              >
                {tierLabel(license.tier)}: {license.license_key}
              </code>
            ))}
          </div>
        ) : null}

        {isOperator && (typed.status === "pending" || typed.status === "paid") ? (
          <SellerActions orderId={typed.id} status={typed.status} />
        ) : null}

        {typed.status === "pending" && !isSeller ? (
          <div className="flex flex-col gap-3 pt-8">
            {/*
              Деньги идут на счёт площадки, а не продавцу: площадка удерживает
              комиссию, остаток кладёт продавцу на баланс, продавец выводит по
              заявке. Инструкция «переведите продавцу» здесь была бы не просто
              неточной — перевод напрямую дал бы продавцу деньги дважды: от
              покупателя и потом ещё выплатой с баланса.
            */}
            <p className="rounded-panel border border-line bg-ink-3 px-4 py-3 text-sm leading-relaxed text-paper">
              {payment.account
                ? t("order.payToAccount", {
                    total: money(typed.total_minor, typed.currency),
                    account: payment.account,
                    orderId: typed.id,
                    email: payment.supportEmail,
                  })
                : t("order.payToPlatform", {
                    total: money(typed.total_minor, typed.currency),
                    email: payment.supportEmail,
                  })}
            </p>

            {commissionRate ? (
              <p className="text-xs leading-relaxed text-mute">
                {t("order.commissionNote", { rate: commissionRate })}
              </p>
            ) : null}

            <p className="text-sm leading-relaxed text-mute">{t("order.manualNote")}</p>
            {typed.status === "pending" && isSeller ? (
              <p className="text-sm leading-relaxed text-mute">{t("order.sellerWaits")}</p>
            ) : null}
          </div>
        ) : null}
      </Container>
    </section>
  );
}
