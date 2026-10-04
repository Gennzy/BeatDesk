"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SectionHead } from "@/components/ui/container";
import { downloadAsset, formatBytes, type BeatAsset } from "@/lib/beats";
import { LegacyMasterMissingError } from "@/lib/supabase/config";
import {
  allBlocks,
  fileNames,
  type DistributionBeat,
  type FileName,
  type PlatformBlock,
} from "@/lib/distribution";
import { FillWithExtension } from "@/components/distribution/fill-with-extension";
import { useI18n } from "@/lib/i18n/provider";

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // запасной путь для http и старых браузеров
  }

  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="label shrink-0 border border-line px-3 py-1.5 text-mute transition-colors duration-150 hover:border-signal/60 hover:text-paper"
    >
      {copied ? t("share.copied") : (label ?? t("share.copy"))}
    </button>
  );
}

function Block({ title, text }: PlatformBlock) {
  return (
    <article className="flex flex-col border border-line bg-ink-2">
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
        <span className="label text-paper">{title}</span>
        <CopyButton text={text} />
      </header>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-mute">
        {text}
      </pre>
    </article>
  );
}

function FileNameRow({ item }: { item: FileName }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
      <span className="label text-mute sm:w-16 sm:shrink-0">{item.label}</span>
      <span className="min-w-0 flex-1 font-mono text-[13px] break-all text-paper">{item.name}</span>
      <div className="sm:shrink-0">
        <CopyButton text={item.name} />
      </div>
    </div>
  );
}

function AssetRow({ beatId, asset }: { beatId: string; asset: BeatAsset }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"generic" | "legacy" | null>(null);

  return (
    <div className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
      <span className="min-w-0 flex-1 font-mono text-[13px] break-all text-paper">{asset.name}</span>
      <span className="label text-mute">{formatBytes(asset.size)}</span>
      {error ? (
        <span className="label text-amber">{t(error === "legacy" ? "share.downloadLegacy" : "share.downloadError")}</span>
      ) : null}
      <div className="sm:shrink-0">
        <Button
        type="button"
        variant="ink"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await downloadAsset(beatId, asset);
          } catch (downloadError) {
            setError(downloadError instanceof LegacyMasterMissingError ? "legacy" : "generic");
          } finally {
            setBusy(false);
          }
        }}
        >
          {busy ? t("share.downloading") : t("share.download")}
        </Button>
      </div>
    </div>
  );
}

/** Каналы с публичным API: BeatDesk постит сам, копировать текст не нужно. */
const AUTO_PLATFORMS = [
  { id: "telegram", label: "Telegram" },
  { id: "discord", label: "Discord" },
  { id: "vk", label: "ВКонтакте" },
] as const;

/** Маркетплейсы без API: форму заполняет расширение. */
const MANUAL_PLATFORMS = [
  { id: "beatstars", label: "BeatStars" },
  { id: "beatchain", label: "BeatChain" },
] as const;

/**
 * Площадки, где форму заполнять нечем: у Airbit своя вёрстка, а расширение
 * про неё ничего не знает. Раньше здесь стоял тот же конфиг, что и для
 * BeatStars, и кнопка обещала заполнение, которого не случилось бы.
 */
const COPY_PLATFORMS = [{ id: "airbit", label: "Airbit", url: "https://airbit.com/dashboard" }] as const;

export function DistributionBlocks({
  beat,
  assets,
  audio,
  isOwner = false,
}: {
  beat: DistributionBeat;
  assets: BeatAsset[];
  audio: BeatAsset | null;
  isOwner?: boolean;
}) {
  const { t } = useI18n();

  const has = {
    wav: Boolean(assets.find((asset) => asset.mime === "audio/wav")),
    zip: Boolean(assets.find((asset) => asset.mime === "application/zip")),
    rar: Boolean(assets.find((asset) => asset.mime === "application/vnd.rar")),
  };

  const names = fileNames(beat, has);

  return (
    <div className="flex flex-col gap-12 pt-12">
      <section className="flex flex-col gap-6">
        <SectionHead label={t("share.filenames")} hint={names[0].name} />
        <div className="border border-line bg-ink-2 px-4">
          {names.map((item) => (
            <FileNameRow key={item.name} item={item} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <SectionHead label={t("share.platforms")} hint={t("fill.autoPublishHint")} />

        <ul className="flex flex-col gap-2">
          {AUTO_PLATFORMS.map((platform) => (
            <li key={platform.id} className="flex flex-wrap items-center gap-4 border border-line bg-ink-2 px-4 py-3.5">
              <span className="font-display text-sm text-paper uppercase">{platform.label}</span>
              <span className="label text-mute">{t("fill.autoPublish")}</span>
            </li>
          ))}

          {MANUAL_PLATFORMS.map((platform) => (
            <li key={platform.id} className="flex flex-wrap items-center justify-between gap-4 border border-line bg-ink-2 px-4 py-3.5">
              <div className="flex flex-col gap-1">
                <span className="font-display text-sm text-paper uppercase">{platform.label}</span>
                <span className="max-w-[54ch] text-[11px] text-mute">{t(`fill.${platform.id}` as "fill.beatstars")}</span>
              </div>
              <FillWithExtension platform={platform.id} label={platform.label} beatId={beat.id} />
            </li>
          ))}

          {COPY_PLATFORMS.map((platform) => (
            <li key={platform.id} className="flex flex-wrap items-center justify-between gap-4 border border-line bg-ink-2 px-4 py-3.5">
              <div className="flex flex-col gap-1">
                <span className="font-display text-sm text-paper uppercase">{platform.label}</span>
                <span className="max-w-[54ch] text-[11px] text-mute">{t("fill.airbit")}</span>
              </div>
              <Button href={platform.url} size="sm" variant="ink">
                {t("fill.airbitOpen")}
                <span aria-hidden>→</span>
              </Button>
            </li>
          ))}
        </ul>

        {/* Готовые тексты остались запасным вариантом: если расширения нет
            или площадка попросила свой формат, они всё равно нужны. */}
        <details className="border border-line bg-ink-2">
          <summary className="label cursor-pointer px-4 py-3 text-mute transition-colors hover:text-paper">
            {t("fill.rawTexts")}
          </summary>
          <div className="grid gap-5 border-t border-line p-4 xl:grid-cols-2">
            {allBlocks(beat).map((block) => (
              <Block key={block.title} {...block} />
            ))}
          </div>
        </details>
      </section>

      {isOwner && assets.length > 0 ? (
        <section className="flex flex-col gap-6">
          <SectionHead label={t("share.files")} hint={t("share.filesOwnerHint")} />
          <div className="border border-line bg-ink-2 px-4">
            {[audio, ...assets].filter((item): item is BeatAsset => Boolean(item)).map((asset) => (
              <AssetRow key={asset.name} beatId={beat.id} asset={asset} />
            ))}
          </div>
        </section>
      ) : !isOwner && audio ? (
        <p className="label flex items-start gap-3 border border-line bg-ink-2 px-4 py-3 text-mute">
          <span aria-hidden className="mt-0.5 size-1.5 shrink-0 bg-signal" />
          {t("share.lockedHint")}
        </p>
      ) : null}
    </div>
  );
}