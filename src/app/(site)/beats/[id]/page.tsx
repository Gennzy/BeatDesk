import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BeatHero, type BeatHeroData } from "@/components/beat/beat-hero";
import { BeatOffer } from "@/components/sales/beat-offer";
import { Container } from "@/components/ui/container";
import { normalizePrices, PRICE_KEYS, priceLabel } from "@/lib/prices";
import { getSupabase } from "@/lib/supabase/user";



export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await getSupabase();
  if (!supabase) return { title: "Раздача" };

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

export default async function BeatDistributionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabase();

  if (!supabase) {
    notFound();
  }

  const { data: beat } = await supabase
    .from("beats")
    .select("id, title, type_beat_artists, bpm, key, tags, mp3_url, cover_url, prices, currency, sale_state, owner_id, profiles(username, avatar_url)")
    .eq("id", id)
    .maybeSingle();

  if (!beat) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const owner = Array.isArray(beat.profiles) ? beat.profiles[0] : beat.profiles;
  const isOwner = Boolean(user && user.id === beat.owner_id);

  const prices = normalizePrices(beat.prices);
  const tiers = PRICE_KEYS.map((key) => ({
    key,
    label: priceLabel[key],
    value: prices[key],
  })).filter((tier) => tier.value !== null) as { key: (typeof PRICE_KEYS)[number]; label: string; value: number }[];

  return (
    <section className="py-14 lg:py-20">
      <Container>
        <BeatHero
          beat={{
            id: beat.id,
            title: beat.title,
            username: owner?.username ?? "",
            avatarUrl: owner?.avatar_url ?? null,
            coverUrl: beat.cover_url ?? null,
            audioUrl: beat.mp3_url ?? null,
            bpm: beat.bpm,
            musicalKey: beat.key,
            tags: beat.tags ?? [],
            typeBeatArtists: beat.type_beat_artists ?? [],
            saleState: (beat.sale_state ?? "draft") as BeatHeroData["saleState"],
          }}
          isOwner={isOwner}
        />

        <div className="pt-10">
          <BeatOffer beatId={beat.id} tiers={tiers} currency={beat.currency ?? "RUB"} isOwner={isOwner} />
        </div>
      </Container>
    </section>
  );
}
