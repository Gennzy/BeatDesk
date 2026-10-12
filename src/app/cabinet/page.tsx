import Link from "next/link";
import { redirect } from "next/navigation";

import { Container } from "@/components/ui/container";
import { Icon, type IconName } from "@/components/ui/icon";
import { formatMoney } from "@/lib/currency";
import { getT } from "@/lib/i18n/server";
import { collectBeatmakerStats, computeAchievements } from "@/lib/sales/achievements";
import { computeWeekly } from "@/lib/sales/weekly";
import { WeeklyMissions } from "@/components/sales/weekly-missions";
import { createClient } from "@/lib/supabase/server";

/**
 * Кабинет битмейкера.
 *
 * Это пульт, а не витрина: сверху деньги и то, что требует действия, слева
 * работа (заказы и продажи), справа ритм (задания недели, инструменты,
 * следующая цель). Порядок отвечает на вопрос «что делать сейчас», а не
 * «что у меня есть».
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

  const [{ data: profile }, { data: items }, { data: ledgerRows }] = await Promise.all([
    supabase.from("profiles").select("created_at").eq("id", user.id).maybeSingle(),
    supabase
      .from("order_items")
      .select("order_id, beat_id, beat_title, tier, seller_net_minor, currency")
      .eq("beat_owner_id", user.id)
      .order("order_id", { ascending: false })
      .limit(50),
    /*
     * Баланс — суммой всего журнала, без лимита: лимит обрезал бы старые
     * начисления, и баланс поплыл бы вниз по мере роста продаж. Строк
     * тянется только одно число, а не вся история, поэтому запрос лёгкий.
     */
    supabase.from("seller_transactions").select("amount_minor").eq("seller_id", user.id),
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
  const balanceMinor = ((ledgerRows ?? []) as { amount_minor: number }[]).reduce(
    (sum, row) => sum + Number(row.amount_minor),
    0,
  );

  const { data: me } = await supabase
    .from("profiles")
    .select("is_operator")
    .eq("id", user.id)
    .maybeSingle();

  const isOperator = me?.is_operator === true;

  const achievements = computeAchievements(stats);
  const weekly = computeWeekly(stats);
  const unlocked = achievements.filter((achievement) => achievement.unlocked);

  return (
    <section className="py-10 lg:py-14">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-title font-semibold text-paper uppercase">{t("cabinet.title")}</h1>
            {isOperator ? (
              <Link href="/cabinet/operator" className="chip chip-hover">
                {t("ops.title")}
              </Link>
            ) : null}
          </div>

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
          Деньги и действия — единственные крупные числа. Баланс первый: это
          то, что можно вывести сейчас. Заработано — оборот за всё время,
          а не дубликат баланса: одно без другого вводит в заблуждение.
        */}
        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="panel flex flex-col gap-2 p-5 sm:col-span-2 lg:col-span-1">
            <dd className="font-mono text-4xl leading-none text-paper tabular-nums">
              {formatMoney(balanceMinor / 100, "RUB")}
            </dd>
            <dt className="label text-mute">{t("cabinet.statBalance")}</dt>
            <Link href="/cabinet/payouts" className="label w-fit text-signal transition-opacity hover:opacity-80">
              {t("cabinet.withdraw")}
            </Link>
          </div>

          <div className="panel flex flex-col gap-2 p-5">
            <dd className="font-display text-2xl leading-none text-paper/85 tabular-nums">
              {formatMoney(earned / 100, currency)}
            </dd>
            <dt className="label text-mute">{t("cabinet.statEarned")}</dt>
          </div>

          <a
            href="#pending"
            className="panel flex flex-col gap-2 p-5 transition-colors hover:border-line-2"
            aria-label={t("cabinet.pendingTitle")}
          >
            <dd
              className={`font-display text-2xl leading-none tabular-nums ${
                pending.length > 0 ? "text-amber" : "text-paper/85"
              }`}
            >
              {pending.length}
            </dd>
            <dt className="label text-mute">{t("cabinet.statPending")}</dt>
          </a>

          <div className="panel flex flex-col gap-2 p-5">
            <dd className="font-display text-2xl leading-none text-paper/85 tabular-nums">{stats.beatsOnSale}</dd>
            <dt className="label text-mute">{t("cabinet.statOnSale")}</dt>
          </div>
        </dl>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            {/*
              Заказы на подтверждение идут первыми и без сворачивания: пока деньги
              не подтверждены, сделка не завершена, и забытый заказ — потерянные
              деньги и недовольный покупатель.
            */}
            <div id="pending" className="panel scroll-mt-24 p-5">
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
                        className="group flex items-baseline justify-between gap-4 border-b border-line py-3.5 transition-colors last:border-b-0 hover:bg-ink-2"
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

            {recent.length > 0 ? (
              <div className="panel p-5">
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
          </div>

          <aside className="flex min-w-0 flex-col gap-6">
            <div className="panel p-5">
              <WeeklyMissions missions={weekly} />
            </div>

            {/* Инструменты — ссылки списком, а не плитки: это ссылки, а не содержимое. */}
            <nav className="panel p-5">
              <h2 className="label mb-4 text-mute">{t("cabinet.tools")}</h2>
              <ul className="flex flex-col gap-1">
                {TOOLS.map((tool) => (
                  <li key={tool.href}>
                    <Link href={tool.href} className="group flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-ink-3">
                      <span className="text-mute transition-colors group-hover:text-paper">
                        <Icon name={tool.icon} className="size-4" />
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="label text-paper transition-colors group-hover:text-bright">
                          {t(tool.label)}
                        </span>
                        <span className="truncate text-[11px] text-mute">{t(tool.hint)}</span>
                      </span>
                      <Icon name="chevronRight" className="ml-auto size-4 shrink-0 text-mute transition-colors group-hover:text-paper" />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            {unlocked.length > 0 ? (
              <div className="panel p-5">
                <div className="mb-4 flex items-baseline justify-between gap-4">
                  <h2 className="label text-mute">{t("ach.title")}</h2>
                  <span className="label text-paper tabular-nums">
                    {unlocked.length} / {achievements.length}
                  </span>
                </div>
                <ul className="flex flex-wrap gap-2">
                  {unlocked.map((achievement) => (
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
          </aside>
        </div>
      </Container>
    </section>
  );
}

/** Тип функции перевода: получаем от getT, чтобы не повторять union вручную. */
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
