import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Icon, type IconName } from "@/components/ui/icon";
import { formatMoney, formatMoneyByCurrency } from "@/lib/currency";
import { getT } from "@/lib/i18n/server";
import { collectBeatmakerStats } from "@/lib/sales/achievements";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Кабинет",
  robots: { index: false, follow: false },
};

/**
 * Кабинет битмейкера.
 *
 * Раньше это был пульт из девяти панелей: четыре плитки чисел, заказы, продажи
 * и три блока с достижениями и заданиями недели. Двадцать виджетов прогресса
 * на первом экране битмейкера — это та игра, которую мы построили вместо
 * инструмента, и она же делала главное невозможно увидеть: на экране с
 * достижениями человек не видит ни своего баланса, ни того, что мешает
 * продать.
 *
 * Теперь экран отвечает на один вопрос — «что делать сейчас, чтобы
 * заработать» — и отвечает одной кнопкой. Деньги видны всегда, работа
 * (заказы и продажи) — рядом, инструменты — списком. Игра уехала на профиль,
 * где у неё правильный смысл: там достижения и видимы, и уместны.
 *
 * Порядок шагов выведен из денег: неоплаченный заказ дороже черновика,
 * черновик дороже пустого кабинета. Первым показывается то, что стоит денег.
 */

type ToolLabel = "cabinet.beats" | "cabinet.channels" | "cabinet.pulse" | "cabinet.studio";

type Tool = { href: string; icon: IconName; label: ToolLabel; hint: `${ToolLabel}Hint` };

