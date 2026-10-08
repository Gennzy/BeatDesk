import Link from "next/link";
import { redirect } from "next/navigation";

import { Container } from "@/components/ui/container";
import { Icon, type IconName } from "@/components/ui/icon";
import { formatMoney } from "@/lib/currency";
import { getT } from "@/lib/i18n/server";
import { collectBeatmakerStats, computeAchievements } from "@/lib/sales/achievements";
import { createClient } from "@/lib/supabase/server";

/**
 * Личный кабинет битмейкера.
 *
 * Порядок блоков отвечает на вопрос «что делать сейчас»: сначала деньги и
 * заказы, которые ждут подтверждения, потом инструменты, потом достижения.
 *
 * Раньше всё стояло одной массой — четыре цифры, четыре плитки инструментов и
 * достижения на одном экране, и взгляд не знал, за что хвататься. Теперь на
 * первом экране только то, что требует действия.
 */

/**
 * Инструменты — мелкой строкой, а не плиткой: это ссылки, а не содержимое.
 * Типы ключей заданы явно, потому что t() принимает строковые литералы из
 * словаря, а вывод типа из массива сузил бы их до первого элемента.
 */
type ToolLabel = "cabinet.beats" | "cabinet.channels" | "cabinet.studio";

type Tool = { href: string; icon: IconName; label: ToolLabel; hint: `${ToolLabel}Hint` };

