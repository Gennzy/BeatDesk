import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EditBeatForm } from "@/components/profile/edit-beat-form";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { beatRoles } from "@/lib/beats";
import { getT } from "@/lib/i18n/server";
import { normalizeGenre } from "@/lib/beat-validation";
import { normalizePrices } from "@/lib/prices";
import type { SaleState } from "@/lib/sales/state";
import { getSupabase } from "@/lib/supabase/user";

export const metadata: Metadata = {
  title: "Правка бита",
  robots: { index: false, follow: false },
};

export default async function EditBeatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, supabase] = await Promise.all([getT(), getSupabase()]);

  if (!supabase) redirect(`/login?next=/beats/${id}/edit`);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=/beats/${id}/edit`);

  const { data: beat } = await supabase
    .from("beats")
    .select("id, title, type_beat_artists, bpm, key, tags, genre, prices, prices_before, discount_percent, is_public, sale_state, mp3_url, cover_url, owner_id, files")
    .eq("id", id)
    .maybeSingle();

  if (!beat) notFound();
  if (beat.owner_id !== user.id) redirect(`/beats/${id}`);

  return (
    <section className="py-14 lg:py-20">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
          <div className="flex flex-col gap-4">
            <span className="flex items-center gap-3">
              <span aria-hidden className="size-1.5 bg-mute/50" />
              <span className="label text-mute">{t("edit.title")}</span>
            </span>
            <h1 className="font-display text-section font-semibold text-paper uppercase">{beat.title}</h1>
          </div>

          <div className="flex flex-col items-end gap-4">
            <div className="flex items-center gap-1.5">
              <Badge tone="outline">{beat.bpm} BPM</Badge>
              <Badge tone="outline">{beat.key}</Badge>
            </div>
            <Link
              href={`/beats/${id}`}
              className="label text-mute underline-offset-4 hover:text-paper hover:underline"
            >
              <span aria-hidden>←</span> {t("beat.backToBeat")}
            </Link>
          </div>
        </div>

        <div className="pt-10">
          <EditBeatForm
            beat={{
              id: beat.id,
              title: beat.title,
              artists: beat.type_beat_artists ?? [],
              bpm: beat.bpm,
              musicalKey: beat.key,
              tags: beat.tags ?? [],
              genre: normalizeGenre(beat.genre),
              // Состояние продажи решает, доступен ли переключатель: у
              // придержанного заказа снять с продажи нельзя.
              saleState: (beat.sale_state ?? "draft") as SaleState,
              prices: normalizePrices(beat.prices),
              discountPercent: beat.discount_percent ?? 0,
              pricesBefore: beat.prices_before ? normalizePrices(beat.prices_before) : null,
              isPublic: beat.is_public,
              coverUrl: beat.cover_url,
              hasStems: Boolean(beat.files?.zip ?? beat.files?.rar),
              hasWav: Boolean(beat.files?.wav),
              // Форме нужно знать, что уже лежит, иначе человек не отличил бы
              // «файла нет» от «файл есть, но я его не вижу».
              files: beat.files,
              hasPreview: Boolean(beat.mp3_url),
              // Путь в баке начинается с владельца: без него файл положил бы
              // не в свою папку.
              userId: user.id,
              fileRoles: beatRoles({
                keys: Object.keys(beat.files ?? {}),
                hasPreview: Boolean(beat.mp3_url),
                hasCover: Boolean(beat.cover_url),
              }),
            }}
          />
        </div>
      </Container>
    </section>
  );
}