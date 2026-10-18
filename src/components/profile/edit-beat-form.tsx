"use client";

import { CURRENCIES, DEFAULT_CURRENCY, formatMoney, isCurrency, type CurrencyCode } from "@/lib/currency";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { BeatAssistant } from "@/components/beats/beat-assistant";
import { SellReadiness } from "@/components/beats/sell-readiness";
import { CurrencyPicker } from "@/components/profile/currency-picker";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { KeyPicker } from "@/components/ui/key-picker";
import { GenreSelect } from "@/components/beat/genre-select";
import { Switch } from "@/components/ui/switch";
import type { FeedBeat } from "@/lib/feed";
import { compressImage } from "@/lib/image";
import type { GenreSlug } from "@/lib/beat-validation";
import type { TierId } from "@/lib/audio/delivery-rules";
import { beatRoles, uploadAsset, validateBeatFile } from "@/lib/beats";
import { normalizeGenre } from "@/lib/beat-validation";
import { applyDiscount, emptyPrices, parsePrice as toPrice, normalizeDiscount } from "@/lib/prices";
import { parseTags } from "@/lib/tags";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { canPutOnSale, canTakeOffSale, type SaleState } from "@/lib/sales/state";

type Props = {
  beat: {
    id: string;
    title: string;
    artists: string[];
    bpm: number;
    musicalKey: string;
    tags: string[];
    prices: FeedBeat["prices"];
    isPublic: boolean;
    /** Состояние продажи: черновик, в продаже, оплачивается или продан. */
    saleState: SaleState;
    coverUrl: string | null;
    /** Есть ли стемы и WAV: подсказка упоминает их в описании. */
    hasStems: boolean;
    hasWav: boolean;
    /** Роли файлов в бите: "mp3", "wav", "stems", "artwork". */
    fileRoles: string[];
    /**
     * Что сейчас лежит в мастерах.
     *
     * Нужно, чтобы форма показала «уже загружено» и знала, что перезаписывает:
     * без этого человек не отличил бы «файла нет» от «файл есть, но я его не
     * вижу».
     */
    files: Record<string, { name?: string; size?: number }> | null;
    /** Есть ли превью: без него карточка в ленте не играется. */
    hasPreview: boolean;
    /** Идентификатор владельца: без него файл не положить в свою же папку. */
    userId: string;
    /** Жанр бита: null — без жанра. */
    genre: GenreSlug | null;
    /** Действующая скидка в процентах: ноль — скидки нет. */
    discountPercent: number;
    /** Цены до скидки, для зачёркивания. Пусто, если скидки нет. */
    pricesBefore: FeedBeat["prices"] | null;
  };
};

