import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { NotificationsList } from "@/components/posts/notifications-list";
import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import type { Notification } from "@/app/api/notifications/route";

export const metadata: Metadata = {
  title: "Уведомления",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 20;

export default async function NotificationsPage() {
  const [t, supabase] = await Promise.all([getT(), createClient()]);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/notifications");

  const { data } = await supabase
    .from("notifications")
    .select("id, kind, post_id, beat_id, order_id, read_at, created_at, posts(body, parent_id), beats(title), profiles!notifications_actor_id_fkey(username, avatar_url)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const rows = (data ?? []) as {
    id: string;
    kind: Notification["kind"];
    post_id: string | null;
    beat_id: string | null;
    order_id: string | null;
    read_at: string | null;
    created_at: string;
    posts: { body: string } | { body: string }[] | null;
    beats: { title: string } | { title: string }[] | null;
    profiles: { username: string; avatar_url: string | null } | { username: string; avatar_url: string | null }[] | null;
  }[];

  const initial: Notification[] = rows.map((row) => {
    const actor = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const post = Array.isArray(row.posts) ? row.posts[0] : row.posts;
    const beat = Array.isArray(row.beats) ? row.beats[0] : row.beats;

    return {
      id: row.id,
      kind: row.kind,
      actorUsername: actor?.username ?? "",
      actorAvatar: actor?.avatar_url ?? null,
      postId: row.post_id,
      postExcerpt: post?.body ? post.body.slice(0, 120) : null,
      beatId: row.beat_id,
      beatTitle: beat?.title ?? null,
      orderId: row.order_id,
      readAt: row.read_at,
      createdAt: row.created_at,
    };
  });

  return (
    <section className="py-14 lg:py-20">
      <Container>
        <div className="flex flex-col gap-5 pb-6">
          <h1 className="font-display text-title font-black text-paper uppercase">{t("notifications.title")}</h1>
          <p className="text-sm text-mute">{t("notifications.subtitle")}</p>
        </div>

        <NotificationsList initial={initial} />
      </Container>
    </section>
  );
}