import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PublishPanel } from "@/components/publish/publish-panel";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { fileBase, hashtagList, priceLine, typeBeatLine, type DistributionBeat } from "@/lib/distribution";
import { isBotConfigured } from "@/lib/platforms/telegram-client";
import { loadConnections } from "@/lib/platforms/publish";
import { getT } from "@/lib/i18n/server";
import { getSupabase } from "@/lib/supabase/user";

export const metadata: Metadata = {
  title: "Публикация",
  robots: { index: false, follow: false },
};

export default async function PublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, supabase] = await Promise.all([getT(), getSupabase()]);

  if (!supabase) redirect("/login?next=/upload");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=/beats/${id}/publish`);

  const { data: beat } = await supabase
    .from("beats")
    .select("id, title, bpm, key, tags, prices, is_public, owner_id, files, profiles(username)")
    .eq("id", id)
    .maybeSingle();

  if (!beat) notFound();
  if (beat.owner_id !== user.id) redirect(`/beats/${id}`);

  const owner = Array.isArray(beat.profiles) ? beat.profiles[0] : beat.profiles;

  const [connections, posts] = await Promise.all([
    loadConnections(supabase, user.id),
    supabase
      .from("platform_posts")
      .select("platform, status, external_url, error, created_at")
      .eq("beat_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const distributionBeat = {
    id: beat.id,
    title: beat.title,
    artists: [],
    bpm: beat.bpm,
    musicalKey: beat.key,
    tags: beat.tags ?? [],
    prices: (beat.prices ?? { mp3: null, bundle: null, exclusive: null }) as DistributionBeat["prices"],
    audioUrl: null,
    ownerUsername: owner?.username ?? "",
  };

  const pasteFields = [
    { label: "Название", value: distributionBeat.title },
    { label: "Описание", value: `${typeBeatLine(distributionBeat)} · ${beat.bpm} BPM · ${beat.key}` },
    { label: "Теги", value: hashtagList(distributionBeat) },
    { label: "Цены по лицензиям", value: priceLine(distributionBeat) || "не заданы" },
    { label: "Файл MP3 (tagged)", value: `${fileBase(distributionBeat)}_tagged.mp3` },
    { label: "Файл WAV (master)", value: `${fileBase(distributionBeat)}_tagged.wav` },
    { label: "Файлы без тегов", value: `${fileBase(distributionBeat)}_untagged.mp3` },
    { label: "Стены (stems)", value: `${fileBase(distributionBeat)}_stems.zip` },
  ];

  return (
    <section className="py-14 lg:py-20">
      <Container>
        <div className="flex flex-col gap-6 border-b border-line pb-8">
          <span className="flex items-center gap-3">
            <span aria-hidden className="size-1.5 bg-signal" />
            <span className="label text-mute">{t("publish.title")}</span>
          </span>

          <div className="flex flex-wrap items-end justify-between gap-6">
            <h1 className="font-display text-section font-black text-paper uppercase">{beat.title}</h1>
            <div className="flex items-center gap-1.5">
              <Badge tone="outline">{beat.bpm} BPM</Badge>
              <Badge tone="outline">{beat.key}</Badge>
            </div>
          </div>

          <p className="max-w-[68ch] text-sub text-mute">{t("publish.sub")}</p>

          <p className="label text-mute">
            <Link href={`/beats/${id}`} className="underline-offset-4 hover:text-paper hover:underline">
              ← {t("share.title")}
            </Link>
          </p>
        </div>

        <PublishPanel
          beatId={beat.id}
          botReady={isBotConfigured()}
          connections={Object.fromEntries(
            connections.map((connection) => [
              connection.platform,
              { label: connection.label, meta: connection.meta },
            ]),
          )}
          pasteFields={pasteFields}
          posts={(posts.data ?? []).map((post) => ({
            platform: post.platform,
            status: post.status,
            externalUrl: post.external_url,
            error: post.error,
            createdAt: post.created_at,
          }))}
        />
      </Container>
    </section>
  );
}
