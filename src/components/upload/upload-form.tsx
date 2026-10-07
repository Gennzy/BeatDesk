"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { CurrencyPicker } from "@/components/profile/currency-picker";
import { Button } from "@/components/ui/button";
import { SectionHead } from "@/components/ui/container";
import { FileDrop } from "@/components/ui/file-drop";
import { Field, Input } from "@/components/ui/input";
import { KeyPicker } from "@/components/ui/key-picker";
import { Switch } from "@/components/ui/switch";
import {
  BEAT_FILE_KINDS,
  BEAT_FILE_RULES,
  countParts,
  type BeatFileKind,
  type BeatFiles,
  type BeatInsert,
  createBeat,
  uploadBeat,
  validateBeatFile,
  validateCoverFile,
} from "@/lib/beats";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { CURRENCIES, type CurrencyCode } from "@/lib/currency";
import { compressImage } from "@/lib/image";
import { SellReadiness } from "@/components/beats/sell-readiness";
import { beatRoles } from "@/lib/beats";
import type { TierId } from "@/lib/audio/delivery-rules";
import { parsePrice as toPrice } from "@/lib/prices";
import { useI18n } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import { MastersBucketMissingError, SupabaseNotConfiguredError } from "@/lib/supabase/config";

type KindLabels = Record<BeatFileKind, TranslationKey>;

const KIND_LABELS: KindLabels = {
  mp3: "upload.audio",
  wav: "upload.wav",
  zip: "upload.zip",
  rar: "upload.rar",
};

const KIND_PROMPTS: Record<BeatFileKind, TranslationKey> = {
  mp3: "upload.audioPrompt",
  wav: "upload.wavPrompt",
  zip: "upload.archivePrompt",
  rar: "upload.archivePrompt",
};

const KIND_HINTS: Record<BeatFileKind, TranslationKey> = {
  mp3: "upload.audioHint",
  wav: "upload.wavHint",
  zip: "upload.zipHint",
  rar: "upload.rarHint",
};

type Status = "idle" | "uploading";

