"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConnectForm } from "@/components/platforms/connect-form";
import { Badge, Card } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { isConnected } from "@/lib/platforms/connection-state";
import { GROUP_LABELS, type Platform, type PlatformGroup } from "@/lib/platforms/registry";

export type ConnectionRow = {
  platform: string;
  label: string | null;
  meta: Record<string, unknown>;
  hasToken: boolean;
  connectedAt: string;
};

/** Что показать рядом с площадкой до первой проверки. */
type Verdict = { ok: boolean; problem?: string; detail?: string };

const PROBLEM_LABELS: Record<string, string> = {
  no_token: "connections.problemNoToken",
  expired: "connections.problemExpired",
  not_found: "connections.problemNotFound",
  forbidden: "connections.problemForbidden",
  network: "connections.problemNetwork",
  unknown: "connections.problemUnknown",
};

type Props = {
  connected: ConnectionRow[];
  platforms: Platform[];
  groups: PlatformGroup[];
};

export function ConnectionsBoard({ connected, platforms, groups }: Props) {
  const { t } = useI18n();
  const router = useRouter();

  const [busy, setBusy] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const byPlatform = new Map(connected.map((row) => [row.platform, row]));

  async function connect(platform: Platform, meta: Record<string, string>) {
    setBusy(platform.id);
    setError(null);

    try {
      const response = await fetch("/api/platforms/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platform.id, meta }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Не удалось подключить");
        return;
      }

      setOpenId(null);
      router.refresh();
    } catch {
      setError("Сеть недоступна");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(platformId: string) {
    setBusy(platformId);
    setError(null);

    try {
      await fetch("/api/platforms/connect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platformId }),
      });
      setVerdicts((prev) => {
        const next = { ...prev };
        delete next[platformId];
        return next;
      });
      router.refresh();
    } catch {
      setError("Сеть недоступна");
    } finally {
      setBusy(null);
    }
  }

  async function check(platformId: string) {
    setBusy(platformId);
    setError(null);

    try {
      const response = await fetch("/api/platforms/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platformId }),
      });
      const data = (await response.json()) as Verdict & { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Проверка не удалась");
        return;
      }

      setVerdicts((prev) => ({ ...prev, [platformId]: data }));
    } catch {
      setError("Сеть недоступна");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-14 pt-10">
      {error ? (
        <p role="alert" className="border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
          {error}
        </p>
      ) : null}

      {groups.map((group) => {
        const items = platforms.filter((platform) => platform.group === group);
        if (items.length === 0) return null;

        return (
          <section key={group} className="flex flex-col gap-6">
            <header className="flex flex-col gap-2 border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <span aria-hidden className="size-1.5 bg-signal" />
                <span className="label text-paper">{GROUP_LABELS[group]}</span>
              </div>
              <p className="max-w-[68ch] text-sub text-mute">{t(`connections.groupHint.${group}` as "connections.groupHint.broadcast")}</p>
            </header>

            <ul className="flex flex-col gap-4">
              {items.map((platform) => {
                const row = byPlatform.get(platform.id);
                const isApi = platform.kind === "api";
                const verdict = verdicts[platform.id];
                const isOpen = openId === platform.id;

                return (
                  <li key={platform.id}>
                    <Card className="flex flex-col gap-4 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="font-display text-lg text-paper uppercase">{platform.label}</span>
                            {row ? (
                              <Badge tone={verdict ? (verdict.ok ? "signal" : "amber") : "dim"}>
                                {verdict
                                  ? verdict.ok
                                    ? t("connections.statusOk")
                                    : t((PROBLEM_LABELS[verdict.problem ?? "unknown"] ?? "connections.problemUnknown") as "connections.problemUnknown")
                                  : isConnected(platform, row)
                                    ? t("connections.statusConnected")
                                    : t("connections.statusNotSaved")}
                              </Badge>
                            ) : (
                              <Badge tone="outline">{t("connections.statusNone")}</Badge>
                            )}
                          </div>

                          <p className="max-w-[62ch] text-sm text-mute">
                            {row?.label ?? platform.note ?? t("connections.noNote")}
                          </p>

                          {verdict?.detail ? <p className="mono text-xs text-paper">{verdict.detail}</p> : null}
                          {row && !verdict?.detail ? <p className="mono text-xs text-mute">{metaSummary(row, t)}</p> : null}
                          {row && !isConnected(platform, row) ? (
                            <p className="text-xs text-amber">{t("connections.notConnectedYet")}</p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {!isApi ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => platform.openUrl && window.open(platform.openUrl, "_blank", "noopener")}
                              disabled={!platform.openUrl}
                            >
                              {t("connections.open")}
                            </Button>
                          ) : null}

                          {row ? (
                            <>
                              <Button
                                type="button"
                                variant="ink"
                                size="sm"
                                disabled={busy === platform.id}
                                onClick={() => check(platform.id)}
                              >
                                {busy === platform.id ? t("connections.checking") : t("connections.check")}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busy === platform.id}
                                onClick={() => (isOpen ? setOpenId(null) : setOpenId(platform.id))}
                              >
                                {t("connections.update")}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busy === platform.id}
                                onClick={() => disconnect(platform.id)}
                              >
                                {t("connections.disconnect")}
                              </Button>
                            </>
                          ) : isApi ? (
                            <Button
                              type="button"
                              variant="signal"
                              size="sm"
                              onClick={() => (isOpen ? setOpenId(null) : setOpenId(platform.id))}
                            >
                              {t("connections.connect")}
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {isOpen && isApi ? (
                        <ConnectForm
                          platform={platform}
                          busy={busy === platform.id}
                          onConnect={connect}
                        />
                      ) : null}

                      {!isApi ? (
                        <p className="label text-mute">{t(`connections.manual.${platform.id}` as "connections.manual.beatstars")}</p>
                      ) : null}
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Показать, куда подключено: ID канала, сообщества или имя подключения. */
function metaSummary(row: ConnectionRow, t: (key: TranslationKey) => string): string {
  const meta = row.meta ?? {};
  const parts: string[] = [];

  if (meta.chatId) parts.push(String(meta.chatId));
  if (meta.groupId) parts.push(String(meta.groupId));
  if (row.label) parts.push(row.label);

  if (parts.length > 0) return parts.join(" · ");
  return row.hasToken ? t("connections.secretStored") : t("connections.secretMissing");
}
