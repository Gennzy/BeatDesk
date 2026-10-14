"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import {
  buildPulseMetadata,
  pulseMetadataProblem,
  DESCRIPTION_LIMIT,
  TAGS_LIMIT,
  TITLE_LIMIT,
  type PulseTemplate,
} from "@/lib/pulse/metadata";
import { renderBeatVideo } from "@/lib/pulse/render-video";
import { sendChunks, watchUrlOf } from "@/lib/pulse/client-upload";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Мастер публикации бита на YouTube.
 *
 * Метаданные собираются на устройстве из данных бита, а не просятся у
 * сервера: правила лимитов и юридический текст лежат в одном модуле, и
 * проверить их можно тестами, без сети.
 *
 * Видеофайл на этом шаге ещё не собран. Сборка идёт в браузере, и до неё
 * есть смысл дойти только с готовыми метаданными: если название не влезает
 * в лимит YouTube, человек узнает об этом здесь, а не через двадцать минут
 * рендера.
 */

type Beat = {
  id: string;
  title: string;
  bpm: number;
  musicalKey: string;
  genre: string | null;
  genreLabel: string | null;
  tags: string[];
  artists: string[];
  coverUrl: string | null;
  audioUrl: string | null;
};

export function PulseWizard({
  beats,
  connected,
  producer,
  beatUrlBase,
}: {
  beats: Beat[];
  connected: boolean;
  producer: string;
  beatUrlBase: string;
}) {
  const { t } = useI18n();

  const [beatId, setBeatId] = useState<string | null>(beats[0]?.id ?? null);
  const [template, setTemplate] = useState<PulseTemplate>("nonProfit");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<"private" | "unlisted" | "public">("unlisted");

  const controller = useRef<AbortController | null>(null);

  const beat = beats.find((item) => item.id === beatId) ?? null;

  /**
   * Метаданные пересобираются при выборе бита и шаблона, но только пока
   * человек не начал их править: иначе первое же нажатие затирало бы
   * половину написанного.
   */
  const generated = useMemo(() => {
    if (!beat) return null;

    return buildPulseMetadata(
      {
        title: beat.title,
        bpm: beat.bpm,
        musicalKey: beat.musicalKey,
        genre: beat.genre as never,
        genreLabel: beat.genreLabel,
        tags: beat.tags,
        artists: beat.artists,
        producer,
        beatUrl: `${beatUrlBase}/beats/${beat.id}`,
      },
      template,
    );
  }, [beat, template, producer, beatUrlBase]);

  const metadata = useMemo(() => {
    if (!generated) return null;

    return { ...generated, title: title || generated.title, description: description || generated.description, tags: tags.length ? tags : generated.tags };
  }, [generated, title, description, tags]);

  const problem = metadata ? pulseMetadataProblem(metadata) : null;

  /**
   * Сборка видео и отправка в YouTube.
   *
   * Файл не идёт через наш сервер: приём тела запроса ограничен четырьмя с
   * половиной мегабайтами, а ролик больше ста. Сервер открывает сессию и
   * отдаёт одноразовый адрес, дальше куски летят из браузера прямо в
   * YouTube — токен при этом ни разу не покидает сервер.
   */
  async function run() {
    if (!beat || !metadata) return;

    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(0);

    const cancel = new AbortController();
    controller.current = cancel;

    try {
      setStage(t("pulse.stageRender"));

      const video = await renderBeatVideo({
        coverUrl: beat.coverUrl,
        audioUrl: beat.audioUrl ?? "",
        title: metadata.title,
        techLine: metadata.techLine,
        producer,
        credit: beat.artists.length > 0 ? beat.artists.join(", ") : null,
        // Ролик идёт в реальном времени: три минуты трека — три минуты
        // сборки, ускорить нельзя, звук из потока не разгоняется.
        signal: cancel.signal,
        onProgress: (ratio) => setProgress(ratio),
      });

      setStage(t("pulse.stageUpload"));

      const session = await fetch("/api/pulse/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          privacy,
          size: video.blob.size,
        }),
      }).then(async (response) => {
        const data = (await response.json().catch(() => null)) as
          | ({ sessionUrl: string; chunkSize: number; mimeType: string } & { error?: string })
          | null;

        if (!response.ok || !data?.sessionUrl) {
          throw new Error(data?.error ?? t("pulse.failed"));
        }

        return data;
      });

      await sendChunks(
        session.sessionUrl,
        video.blob,
        session.chunkSize,
        session.mimeType,
        (sent) => setProgress(sent / video.blob.size),
        cancel.signal,
      );

      setProgress(1);
      setStage(null);
      setResult(watchUrlOf(session.sessionUrl));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("pulse.failed"));
    } finally {
      setBusy(false);
      setStage(null);
      controller.current = null;
    }
  }

  if (beats.length === 0) {
    return (
      <p className="panel max-w-[70ch] p-6 text-sm leading-relaxed text-mute">{t("pulse.noBeats")}</p>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {/*
        Шаг первый. Показан списком, а не выпадающим списком: у человека
        десяток битов, и он узнаёт их по обложкам, а не по названиям.
      */}
      <section className="flex flex-col gap-4">
        <StepHead step={1} label={t("pulse.stepBeat")} />

        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {beats.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={beatId === item.id}
                onClick={() => {
                  setBeatId(item.id);
                  setTitle("");
                  setDescription("");
                  setTags([]);
                }}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  beatId === item.id
                    ? "border-signal bg-ink-3"
                    : "border-line bg-ink-2 hover:border-line-2"
                }`}
              >
                <span className="size-10 shrink-0 overflow-hidden rounded-md bg-ink-3">
                  {item.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.coverUrl} alt="" className="size-full object-cover" />
                  ) : null}
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm text-paper">{item.title}</span>
                  <span className="text-xs text-mute">
                    {item.bpm} BPM{item.musicalKey ? ` · ${item.musicalKey}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <StepHead step={2} label={t("pulse.stepTemplate")} />

        <div className="flex flex-wrap gap-2">
          {(["nonProfit", "paid"] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={template === id}
              onClick={() => {
                setTemplate(id);
              }}
              className={`chip ${template === id ? "border-signal text-signal" : "chip-hover"}`}
            >
              {t(id === "nonProfit" ? "pulse.templateFree" : "pulse.templatePaid")}
            </button>
          ))}
        </div>

        <p className="max-w-[70ch] text-sm leading-relaxed text-mute">
          {t(template === "nonProfit" ? "pulse.templateFreeNote" : "pulse.templatePaidNote")}
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <StepHead step={3} label={t("pulse.stepMetadata")} />

        {metadata ? (
          <div className="flex flex-col gap-5">
            <Field label={t("pulse.title")} hint={`${metadata.title.length}/${TITLE_LIMIT}`}>
              <input
                value={metadata.title}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
                className="control h-12"
              />
            </Field>

            <Field
              label={t("pulse.description")}
              hint={`${metadata.description.length}/${DESCRIPTION_LIMIT}`}
            >
              <textarea
                value={metadata.description}
                onChange={(event) => {
                  setDescription(event.target.value);
                }}
                rows={9}
                className="control py-3 text-sm leading-relaxed"
              />
            </Field>

            <Field
              label={t("pulse.tags")}
              hint={`${metadata.tags.join(",").length}/${TAGS_LIMIT}`}
            >
              <input
                value={metadata.tags.join(", ")}
                onChange={(event) => {
                  setTags(
                    event.target.value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  );
                }}
                className="control h-12"
              />
            </Field>

            {metadata.trimmed.title ? (
              <Note>{t("pulse.titleTrimmed")}</Note>
            ) : null}
            {metadata.trimmed.tags.length > 0 ? (
              <Note>
                {t("pulse.tagsTrimmed", { count: String(metadata.trimmed.tags.length) })}
              </Note>
            ) : null}
            {!metadata.named ? <Note>{t("pulse.titleMissing")}</Note> : null}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-4 border-t border-line pt-8">
        <StepHead step={4} label={t("pulse.stepPublish")} />

        {!connected ? (
          <p className="max-w-[70ch] rounded-panel border border-line bg-ink-3 px-4 py-3 text-sm leading-relaxed text-paper">
            {t("pulse.notConnected")}{" "}
            <Link href="/cabinet/channels" className="text-signal underline">
              {t("pulse.connect")}
            </Link>
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-paper">{t("pulse.privacy")}</span>
          <div className="flex flex-wrap gap-2">
            {(["private", "unlisted", "public"] as const).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={privacy === id}
                onClick={() => setPrivacy(id)}
                className={`chip ${privacy === id ? "border-signal text-signal" : "chip-hover"}`}
              >
                {t(`pulse.privacy${id[0].toUpperCase()}${id.slice(1)}` as "pulse.privacyPrivate")}
              </button>
            ))}
          </div>
          <p className="max-w-[70ch] text-sm leading-relaxed text-mute">{t(`pulse.privacyNote${privacy[0].toUpperCase()}${privacy.slice(1)}` as "pulse.privacyNotePrivate")}</p>
        </div>

        <p className="max-w-[70ch] text-sm leading-relaxed text-mute">{t("pulse.nextStep")}</p>

        {result ? (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm text-signal">
              <span aria-hidden className="size-1.5 rounded-full bg-signal" />
              {t("pulse.done")}
            </p>
            <a href={result} className="text-sm text-paper underline" target="_blank" rel="noreferrer">
              {result}
            </a>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy || !metadata || problem !== null || !connected}
            className="h-10 bg-signal px-5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? stage : t("pulse.create")}
          </button>

          {busy ? (
            <button
              type="button"
              onClick={() => controller.current?.abort()}
              className="chip chip-hover"
            >
              {t("pulse.cancel")}
            </button>
          ) : null}
        </div>

        {stage ? (
          <div className="flex flex-col gap-2">
            <div className="h-1 w-full max-w-md overflow-hidden rounded-full bg-ink-3">
              <div className="h-full bg-signal" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="text-xs text-mute">{stage}</p>
          </div>
        ) : null}

        {error ? <Note>{error}</Note> : null}
      </section>
    </div>
  );
}

function StepHead({ step, label }: { step: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line font-mono text-xs text-mute">
        {step}
      </span>
      <span className="text-sm font-semibold uppercase tracking-wider text-paper">{label}</span>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-semibold text-paper">{label}</span>
        {hint ? <span className="font-mono text-xs text-mute">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[70ch] text-sm leading-relaxed text-amber">{children}</p>;
}