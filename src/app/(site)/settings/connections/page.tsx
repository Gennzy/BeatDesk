import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ConnectionsBoard, type ConnectionRow } from "@/components/platforms/connections-board";
import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";
import { platformsByGroup, type PlatformGroup } from "@/lib/platforms/registry";
import { loadConnections } from "@/lib/platforms/publish";
import { getSupabase } from "@/lib/supabase/user";

export const metadata: Metadata = {
  title: "Площадки",
  robots: { index: false, follow: false },
};

const GROUPS: PlatformGroup[] = ["broadcast", "market", "distribution"];

export default async function ConnectionsPage() {
  const [t, supabase] = await Promise.all([getT(), getSupabase()]);

  if (!supabase) redirect("/login?next=/settings/connections");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/settings/connections");

  const connections = await loadConnections(supabase, user.id);

  const connected: ConnectionRow[] = connections.map((connection) => ({
    platform: connection.platform,
    label: connection.label,
    meta: (connection.meta ?? {}) as Record<string, unknown>,
    hasToken: Boolean(connection.accessTokenCipher),
    connectedAt: connection.createdAt,
  }));

  return (
    <section className="py-14 lg:py-20">
      <Container>
        <div className="flex flex-col gap-6 border-b border-line pb-8">
          <span className="flex items-center gap-3">
            <span aria-hidden className="size-1.5 bg-signal" />
            <span className="label text-mute">{t("connections.title")}</span>
          </span>

          <h1 className="font-display text-section font-black text-paper uppercase">{t("connections.heading")}</h1>

          <p className="max-w-[68ch] text-sub text-mute">{t("connections.sub")}</p>
        </div>

        <ConnectionsBoard
          connected={connected}
          platforms={GROUPS.flatMap((group) => platformsByGroup(group))}
          groups={GROUPS}
        />
      </Container>
    </section>
  );
}