export function EditBeatForm({ beat }: Props) {
  const { t } = useI18n();
  const router = useRouter();

  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  /** Что лежит в мастерах сейчас: база плюс то, что положили в этом окне. */
  const [files, setFiles] = useState<Record<string, { name?: string; size?: number }>>(beat.files ?? {});
  /** Какой файл сейчас летит в бакет: null — никто не грузится. */
  const [uploadingKind, setUploadingKind] = useState<"wav" | "zip" | null>(null);

  /*
   * Превью создаётся в обработчике выбора, а не в эффекте: новый objectURL
   * на каждый рендер тёк, а старый никто не освобождал. Здесь старый
   * освобождается до создания нового.
   */
  function pickCover(file: File | null) {
    setCoverPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setCover(file);
  }

  /**
   * Положить мастер в бакет и записать это в бит.
   *
   * Файл уходит сразу при выборе, а не по кнопке «сохранить»: архив весит
   * сотни мегабайт и идёт долго, и человек, который уже ушёл со страницы,
   * решил бы, что файл не загрузился, и залил бы его второй раз.
   *
   * Ошибка показывается тем же сообщением, что и сохранение: отдельное
   * «что-то сломалось с файлом» заставляет человека гадать, куда смотреть.
   */
  async function uploadFile(kind: "wav" | "zip", file: File | null) {
    if (!file) return;

    const problem = validateBeatFile(kind, file);

    if (problem) {
      setState("error");
      setMessage(problem);
      return;
    }

    setUploadingKind(kind);
    setState("saving");

    try {
      const supabase = createClient();
      const asset = await uploadAsset(supabase, {
        userId: beat.userId,
        beatId: beat.id,
        kind,
        file,
      });

      const response = await fetch(`/api/beats/${beat.id}`, {
        method: "PATCH",
        body: (() => {
          const data = new FormData();

          data.set("files", JSON.stringify({ [kind]: asset }));
          return data;
        })(),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;

        throw new Error(data?.error ?? t("edit.error"));
      }

      setFiles((prev) => ({ ...prev, [kind]: asset }));
      setState("saved");
      setMessage(t("edit.saved"));
      router.refresh();
    } catch (cause) {
      setState("error");
      setMessage(cause instanceof Error ? cause.message : t("edit.error"));
    } finally {
      setUploadingKind(null);
    }
  }
  // Валюта приходит из базы, поэтому проверяем её, а не верим на слово:
  // неизвестный код оставил бы пикер без выбранной валюты и тихо записал бы
  // рубли вместо того, что стоит в бите.
  const storedCurrency = (beat as { currency?: unknown }).currency;
  const [currency, setCurrency] = useState<CurrencyCode>(isCurrency(storedCurrency) ? storedCurrency : DEFAULT_CURRENCY);
  const currencyHint = CURRENCIES.find((item) => item.code === currency)?.symbol ?? "₽";
  /*
   * Название и теги — контролируемые поля: подсказка AI должна уметь
   * подставить в них своё. Раньше стоял defaultValue, и подставить было
   * некуда: input игнорирует попытки изменить себя после первого рендера.
   */
  const [title, setTitle] = useState(beat.title);
  const [tags, setTags] = useState(beat.tags.join(", "));

  /*
   * Цены дублируем в состояние, хотя поля остаются uncontrolled: полем
   * управляет форма, а проверке готовности нужно видеть цену в ту же
   * секунду, когда её ввели. Иначе человек поставит цену на уровень без
   * файла и узнает об этом только после перезагрузки.
   */
/*
 * Уровни для предпросмотра скидки. Ключ формы для WAV — bundle, потому что
 * так называется колонка в базе; в подписи он остаётся WAV.
 */
/** Один уровень в виде Prices: applyDiscount работает с набором, а не с числом. */
function oneTier(value: number) {
  return { ...emptyPrices(), mp3: value };
}

const DISCOUNT_TIERS: { key: string; label: string; priceKey: TierId }[] = [
  { key: "mp3", label: "MP3", priceKey: "mp3" },
  { key: "wav", label: "MP3 + WAV", priceKey: "bundle" },
  { key: "trackout", label: "Track Out", priceKey: "trackout" },
  { key: "exclusive", label: "Эксклюзив", priceKey: "exclusive" },
];

  const [discount, setDiscount] = useState(beat.discountPercent ?? 0);

  /*
   * Форма правится от прежних цен, а не от тех, что сейчас в бите.
   *
   * В базе лежит цена со скидкой: MP3 700 ₽ при скидке 30 от 1000. Если
   * открыть эту правку и поднять скидку до 40, а считать от 700, получится
   * 420 — скидка съедала бы сама себя с каждой правкой. Поэтому берём
   * prices_before: битмейкер правит исходную цену, а процент — это способ
   * показать, сколько с неё срезать.
   */
  const [prices, setPrices] = useState<Record<TierId, number | null>>({
    mp3: (beat.pricesBefore ?? beat.prices).mp3 ?? null,
    bundle: (beat.pricesBefore ?? beat.prices).wav ?? null,
    trackout: (beat.pricesBefore ?? beat.prices).trackout ?? null,
    exclusive: (beat.pricesBefore ?? beat.prices).exclusive ?? null,
  });

  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage(null);

    const form = new FormData(event.currentTarget);

    // Жанр обязателен и здесь: сохранить бит без него нельзя, поэтому
    // пустое значение — понятный отказ, а не запрос, который вернёт ошибку
    // с сервера через полсекунды.
    if (!normalizeGenre(form.get("genre"))) {
      setState("idle");
      setMessage(t("upload.errorGenre"));
      return;
    }

    const payload = new FormData();
    payload.set("title", title.trim());
    payload.set("typeBeat", String(form.get("typeBeat") ?? ""));
    payload.set("bpm", String(form.get("bpm") ?? ""));
    payload.set("key", String(form.get("key") ?? ""));
    payload.set("tags", tags);
    payload.set("genre", String(form.get("genre") ?? ""));
    payload.set("isPublic", form.get("isPublic") === "on" ? "true" : "false");
    payload.set("onSale", form.get("onSale") === "on" ? "true" : "false");
    payload.set("currency", String(form.get("currency") ?? "RUB"));
    /*
     * Скидка обязана уйти вместе с ценами.
     *
     * Поле в форме есть, но в запрос не попадало, и сервер читал
     * normalizeDiscount(null) = 0. Любое сохранение — заголовок, тег, обложка —
     * обнуляло скидку и возвращало полную цену. Продавец не получал ни ошибки,
     * ни уведомления, а покупатель платил на 30 % больше обещанного.
     */
    payload.set("discountPercent", String(form.get("discountPercent") ?? "0"));
    payload.set(
      "prices",
      JSON.stringify({
        mp3: form.get("priceMp3"),
        wav: form.get("priceBundle"),
        trackout: form.get("priceTrackout"),
        exclusive: form.get("priceExclusive"),
      }),
    );

    const tagList = parseTags(tags);

    // Строку тегов убираем: сервер ждёт массив, и без этого поле уходило
    // дважды — сначала текстом, потом списком.
    payload.delete("tags");
    payload.set("tags", JSON.stringify(tagList));

    if (cover) payload.set("coverFile", cover);

    try {
      const response = await fetch(`/api/beats/${beat.id}`, { method: "PATCH", body: payload });
      const data = await response.json();

      if (!response.ok) {
        setState("error");
        setMessage(data.error ?? t("edit.error"));
        return;
      }

      setState("saved");
      setMessage(t("edit.saved"));
      router.refresh();
    } catch {
      setState("error");
      setMessage(t("edit.error"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center gap-5">
        <div className="grid size-24 shrink-0 place-items-center overflow-hidden border border-line bg-ink-2">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverPreview ?? undefined} alt="" className="size-full object-cover" />
          ) : beat.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={beat.coverUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="label text-mute">{t("feed.noCover")}</span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="label text-paper">{t("upload.cover")}</span>
          <span className="text-xs text-mute">{t("upload.coverHint")}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              pickCover(file ? await compressImage(file) : null);
            }}
            className="label h-9 w-full max-w-xs cursor-pointer rounded-xs border border-line bg-ink px-3 py-2 text-mute file:mr-3 file:border-0 file:bg-signal file:px-2 file:py-1 file:text-ink"
          />
        </div>
      </div>

      {/*
       * Мастера: WAV и архив со стемами.
       *
       * Здесь их не было, и это делало бит неисправимым: проверка готовности
       * требовала архив для Track Out и Эксклюзива, а положить его было не
       * чем. Человек загружал бит без стемов — и дальше ни отправить уровень,
       * ни убрать претензию: тупик без единого выхода.
       *
       * Файлы уходят в бакет сразу при выборе, а не при сохранении: архив на
       * полгигабайта идёт долго, и ждать его после нажатия «сохранить» —
       * значит держать человека у формы на минуту без объяснений.
       */}
      <div className="grid gap-4 sm:grid-cols-2">
        {(["wav", "zip"] as const).map((kind) => (
          <div key={kind} className="flex flex-col gap-2">
            <span className="label text-paper">{kind === "wav" ? t("upload.wav") : t("upload.zip")}</span>
            <span className="text-xs text-mute">
              {files[kind] ? t("upload.filePresent") : t(kind === "wav" ? "upload.wavHint" : "upload.zipHint")}
            </span>
            <input
              type="file"
              accept={kind === "wav" ? "audio/wav,audio/x-wav,.wav" : ".zip,.rar,application/zip"}
              disabled={uploadingKind !== null}
              onChange={(event) => void uploadFile(kind, event.target.files?.[0] ?? null)}
              className="label h-9 w-full max-w-xs cursor-pointer rounded-xs border border-line bg-ink px-3 py-2 text-mute file:mr-3 file:border-0 file:bg-signal file:px-2 file:py-1 file:text-ink disabled:opacity-50"
            />
          </div>
        ))}
      </div>

      <div className="grid gap-6">
        <Field label={t("upload.title_field")}>
          <Input name="title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={80} />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label={t("upload.typeBeat")} hint={t("upload.typeBeatHint")}>
            <Input name="typeBeat" defaultValue={beat.artists.join(", ")} placeholder="MORGAN, STANLEY" />
          </Field>
          <Field label={t("upload.bpm")}>
            <Input name="bpm" type="number" inputMode="numeric" defaultValue={beat.bpm} className="font-mono" required />
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label={t("upload.key")}>
            <KeyPicker defaultValue={beat.musicalKey} />
          </Field>

          {/*
           * Жанр был обязателен при сохранении, но поля в форме не было.
           *
           * Форма читала genre, которого в ней не существовало, получала
           * пустое значение и отказывалась сохранять бит: править было
           * нечем вообще, а отказ приходил с требованием выбрать жанр, для
           * которого не было ни одного списка. Самый неприятный вид отказа —
           * когда виноваты данные, а спросить некуда.
           *
           * Ставится с текущим значением, иначе список открывался бы пустым и
           * выглядел бы как «beat без жанра», хотя он есть.
           */}
          <GenreSelect name="genre" value={beat.genre} />

          <Field label={t("upload.tags")} hint={t("upload.tagsHint")}>
            <Input name="tags" value={tags} onChange={(event) => setTags(event.target.value)} className="font-mono" />
          </Field>
        </div>
      </div>

      <BeatAssistant
        beat={{
          id: beat.id,
          title,
          bpm: beat.bpm,
          musicalKey: beat.musicalKey,
          // В форме теги живут строкой, а в подсказке нужны списком. Разбор
          // один на весь проект: в этой форме он стоял в трёх видах, и
          // подсказка считала теги иначе, чем сохраняла форма.
          tags: parseTags(tags),
          artists: beat.artists,
        }}
        hasStems={beat.hasStems}
        hasWav={beat.hasWav}
        onApply={(patch) => {
          if (patch.title) setTitle(patch.title);
          if (patch.tags) setTags(patch.tags);
        }}
      />

      <div className="flex flex-col gap-4">
        <Field label={t("upload.currency")}>
          <CurrencyPicker name="currency" value={currency} onChange={setCurrency} />
        </Field>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("upload.priceMp3")} optional={currencyHint}>
          <Input
            name="priceMp3"
            type="number"
            inputMode="numeric"
            defaultValue={beat.prices.mp3 ?? ""}
            onChange={(event) =>
              setPrices((current) => ({ ...current, mp3: toPrice(event.target.value) }))
            }
            className="font-mono"
          />
        </Field>
        <Field label={t("upload.priceBundle")} optional={currencyHint}>
          <Input
            name="priceBundle"
            type="number"
            inputMode="numeric"
            defaultValue={beat.prices.wav ?? ""}
            onChange={(event) =>
              setPrices((current) => ({ ...current, bundle: toPrice(event.target.value) }))
            }
            className="font-mono"
          />
        </Field>
        <Field label={t("upload.priceTrackout")} hint={t("upload.priceTrackoutHint")} optional={currencyHint}>
          <Input
            name="priceTrackout"
            type="number"
            inputMode="numeric"
            defaultValue={beat.prices.trackout ?? ""}
            onChange={(event) =>
              setPrices((current) => ({ ...current, trackout: toPrice(event.target.value) }))
            }
            className="font-mono"
          />
        </Field>
        <Field label={t("upload.priceExclusive")} optional={currencyHint}>
          <Input
            name="priceExclusive"
            type="number"
            inputMode="numeric"
            defaultValue={beat.prices.exclusive ?? ""}
            onChange={(event) =>
              setPrices((current) => ({ ...current, exclusive: toPrice(event.target.value) }))
            }
            className="font-mono"
          />
        </Field>

        {/*
          Скидка применяется к введённым ценам. Считаем и показываем
          результат сразу: битмейкер должен видеть, что получит покупатель,
          а не проверять арифметику в голове.
        */}
        <Field label={t("discount.label")} hint={t("discount.hint")} optional={t("discount.optional")}>
          <Input
            name="discountPercent"
            type="number"
            inputMode="numeric"
            min={0}
            max={90}
            value={discount === 0 ? "" : discount}
            onChange={(event) => setDiscount(normalizeDiscount(event.target.value))}
            className="font-mono"
          />
        </Field>
      </div>

      {discount > 0 ? (
        <div className="panel flex flex-col gap-3 p-4">
          <span className="label text-mute">{t("discount.preview")}</span>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {DISCOUNT_TIERS.map(({ key, label, priceKey }) => {
              const before = prices[priceKey];
              if (before === null) return null;

              return (
                <li key={key} className="flex items-baseline gap-2">
                  <span className="label text-mute">{label}</span>
                  <span className="font-mono text-sm text-paper tabular-nums">
                    {formatMoney(applyDiscount(oneTier(before), discount).mp3 ?? 0, currency)}
                  </span>
                  <span className="font-mono text-xs text-mute line-through tabular-nums">
                    {formatMoney(before, currency)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <SellReadiness
        prices={prices}
        title={title}
        tags={parseTags(tags)}
        roles={beatRoles({
          /*
           * Ключи берём из files, а не из fileRoles.
           *
           * fileRoles — это уже результат beatRoles («mp3», «stems»), и если
           * скормить его beatRoles как keys, тот ищет «zip»/«rar» и не находит
           * «stems» никогда. Форма показывала «не хватает: архива со стемами»
           * даже после успешной загрузки архива — и снять претензию было
           * нечем.
           */
          keys: Object.keys({ ...(beat.files ?? {}), ...files }),
          hasCover: beat.coverUrl !== null || cover !== null,
          hasPreview: Boolean(beat.hasPreview),
        })}
      />

      {/*
         * Публикация и продажа — разные вещи, и раньше был только первый
         * переключатель. Бит со всеми ценами можно было держать в ленте и
         * при этом остаться непригодным для покупки: корзина требует и
         * публикации, и состояния «в продаже», а менять второе было нечем.
         */}
      <Switch label={t("upload.publish")} hint={t("upload.publishHint")} name="isPublic" defaultChecked={beat.isPublic} />
      <Switch
        label={t("upload.onSale")}
        hint={t("upload.onSaleHint")}
        name="onSale"
        defaultChecked={beat.saleState === "on_sale"}
        disabled={!canPutOnSale(beat.saleState) && !canTakeOffSale(beat.saleState)}
      />

      {message ? <p className={state === "error" ? "label text-amber" : "label text-paper"}>{message}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={state === "saving"}>
          {state === "saving" ? t("edit.saving") : t("profile.save")}
        </Button>
        <Button type="button" variant="ink" size="lg" href={`/beats/${beat.id}`}>
          {t("beat.backToBeat")}
        </Button>
      </div>
    </form>
  );
}

export function DeleteBeatButton({ beatId, redirectTo }: { beatId: string; redirectTo: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="label px-2 py-1.5 text-mute underline-offset-4 transition-colors hover:text-amber hover:underline"
      >
        {t("delete.open")}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const response = await fetch(`/api/beats/${beatId}`, { method: "DELETE" });
          setBusy(false);

          if (response.ok) {
            router.push(redirectTo);
            router.refresh();
            return;
          }

          setConfirming(false);
        }}
        className="label border border-amber/50 px-2 py-1.5 text-amber transition-colors hover:bg-amber hover:text-ink"
      >
        {busy ? t("delete.deleting") : t("delete.confirm")}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="label px-2 py-1.5 text-mute transition-colors hover:text-paper"
      >
        {t("nav.close")}
      </button>
    </div>
  );
}