const TOOLS: Tool[] = [
  { href: "/cabinet/beats", icon: "heart", label: "cabinet.beats", hint: "cabinet.beatsHint" },
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
      .select("order_id, beat_id, beat_title, tier, seller_net_minor, currency")
      .eq("beat_owner_id", user.id)
      .order("order_id", { ascending: false })
      .limit(50),
  ]);

  const stats = await collectBeatmakerStats(supabase, user.id, profile?.created_at ?? new Date().toISOString());

  const rows = (items ?? []) as {
    order_id: string;
    beat_id: string;
    beat_title: string;
    tier: string;
    seller_net_minor: number;
    currency: string;
  }[];

  const orderIds = [...new Set(rows.map((row) => row.order_id))];

  /*
   * Статусы нужны, чтобы отдельно показать заказы, которые ждут
   * подтверждения: без этого битмейкер узнаёт о продаже только из уведомлений,
   * а пока деньги не подтверждены, файл покупателю не отдан.
   */
  const { data: orders } = orderIds.length
    ? await supabase.from("orders").select("id, status").in("id", orderIds)
    : { data: [] as { id: string; status: string }[] };

  const statusById = new Map(((orders ?? []) as { id: string; status: string }[]).map((row) => [row.id, row.status]));

  const sold = rows.filter((row) => ["paid", "delivered"].includes(statusById.get(row.order_id) ?? ""));
  const pending = rows.filter((row) => statusById.get(row.order_id) === "pending");
  const recent = rows.filter((row) => ["paid", "delivered"].includes(statusById.get(row.order_id) ?? "")).slice(0, 5);

  const earned = sold.reduce((sum, row) => sum + Number(row.seller_net_minor), 0);
  const currency = sold[0]?.currency ?? "RUB";

  const achievements = computeAchievements(stats);

  return (
    <section className="py-10 lg:py-14">
      <Container>
        <div className="flex items-baseline justify-between gap-6 border-b border-line pb-5">
          <h1 className="font-display text-title font-black text-paper uppercase">{t("cabinet.title")}</h1>

          {/* Одно главное действие на экран: загрузить бит. Остальное — ниже. */}
          <Link
            href="/cabinet/upload"
            className="flex h-10 items-center gap-2 bg-signal px-5 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
          >
            <Icon name="upload" className="size-4" />
            {t("cabinet.upload")}
          </Link>
        </div>

        {/*
          Деньги и продажи — единственные крупные числа на странице. Цифры
          набраны моноширинным шрифтом: в display-глифе Unbounded знак рубля
          теряет засечку и читается как «Р».
        */}
        <dl className="grid grid-cols-2 gap-px border-b border-line bg-line lg:grid-cols-4">
          {[
            { label: t("cabinet.statEarned"), value: formatMoney(earned / 100, currency), money: true },
            { label: t("cabinet.statSold"), value: String(sold.length) },
            { label: t("cabinet.statOnSale"), value: String(stats.beatsOnSale) },
            { label: t("cabinet.statPlays"), value: String(stats.plays) },
          ].map((item, index) => (
            <div
              key={item.label}
              className={
                index < 2
                  ? "flex flex-col gap-2 border-b border-line py-6 pr-6 lg:border-b-0"
                  : "flex flex-col gap-2 border-b border-line py-6 pr-6 lg:border-b-0 lg:border-l lg:pl-6"
              }
            >
              <dd
                className={`text-3xl leading-none tabular-nums ${item.money ? "font-mono" : "font-display"} ${
                  index === 0 ? "text-paper" : "text-paper/80"
                }`}
              >
                {item.value}
              </dd>
              <dt className="label text-mute">{item.label}</dt>
            </div>
          ))}
        </dl>

        {/*
          Заказы на подтверждение идут первыми и без сворачивания: пока деньги
          не подтверждены, сделка не завершена, и забытый заказ — потерянные
          деньги и недовольный покупатель.
        */}
        <div className="panel mt-6 p-5">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="label text-paper">{t("cabinet.pendingTitle")}</h2>
            {pending.length > 0 ? <span className="font-mono text-sm text-signal">{pending.length}</span> : null}
          </div>

          {pending.length === 0 ? (
            <p className="text-sm text-mute">{t("cabinet.pendingEmpty")}</p>
          ) : (
            <ul className="flex flex-col">
              {pending.map((row) => (
                <li key={row.order_id}>
                  <Link
                    href={`/orders/${row.order_id}`}
                    className="group flex items-baseline justify-between gap-4 border-b border-line py-3.5 transition-colors hover:bg-ink-2"
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-sm text-paper transition-colors group-hover:text-bright">
                        {row.beat_title}
                      </span>
                      <span className="label text-mute">{tierLabel(row.tier)}</span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-4">
                      <span className="font-mono text-sm text-paper tabular-nums">
                        {formatMoney(Number(row.seller_net_minor) / 100, row.currency)}
                      </span>
                      <Icon name="chevronRight" className="size-4 text-mute transition-colors group-hover:text-paper" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Инструменты — ссылки в одну строку, а не плитки. */}
        <nav className="panel mt-6 p-5">
          <h2 className="label mb-4 text-mute">{t("cabinet.tools")}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {TOOLS.map((tool) => (
              <li key={tool.href}>
                <Link href={tool.href} className="group flex items-start gap-3 rounded-md border border-line bg-ink-2 p-3 transition-colors hover:border-line-2">
                  <span className="mt-0.5 text-mute transition-colors group-hover:text-paper">
                    <Icon name={tool.icon} className="size-4" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="label text-paper transition-colors group-hover:text-bright">
                      {t(tool.label)}
                    </span>
                    <span className="text-[11px] text-mute">{t(tool.hint)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {recent.length > 0 ? (
          <div className="panel mt-6 p-5">
            <h2 className="label mb-4 text-mute">{t("cabinet.recentSales")}</h2>
            <ul className="flex flex-col">
              {recent.map((row) => (
                <li key={`${row.order_id}-${row.beat_id}`}>
                  <Link
                    href={`/orders/${row.order_id}`}
                    className="flex items-baseline justify-between gap-4 rounded-md px-2 py-3 text-sm transition-colors hover:bg-ink-3"
                  >
                    <span className="truncate text-mute">{row.beat_title}</span>
                    <span className="flex shrink-0 items-baseline gap-4">
                      <span className="label text-mute">{tierLabel(row.tier)}</span>
                      <span className="font-mono text-paper tabular-nums">
                        {formatMoney(Number(row.seller_net_minor) / 100, row.currency)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {achievements.length > 0 ? (
          <div className="panel mt-6 p-5">
            <h2 className="label mb-4 text-mute">{t("ach.title")}</h2>
            <ul className="flex flex-wrap gap-2">
              {achievements
                .filter((achievement) => achievement.unlocked)
                .map((achievement) => (
                  <li
                    key={achievement.id}
                    title={t(achievement.titleKey as "ach.firstBeat.title")}
                    className="chip px-3 py-2"
                  >
                    <span className="label text-paper">{t(achievement.titleKey as "ach.firstBeat.title")}</span>
                  </li>
                ))}
            </ul>
            {nextAchievementLine(achievements, t) ? (
              <p className="mt-4 text-xs text-mute">{nextAchievementLine(achievements, t)}</p>
            ) : null}
          </div>
        ) : null}
      </Container>
    </section>
  );
}

/** Тип функции перевода: получаем от getT, чтобы не повторятьunionвручную. */
type T = Awaited<ReturnType<typeof getT>>;

/**
 * Уровень покупки. Подписи совпадают в обоих языках: это названия тарифов,
 * а не фразы интерфейса, и «MP3 + WAV» переводить нечего.
 */
function tierLabel(tier: string): string {
  return tier === "mp3" ? "MP3" : tier === "wav" ? "MP3 + WAV" : tier === "trackout" ? "TRACK OUT" : "ЭКСКЛЮЗИВ";
}

/** Следующая цель: без неё список достижений выглядит как список медалей. */
function nextAchievementLine(
  achievements: ReturnType<typeof computeAchievements>,
  t: T,
): string | null {
  const next = achievements.find((achievement) => !achievement.unlocked);

  if (!next) return null;

  return `${t("ach.next")}: ${t(next.titleKey as "ach.firstBeat.title")} · ${next.current} / ${next.threshold}`;
}