"use client";

import { useCallback, useState } from "react";

import { PostCard } from "@/components/posts/post-card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";
import type { Post } from "@/lib/posts";
import { useRealtime } from "@/lib/realtime";

type Props = {
  rootId: string;
  initial: Post[];
  maxDepth: number;
  loggedIn?: boolean;
};

/**
 * Ответы внутри ветки. Глубокие уровни сворачиваются: без этого один
 * спорный ответ разворачивает на экране двадцать экранов текста.
 */
export function ReplyThread({ rootId, initial, maxDepth, loggedIn = true }: Props) {
  const { t } = useI18n();

  const [extra, setExtra] = useState<Post[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(initial.length > 0 ? initial.length : null);
  const [loading, setLoading] = useState(false);
  // В ветке споришь с кем-то прямо сейчас: ответ, написанный другим,
  // должен появиться без перезагрузки.
  const [live, setLive] = useState<Post[]>([]);

  const pull = useCallback(async () => {
    const response = await fetch(`/api/posts/${rootId}/replies?offset=0`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;

    const data = (await response.json()) as { replies?: Post[] };
    setLive((prev) => {
      const seen = new Set([...initial, ...extra, ...prev].map((post) => post.id));
      const fresh = (data.replies ?? []).filter((post) => !seen.has(post.id));
      return fresh.length > 0 ? [...fresh, ...prev] : prev;
    });
  }, [extra, initial, rootId]);

  useRealtime("posts", () => void pull());

  const all = [...live, ...initial, ...extra];
  const byParent = new Map<string, Post[]>();
  for (const post of all) {
    if (!post.parentId) continue;
    const bucket = byParent.get(post.parentId) ?? [];
    bucket.push(post);
    byParent.set(post.parentId, bucket);
  }

  const rendered = new Set<string>();

  function renderLevel(parentId: string, depth: number): React.ReactNode {
    const children = byParent.get(parentId) ?? [];
    if (children.length === 0) return null;

    return children.map((post) => {
      rendered.add(post.id);
      const deeper = depth + 1 < maxDepth;
      const descendants = deeper ? renderLevel(post.id, depth + 1) : null;

      return (
        <div key={post.id}>
          <PostCard post={post} loggedIn={loggedIn} depth={depth + 1} inThread />
          {descendants}
        </div>
      );
    });
  }

  async function loadMore() {
    if (loading || nextOffset === null) return;
    setLoading(true);

    try {
      const response = await fetch(`/api/posts/${rootId}/replies?offset=${nextOffset}`, { cache: "no-store" });
      const data = (await response.json()) as { replies?: Post[]; nextOffset?: number | null };

      const seen = new Set(all.map((post) => post.id));
      setExtra((prev) => [...prev, ...(data.replies ?? []).filter((post) => !seen.has(post.id))]);
      setNextOffset(data.nextOffset ?? null);
    } finally {
      setLoading(false);
    }
  }

  // Порядок важен: rendered наполняется только пока вызывается renderLevel,
  // поэтому дерево строим раньше, чем считаем то, что в него не попало.
  const tree = renderLevel(rootId, 0);
  const hidden = all.filter((post) => !rendered.has(post.id));

  return (
    <div className="flex flex-col gap-3">
      <h2 className="label flex items-center gap-2 border-b border-line pb-3 text-paper">
        {t("posts.repliesTitle")}
        {all.length > 0 ? <span className="text-mute">{all.length}</span> : null}
      </h2>

      {all.length === 0 ? <p className="text-sub text-mute">{t("posts.empty")}</p> : tree}

      {hidden.length > 0 ? (
        <details className="border border-line bg-ink-2 p-3">
          <summary className="label cursor-pointer text-mute">{t("posts.collapsedReplies")}: {hidden.length}</summary>
          <div className="mt-3 flex flex-col gap-2">
            {hidden.map((post) => (
              <PostCard key={post.id} post={post} loggedIn={loggedIn} depth={1} inThread />
            ))}
          </div>
        </details>
      ) : null}

      {nextOffset !== null ? (
        <Button variant="ink" size="sm" disabled={loading} onClick={() => void loadMore()} className="w-fit">
          {t("posts.moreReplies")}
        </Button>
      ) : null}
    </div>
  );
}