import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Container } from "@/components/ui/container";
import { formatMoney } from "@/lib/currency";
import { fetchBeatsByOwner } from "@/lib/feed";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Аналитика",
  robots: { index: false, follow: false },
};

type DayBucket = { date: string; amount: number };

function buildDailyBuckets(sales: { amount_minor: number; created_at: string }[], days: number): DayBucket[] {
  const now = new Date();
  const buckets: DayBucket[] = [];
  const map = new Map<string, number>();

  for (const row of sales) {
    const key = new Date(row.created_at).toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + Number(row.amount_minor ?? 0));
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.push({ date: key, amount: map.get(key) ?? 0 });
  }

  return buckets;
}

export default async function CabinetAnalyticsPage() {
  const supabase = await createClient();
  const t = await getT();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/cabinet/analytics");

  const [beats, transactions] = await Promise.all([
    fetchBeatsByOwner(supabase, user.id, true).catch(() => []),
    supabase
      .from("seller_transactions")
      .select("amount_minor, currency, kind, created_at")
      .eq("seller_id", user.id)
      .eq("kind", "sale"),
  ]);

  const sales = (transactions.data ?? []) as { amount_minor: number; currency: string; created_at: string }[];
  const totalPlays = beats.reduce((sum, beat) => sum + (beat.plays ?? 0), 0);
  const totalSales = sales.length;
  const totalRevenueMinor = sales.reduce((sum, row) => sum + Number(row.amount_minor ?? 0), 0);
  const currency = sales[0]?.currency ?? "RUB";

  const topBeats = [...beats]
    .sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0))
    .slice(0, 5);

  const daily = buildDailyBuckets(sales, 14);
  const maxAmount = Math.max(1, ...daily.map((d) => d.amount));

  return (
    <section className="py-10 lg:py-20">
      <Container>
        <div className="flex flex-col gap-6 border-b border-line py-8">
          <h1 className="font-display text-section font-semibold text-paper uppercase">Аналитика</h1>
          <p className="label text-mute">Прослушивания, продажи и доход по вашим битам.</p>
        </div>

        <div className="grid gap-4 pt-10 sm:grid-cols-3">
          <div className="panel flex flex-col gap-2 p-5">
            <span className="label text-mute">Прослушивания</span>
            <span className="font-display text-2xl text-paper">{totalPlays.toLocaleString("ru-RU")}</span>
          </div>
          <div className="panel flex flex-col gap-2 p-5">
            <span className="label text-mute">Продажи</span>
            <span className="font-display text-2xl text-paper">{totalSales.toLocaleString("ru-RU")}</span>
          </div>
          <div className="panel flex flex-col gap-2 p-5">
            <span className="label text-mute">Доход</span>
            <span className="font-display text-2xl text-paper">{formatMoney(totalRevenueMinor / 100, currency)}</span>
          </div>
        </div>

        <div className="pt-10">
          <h2 className="label text-mute mb-4">Доход по дням (14 дней)</h2>
          <div className="panel p-5">
            <svg viewBox="0 0 560 160" className="h-40 w-full" preserveAspectRatio="none" role="img" aria-label="Доход по дням">
              {daily.map((bucket, index) => {
                const barWidth = 560 / daily.length;
                const height = (bucket.amount / maxAmount) * 140;
                const x = index * barWidth;
                const y = 160 - height;
                return (
                  <rect
                    key={bucket.date}
                    x={x + 2}
                    y={y}
                    width={barWidth - 4}
                    height={Math.max(height, bucket.amount > 0 ? 2 : 0)}
                    className="fill-signal/70"
                  />
                );
              })}
            </svg>
            <div className="mt-2 flex justify-between text-[10px] text-mute">
              <span>{daily[0]?.date.slice(5)}</span>
              <span>{daily[daily.length - 1]?.date.slice(5)}</span>
            </div>
          </div>
        </div>

        <div className="pt-10">
          <h2 className="label text-mute mb-4">Топ битов по прослушиваниям</h2>
          {topBeats.length === 0 ? (
            <p className="text-sm text-mute">Пока нет битов.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {topBeats.map((beat) => (
                <li key={beat.id} className="flex items-center justify-between border-b border-line py-3">
                  <a href={`/beats/${beat.id}`} className="text-sm text-paper hover:text-signal">{beat.title}</a>
                  <span className="label text-mute">{(beat.plays ?? 0).toLocaleString("ru-RU")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Container>
    </section>
  );
}