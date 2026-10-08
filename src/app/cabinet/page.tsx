import Link from "next/link";
import { redirect } from "next/navigation";

import { Achievements } from "@/components/sales/achievements";
import { Container } from "@/components/ui/container";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/currency";
import { getT } from "@/lib/i18n/server";
import { collectBeatmakerStats, computeAchievements } from "@/lib/sales/achievements";
import { createClient } from "@/lib/supabase/server";

/**
 * Личный кабинет битмейкера.
 *
 * Раньше инструменты висели в общей шапке — «Загрузить бит», «Студия»,
 * «Каналы» — и были видны каждому гостю, хотя относятся к продавцу. Здесь
 * собрано всё, что нужно для работы с битами: цифры, заказы на подтверждение,
 * достижения и переходы к инструментам.
 */

/**
 * Инструменты кабинета. Порядок — по тому, как их открывают чаще.
 *
 * Типы ключей заданы явно: t() принимает строковые литералы из словаря, и
 * вывод типа из массива сузил бы их до первого элемента.
 */
type ToolLabel =
  | "cabinet.beats"
  | "cabinet.upload"
  | "cabinet.channels"
  | "cabinet.studio";

type Tool = { href: string; icon: IconName; label: ToolLabel; hint: `${ToolLabel}Hint` };

const TOOLS: Tool[] = [
  { href: "/cabinet/beats", icon: "heart", label: "cabinet.beats", hint: "cabinet.beatsHint" },
  { href: "/cabinet/upload", icon: "upload", label: "cabinet.upload", hint: "cabinet.uploadHint" },
  { href: "/cabinet/channels", icon: "broadcast", label: "cabinet.channels", hint: "cabinet.channelsHint" },
  { href: "/cabinet/studio", icon: "waveform", label: "cabinet.studio", hint: "cabinet.studioHint" },
];

export default async function CabinetPage() {
  const [t, supabase] = await Promise.all([getT(), createClient()]);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Без входа кабинета нет: гостю показывать нечего, а страница с нулями
  // выглядит как поломка.
  if (!user) redirect("/login?next=/cabinet");

  const [{ data: profile }, { data: items }] = await Promise.all([
    supabase.from("profiles").select("created_at").eq("id", user.id).maybeSingle(),
    supabase
      .from("order_items")
      .select("order_id, beat_title, tier, seller_net_minor, currency")
      .eq("beat_owner_id", user.id)
      .order("order_id", { ascending: false })
      .limit(50),
  ]);

  const stats = await collectBeatmakerStats(
    supabase,
    user.id,
    profile?.created_at ?? new Date().toISOString(),
  );

  const rows = (items ?? []) as {
    order_id: string;
    beat_title: string;
    tier: string;
    seller_net_minor: number;
    currency: string;
  }[];

  const orderIds = [...new Set(rows.map((row) => row.order_id))];

  // Статусы нужны, чтобы показать вверху заказы, которые ждут подтверждения:
  // без этого битмейкер узнаёт о продаже только из ленты уведомлений.
  const { data: orders } = orderIds.length
    ? await supabase.from("orders").select("id, status, created_at").in("id", orderIds)
    : { data: [] as { id: string; status: string; created_at: string }[] };

  const statusById = new Map(((orders ?? []) as { id: string; status: string; created_at: string }[]).map((row) => [row.id, row.status]));

  const sold = rows.filter((row) => ["paid", "delivered"].includes(statusById.get(row.order_id) ?? ""));
  const pending = rows.filter((row) => statusById.get(row.order_id) === "pending");

  const earned = sold.reduce((sum, row) => sum + Number(row.seller_net_minor), 0);
  const currency = sold[0]?.currency ?? "RUB";

  const achievements = computeAchievements(stats);

  /*
   * Деньги показываем моноширинным шрифтом, как в карточке бита: в
   * display-глифе Unbounded знак рубля теряет засечку и читается как «Р».
   */
  const statsRow: { label: string; value: string; money?: boolean }[] = [
    { label: t("cabinet.statEarned"), value: formatMoney(earned / 100, currency), money: true },
    { label: t("cabinet.statSold"), value: String(sold.length) },
    { label: t("cabinet.statOnSale"), value: String(stats.beatsOnSale) },
    { label: t("cabinet.statPlays"), value: String(stats.plays) },
  ];

  return (
    <section className="py-10 lg:py-14">
      <Container>
        <div className="flex flex-col gap-6 border-b border-line pb-7">
          <span className="flex items-center gap-3">
            <span aria-hidden className="size-1.5 bg-signal" />
            <span className="label text-mute">{t("cabinet.title")}</span>
          </span>
          <h1 className="font-display text-section font-black text-paper uppercase">{t("cabinet.title")}</h1>
        </div>

        <dl className="grid grid-cols-2 gap-px border-b border-line bg-line lg:grid-cols-4">
          {statsRow.map((item) => (
            <div key={item.label} className="flex flex-col gap-1.5 bg-ink px-4 py-5">
              <dd
                className={cn(
                  "text-2xl leading-none text-paper tabular-nums",
                  item.money ? "font-mono" : "font-display",
                )}
              >
                {item.value}
              </dd>
              <dt className="label text-mute">{item.label}</dt>
            </div>
          ))}
        </dl>

        {/*
          Заказы, ждущие подтверждения, идут первыми и без сворачивания:
          пока деньги не подтверждены, файл покупателю не отдан, и забытый
          заказ — это потерянная продажа.
        */}
        {pending.length > 0 ? (
          <div className="border-b border-line py-6">
            <h2 className="label mb-3 text-signal">{t("cabinet.pendingTitle")}</h2>
            <ul className="flex flex-col gap-px bg-line">
              {pending.slice(0, 5).map((row) => (
                <li key={row.order_id} className="bg-ink">
                  <Link
                    href={`/orders/${row.order_id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-ink-3"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm text-paper">{row.beat_title}</span>
                      <span className="label text-mute">{row.tier}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-[13px] text-paper tabular-nums">
                        {formatMoney(Number(row.seller_net_minor) / 100, row.currency)}
                      </span>
                      <Icon name="chevronRight" className="size-4 text-mute" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-8 py-8 lg:grid-cols-[1fr_auto]">
          <nav className="grid gap-px self-start bg-line sm:grid-cols-2">
            {TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="group flex items-start gap-3 bg-ink p-4 transition-colors hover:bg-ink-3"
              >
                <span className="mt-0.5 text-mute transition-colors group-hover:text-signal">
                  <Icon name={tool.icon} className="size-4" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="label text-paper transition-colors group-hover:text-signal">{t(tool.label)}</span>
                  <span className="text-[11px] text-mute">{t(tool.hint)}</span>
                </span>
              </Link>
            ))}
          </nav>

          {achievements.length > 0 ? (
            <div className="lg:w-96">
              <Achievements list={achievements} />
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}