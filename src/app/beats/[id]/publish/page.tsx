import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PublishPanel } from "@/components/publish/publish-panel";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
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

  if (!supabase) redirect("/login?next=/cabinet/upload");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=/beats/${id}/publish`);

  const { data: beat } = await supabase
    .from("beats")
    .select("id, title, bpm, key, tags, prices, is_public, owner_id, files")
    .eq("id", id)
    .maybeSingle();

  if (!beat) notFound();
  if (beat.owner_id !== user.id) redirect(`/beats/${id}`);

  const [connections, posts] = await Promise.all([
    loadConnections(supabase, user.id),
    supabase
      .from("platform_posts")
      .select("platform, status, external_url, error, created_at")
      .eq("beat_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);



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
