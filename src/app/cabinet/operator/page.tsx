import { redirect } from "next/navigation";

import { OperatorPanel } from "@/components/ops/operator-panel";
import { Container } from "@/components/ui/container";
import { formatMoney } from "@/lib/currency";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Оператор", robots: { index: false, follow: false } };

type PendingOrder = {
  id: string;
  total_minor: number;
  currency: string;
  created_at: string;
  buyer_email: string | null;
};

/**
 * Рабочее место оператора площадки.
 *
 * До этой страницы у площадки не было ни одного рабочего места. Деньги
 * приходили на счёт площадки, но подтвердить их и выплатить продавцу было
 * некем: заказ подтверждал продавец, у которого денег не было.
 *
 * Здесь две очереди, и обе про деньги:
 *
 *   * заказы, ожидающие подтверждения — деньги пришли на счёт, их нужно
 *     подтвердить, чтобы покупатель получил файлы, а продавец — баланс;
 *   * заявки на вывод — деньги у продавца на балансе, их нужно отправить.
 *
 * Чтение идёт через сервисный ключ: RLS показывает оператору только свои
 * собственные строки, а оператору нужно видеть чужие заказы. На запись
 * ключ не используется — только вызовы функций под сессией оператора,
 * которые сами проверяют, что он оператор.
 */
export default async function OperatorPage() {
  const supabase = await createClient();
  const t = await getT();

  const {
    data: { user },
  } = await supabase?.auth.getUser() ?? { data: { user: null } };

  if (!user || !supabase) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_operator")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_operator !== true) redirect("/cabinet");

  const admin = getAdminClient();

  const [ordersResult, payoutsResult] = await Promise.all([
    admin
      .from("orders")
      .select("id, total_minor, currency, created_at, buyer_email")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50),

    admin
      .from("payouts")
      .select("id, seller_id, amount_minor, currency, status, created_at, profiles!payouts_seller_id_fkey(username)")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50),
  ]);

  const orders = (ordersResult.data ?? []) as PendingOrder[];

  const payouts = ((payoutsResult.data ?? []) as Array<{
    id: string;
    seller_id: string;
    amount_minor: number;
    currency: string;
    status: string;
    created_at: string;
    profiles: { username: string } | { username: string }[] | null;
  }>).map((row) => ({
    id: row.id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    seller: (Array.isArray(row.profiles) ? row.profiles[0]?.username : row.profiles?.username) ?? "—",
    createdAt: row.created_at,
  }));

  return (
    <Container className="flex flex-col gap-10 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-hero uppercase leading-none tracking-tight">
          {t("ops.title")}
        </h1>
        <p className="max-w-[70ch] text-sub text-mute">{t("ops.note")}</p>
      </div>

      <OperatorPanel
        orders={orders.map((row) => ({
          id: row.id,
          totalMinor: row.total_minor,
          currency: row.currency,
          buyerEmail: row.buyer_email,
          createdAt: row.created_at,
          formattedTotal: formatMoney(row.total_minor / 100, row.currency),
        }))}
        payouts={payouts.map((row) => ({
          ...row,
          formattedAmount: formatMoney(row.amountMinor / 100, row.currency),
        }))}
      />
    </Container>
  );
}