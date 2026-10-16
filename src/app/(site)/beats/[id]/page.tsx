import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BeatComments, type BeatComment } from "@/components/beat/beat-comments";
import { BeatCover } from "@/components/beat/beat-cover";
import { BeatViewCounter } from "@/components/beat/beat-view-counter";
import { BeatStats } from "@/components/beat/beat-stats";
import { LicenseTerms } from "@/components/beat/license-terms";
import { SellerCard } from "@/components/beat/seller-card";
import { BeatShare } from "@/components/beat/beat-share";
import { ShareToTelegram } from "@/components/platforms/share-to-telegram";
import { BeatOffer } from "@/components/sales/beat-offer";
import { Container } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/currency";
import { getT } from "@/lib/i18n/server";
import { normalizePrices, PRICE_KEYS, priceLabel } from "@/lib/prices";
import { getSupabase } from "@/lib/supabase/user";
import { SALE_STATE_LABELS, type SaleState } from "@/lib/sales/state";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await getSupabase();
  if (!supabase) return { title: "Бит не найден" };

  const { data } = await supabase
    .from("beats")
    .select("title, tags, bpm, key, cover_url, profiles!beats_owner_id_fkey(username)")
    .eq("id", id)
    .maybeSingle();

  if (!data) return { title: "Бит не найден" };

  const description = [`${data.bpm} BPM`, data.key, (data.tags ?? []).slice(0, 4).map((tag: string) => `#${tag}`).join(" ")]
    .filter(Boolean)
    .join(" · ");

  return {
    title: data.title,
    description,
    alternates: { canonical: `/beats/${id}` },
    openGraph: {
      type: "article",
      title: `${data.title} · BeatDesk`,
      description,
      images: data.cover_url ? [{ url: data.cover_url }] : undefined,
    },
    twitter: { card: "summary_large_image", title: data.title, description },
  };
}

