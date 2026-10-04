import type { Metadata } from "next";
import { notFound } from "next/navigation";

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
  robots: { index: true, follow: true },
};

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, supabase] = await Promise.all([getT(), getSupabase()]);

  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase) notFound();

  const thread = await fetchThread(supabase, id, user?.id ?? null);
  if (!thread.root) notFound();

  const myBeats = user ? await fetchBeatsByOwner(supabase, user.id, true).catch(() => []) : [];

  return (
    <section className="py-14 lg:py-20">
      <Container>
        <div className="flex flex-col gap-6 border-b border-line pb-8">
          <span className="flex items-center gap-3">
            <span aria-hidden className="size-1.5 bg-signal" />
            <span className="label text-mute">{t("posts.thread")}</span>
          </span>
          <h1 className="font-display text-section font-black text-paper uppercase">{thread.root.author.username}</h1>
        </div>

        <div className="flex flex-col gap-6 pt-8">
          <PostCard post={thread.root} />

          <PostComposer
            parentId={thread.root.id}
            beats={myBeats}
            loggedIn={Boolean(user)}
            autoFocus
          />

          <ReplyThread
            rootId={thread.root.id}
            initial={thread.replies}
            totalReplies={thread.totalReplies}
            maxDepth={THREAD_RENDER_DEPTH}
          />
        </div>
      </Container>
    </section>
  );
}