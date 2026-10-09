"use client";

import { CURRENCIES, DEFAULT_CURRENCY, formatMoney, isCurrency, type CurrencyCode } from "@/lib/currency";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { GenreSelect } from "@/components/beat/genre-select";
import { BeatAssistant } from "@/components/beats/beat-assistant";
import { SellReadiness } from "@/components/beats/sell-readiness";
import { CurrencyPicker } from "@/components/profile/currency-picker";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { KeyPicker } from "@/components/ui/key-picker";
import { Switch } from "@/components/ui/switch";
import type { FeedBeat } from "@/lib/feed";
import { compressImage } from "@/lib/image";
import type { GenreSlug } from "@/lib/beat-validation";
import type { TierId } from "@/lib/audio/delivery-rules";
import { beatRoles } from "@/lib/beats";
import { normalizeGenre } from "@/lib/beat-validation";
import { applyDiscount, emptyPrices, parsePrice as toPrice, normalizeDiscount } from "@/lib/prices";
import { parseTags } from "@/lib/tags";
import { useI18n } from "@/lib/i18n/provider";

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
    coverUrl: string | null;
    /** Есть ли стемы и WAV: подсказка упоминает их в описании. */
    hasStems: boolean;
    hasWav: boolean;
    /** Роли файлов в бите: "mp3", "wav", "stems", "artwork". */
    fileRoles: string[];
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
    payload.set("currency", String(form.get("currency") ?? "RUB"));
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
            <img src={URL.createObjectURL(cover)} alt="" className="size-full object-cover" />
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
              setCover(file ? await compressImage(file) : null);
            }}
            className="label h-9 w-full max-w-xs cursor-pointer rounded-xs border border-line bg-ink px-3 py-2 text-mute file:mr-3 file:border-0 file:bg-signal file:px-2 file:py-1 file:text-ink"
          />
        </div>
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
          // В форме теги живут строкой, а в подсказке нужны списком.
          tags: tags.split(/[\s,]+/).filter(Boolean),
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
                    {formatMoney(applyDiscount(oneTier(before), discount).mp3 ?? 0, "RUB")}
                  </span>
                  <span className="font-mono text-xs text-mute line-through tabular-nums">
                    {formatMoney(before, "RUB")}
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
        tags={tags.split(",").map((tag) => tag.trim()).filter(Boolean)}
        roles={beatRoles({
          keys: beat.fileRoles,
          // Обложку можно выбрать прямо сейчас: она ещё не сохранена, но
          // претензия «обложка не загружена» в этом случае врала бы.
          hasCover: beat.coverUrl !== null || cover !== null,
        })}
      />

      <Switch label={t("upload.publish")} hint={t("upload.publishHint")} name="isPublic" defaultChecked={beat.isPublic} />

      {message ? <p className={state === "error" ? "label text-amber" : "label text-paper"}>{message}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={state === "saving"}>
          {state === "saving" ? t("edit.saving") : t("profile.save")}
        </Button>
        <Button type="button" variant="ink" size="lg" href={`/beats/${beat.id}`}>
          {t("share.title")}
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
