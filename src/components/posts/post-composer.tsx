"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import type { FeedBeat } from "@/lib/feed";
import { POST_BODY_LIMIT } from "@/lib/posts";

type Props = {
  /** Куда отправить пост. Для ответа передаётся id родителя. */
  parentId?: string | null;
  beats: FeedBeat[];
  loggedIn: boolean;
  /** Ник автора — для аватара в композере. */
  myUsername?: string | null;
  /** Показать поле бита. Для ответа прикрепление тоже разрешено. */
  withBeat?: boolean;
  autoFocus?: boolean;
  onPosted?: () => void;
};

export function PostComposer({ parentId = null, beats, loggedIn, myUsername, withBeat = true, autoFocus = false, onPosted }: Props) {
  const { t } = useI18n();
  const router = useRouter();

  const [body, setBody] = useState("");
  const [beatId, setBeatId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicBeats = beats.filter((beat) => beat.isPublic);
  const tooLong = body.length > POST_BODY_LIMIT;
  const canSend = !busy && !tooLong && (body.trim().length > 0 || beatId !== null);

  async function submit() {
    if (!canSend) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, beatId, parentId }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? t("posts.needText"));
        return;
      }

      setBody("");
      setBeatId(null);
      onPosted?.();
      router.refresh();
    } catch {
      setError(t("posts.needText"));
    } finally {
      setBusy(false);
    }
  }

  if (!loggedIn) {
    return (
      <div className="flex items-center gap-3 border border-line bg-ink-2 px-4 py-3.5">
        <Avatar username="?" size="sm" className="opacity-40" />
        <a
          href={`/login?next=${encodeURIComponent(parentId ? `/posts/${parentId}` : "/")}`}
          className="text-sub text-mute transition-colors hover:text-paper"
        >
          {t("posts.loginToPost")}
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border border-line bg-ink-2 p-4">
      <div className="flex items-start gap-3">
        <Avatar username={myUsername ?? "?"} size="sm" />
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={t("posts.placeholder")}
          rows={parentId ? 2 : 3}
          maxLength={POST_BODY_LIMIT + 40}
          autoFocus={autoFocus}
          className={cn(
            "w-full resize-y bg-transparent text-sub text-pretty text-paper outline-none placeholder:text-mute",
            tooLong && "text-amber",
          )}
        />
      </div>

      {withBeat && publicBeats.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="label text-mute">{t("posts.pickBeat")}</span>
          <button
            type="button"
            onClick={() => setBeatId(null)}
            className={cn(
              "label border px-2.5 py-1.5 transition-colors",
              beatId === null ? "border-signal bg-signal text-ink" : "border-line text-mute hover:text-paper",
            )}
          >
            {t("posts.noBeat")}
          </button>
          {publicBeats.slice(0, 6).map((beat) => (
            <button
              key={beat.id}
              type="button"
              onClick={() => setBeatId(beat.id === beatId ? null : beat.id)}
              className={cn(
                "label max-w-52 truncate border px-2.5 py-1.5 transition-colors",
                beatId === beat.id ? "border-signal bg-signal text-ink" : "border-line text-mute hover:text-paper",
              )}
            >
              {beat.title}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={!canSend} onClick={() => void submit()}>
          {busy ? t("posts.publishing") : parentId ? t("posts.sendReply") : t("posts.publish")}
        </Button>

        <span className={cn("label", tooLong ? "text-amber" : "text-mute")}>
          {body.length}/{POST_BODY_LIMIT}
        </span>

        {error ? <span className="label text-amber">{error}</span> : null}
      </div>
    </div>
  );
}