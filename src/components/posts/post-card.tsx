"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { usePlayer } from "@/components/player/player-provider";
import { beatToFeedCard } from "@/lib/posts";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/dates";
import { useI18n } from "@/lib/i18n/provider";
import type { Post } from "@/lib/posts";
import { trackFromBeat } from "@/lib/player";
import { pluralEn, pluralRu } from "@/lib/plural";

type Props = {
  post: Post;
  /** Глубина вложенности: корневой пост 0, ответ 1 и так далее. */
  depth?: number;
  /** Показывать линию ветки слева — только внутри страницы ветки. */
  inThread?: boolean;
};

export function PostCard({ post, depth = 0, inThread = false }: Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { track: playing, isPlaying, play, toggle } = usePlayer();

  const [liked, setLiked] = useState(post.likedByMe);
  const [likes, setLikes] = useState(post.likeCount);
  const [busy, setBusy] = useState(false);

  const beat = post.beat;
  const track = beat ? trackFromBeat(beatToFeedCard(beat, post.author)) : null;
  const isBeatPlaying = Boolean(track && playing?.id === track.id && isPlaying);

  function togglePreview() {
    if (!track) return;
    if (playing?.id === track.id) toggle();
    else play(track);
  }

  async function toggleLike() {
    if (busy) return;
    setBusy(true);

    // Меняем счётчик сразу и откатываем при ошибке: так отклик ощущается
    // мгновенным, а расхождение с сервером не остаётся навсегда.
    const next = !liked;
    setLiked(next);
    setLikes((value) => Math.max(0, value + (next ? 1 : -1)));

    try {
      const response = await fetch(`/api/posts/${post.id}/like`, { method: next ? "POST" : "DELETE" });
      if (!response.ok) throw new Error("like failed");
    } catch {
      setLiked(!next);
      setLikes((value) => Math.max(0, value + (next ? -1 : 1)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={cn(
        "flex flex-col gap-3 bg-ink-2 p-4",
        inThread && depth > 0 && "border-l border-line pl-3",
        depth > 0 && "mt-2",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/beatmakers/${post.author.username}`} className="label text-paper hover:underline">
          @{post.author.username}
        </Link>
        <span aria-hidden className="text-mute/50">
          ·
        </span>
        <time dateTime={post.createdAt} className="label text-mute">
          {timeAgo(post.createdAt, locale)}
        </time>
      </div>

      {post.body ? <p className="text-sub whitespace-pre-wrap text-paper">{post.body}</p> : null}

      {beat ? (
        <Link
          href={`/beats/${beat.id}`}
          className="group flex items-center gap-3 border border-line bg-ink-3 p-2.5 transition-colors hover:border-line-2"
        >
          {beat.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={beat.coverUrl} alt="" loading="lazy" decoding="async" className="size-14 shrink-0 object-cover" />
          ) : (
            <span aria-hidden className="size-14 shrink-0 bg-ink-2" />
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate font-display text-sm text-paper uppercase">{beat.title}</span>
            <span className="mono text-[11px] text-mute">
              {beat.bpm} BPM · {beat.musicalKey}
            </span>
          </div>

          {beat.mp3Url ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                togglePreview();
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                togglePreview();
              }}
              className="label shrink-0 border border-line px-2.5 py-1.5 text-mute transition-colors hover:border-signal/60 hover:text-paper"
            >
              {isBeatPlaying ? t("posts.pause") : t("posts.play")}
            </span>
          ) : null}
        </Link>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => void toggleLike()}
          disabled={busy}
          aria-pressed={liked}
          className={cn(
            "label flex items-center gap-1.5 transition-colors",
            liked ? "text-signal" : "text-mute hover:text-paper",
          )}
        >
          <span aria-hidden>{liked ? "♥" : "♡"}</span>
          {likes > 0 ? likes : t("posts.like")}
        </button>

        {post.replyCount > 0 || depth === 0 ? (
          <Link
            href={`/posts/${post.id}`}
            className="label text-mute transition-colors hover:text-paper"
          >
            {post.replyCount > 0
              ? locale === "ru"
                ? `${post.replyCount} ${pluralRu(post.replyCount, "ответ", "ответа", "ответов")}`
                : `${post.replyCount} ${pluralEn(post.replyCount, "reply", "replies")}`
              : t("posts.reply")}
          </Link>
        ) : null}
      </div>

      {depth === 0 && post.replyCount === 0 ? (
        <Badge tone="dim" className="w-fit">
          {t("posts.threadHint")}
        </Badge>
      ) : null}
    </article>
  );
}