const TOOLS: Tool[] = [
  { href: "/cabinet/beats", icon: "heart", label: "cabinet.beats", hint: "cabinet.beatsHint" },
  { href: "/cabinet/channels", icon: "broadcast", label: "cabinet.channels", hint: "cabinet.channelsHint" },
  /*
   * Pulse стоит здесь, а не в подвале и не по прямой ссылке.
   *
   * Страница публикации на YouTube существовала и работала, но на неё не
   * вёл ни один адрес: единственное упоминание `/pulse` в проекте было в
   * robots.txt, где он запрещён к индексации. Человек, который подключил
   * YouTube в «Каналах», видел подключённый канал и не находил, куда им
   * публиковать, — и решал, что площадка не умеет.
   */
  { href: "/pulse", icon: "upload", label: "cabinet.pulse", hint: "cabinet.pulseHint" },
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

  /*
   * Профиль читается один раз и целиком: раньше он спрашивался дважды —
   * сначала за датой регистрации, потом за флагом оператора, — и каждое
   * чтение стояло отдельным кругом ожидания. Теперь он в общей пачке.
   */
  const [{ data: profile }, { data: items }, { data: ledgerRows }] = await Promise.all([
    supabase.from("profiles").select("created_at, is_operator").eq("id", user.id).maybeSingle(),
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
    supabase.from("seller_transactions").select("amount_minor, currency").eq("seller_id", user.id),
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
  // Ждут — в заказах, а не в позициях: рядом в заказах счёт идёт заказами,
  // и два числа на разных экранах обязаны совпадать.
  const pendingOrders = [...new Set(pending.map((row) => row.order_id))];
  const recent = rows.filter((row) => ["paid", "delivered"].includes(statusById.get(row.order_id) ?? "")).slice(0, 5);

  const earnedByCurrency = sold.map((row) => ({
    amount: Number(row.seller_net_minor) / 100,
    currency: row.currency,
  }));
  const balanceMinor = ((ledgerRows ?? []) as { amount_minor: number; currency: string }[]).map((row) => ({
    amount: Number(row.amount_minor) / 100,
    currency: row.currency,
  }));

  const isOperator = profile?.is_operator === true;

  /*
   * Одно действие, которое стоит денег.
   *
   * Порядок не украшение: неоплаченный заказ — это деньги, которые уже
   * пришли и лежат без движения; черновик — деньги, которые ещё не могут
   * прийти; пустой кабинет — только вход в профессию. Сначала то, что
   * дороже всего, и одна кнопка: экран с двумя просьбами не отвечает ни на
   * одну.
   */
  const drafts = Math.max(0, stats.beatsTotal - stats.beatsOnSale);
  const step = (() => {
    if (stats.beatsTotal === 0) {
      return { href: "/cabinet/upload", icon: "upload" as IconName, title: "cabinet.stepFirst", note: "cabinet.stepFirstNote" };
    }

    if (pendingOrders.length > 0) {
      return { href: "/cabinet/orders", icon: "sale" as IconName, title: "cabinet.stepPending", note: "cabinet.stepPendingNote" };
    }

    if (drafts > 0) {
      return { href: "/cabinet/beats", icon: "upload" as IconName, title: "cabinet.stepDraft", note: "cabinet.stepDraftNote" };
    }

    return null;
  })();

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

          <Link
            href="/cabinet/upload"
            className="flex h-10 items-center gap-2 border border-line-2 px-5 text-sm font-semibold text-paper transition-colors hover:border-line-2 hover:bg-ink-2"
          >
            <Icon name="upload" className="size-4" />
            {t("cabinet.upload")}
          </Link>
        </div>

        {step ? (
          <Link
            href={step.href}
            className="mt-6 flex flex-wrap items-center gap-4 rounded-panel border border-signal/40 bg-signal/5 px-5 py-5 transition-colors hover:bg-signal/10"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-signal/40 bg-signal/10 text-signal">
              <Icon name={step.icon} className="size-5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="label text-signal">{t(step.title as "cabinet.stepPending")}</span>
              <span className="max-w-[62ch] text-sm leading-relaxed text-paper">
                {t(step.note as "cabinet.stepPendingNote")}
              </span>
            </span>
            <Icon name="chevronRight" className="size-5 shrink-0 text-signal" />
          </Link>
        ) : null}

        {/*
          Деньги — два числа и ничего больше. Баланс можно вывести сейчас,
          заработано — оборот за всё время; одно без другого вводит в
          заблуждение, а третье и четвёртое число про заказы и биты раньше
          просто занимали место денег.
        */}
        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="panel flex flex-col gap-2 p-5">
            <dd className="font-mono text-4xl leading-none text-paper tabular-nums">
              {formatMoneyByCurrency(balanceMinor)}
            </dd>
            <dt className="label text-mute">{t("cabinet.statBalance")}</dt>
            <Link href="/cabinet/payouts" className="label w-fit text-signal transition-opacity hover:opacity-80">
              {t("cabinet.withdraw")}
            </Link>
          </div>

          <div className="panel flex flex-col gap-2 p-5">
            <dd className="font-display text-2xl leading-none text-paper/85 tabular-nums">
              {formatMoneyByCurrency(earnedByCurrency)}
            </dd>
            <dt className="label text-mute">{t("cabinet.statEarned")}</dt>
          </div>
        </dl>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            {/*
              Заказы на подтверждение идут первыми и без сворачивания: пока деньги
              не подтверждены, сделка не завершена, и забытый заказ — потерянные
              деньги и недовольный покупатель. Блок пуст — его не показываем:
              рамка с текстом «необработанных заказов нет» занимает место
              дороже, чем сообщает.
            */}
            {pending.length > 0 ? (
              <div id="pending" className="panel scroll-mt-24 p-5">
                <div className="mb-4 flex items-baseline justify-between gap-4">
                  <h2 className="label text-paper">{t("cabinet.pendingTitle")}</h2>
                  <span className="font-mono text-sm text-signal">{pendingOrders.length}</span>
                </div>

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
              </div>
            ) : null}

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
            {/*
              Инструменты — ссылки списком, а не плитки: это ссылки, а не содержимое.
            */}
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
          </aside>
        </div>
      </Container>
    </section>
  );
}

/**
 * Уровень покупки. Подписи совпадают в обоих языках: это названия тарифов,
 * а не фразы интерфейса, и «MP3 + WAV» переводить нечего.
 */
function tierLabel(tier: string): string {
  return tier === "mp3" ? "MP3" : tier === "wav" ? "MP3 + WAV" : tier === "trackout" ? "Track Out" : "Эксклюзив";
}
