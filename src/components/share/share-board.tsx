"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { VisibilityToggle } from "@/components/profile/visibility-toggle";
import { useI18n } from "@/lib/i18n/provider";
import type { FeedBeat } from "@/lib/feed";
import { PLATFORM_MAP } from "@/lib/platforms/registry";

export type ShareChannel = {
  id: string;
  connected: boolean;
};

export type ShareResult = {
  beatId: string;
  title: string;
  platform: string;
  ok: boolean;
  externalUrl?: string | null;
  error?: string;
};

type Props = {
  beats: FeedBeat[];
  channels: ShareChannel[];
  /** последние публикации по битам: платформа → статус */
  published: Record<string, { platform: string; externalUrl: string | null; createdAt: string }[]>;
};

export function ShareBoard({ beats, channels, published }: Props) {
  const { t } = useI18n();
  const router = useRouter();

  const [selected, setSelected] = useState<string[]>([]);
  const [targets, setTargets] = useState<string[]>(channels.filter((item) => item.connected).map((item) => item.id));
  const [onlyPublic, setOnlyPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ShareResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () => (onlyPublic ? beats.filter((beat) => beat.isPublic) : beats),
    [beats, onlyPublic],
  );

  const connectedIds = channels.filter((item) => item.connected).map((item) => item.id);
  const readyTargets = targets.filter((id) => connectedIds.includes(id));

  function toggleBeat(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function toggleTarget(id: string) {
    setTargets((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function publish(ids: string[], list: string[]) {
    if (ids.length === 0 || list.length === 0) return;

    setBusy(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch("/api/publish/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beatIds: ids, platforms: list }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? t("publish.error"));
        return;
      }

      setResults(data.results ?? []);
      setSelected([]);
      router.refresh();
    } catch {
      setError(t("publish.error"));
    } finally {
      setBusy(false);
    }
  }

  const failures = results?.filter((item) => !item.ok) ?? [];
  const retryIds = [...new Set(failures.map((item) => item.beatId))];
  const retryTargets = [...new Set(failures.map((item) => item.platform))];

  return (
    <div className="flex flex-col gap-8 pt-10">
      <div className="flex flex-col gap-4 border border-line bg-ink-2 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3">
          <span className="label text-paper">{t("sharing.channels")}</span>
          <div className="flex flex-wrap items-center gap-2">
            {channels.map((channel) => {
              const platform = PLATFORM_MAP[channel.id as keyof typeof PLATFORM_MAP];
              if (!platform || platform.noAutoPublish) return null;

              const active = targets.includes(channel.id);

              return (
                <button
                  key={channel.id}
                  type="button"
                  disabled={!channel.connected}
                  onClick={() => toggleTarget(channel.id)}
                  className={
                    active && channel.connected
                      ? "label border border-signal bg-signal px-3 py-1.5 text-ink"
                      : channel.connected
                        ? "label border border-line px-3 py-1.5 text-mute transition-colors hover:border-line-2 hover:text-paper"
                        : "label cursor-not-allowed border border-line px-3 py-1.5 text-mute/50"
                  }
                  title={channel.connected ? platform.label : t("sharing.notConnected")}
                >
                  {platform.label}
                </button>
              );
            })}
          </div>
          {channels.every((channel) => !channel.connected) ? (
            <Link href="/settings/connections" className="label w-fit border-b border-line-2 pb-0.5 text-paper">
              {t("sharing.connectChannels")}
            </Link>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="md"
            disabled={busy || selected.length === 0 || readyTargets.length === 0}
            onClick={() => void publish(selected, readyTargets)}
          >
            {busy
              ? t("sharing.publishing")
              : `${t("sharing.publishSelected")} · ${selected.length} × ${readyTargets.length}`}
          </Button>
          {selected.length > 0 ? (
            <button
              type="button"
              onClick={() => setSelected([])}
              className="label text-mute underline-offset-4 hover:text-paper hover:underline"
            >
              {t("sharing.clearSelection")}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="label text-amber">{error}</p> : null}

      {results ? (
        <div className="flex flex-col gap-3 border border-signal/30 bg-ink-2 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="label text-signal">
              {t("sharing.done")} · {results.length - failures.length}/{results.length}
            </span>
            {failures.length > 0 ? (
              <Button
                size="sm"
                variant="ink"
                disabled={busy}
                onClick={() => void publish(retryIds, retryTargets)}
              >
                {t("sharing.retry")} · {failures.length}
              </Button>
            ) : null}
          </div>

          {failures.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {failures.slice(0, 6).map((item, index) => (
                <li key={`${item.beatId}-${item.platform}-${index}`} className="label text-amber">
                  {item.title} → {PLATFORM_MAP[item.platform as keyof typeof PLATFORM_MAP]?.label ?? item.platform}:{" "}
                  {item.error}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <span className="label text-paper">{t("sharing.beats")}</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setOnlyPublic((prev) => !prev)}
            className="label text-mute transition-colors hover:text-paper"
          >
            {onlyPublic ? t("sharing.showAll") : t("sharing.onlyPublic")}
          </button>
          <button
            type="button"
            onClick={() =>
              setSelected((prev) =>
                prev.length === visible.length ? [] : visible.map((beat) => beat.id),
              )
            }
            className="label text-mute transition-colors hover:text-paper"
          >
            {selected.length === visible.length && visible.length > 0 ? t("sharing.unselectAll") : t("sharing.selectAll")}
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sub text-mute">{t("sharing.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-px">
          {visible.map((beat) => {
            const checked = selected.includes(beat.id);
            const posts = published[beat.id] ?? [];

            return (
              <li
                key={beat.id}
                className={checked ? "flex items-center gap-4 border border-signal/40 bg-ink-2 p-3" : "flex items-center gap-4 border border-line bg-ink-2 p-3"}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleBeat(beat.id)}
                  aria-label={beat.title}
                  className="size-4 shrink-0 accent-[#d8ff3e]"
                />

                {beat.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={beat.coverUrl} alt="" className="size-12 shrink-0 border border-line object-cover" />
                ) : (
                  <span aria-hidden className="cover-grid size-12 shrink-0 border border-line" />
                )}

                <Link href={`/beats/${beat.id}`} className="flex min-w-0 flex-1 flex-col gap-1 hover:opacity-80">
                  <span className="truncate font-display text-sm tracking-tight text-paper uppercase">{beat.title}</span>
                  <span className="label text-mute">
                    {beat.bpm} BPM · {beat.musicalKey} · {beat.plays} {t("sharing.plays")}
                  </span>
                </Link>

                <div className="hidden items-center gap-2 sm:flex">
                  {channels.map((channel) => {
                    if (!connectedIds.includes(channel.id)) return null;
                    const platform = PLATFORM_MAP[channel.id as keyof typeof PLATFORM_MAP];
                    if (!platform || platform.noAutoPublish) return null;

                    const post = posts.find((item) => item.platform === channel.id);

                    return post ? (
                      post.externalUrl ? (
                        <a
                          key={channel.id}
                          href={post.externalUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="label border border-signal/40 px-2 py-1 text-signal"
                        >
                          {platform.label}
                        </a>
                      ) : (
                        <span key={channel.id} className="label border border-line px-2 py-1 text-mute">
                          {platform.label}
                        </span>
                      )
                    ) : null;
                  })}
                </div>

                <VisibilityToggle beatId={beat.id} initialPublic={beat.isPublic} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}