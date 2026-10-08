"use client";

import Link from "next/link";
import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TimeAgo } from "@/components/ui/time-ago";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/provider";

export type BeatComment = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
  authorUsername: string | null;
  authorAvatar: string | null;
  parentId: string | null;
};

/**
 * Обсуждение под битом.
 *
 * Форма одна на всё: чтобы написать первый комментарий и чтобы ответить,
 * иначе на странице оказалось бы две почти одинаковые формы.
 *
 * Ветка показывается на один уровень глубже — на два запрещает база. Вложенность
 * третьего уровня на телефоне превращается в лестницу в одну колонку, которую
 * невозможно читать.
 */
export function BeatComments({
  beatId,
  initial,
  loggedInUserId,
}: {
  beatId: string;
  initial: BeatComment[];
  loggedInUserId: string | null;
}) {
  const { t } = useI18n();
  const toast = useToast();

  const [comments, setComments] = useState(initial);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const roots = comments.filter((comment) => comment.parentId === null);
  const repliesOf = (id: string) => comments.filter((comment) => comment.parentId === id);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = event.currentTarget;
    const field = form.elements.namedItem("body") as HTMLTextAreaElement | null;
    const text = field?.value.trim() ?? "";

    if (!text) return;

    setBusy(true);

    try {
      const response = await fetch("/api/beats/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beatId, parentId: replyTo, body: text }),
      });

      if (response.status === 409) {
        toast.show({ icon: "close", title: t("comments.alreadyAnswered") });
        return;
      }

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.show({ icon: "close", title: data?.error ?? t("comments.failed") });
        return;
      }

      // Комментарий появляется сразу: перечитывать страницу из-за одной строки
      // не нужно, а ответ на свой же комментарий человек ждёт секундуми.
      setComments((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          body: text,
          createdAt: new Date().toISOString(),
          authorId: loggedInUserId,
          authorUsername: null,
          authorAvatar: null,
          parentId: replyTo,
        },
      ]);

      setReplyTo(null);
      form.reset();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const response = await fetch(`/api/beats/comments?id=${id}`, { method: "DELETE" });

    if (response.ok) {
      // Ответы удалённого комментария уходят вместе с ним: база каскадом
      // сносит ветку, и оставлять её в разметке нельзя.
      setComments((prev) => {
        const doomed = new Set([id]);
        let changed = true;

        while (changed) {
          changed = false;
          for (const comment of prev) {
            if (comment.parentId && doomed.has(comment.parentId) && !doomed.has(comment.id)) {
              doomed.add(comment.id);
              changed = true;
            }
          }
        }

        return prev.filter((comment) => !doomed.has(comment.id));
      });
      return;
    }

    toast.show({ icon: "close", title: t("comments.deleteFailed") });
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
        <h2 className="label text-mute">{t("comments.title")}</h2>
        {comments.length > 0 ? <span className="font-mono text-xs text-mute tabular-nums">{comments.length}</span> : null}
      </div>

      {loggedInUserId ? (
        <form onSubmit={submit} className="flex flex-col gap-2">
          {replyTo ? (
            <p className="flex items-center gap-2 text-xs text-mute">
              {t("comments.replying")}
              <button type="button" onClick={() => setReplyTo(null)} className="text-paper underline underline-offset-4">
                {t("comments.cancel")}
              </button>
            </p>
          ) : null}

          <textarea
            name="body"
            rows={2}
            maxLength={1000}
            required
            placeholder={t("comments.placeholder")}
            aria-label={t("comments.placeholder")}
            className="control resize-y py-2 text-sm"
          />

          <div className="flex justify-end">
            <Button type="submit" variant="ink" size="sm" disabled={busy}>
              {t("comments.submit")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-mute">
          <Link href="/login" className="text-paper underline underline-offset-4">
            {t("comments.signIn")}
          </Link>
        </p>
      )}

      {roots.length === 0 ? (
        <p className="text-sm text-mute">{t("comments.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-5">
          {roots.map((comment) => (
            <li key={comment.id} className="flex flex-col gap-3">
              <CommentRow
                comment={comment}
                canDelete={comment.authorId !== null && comment.authorId === loggedInUserId}
                onReply={() => setReplyTo(comment.id)}
                onDelete={() => void remove(comment.id)}
              />

              {repliesOf(comment.id).length > 0 ? (
                <ul className="flex flex-col gap-3 border-l border-line pl-4 sm:pl-6">
                  {repliesOf(comment.id).map((reply) => (
                    <CommentRow
                      key={reply.id}
                      comment={reply}
                      canDelete={reply.authorId !== null && reply.authorId === loggedInUserId}
                      onReply={() => setReplyTo(comment.id)}
                      onDelete={() => void remove(reply.id)}
                    />
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentRow({
  comment,
  canDelete,
  onReply,
  onDelete,
}: {
  comment: BeatComment;
  canDelete: boolean;
  onReply: () => void;
  onDelete: () => void;
}) {
  const { t, locale } = useI18n();

  // У только что отправленного комментария ника нет: рисовать «@ты» вместо
  // ссылки на профиль было бы враньём, поэтому имя выводится текстом.
  const profileHref = comment.authorUsername ? `/beatmakers/${comment.authorUsername}` : null;
  const name = comment.authorUsername ? `@${comment.authorUsername}` : t("comments.anonymous");

  return (
    <div className="flex gap-3">
      {profileHref ? (
        <Link href={profileHref} className="shrink-0">
          <Avatar username={comment.authorUsername ?? "?"} src={comment.authorAvatar} size="sm" />
        </Link>
      ) : (
        <span className="shrink-0">
          <Avatar username={name} size="sm" />
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {profileHref ? (
            <Link href={profileHref} className="label text-paper">
              {name}
            </Link>
          ) : (
            <span className="label text-paper">{name}</span>
          )}
          <TimeAgo iso={comment.createdAt} locale={locale} className="label text-mute" />
        </div>

        <p className="text-sm leading-relaxed whitespace-pre-wrap text-mute">{comment.body}</p>

        <div className="flex items-center gap-4">
          <button type="button" onClick={onReply} className="label text-mute transition-colors hover:text-paper">
            {t("comments.reply")}
          </button>

          {canDelete ? (
            <button
              type="button"
              onClick={onDelete}
              aria-label={t("comments.delete")}
              className="text-mute transition-colors hover:text-amber"
            >
              <Icon name="trash" className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}