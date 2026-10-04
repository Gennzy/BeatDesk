"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConnectForm } from "@/components/platforms/connect-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { absoluteDateTime } from "@/lib/dates";
import { useI18n } from "@/lib/i18n/provider";
import {
  DISTRIBUTORS,
  GROUP_HINTS,
  GROUP_LABELS,
  LEVEL_LABELS,
  platformsByGroup,
  type Platform,
  type PlatformGroup,
  type PlatformId,
} from "@/lib/platforms/registry";

type Props = {
  beatId: string;
  connections: Record<string, { label: string | null; meta: Record<string, unknown> }>;
  botReady: boolean;
  posts: { platform: string; status: string; externalUrl: string | null; error: string | null; createdAt: string }[];
  /** поля, которые вставляются руками в маркетплейс */
  pasteFields: { label: string; value: string }[];
};

type Status = { kind: "idle" } | { kind: "busy"; platform: string } | { kind: "error"; message: string };
type Result = { ok: boolean; message: string; url?: string };

export function PublishPanel({ beatId, connections, botReady, posts, pasteFields }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [selected, setSelected] = useState<PlatformId[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [results, setResults] = useState<Record<string, Result>>({});
  const [chats, setChats] = useState<{ chatId: string; type: string; title: string }[]>([]);
  const [showDetected, setShowDetected] = useState(false);

  function toggle(id: PlatformId) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function detectChats() {
    setStatus({ kind: "busy", platform: "telegram" });
    try {
      const response = await fetch("/api/platforms/telegram/detect", { cache: "no-store" });
      const data = await response.json();
      setChats(data.chats ?? []);
      setShowDetected(true);
      if (!data.chats?.length) setStatus({ kind: "error", message: t("publish.noChats") });
    } catch {
      setStatus({ kind: "error", message: t("publish.error") });
    } finally {
      setStatus({ kind: "idle" });
    }
  }

  async function connect(platform: Platform, meta: Record<string, string>) {
    setStatus({ kind: "busy", platform: platform.id });
    try {
      const response = await fetch("/api/platforms/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: platform.id,
          meta,
          accessToken: meta.accessToken || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus({ kind: "error", message: data.error ?? t("publish.error") });
        return;
      }
      setShowDetected(false);
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: t("publish.error") });
    } finally {
      setStatus({ kind: "idle" });
    }
  }

  async function publish() {
    if (selected.length === 0) return;
    setStatus({ kind: "busy", platform: "all" });
    setResults({});

    try {
      const response = await fetch(`/api/beats/${beatId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: selected }),
      });
      const data = await response.json();

      if (!response.ok) {
        setStatus({ kind: "error", message: data.error ?? t("publish.error") });
        return;
      }

      const next: Record<string, Result> = {};
      for (const result of data.results ?? []) {
        next[result.platform] = {
          ok: result.ok,
          message: result.ok ? t("publish.sent") : (result.error ?? t("publish.error")),
          url: result.externalUrl,
        };
      }
      setResults(next);
      setStatus({ kind: "idle" });
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: t("publish.error") });
    }
  }

  async function disconnect(platform: string) {
    setStatus({ kind: "busy", platform });
    await fetch("/api/platforms/connect", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform }),
    });
    router.refresh();
    setStatus({ kind: "idle" });
  }

  const connectedIds = Object.keys(connections);
  const groups: PlatformGroup[] = ["broadcast", "market", "distribution"];
  const autoPublishable = platformsByGroup("broadcast").filter((platform) => !platform.noAutoPublish);

  return (
    <div className="flex flex-col gap-14 pt-10">
      {groups.map((group) => {
        const platforms = platformsByGroup(group);
        if (platforms.length === 0) return null;

        return (
          <section key={group} className="flex flex-col gap-6">
            <header className="flex flex-col gap-2 border-b border-line pb-4">
              <div className="flex flex-wrap items-center gap-3">
                <span aria-hidden className="size-1.5 bg-signal" />
                <span className="label text-paper">{GROUP_LABELS[group]}</span>
              </div>
              <p className="max-w-[76ch] text-sm leading-relaxed text-mute">{GROUP_HINTS[group]}</p>
            </header>

            {group === "broadcast" ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button size="md" onClick={() => void publish()} disabled={selected.length === 0 || status.kind === "busy"}>
                  {t("publish.send")} · {selected.length || ""}
                </Button>
                <span className="label text-mute">{t("publish.hint")}</span>
              </div>
            ) : null}

            {status.kind === "error" && group === "broadcast" ? (
              <p className="label text-amber">{status.message}</p>
            ) : null}

            <div className={cn("grid gap-4", group === "broadcast" ? "lg:grid-cols-2" : "xl:grid-cols-2")}>
              {platforms.map((platform) => {
                const connection = connections[platform.id];
                const isConnected = Boolean(connection) || (platform.id === "telegram" && botReady);
                const result = results[platform.id];
                const busy = status.kind === "busy" && status.platform === platform.id;
                const canAuto = platform.kind === "api" && !platform.noAutoPublish;

                return (
                  <article
                    key={platform.id}
                    className={cn(
                      "flex flex-col gap-4 border bg-ink-2 p-5",
                      isConnected ? "border-signal/30" : "border-line",
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-1.5">
                        <span className="font-display text-lg uppercase text-paper">{platform.label}</span>
                        <span
                          className={cn(
                            "label",
                            platform.level === "live" ? "text-signal" : platform.level === "manual" ? "text-mute" : "text-amber",
                          )}
                        >
                          {LEVEL_LABELS[platform.level]}
                          {platform.sendsFile ? ` · ${t("publish.withFile")}` : ""}
                        </span>
                      </div>

                      {canAuto ? (
                        <button
                          type="button"
                          onClick={() => toggle(platform.id)}
                          className={cn(
                            "label border px-3 py-1.5 transition-colors",
                            selected.includes(platform.id)
                              ? "border-signal bg-signal text-ink"
                              : "border-line text-mute hover:border-line-2 hover:text-paper",
                          )}
                        >
                          {selected.includes(platform.id) ? t("publish.selected") : t("publish.select")}
                        </button>
                      ) : platform.openUrl ? (
                        <a
                          href={platform.openUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="label border border-line px-3 py-1.5 text-mute transition-colors hover:border-line-2 hover:text-paper"
                        >
                          {t("publish.open")}
                        </a>
                      ) : null}
                    </div>

                    <p className="text-sm leading-relaxed text-mute">{platform.note}</p>

                    {platform.kind === "api" && platform.fields ? (
                      connection ? (
                        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
                          <span className="label text-signal">{t("publish.connected")}</span>
                          <button
                            type="button"
                            onClick={() => void disconnect(platform.id)}
                            className="label text-mute underline-offset-4 hover:text-amber hover:underline"
                          >
                            {t("publish.disconnect")}
                          </button>
                        </div>
                      ) : (
                        <ConnectForm platform={platform} busy={busy} onConnect={connect} />
                      )
                    ) : null}

                    {platform.id === "telegram" && !connections.telegram && botReady ? (
                      <div className="flex flex-col gap-3 border-t border-line pt-4">
                        <Button type="button" variant="ink" size="sm" onClick={() => void detectChats()} disabled={busy}>
                          {t("publish.findChat")}
                        </Button>

                        {showDetected && chats.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {chats.map((chat) => (
                              <button
                                key={chat.chatId}
                                type="button"
                                onClick={() => void connect(platform, { chatId: chat.chatId })}
                                className="flex items-center justify-between gap-3 border border-line px-3 py-2 text-left transition-colors hover:border-signal/50"
                              >
                                <span className="truncate text-sm text-paper">{chat.title}</span>
                                <span className="label text-mute">{chat.type}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}

                        {showDetected && chats.length === 0 ? (
                          <p className="text-xs leading-relaxed text-mute">{t("publish.noChats")}</p>
                        ) : null}
                      </div>
                    ) : null}

                    {group === "distribution" ? (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
                        <span className="label text-mute">Дистрибьюторы</span>
                        {DISTRIBUTORS.map((item) => (
                          <a
                            key={item.url}
                            href={item.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="label text-paper underline-offset-4 transition-colors hover:text-signal hover:underline"
                          >
                            {item.label}
                          </a>
                        ))}
                      </div>
                    ) : null}

                    {platform.docsUrl ? (
                      <a
                        href={platform.docsUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="label text-mute underline-offset-4 transition-colors hover:text-paper hover:underline"
                      >
                        {t("publish.docs")}
                      </a>
                    ) : null}

                    {result ? (
                      <p className={result.ok ? "label text-signal" : "label text-amber"}>
                        {result.url ? (
                          <a href={result.url} target="_blank" rel="noreferrer noopener" className="underline-offset-4 hover:underline">
                            {result.message}
                          </a>
                        ) : (
                          result.message
                        )}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>

            {group === "market" && pasteFields.length > 0 ? <PasteFields fields={pasteFields} /> : null}
          </section>
        );
      })}

      {posts.length > 0 ? (
        <section className="flex flex-col gap-4">
          <span className="label text-mute">{t("publish.history")}</span>
          <div className="border border-line bg-ink-2">
            {posts.map((post, index) => (
              <div key={index} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3 last:border-b-0">
                <span className="label text-paper">
                  {platformsByGroup("broadcast").find((item) => item.id === post.platform)?.label ?? post.platform}
                </span>
                <span className={post.status === "published" ? "label text-signal" : "label text-amber"}>
                  {post.status === "published" ? t("publish.sent") : (post.error ?? t("publish.error"))}
                </span>
                <span className="label text-mute">{absoluteDateTime(post.createdAt, "ru")}</span>
                {post.externalUrl ? (
                  <a
                    href={post.externalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="label text-mute underline-offset-4 hover:text-paper hover:underline"
                  >
                    {t("publish.open")}
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {connectedIds.length === 0 ? <p className="label text-mute">{t("publish.noConnections")}</p> : null}
      {autoPublishable.length === 0 ? null : null}
    </div>
  );
}

function PasteFields({ fields }: { fields: { label: string; value: string }[] }) {
  const { t } = useI18n();

  if (fields.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 border border-line bg-ink-2 p-5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="size-1.5 bg-signal" />
        <span className="label text-paper">{t("publish.pasteTitle")}</span>
      </div>
      {fields.map((field) => (
        <div key={field.label} className="flex items-start justify-between gap-3 border-b border-line px-1 py-2 last:border-b-0">
          <span className="flex min-w-0 flex-col gap-1">
            <span className="label text-paper">{field.label}</span>
            <span className="mono text-xs break-all text-mute">{field.value}</span>
          </span>
          <CopyChip text={field.value} />
        </div>
      ))}
    </div>
  );
}

function CopyChip({ text }: { text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const area = document.createElement("textarea");
          area.value = text;
          area.style.position = "fixed";
          area.style.opacity = "0";
          document.body.append(area);
          area.select();
          document.execCommand("copy");
          area.remove();
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
      className="label shrink-0 border border-line px-2.5 py-1.5 text-mute transition-colors hover:border-signal/60 hover:text-paper"
    >
      {copied ? t("share.copied") : t("share.copy")}
    </button>
  );
}
