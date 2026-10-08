"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Форма отзыва о битмейкере после оплаченной покупки.
 *
 * Отзыв привязан к позиции заказа, а не к биту: купил один раз — сказал один
 * раз. Право на вставку проверяет триггер в базе (0025), здесь же только
 * спрашиваем оценку и текст.
 */
export function ReviewForm({
  orderItemId,
  beatTitle,
}: {
  orderItemId: string;
  beatTitle: string;
}) {
  const { t } = useI18n();

  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = body.trim().length > 0 && body.trim().length < 10;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (rating === 0) {
      setError(t("review.needRating"));
      return;
    }

    // Текст необязателен, но если человек что-то пишет, это должно быть
    // объяснением, а не «спс». Такую же проверку дублирует триггер.
    if (tooShort) {
      setError(t("review.tooShort"));
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderItemId, rating, body: body.trim() || null }),
      });

      if (response.status === 409) {
        setDone(true);
        return;
      }

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? t("review.failed"));
        return;
      }

      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 border border-line-2 bg-ink-3 px-3 py-2">
        <Icon name="check" className="size-4 text-paper" />
        <span className="text-xs text-paper">{t("review.sent")}</span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border border-line bg-ink-2 p-3">
      <span className="label text-paper">{t("review.title")}</span>

      <div className="flex items-center gap-1" role="radiogroup" aria-label={t("review.rating")}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} ${t("review.ofFive")}`}
            onClick={() => setRating(value)}
            className={cn(
              "grid size-8 place-items-center border transition-colors",
              rating >= value ? "border-signal text-signal" : "border-line text-mute hover:text-paper",
            )}
          >
            <Icon name="heart" className="size-3.5" filled={rating >= value} />
          </button>
        ))}
      </div>

      <textarea
        name="body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={2}
        maxLength={600}
        placeholder={t("review.placeholder")}
        aria-label={t("review.placeholder")}
        className="control resize-y py-2 text-sm"
      />

      {error ? <p className="text-xs text-amber">{error}</p> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="ink" size="sm" disabled={busy}>
          {t("review.submit")}
        </Button>
        <span className="truncate text-[11px] text-mute">{beatTitle}</span>
      </div>
    </form>
  );
}