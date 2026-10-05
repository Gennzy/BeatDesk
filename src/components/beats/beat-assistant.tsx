"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";

import type { BeatSuggestion } from "@/lib/ai/beat-suggestion";

type Props = {
  beat: {
    id: string;
    bpm: number;
    musicalKey: string;
    tags: string[];
    artists: string[];
    title: string;
  };
  hasStems: boolean;
  hasWav: boolean;
  /** Ставит значения в поля формы от имени пользователя. */
  onApply: (patch: { title?: string; description?: string; tags?: string }) => void;
};

/**
 * Подсказки по оформлению бита.
 *
 * Кнопка вместо автоматического заполнения: описание бита пишет человек,
 * и молча подставить чужой текст в его карточку нельзя. Модель
 * предлагает, решение остаётся за ним.
 */
export function BeatAssistant({ beat, hasStems, hasWav, onApply }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<BeatSuggestion | null>(null);

  const ask = useCallback(async () => {
    setState("loading");
    setError(null);

    try {
      const response = await fetch("/api/ai/beat-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: beat.title,
          bpm: beat.bpm,
          key: beat.musicalKey,
          tags: beat.tags,
          artists: beat.artists,
          hasStems,
          hasWav,
        }),
      });

      const data = (await response.json()) as BeatSuggestion & { error?: string };

      if (!response.ok) {
        setError(data.error ?? t("edit.aiError"));
        setState("error");
        return;
      }

      setSuggestion(data);
      setState("done");
    } catch {
      setError(t("edit.aiError"));
      setState("error");
    }
  }, [beat, hasStems, hasWav, t]);

  return (
    <div className="flex flex-col gap-4 border border-line bg-ink-2 px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="label text-paper">{t("edit.aiTitle")}</span>
          <p className="max-w-[60ch] text-sm text-mute">{t("edit.aiHint")}</p>
        </div>

        <Button type="button" size="sm" variant="signal" disabled={state === "loading"} onClick={() => void ask()}>
          {state === "loading" ? t("edit.aiThinking") : t("edit.aiAsk")}
        </Button>
      </div>

      {error ? <p className="text-sm text-amber">{error}</p> : null}

      {suggestion ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="label text-mute">{t("edit.aiTitles")}</span>
            <ul className="flex flex-wrap gap-2">
              {suggestion.titles.map((title) => (
                <li key={title}>
                  <button
                    type="button"
                    onClick={() => onApply({ title })}
                    className={cn(
                      "border border-line-2 px-3 py-1.5 text-sm text-paper transition-colors",
                      "hover:border-signal",
                    )}
                  >
                    {title}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <span className="label text-mute">{t("edit.aiDescription")}</span>
            <p className="max-w-[68ch] text-sm leading-relaxed text-paper">{suggestion.description}</p>
          </div>

          {suggestion.tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="label text-mute">{t("edit.aiTags")}</span>
              <ul className="flex flex-wrap gap-1.5">
                {suggestion.tags.map((tag) => (
                  <li key={tag} className="border border-line-2 px-2 py-0.5 text-xs text-mute">
                    {tag}
                  </li>
                ))}
              </ul>
              <Button type="button" size="sm" variant="ink" onClick={() => onApply({ tags: suggestion.tags.join(", ") })}>
                {t("edit.aiApplyTags")}
              </Button>
            </div>
          ) : null}

          {suggestion.notes.length > 0 ? (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-mute">
              {suggestion.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
