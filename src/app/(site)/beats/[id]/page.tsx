import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BeatCover } from "@/components/beat/beat-cover";
import { BeatStats } from "@/components/beat/beat-stats";
import { LicenseTerms } from "@/components/beat/license-terms";
import { SellerCard } from "@/components/beat/seller-card";
import { BeatShare } from "@/components/beat/beat-share";
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
    .select("title, tags, bpm, key, cover_url, profiles(username)")
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
    "id, title, type_beat_artists, bpm, key, tags, genre, mp3_url, cover_url, prices, currency, sale_state, owner_id, plays, views, impressions, created_at, profiles(id, username, avatar_url, bio, links, level)";
  const SAFE_COLUMNS =
    "id, title, type_beat_artists, bpm, key, tags, mp3_url, cover_url, prices, currency, sale_state, owner_id, plays, created_at, profiles(id, username, avatar_url, bio, links)";

  let result = await supabase.from("beats").select(FULL_COLUMNS).eq("id", id).maybeSingle();

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

  const createdLabel = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(beat.created_at),
  );

  return (
    <section className="py-8 lg:py-12">
      <Container>
        {/* Хлебные крошки: показывают, где человек находится, и дают ссылку
            назад в каталог одним кликом. */}
        <nav aria-label={t("beat.breadcrumb")} className="flex flex-wrap items-center gap-2 text-xs text-mute">
          <Link href="/" className="transition-colors hover:text-paper">
            {t("beat.crumbHome")}
          </Link>
          <Icon name="chevronRight" className="size-3 text-mute/50" />
          <span>{t("beat.crumbCatalog")}</span>
        </nav>

        <h1 className="mt-5 max-w-4xl font-display text-3xl leading-tight font-black text-paper lg:text-5xl">
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
                  plays={beat.plays ?? 0}
                />

                {beat.tags && beat.tags.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {beat.tags.map((tag: string) => (
                      <Link
                        key={tag}
                        href={`/?q=${encodeURIComponent(tag)}`}
                        className="rounded-pill border border-line px-2.5 py-1 text-xs text-mute transition-colors hover:border-line-2 hover:text-paper"
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
                    {beat.genre ? <BeatFact label={t("beat.genreLabel")} value={beat.genre} /> : null}
                    {beat.type_beat_artists && beat.type_beat_artists.length > 0 ? (
                      <BeatFact label={t("feed.typeOf")} value={beat.type_beat_artists.join(", ")} />
                    ) : null}
                  </dl>
                </section>

                <LicenseTerms tiers={tiers} />

                <BeatShare beatId={beat.id} title={beat.title} />
              </div>
            </div>

            <BeatOffer beatId={beat.id} tiers={tiers} currency={beat.currency ?? "RUB"} isOwner={isOwner} />
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
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-2.5">
      <dt className="text-sm text-mute">{label}</dt>
      <dd className="text-sm text-paper">{value}</dd>
    </div>
  );
}