export function UploadForm({ userId }: { userId: string }) {
  const { t } = useI18n();
  const router = useRouter();

  const [files, setFiles] = useState<BeatFiles>({});
  const [cover, setCover] = useState<File | null>(null);
  const [fileErrors, setFileErrors] = useState<Partial<Record<BeatFileKind | "cover", string>>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Символ валюты под ценами: выбрал валюту — подписи перестали врать.
  const [currency, setCurrency] = useState<CurrencyCode>("RUB");
  const currencyHint = CURRENCIES.find((item) => item.code === currency)?.symbol ?? "₽";

  /*
   * Цены и название дублируем в состояние: поля остаются uncontrolled, ими
   * владеет форма, но проверка готовности обязана видеть цену в ту же секунду,
   * когда её ввели. Иначе человек поставит цену на дорожки, которых не
   * загрузил, и узнает об этом только после отправки.
   */
  const [prices, setPrices] = useState<Record<TierId, number | null>>({
    mp3: null,
    bundle: null,
    trackout: null,
    exclusive: null,
  });
  const [title, setTitle] = useState("");

  /** Роли выбранных файлов: проверка знает, что загружено, по ним. */
  const roles = beatRoles({ keys: Object.keys(files), hasCover: cover !== null });

  function selectFile(kind: BeatFileKind, file: File | null) {
    setFiles((prev) => ({ ...prev, [kind]: file ?? undefined }));
    setFileErrors((prev) => ({ ...prev, [kind]: file ? (validateBeatFile(kind, file) ?? undefined) : undefined }));
  }

  async function selectCover(file: File | null) {
    if (!file) {
      setCover(null);
      setFileErrors((prev) => ({ ...prev, cover: undefined }));
      return;
    }

    const compressed = await compressImage(file);
    setCover(compressed);
    setFileErrors((prev) => ({ ...prev, cover: validateCoverFile(compressed) ?? undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const errors: Partial<Record<BeatFileKind | "cover", string>> = { ...fileErrors };

    for (const kind of BEAT_FILE_KINDS) {
      const file = files[kind];
      if (file) errors[kind] = validateBeatFile(kind, file) ?? undefined;
    }
    if (cover) errors.cover = validateCoverFile(cover) ?? undefined;

    if (!files.mp3 && !files.wav) {
      setError(t("upload.audioRequired"));
      return;
    }

    const form = new FormData(event.currentTarget);
    const bpm = Number(form.get("bpm"));

    if (!Number.isFinite(bpm) || bpm < 40 || bpm > 300) {
      setError(t("upload.errorBpm"));
      return;
    }

    if (Object.values(errors).some(Boolean)) {
      setFileErrors(errors);
      return;
    }

    const toNumber = (value: FormDataEntryValue | null) => {
      const parsed = Number(value);
      return typeof value === "string" && value.trim() !== "" && Number.isFinite(parsed) ? parsed : null;
    };

    const beatId = crypto.randomUUID();

    const payload: BeatInsert = {
      title: String(form.get("title") ?? "").trim(),
      type_beat_artists: String(form.get("typeBeat") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      bpm: Math.round(bpm),
      key: String(form.get("key") ?? ""),
      tags: String(form.get("tags") ?? "")
        .split(/[\s,]+/)
        .map((item) => item.replace(/^#/, "").trim())
        .filter(Boolean),
      mp3_url: null,
      cover_url: null,
      files: {},
      prices: {
        mp3: toNumber(form.get("priceMp3")),
        wav: toNumber(form.get("priceBundle")),
        trackout: toNumber(form.get("priceTrackout")),
        exclusive: toNumber(form.get("priceExclusive")),
      },
      // Форма хранит валюту в состоянии и кладёт в hidden-поле, но берём
      // именно из состояния: hidden-поле может не отправиться.
      currency,
      is_public: form.get("isPublic") === "on",
    };

    setStatus("uploading");

    try {
      const supabase = createClient();

      const uploaded = await uploadBeat(supabase, {
        userId,
        beatId,
        files,
        cover,
        onStep: setStep,
      });

      const beat = await createBeat({
        ...payload,
        mp3_url: uploaded.audioUrl,
        cover_url: uploaded.coverUrl,
        files: uploaded.files,
      });

      setStep(null);
      router.replace(`/beats/${beat.id}`);
    } catch (uploadError) {
      setStatus("idle");
      setStep(null);
      setError(
        uploadError instanceof SupabaseNotConfiguredError
          ? t("auth.notConfigured")
          : uploadError instanceof MastersBucketMissingError
            ? t("upload.errorMastersBucket")
            : `${t("upload.errorGeneric")}: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`,
      );
    }
  }


  return (
    <form onSubmit={handleSubmit} className="grid gap-14 pt-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-10">
      <div className="flex flex-col gap-8">
        <SectionHead label={t("upload.sectionFiles")} />

        <div className="flex flex-col gap-7">
          {BEAT_FILE_KINDS.map((kind) => (
            <FileDrop
              key={kind}
              label={t(KIND_LABELS[kind])}
              prompt={t(KIND_PROMPTS[kind])}
              hint={t(KIND_HINTS[kind])}
              accept={BEAT_FILE_RULES[kind].accept}
              format={
                kind === "mp3"
                  ? `MP3 · ≤15 MB`
                  : `${kind.toUpperCase()} · ${countParts(files[kind]?.size ?? 0) > 1 ? `${countParts(files[kind]?.size ?? 0)}×20 MB` : "≤20 MB"}`
              }
              selected={files[kind] ?? null}
              error={fileErrors[kind] ?? null}
              onSelect={(file) => selectFile(kind, file)}
            />
          ))}

          <FileDrop
            label={t("upload.cover")}
            prompt={t("upload.coverPrompt")}
            hint={t("upload.coverHint")}
            accept="image/jpeg,image/png,image/webp"
            format="JPG · PNG · WEBP"
            selected={cover}
            error={fileErrors.cover ?? null}
            onSelect={(file) => void selectCover(file)}
          />
        </div>

      </div>

      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-8">
          <SectionHead label={t("upload.sectionMeta")} />

          <div className="grid gap-6">
            <Field label={t("upload.title_field")} hint={t("upload.title_fieldHint")}>
              <Input name="title" placeholder="Night Shift" required maxLength={80} onChange={(event) => setTitle(event.target.value)} />
            </Field>

            <div className="grid gap-6 sm:grid-cols-2">
              <Field label={t("upload.typeBeat")} hint={t("upload.typeBeatHint")}>
                <Input name="typeBeat" placeholder="MORGAN, STANLEY" />
              </Field>
              <Field label={t("upload.bpm")} error={error === t("upload.errorBpm") ? t("upload.errorBpm") : undefined}>
                <Input name="bpm" type="number" inputMode="numeric" placeholder="142" className="font-mono" required />
              </Field>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <Field label={t("upload.key")}>
                <KeyPicker defaultValue="F# minor" />
              </Field>
              <Field label={t("upload.tags")} hint={t("upload.tagsHint")}>
                <Input name="tags" placeholder="trap, dark, 140" className="font-mono" />
              </Field>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <SectionHead label={t("upload.sectionPrices")} hint={t("upload.pricesNote")} />

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("upload.currency")}>
              <CurrencyPicker name="currency" value={currency} onChange={setCurrency} />
            </Field>

            <Field label={t("upload.priceMp3")} optional={currencyHint}>
              <Input name="priceMp3" type="number" inputMode="numeric" placeholder="500" className="font-mono" onChange={(event) => setPrices((current) => ({ ...current, mp3: toPrice(event.target.value) }))} />
            </Field>
            <Field label={t("upload.priceBundle")} optional={currencyHint}>
              <Input name="priceBundle" type="number" inputMode="numeric" placeholder="1500" className="font-mono" onChange={(event) => setPrices((current) => ({ ...current, bundle: toPrice(event.target.value) }))} />
            </Field>
            <Field label={t("upload.priceTrackout")} hint={t("upload.priceTrackoutHint")} optional={currencyHint}>
              <Input name="priceTrackout" type="number" inputMode="numeric" placeholder="2500" className="font-mono" onChange={(event) => setPrices((current) => ({ ...current, trackout: toPrice(event.target.value) }))} />
            </Field>
            <Field label={t("upload.priceExclusive")} optional={currencyHint}>
              <Input name="priceExclusive" type="number" inputMode="numeric" placeholder="5000" className="font-mono" onChange={(event) => setPrices((current) => ({ ...current, exclusive: toPrice(event.target.value) }))} />
            </Field>
          </div>

          <SellReadiness prices={prices} title={title} tags={[]} roles={roles} />

          <Switch label={t("upload.publish")} hint={t("upload.publishHint")} name="isPublic" defaultChecked={false} />
          <p className="text-xs leading-relaxed text-mute">{t("upload.feedNote")}</p>

          {error ? <p className="label leading-relaxed text-amber">{error}</p> : null}

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" size="lg" disabled={status === "uploading"}>
              {status === "uploading" ? t("upload.submitting") : t("upload.submit")}
            </Button>
            {status === "uploading" && step ? (
              <span className="label max-w-72 truncate text-signal">{step}</span>
            ) : status === "uploading" ? (
              <span className="label animate-pulse text-signal">{t("upload.submitting")}</span>
            ) : null}
          </div>
        </div>
      </div>
    </form>
  );
}