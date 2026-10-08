import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PostCard } from "@/components/posts/post-card";
import { PostComposer } from "@/components/posts/post-composer";
import { ReplyThread } from "@/components/posts/reply-thread";
import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";
import { THREAD_RENDER_DEPTH, fetchThread } from "@/lib/posts";
import { getSupabase } from "@/lib/supabase/user";
import { fetchBeatsByOwner } from "@/lib/feed";

export const metadata: Metadata = {
  title: "Ветка",
  robots: { index: false, follow: false },
};

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, supabase] = await Promise.all([getT(), getSupabase()]);

  if (!supabase) notFound();

  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect(`/login?next=/posts/${id}`);

  const thread = await fetchThread(supabase, id, user.id);
  if (!thread.root) notFound();

  const myBeats = await fetchBeatsByOwner(supabase, user.id, true).catch(() => []);

  return (
    <section className="py-14 lg:py-20">
      <Container>
        <div className="flex flex-col gap-6 border-b border-line pb-8">
          <span className="flex items-center gap-3">
            <span aria-hidden className="size-1.5 bg-mute/50" />
            <span className="label text-mute">{t("posts.thread")}</span>
          </span>
          <h1 className="font-display text-section font-semibold text-paper uppercase">{thread.root.author.username}</h1>
        </div>

        <div className="flex flex-col gap-6 pt-8">
          <PostCard post={thread.root} />

          <PostComposer parentId={thread.root.id} beats={myBeats} autoFocus />

          <ReplyThread rootId={thread.root.id} initial={thread.replies} maxDepth={THREAD_RENDER_DEPTH} />
        </div>
      </Container>
    </section>
  );
}