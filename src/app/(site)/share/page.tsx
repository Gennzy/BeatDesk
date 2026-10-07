import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ShareBoard } from "@/components/share/share-board";
import { Container } from "@/components/ui/container";
import { fetchBeatsByOwner } from "@/lib/feed";
import { getT } from "@/lib/i18n/server";
import { PLATFORMS } from "@/lib/platforms/registry";
import { getSupabase } from "@/lib/supabase/user";

export const metadata: Metadata = {
  title: "Шейринг",
  description: "Публикация битов в Telegram, ВК и YouTube сразу пачкой.",
  robots: { index: false, follow: false },
};

export default async function SharePage() {
  const [t, supabase] = await Promise.all([getT(), getSupabase()]);

  if (!supabase) redirect("/login?next=/share");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/share");

  const beats = await fetchBeatsByOwner(supabase, user.id, true).catch(() => []);

  const { data: connections } = await supabase
    .from("platform_connections")
    .select("platform, meta")
    .eq("user_id", user.id);

  const connected = new Set<string>();

  for (const connection of connections ?? []) {
    const platform = connection.platform;
    const meta = (connection.meta ?? {}) as Record<string, unknown>;

    // у Telegram токен бота живёт на сервере, достаточно подключённого чата
    const ready = platform === "telegram" ? Boolean(meta.chatId) : true;
    if (ready) connected.add(platform);
  }

  const { data: posts } = await supabase
    .from("platform_posts")
    .select("beat_id, platform, external_url, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const published: Record<string, { platform: string; externalUrl: string | null; createdAt: string }[]> = {};

  for (const post of posts ?? []) {
    const list = (published[post.beat_id] ??= []);
    if (list.length < 4) {
      list.push({ platform: post.platform, externalUrl: post.external_url, createdAt: post.created_at });
    }
  }

  const channels = PLATFORMS.filter(
    (platform) => platform.kind === "api" && !platform.noAutoPublish,
  ).map((platform) => ({ id: platform.id, connected: connected.has(platform.id) }));

  return (
    <section className="py-14 lg:py-20">
      <Container>
        <div className="flex flex-col gap-6 border-b border-line pb-8">
          <span className="flex items-center gap-3">
            <span aria-hidden className="size-1.5 bg-signal" />
            <span className="label text-paper">{t("sharing.eyebrow")}</span>
          </span>

          <h1 className="font-display text-section font-black text-paper uppercase">{t("sharing.heading")}</h1>

          <p className="max-w-[68ch] text-sub text-mute">{t("sharing.sub")}</p>
        </div>

        <ShareBoard beats={beats} channels={channels} published={published} />
      </Container>
    </section>
  );
}