export default async function BeatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [supabase, t] = await Promise.all([getSupabase(), getT()]);

  if (!supabase) notFound();

  /*
   * Колонки из миграций 0029 и 0030 появляются не сразу, а PostgREST отвечает
   * ошибкой на любую несуществующую — и страница бита становилась 404 на весь
   * каталог. Поэтому набор один, а откат на старый тот же, что в ленте.
   */
  const FULL_COLUMNS =
    "id, title, type_beat_artists, bpm, key, tags, genre, mp3_url, cover_url, prices, prices_before, discount_percent, currency, sale_state, owner_id, plays, views, impressions, created_at, profiles!beats_owner_id_fkey(id, username, avatar_url, bio, links, level)";
  const SAFE_COLUMNS =
    "id, title, type_beat_artists, bpm, key, tags, mp3_url, cover_url, prices, prices_before, discount_percent, currency, sale_state, owner_id, plays, created_at, profiles!beats_owner_id_fkey(id, username, avatar_url, bio, links)";

  /*
   * Пока не применена миграция 0035, колонок скидки нет, и запрос с ними
   * падает целиком — вместе со всей страницей. Поэтому третий набор, без
   * скидки: бит открывается, покупается и показывается как обычно, просто
   * без зачёркнутой цены. Лучше так, чем витрина, которая не грузится.
   */
  const PRE_DISCOUNT_COLUMNS =
    "id, title, type_beat_artists, bpm, key, tags, genre, mp3_url, cover_url, prices, currency, sale_state, owner_id, plays, views, impressions, created_at, profiles!beats_owner_id_fkey(id, username, avatar_url, bio, links, level)";

  let result = await supabase.from("beats").select(FULL_COLUMNS).eq("id", id).maybeSingle();

  if (result.error) {
    result = await supabase.from("beats").select(PRE_DISCOUNT_COLUMNS).eq("id", id).maybeSingle();
  }

  if (result.error) {
    result = await supabase.from("beats").select(SAFE_COLUMNS).eq("id", id).maybeSingle();
  }

  if (result.error) console.error("beat page query failed", result.error);

  const raw = result.data;

  if (!raw) notFound();

  const beat = raw as typeof raw & { plays?: number | null; views?: number | null; impressions?: number | null };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const owner = Array.isArray(beat.profiles) ? beat.profiles[0] : beat.profiles;
  const isOwner = Boolean(user && user.id === beat.owner_id);

  const prices = normalizePrices(beat.prices);
  const pricesBefore = beat.prices_before ? normalizePrices(beat.prices_before) : null;
  const discountPercent = Number(beat.discount_percent ?? 0);
  const tiers = PRICE_KEYS.map((key) => ({ key, label: priceLabel[key], value: prices[key] })).filter(
    (tier) => tier.value !== null,
  ) as { key: (typeof PRICE_KEYS)[number]; label: string; value: number }[];

  /*
   * Состояние приходит строкой из базы, а набор значений закрыт: on_sale,
   * а не public. Сверка идёт через словарь, иначе незнакомое значение
   * показывалось бы покупателю как есть.
   */
  const saleState = ((beat.sale_state ?? "draft") as SaleState) in SALE_STATE_LABELS
    ? ((beat.sale_state ?? "draft") as SaleState)
    : "draft";
  const sellable = saleState === "on_sale";
  const cheapest = sellable ? tiers.reduce<number | null>((min, tier) => (min === null || tier.value < min ? tier.value : min), null) : null;

  /*
   * Обсуждение грузится отдельно от товара. Раньше оно шло одним запросом, но
   * обсуждения у бита не было вовсе, и правило на будущее: комментариев может
   * быть сколько угодно, а показ цены не должен ждать их.
   */
  const { data: commentRows } = await supabase
    .from("beat_comments")
    .select("id, body, created_at, author_id, parent_id, profiles!beat_comments_author_id_fkey(username, avatar_url)")
    .eq("beat_id", id)
    .order("created_at", { ascending: true })
    .limit(100);

  const comments = ((commentRows ?? []) as {
    id: string;
    body: string;
    created_at: string;
    author_id: string | null;
    parent_id: string | null;
    profiles: { username: string; avatar_url: string | null } | { username: string; avatar_url: string | null }[] | null;
  }[]).map<BeatComment>((row) => {
    const author = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

    return {
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      authorId: row.author_id,
      authorUsername: author?.username ?? null,
      authorAvatar: author?.avatar_url ?? null,
      parentId: row.parent_id,
    };
  });

  const createdLabel = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(beat.created_at),
  );

  /*
   * Другие биты того же продавца — кросс-продажа. Без неё страница бита
   * заканчивается комментариями: услышал трек, решил, полез в профиль
   * продавца, и если он там не заглянул — человек уходит, хотя у
   * продавца обычно есть ещё что послушать.
   *
   * Берём только то, что действительно можно купить: бит без цены или
   * снятый с продажи в витрине смотреть нельзя, и строка «другие биты
   * автора» с некупаемым битом — обещание, которое не выполнится.
   */
  const { data: siblingRaw } = await supabase
    .from("beats")
    .select("id, title, bpm, key, cover_url, mp3_url, prices, currency, plays")
    .eq("owner_id", beat.owner_id)
    .eq("is_public", true)
    .eq("sale_state", "on_sale")
    .neq("id", beat.id)
    .limit(4);

  const siblings = ((siblingRaw ?? []) as Array<{
    id: string;
    title: string;
    bpm: number;
    key: string | null;
    cover_url: string | null;
    mp3_url: string | null;
    prices: Record<string, number> | null;
    currency: string | null;
    plays: number | null;
  }>).filter((row) => {
    const p = normalizePrices(row.prices);
    return p.mp3 !== null || p.wav !== null || p.trackout !== null || p.exclusive !== null;
  });

  return (
    <section className="py-8 lg:py-12">
      <BeatViewCounter beatId={beat.id} isOwner={isOwner} />

      <Container>
        {/* Хлебные крошки: показывают, где человек находится, и дают ссылку
            назад в каталог одним кликом. */}
        <nav aria-label={t("beat.breadcrumb")} className="flex flex-wrap items-center gap-2 text-xs text-mute">
          <Link href="/" className="transition-colors hover:text-paper">
            {t("beat.crumbHome")}
          </Link>
          <Icon name="chevronRight" className="size-3 text-mute" />
          <span>{t("beat.crumbCatalog")}</span>
        </nav>

        <h1 className="mt-5 max-w-4xl font-display text-3xl leading-tight font-semibold tracking-tight text-paper lg:text-5xl">
          {beat.title}
        </h1>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
          <div className="flex min-w-0 flex-col gap-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
              <div className="w-full shrink-0 sm:w-72">
                <BeatCover
                  beatId={beat.id}
                  coverUrl={beat.cover_url}
                  audioUrl={beat.mp3_url}
                  title={beat.title}
                  username={owner?.username ?? ""}
                  bpm={beat.bpm}
                  musicalKey={beat.key}
                  plays={beat.plays ?? 0}
                />

                {beat.tags && beat.tags.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {beat.tags.map((tag: string) => (
                      <Link
                        key={tag}
                        href={`/?q=${encodeURIComponent(tag)}`}
                        className="chip chip-hover"
                      >
                        #{tag}
                      </Link>
                    ))}
                  </div>
                ) : null}

                <BeatStats plays={beat.plays ?? 0} views={beat.views ?? 0} impressions={beat.impressions ?? 0} />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-8">
                <section className="flex flex-col gap-3">
                  <h2 className="label text-mute">{t("beat.about")}</h2>
                  <dl className="flex flex-col">
                    <BeatFact label={t("beat.addedAt")} value={createdLabel} />
                    <BeatFact label={t("beat.keyLabel")} value={beat.key} />
                    <BeatFact label={t("beat.bpmLabel")} value={`${beat.bpm} BPM`} />
                    {beat.genre ? (
                      <BeatFact
                        label={t("beat.genreLabel")}
                        value={t(`genre.${beat.genre}` as "genre.trap")}
                      />
                    ) : null}
                    {beat.type_beat_artists && beat.type_beat_artists.length > 0 ? (
                      <BeatFact label={t("feed.typeOf")} value={beat.type_beat_artists.join(", ")} />
                    ) : null}
                  </dl>
                </section>

                <LicenseTerms tiers={tiers} />

                <div className="flex flex-wrap items-center gap-3">
                  <BeatShare beatId={beat.id} title={beat.title} />

                  {/*
                    Отправка в Telegram — только владельцу. Ссылку выдаёт
                    сервер и только ему: подпись защищает бит от подмены, но
                    право выдать ссылку на чужой бит — это уже право, а не
                    целостность.
                  */}
                  {isOwner ? <ShareToTelegram beatId={beat.id} /> : null}

                  {/*
                    Правка — только владельцу, и раньше с бита на неё было
                    не откуда пойти: страница правки жила, а адрес на неё не
                    стоял нигде. Человек видел «Бит сейчас не продаётся» и
                    «Черновик» на своём бите и не имел чем это исправить —
                    ровно то, о чём он и спросил.
                  */}
                  {isOwner ? (
                    <Link
                      href={`/beats/${beat.id}/edit`}
                      className="chip chip-hover transition-colors hover:border-line-2"
                    >
                      {t("beat.edit")}
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>

            <BeatOffer
                  beatId={beat.id}
                  tiers={tiers}
                  pricesBefore={pricesBefore}
                  discountPercent={discountPercent}
                  currency={beat.currency ?? "RUB"}
                  isOwner={isOwner}
                  signedIn={Boolean(user)}
                />

            {/*
              Обсуждение после блока покупки: человек сначала решает, брать ли,
              и уже потом спорит с автором. Наоборот разговор уводил бы от кнопки.
            */}
            <BeatComments beatId={beat.id} initial={comments} loggedInUserId={user?.id ?? null} />

            {siblings.length > 0 ? (
              <section className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span aria-hidden className="size-1.5 shrink-0 bg-signal" />
                  <span className="text-sm font-semibold uppercase tracking-wider text-paper">
                    {t("beat.moreFromSeller")}
                  </span>
                  {owner?.username ? (
                    <Link
                      href={`/beatmakers/${owner.username}`}
                      className="ml-auto text-sm text-mute transition-colors hover:text-paper"
                    >
                      {t("beat.allBySeller")}
                    </Link>
                  ) : null}
                </div>

                <ul className="grid gap-3 sm:grid-cols-2">
                  {siblings.map((row) => (
                    <li key={row.id}>
                      <Link
                        href={`/beats/${row.id}`}
                        className="panel focusable flex h-full items-center gap-4 p-3 transition-colors hover:border-line-2"
                      >
                        <BeatCover
                          beatId={row.id}
                          title={row.title}
                          coverUrl={row.cover_url}
                          audioUrl={row.mp3_url}
                          username={owner?.username ?? ""}
                          bpm={row.bpm}
                          musicalKey={row.key ?? ""}
                          plays={row.plays ?? 0}
                          className="aspect-square w-16 shrink-0 rounded-md"
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm font-semibold text-paper">{row.title}</span>
                          <span className="text-sm text-mute">
                            {row.bpm} BPM
                            {row.key ? ` · ${row.key}` : ""}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          {/* Правая колонка липнет при прокрутке: цена и продавец остаются
              на виду, пока читают условия лицензии. */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="flex flex-col gap-4">
              <div className="panel p-5">
                {cheapest !== null ? (
                  <p className="font-display text-4xl leading-none text-paper">{formatMoney(cheapest, beat.currency ?? "RUB")}</p>
                ) : null}

                <p className="mt-2 flex items-center justify-between gap-3 text-xs text-mute">
                  <span>{cheapest !== null ? t("beat.fromPrice") : t("beat.notForSale")}</span>
                  {/*
                    Состояние продажи показывается всегда, а не только когда
                    цены нет: «оплачивается» и «продан эксклюзивно» говорят
                    покупателю больше, чем отсутствие числа.
                  */}
                  <span className="label text-paper">{SALE_STATE_LABELS[saleState]}</span>
                </p>
              </div>

              {/*
                Черновик у владельца — это не «витрина пустая», а его рабочий
                бит, который ждёт одного нажатия. Раньше страница говорила
                только «Бит сейчас не продаётся», и человек, у которого это
                его собственный бит, оставался с этим по ту сторону экрана:
                почему — непонятно, что делать — тоже. Здесь и причина, и
                дорога.
              */}
              {isOwner && saleState === "draft" ? (
                <div className="flex flex-col gap-3 rounded-panel border border-signal/35 bg-signal/5 px-5 py-5">
                  <span className="label text-signal">{t("beat.draftOwnerTitle")}</span>
                  <p className="max-w-[46ch] text-sm leading-relaxed text-paper">{t("beat.draftOwnerNote")}</p>
                  <Link
                    href={`/beats/${beat.id}/edit`}
                    className="label w-fit text-signal underline underline-offset-4 transition-opacity hover:opacity-75 focusable"
                  >
                    {t("beat.draftOwnerLink")}
                  </Link>
                </div>
              ) : null}

              {owner ? (
                <SellerCard
                  username={owner.username}
                  avatarUrl={owner.avatar_url}
                  bio={owner.bio}
                  bioLinks={owner.links}
                  currentUserId={user?.id ?? null}
                  isOwner={isOwner}
                />
              ) : null}
            </div>
          </aside>
        </div>
      </Container>
    </section>
  );
}

function BeatFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-2.5 last:border-b-0">
      <dt className="text-sm text-mute">{label}</dt>
      <dd className="text-sm text-paper">{value}</dd>
    </div>
  );
}