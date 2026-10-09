"use client";

import Link from "next/link";
import { useState } from "react";

import { usePlayer } from "@/components/player/player-provider";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { DiscountPrice, beforePrice } from "@/components/beat/discount-price";
import { TimeAgo } from "@/components/ui/time-ago";
import { useI18n } from "@/lib/i18n/provider";
import { beatToFeedCard, type Post } from "@/lib/posts";
import { useAuthPrompt } from "@/components/posts/auth-prompt-provider";
import { pluralEn, pluralRu } from "@/lib/plural";
import { trackFromBeat } from "@/lib/player";

type Props = {
  post: Post;
  /** Гость лайкнуть не может: показываем плашку входа. */
  loggedIn?: boolean;
  /** Глубина вложенности: корневой пост 0, ответ 1 и так далее. */
  depth?: number;
  /** Показывать линию ветки слева — только внутри страницы ветки. */
  inThread?: boolean;
};

export function PostCard({ post, loggedIn = true, depth = 0, inThread = false }: Props) {
  const { t, locale } = useI18n();
  const { requireAuth } = useAuthPrompt();
  const { track: playing, isPlaying, plays: playingPlays, play, toggle } = usePlayer();

  const [liked, setLiked] = useState(post.likedByMe);
  const [likes, setLikes] = useState(post.likeCount);
  const [busy, setBusy] = useState(false);

  const beat = post.beat;
  const track = beat ? trackFromBeat(beatToFeedCard(beat, post.author)) : null;
  const isBeatPlaying = Boolean(track && playing?.id === track.id && isPlaying);
  const plays = track && playing?.id === track.id ? playingPlays : (beat?.plays ?? 0);

  function togglePreview() {
    if (!track) return;
    if (playing?.id === track.id) toggle();
    else play(track);
  }

  async function toggleLike() {
    if (busy) return;

    // Гостю показываем плашку, а не зажигаем сердечко и тут же гасим:
    // откат без объяснения выглядит как поломка.
    if (!loggedIn) {
      requireAuth("like", post.author.username);
      return;
    }

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

  const repliesLabel =
    post.replyCount > 0
      ? locale === "ru"
        ? `${post.replyCount} ${pluralRu(post.replyCount, "ответ", "ответа", "ответов")}`
        : `${post.replyCount} ${pluralEn(post.replyCount, "reply", "replies")}`
      : t("posts.reply");

  return (
    <article
      className={cn(
        "flex flex-col gap-3 border-b border-line/60 pb-5",
        inThread && depth > 0 && "border-b-0 border-l border-line/60 pl-4",
        depth > 0 && "pt-1",
      )}
    >
      <div className="flex items-center gap-2.5">
        <Link href={`/beatmakers/${post.author.username}`} aria-label={post.author.username}>
          <Avatar username={post.author.username} src={post.author.avatarUrl} />
        </Link>

        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Link
            href={`/beatmakers/${post.author.username}`}
            className="font-display text-sm text-paper uppercase hover:text-bright"
          >
            {post.author.username}
          </Link>
          <TimeAgo iso={post.createdAt} locale={locale} className="text-[11px] text-mute" />
        </div>
      </div>

      {post.body ? <p className="text-sub max-w-[70ch] text-pretty whitespace-pre-wrap text-paper">{post.body}</p> : null}

      {beat ? (
        <div className="surface flex items-center gap-3 p-3">
          <Link href={`/beats/${beat.id}`} className="flex min-w-0 flex-1 items-center gap-3">
            {beat.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={beat.coverUrl} alt="" loading="lazy" decoding="async" className="size-14 shrink-0 rounded-md object-cover" />
            ) : (
              <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-md bg-ink-3 text-[10px] text-mute">
                {beat.bpm}
              </span>
            )}

            <div className="flex w-0 min-w-0 flex-1 flex-col gap-1.5">
              <span className="truncate font-display text-sm text-paper uppercase">{beat.title}</span>
              <span className="mono text-[11px] text-mute">
                {beat.bpm} BPM · {beat.musicalKey}
                {plays > 0 ? ` · ${plays} ${t("posts.playsShort")}` : ""}
              </span>
            </div>

            {beat.prices.mp3 ? (
              <span className="flex shrink-0 items-baseline gap-1.5">
                <span className="label text-mute">{t("posts.from")}</span>
                <DiscountPrice
                  price={beat.prices.mp3}
                  before={beforePrice(beat.pricesBefore, "mp3")}
                  percent={beat.discountPercent}
                  currency={beat.currency}
                />
              </span>
            ) : null}
          </Link>

          {track ? (
            <span
              role="button"
              tabIndex={0}
              onClick={togglePreview}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                togglePreview();
              }}
              className="chip chip-hover shrink-0 px-3 py-1.5"
            >
              {isBeatPlaying ? t("posts.pause") : t("posts.play")}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => void toggleLike()}
          disabled={busy}
          aria-pressed={liked}
          className={cn(
            "label flex items-center gap-1.5 px-2 py-1.5 transition-colors",
            liked ? "text-signal" : "text-mute hover:text-paper",
          )}
        >
          <span aria-hidden>{liked ? "♥" : "♡"}</span>
          {likes > 0 ? likes : t("posts.like")}
        </button>

        <Link
          href={`/posts/${post.id}`}
          className="label px-2 py-1.5 text-mute transition-colors hover:text-paper"
        >
          {repliesLabel}
        </Link>
      </div>
    </article>
  );
}
