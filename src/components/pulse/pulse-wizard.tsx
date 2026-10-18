"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildPulseMetadata,
  pulseMetadataProblem,
  DESCRIPTION_LIMIT,
  TAGS_LIMIT,
  TITLE_LIMIT,
  type PulseTemplate,
} from "@/lib/pulse/metadata";
import { renderBeatVideo } from "@/lib/pulse/render-video";
import { sendChunks, videoIdOf, watchUrlOf } from "@/lib/pulse/client-upload";
import type { JobStatus } from "@/lib/pulse/jobs";
import type { AiPackage } from "@/lib/ai/pulse-package";
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
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ ПУБЛИКАЦИЯ ИДЁТ ЧЕРЕЗ ЗАДАЧУ
 *
 * Раньше кнопка «опубликовать» делала всё сразу и нигде не оставляла след.
 * Ролик мог уйти в YouTube, а человек остался без записи: что вышло, когда и
 * под каким заголовком. Закрыл вкладку посреди рендера — и всё потеряно
 * безвозвратно, переделать можно, но не узнать, что именно сломалось.
 *
 * Теперь публикация — это задача. Перед сборкой она создаётся, на каждом
 * шаге отмечает, где находится, и в конце помнит номер ролика. Отсюда
 * появляется история, повтор и будущая статистика.
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
  /** Теги, которые человек убрал из сгенерированного списка. */
  const [dropped, setDropped] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<"private" | "unlisted" | "public">("unlisted");

  const controller = useRef<AbortController | null>(null);

  /** Что прислала модель для текущей пары «бит + шаблон». */
  const [aiPackage, setAiPackage] = useState<AiPackage | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  /** Ключ пары, для которой уже спрашивали: чтобы не спрашивать на каждый рендер. */
  const askedFor = useRef<string | null>(null);
  /** Контроллер текущего запроса: смена бита обрывает предыдущий. */
  const runAi = useRef<AbortController | null>(null);

  const beat = beats.find((item) => item.id === beatId) ?? null;

  /**
   * Метаданные пересобираются при выборе бита, шаблона и при убранных тегах,
   * но не затирают то, что человек правил руками: иначе первое же нажатие
   * стирало бы половину написанного.
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
      dropped,
    );
  }, [beat, template, producer, beatUrlBase, dropped]);

  const metadata = useMemo(() => {
    if (!generated) return null;

    /*
     * Ответ модели перекрывает правила, но не переживает их.
     *
     * Пока человек ничего не правил руками, показываем то, что прислала
     * модель. Поправил хоть что-то — его текст главнее: стирать правку
     * человека из-за новой подсказки нельзя, поэтому дальше работают правила.
     */
    const touched = Boolean(title || description);

    return {
      ...generated,
      title: (touched ? title : aiPackage?.title) || generated.title,
      description: (touched ? description : aiPackage?.description) || generated.description,
      tags: aiPackage && !touched ? aiPackage.tags : generated.tags,
    };
  }, [generated, title, description, aiPackage]);

  /**
   * Пересобрать упаковку по требованию человека.
   *
   * Отдельная функция, а не переиспользование автоматического срабатывания:
   * пересборка — это нажатие, и она обязана спрашивать заново, даже если эта
   * пара уже спрашивалась.
   */
  const rebuildAi = useCallback(async () => {
    if (!beat) return;

    askedFor.current = null;

    setAiBusy(true);

    runAi.current?.abort();

    const controller = new AbortController();

    runAi.current = controller;

    try {
      const response = await fetch("/api/ai/pulse-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          title: beat.title,
          bpm: beat.bpm,
          musicalKey: beat.musicalKey,
          genre: beat.genre,
          genreLabel: beat.genreLabel,
          tags: beat.tags,
          artists: beat.artists,
          producer,
          beatUrl: `${beatUrlBase}/beats/${beat.id}`,
          template,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { title?: string; description?: string; tags?: string[] }
        | null;

      if (response.ok && data?.title) {
        setAiPackage({ title: data.title, description: data.description ?? "", tags: data.tags ?? [] });
      }
    } catch {
      // Тишина: пересборка — необязательная роскошь, ошибка в ней не должна
      // выглядеть как поломка публикации.
    } finally {
      setAiBusy(false);
    }
  }, [beat, template, producer, beatUrlBase]);


  /** Убранный тег возвращается по тому же нажатию. */
  const dropTag = (tag: string) => {
    setDropped((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
  };

  // Срабатывает само на смену бита или шаблона.
  //
  // Работа живёт внутри эффекта, а не в useCallback: состояние ставится в
  // цепочке промисов, и React Compiler не считает это синхронной установкой
  // из эффекта, из-за которой он гоняет лишний рендер.
  useEffect(() => {
    if (!beat) return;

    const key = `${beat.id}:${template}`;

    // Ключ запроса — пара «бит + шаблон», и он же защита от повторов: без
    // него смена тегов, перенос и рендер слали бы запрос заново и съедали
    // лимит бесплатных моделей, который делится на всех.
    if (askedFor.current === key) return;

    askedFor.current = key;

    const controller = new AbortController();

    runAi.current = controller;

    void (async () => {
      try {
        const response = await fetch("/api/ai/pulse-package", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            title: beat.title,
            bpm: beat.bpm,
            musicalKey: beat.musicalKey,
            genre: beat.genre,
            genreLabel: beat.genreLabel,
            tags: beat.tags,
            artists: beat.artists,
            producer,
            beatUrl: `${beatUrlBase}/beats/${beat.id}`,
            template,
          }),
        });

        const data = (await response.json().catch(() => null)) as
          | { title?: string; description?: string; tags?: string[] }
          | null;

        /*
         * Пока модель думает, человек может уже начать с правил, и его правка
         * должна пережить её ответ: пустой ответ тут просто игнорируется.
         */
        if (response.ok && data?.title) {
          setAiPackage({ title: data.title, description: data.description ?? "", tags: data.tags ?? [] });
          setAiBusy(false);
        }
      } catch {
        // Отказ не виден и не мешает: правила уже собраны, и публикация от
        // модели не зависит.
        setAiBusy(false);
      }
    })();

    return () => controller.abort();
  }, [beat, template, producer, beatUrlBase]);

  const problem = metadata ? pulseMetadataProblem(metadata) : null;

  /**
   * Сборка видео и отправка в YouTube.
   *
   * Файл не идёт через наш сервер: приём тела запроса ограничен четырьмя с
   * половиной мегабайтами, а ролик больше ста. Сервер открывает сессию и
   * отдаёт одноразовый адрес, дальше куски летят из браузера прямо в
   * YouTube — токен при этом ни разу не покидает сервер.
   */
  /**
   * Отмечает шаг задачи.
   *
   * Ошибка здесь никогда не прерывает публикацию: если записать прогресс не
   * вышло, ролик всё равно уйдёт, а потеря отметки — это отсутствующая
   * строчка в истории, а не сорванный ролик. Обратный порядок отдал бы
   * человеку ошибку там, где ролик уже на YouTube.
   */
  const mark = useCallback(
    async (jobId: string | null, status: JobStatus, extra: Record<string, unknown> = {}) => {
      if (!jobId) return;

      try {
        await fetch(`/api/pulse/jobs/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, ...extra }),
        });
      } catch {
        // Молча: см. выше. Отметка — вспомогательная, ролик важнее.
      }
    },
    [],
  );

  async function run() {
    if (!beat || !metadata) return;

    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(0);

    const cancel = new AbortController();
    controller.current = cancel;

    let jobId: string | null = null;

    try {
      /*
       * Задача создаётся до сборки, а не после.
       *
       * После — поздно: если ролик собрался и упал на загрузке, следов не
       * осталось бы совсем, и повторить было бы нечего. Создать заранее
       * дороже на один запрос, но он окупается ровно тогда, когда всё
       * ломается, а ломается это часто.
       */
      const created = await fetch("/api/pulse/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beatId: beat.id,
          beatTitle: beat.title,
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          privacy,
          template,
        }),
      }).then(async (response) => {
        const data = (await response.json().catch(() => null)) as
          | { job?: { id: string } }
          | null;

        return data?.job?.id ?? null;
      });

      jobId = created;

      await mark(jobId, "rendering");

      setStage(t("pulse.stageRender"));

      const video = await renderBeatVideo({
        coverUrl: beat.coverUrl,
        audioUrl: beat.audioUrl ?? "",
        title: metadata.title,
        techLine: metadata.techLine,
        producer,
        // Кредит в ролике — битмейкеру, как и в описании. Раньше сюда
        // попадали артисты, и ролик запекал «must credit: madk1d, villian»:
        // артисты тут не имеют отношения, имя нужно тому, кто бит сделал.
        credit: producer || null,
        // Ролик идёт в реальном времени: три минуты трека — три минуты
        // сборки, ускорить нельзя, звук из потока не разгоняется.
        signal: cancel.signal,
        onProgress: (ratio) => setProgress(ratio),
      });

      await mark(jobId, "uploading");

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

      const watchUrl = watchUrlOf(session.sessionUrl);

      setResult(watchUrl);

      // Номер ролика кладём в задачу: из него потом считаются просмотры, и
      // без него статистика не узнает, чей это ролик.
      await mark(jobId, "published", {
        progress: 1,
        videoId: videoIdOf(session.sessionUrl),
        watchUrl,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("pulse.failed");

      setError(message);

      // Отказ пишется с текстом: «что-то сломалось» бесполезно через неделю,
      // а текст от YouTube объясняет, съедена квота или запрещён монтаж.
      await mark(jobId, "failed", { error: message });
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
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-10">
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
                  // Убранные теги принадлежали прежнему биту и к нему не
                  // относятся: оставлять их значило бы тащить чужие теги в
                  // чужие места.
                  setDropped([]);
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

          {/*
           * Статус упаковки и кнопка пересборки.
           *
           * Пока модель думает, человек уже видит собранные правилами данные и
           * может начать с ними: ждать пустоты хуже, чем работать. Поэтому
           * надпись и кнопка появляются только после ответа модели — раньше
           * нечего было бы показывать.
           *
           * Молчаливая подмена опаснее: человек правит заголовок, не зная, что
           * он правит правила, и потом удивляется, почему модель его затерла.
           */}
          {aiPackage ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="label text-signal">{t("pulse.aiReady")}</span>
              <button type="button" onClick={() => void rebuildAi()} className="chip chip-hover">
                {aiBusy ? t("pulse.aiThinking") : t("pulse.aiRebuild")}
              </button>
            </div>
          ) : aiBusy ? (
            <span className="label text-mute">{t("pulse.aiThinking")}</span>
          ) : null}

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

                        {/*
              Теги показываются плитками, а не строкой через запятую.
              В строке не видно, где обязательное, а где добавка от автора, и
              невозможно понять, что именно не влезло в лимит YouTube. Нажатие
              на плитку убирает тег, и это видно сразу — в списке, а не после
              публикации на YouTube.
            */}
            <div className="flex flex-col gap-3">
              <Field
                label={t("pulse.tags")}
                hint={`${metadata.tags.join(",").length}/${TAGS_LIMIT}`}
              >
                <div className="flex flex-col gap-3">
                  {metadata.coreTags.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="label text-mute">{t("pulse.tagsCore")}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {metadata.coreTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => dropTag(tag)}
                            title={t("pulse.tagDrop")}
                            className="chip border-signal/40 text-signal transition-colors hover:border-danger/60 hover:text-danger"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {metadata.ownTags.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="label text-mute">{t("pulse.tagsOwn")}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {metadata.ownTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => dropTag(tag)}
                            title={t("pulse.tagDrop")}
                            className="chip chip-hover transition-colors hover:border-danger/60 hover:text-danger"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </Field>
            </div>

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
            {/*
             * Ссылка на историю сразу после выхода: это единственный момент,
             * когда человек точно знает, что только что опубликовал, и ещё
             * помнит, какой это был бит. Через неделю он не вспомнит.
             */}
            <a href="/pulse/history" className="chip chip-hover self-start">
              {t("pulse.history")}
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

      {/*
        Предпросмотр липнет сбоку и не уезжает при прокрутке.
        *
        * Раньше человек собирал метаданные вслепую: заголовок, описание,
        * теги — три поля, и как это будет выглядеть в ленте YouTube, он
        * узнавал после публикации. Карточка повторяет то, что увидит
        * зритель: обложка, заголовок, техника и первые строки описания.
        */}
      <aside className="lg:sticky lg:top-24">
        <div className="flex flex-col gap-3">
          <span className="label text-mute">{t("pulse.preview")}</span>

          {beat ? (
            <div className="flex flex-col gap-3 rounded-panel border border-line-2 bg-ink-2 p-4">
              <div className="relative aspect-video overflow-hidden rounded-lg bg-ink-3">
                {beat.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={beat.coverUrl}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}

                <span className="absolute bottom-2 right-2 rounded-md bg-ink/85 px-2 py-0.5 font-mono text-[11px] text-paper tabular-nums">
                  {metadata ? `${metadata.techLine}` : ""}
                </span>
              </div>

              {metadata ? (
                <>
                  <span className="line-clamp-2 text-sm font-semibold text-paper">{metadata.title}</span>
                  <span className="label text-mute">{t("pulse.previewMeta", { producer })}</span>
                  <p className="line-clamp-6 whitespace-pre-line border-t border-line pt-3 text-xs leading-relaxed text-mute">
                    {metadata.description}
                  </p>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
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
