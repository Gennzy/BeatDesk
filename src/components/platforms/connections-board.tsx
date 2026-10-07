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

/** Что Google сообщил на обратном пути: ?youtube=ok | error | denied. */
type OAuthReturn = { youtube?: string; channel?: string; detail?: string };

type Props = {
  /** Параметры возврата из OAuth. Приходят один раз, сразу после входа. */
  oauthReturn?: OAuthReturn;
  connected: ConnectionRow[];
  platforms: Platform[];
  groups: PlatformGroup[];
};

export function ConnectionsBoard({ connected, platforms, groups, oauthReturn }: Props) {
  const { t } = useI18n();
  const router = useRouter();

  const [busy, setBusy] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  /** Имя канала, которое вернула проверка: база может хранить старое. */
  const [labels, setLabels] = useState<Record<string, string>>({});
  /*
   * Сообщение из OAuth ставим сразу при разборе страницы, а не в эффекте:
   * эффект выполнился бы после отрисовки, и человек мигнул бы на пустое
   * поле, решив, что подключение прошло молча.
   */
  const [error, setError] = useState<string | null>(() => {
    if (!oauthReturn) return null;
    if (oauthReturn.youtube === "denied") return "Доступ не выдан — это нормально, подключать было необязательно.";
    if (oauthReturn.youtube === "error") return oauthReturn.detail ?? "Подключение не удалось";
    if (oauthReturn.youtube === "ok" && oauthReturn.channel) return `Канал «${oauthReturn.channel}» подключён`;

    return null;
  });
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
      /*
       * У YouTube своя проверка с обновлением токена: общий маршрут не знает
       * про refresh_token и через час после подключения называл бы канал
       * сломанным, хотя подключение живое.
       */
      const isYoutube = platformId === "youtube";

      const response = isYoutube
        ? await fetch("/api/platforms/youtube/check", { method: "GET" })
        : await fetch("/api/platforms/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ platform: platformId }),
          });
      const data = (await response.json()) as Verdict & { error?: string; ok?: boolean; detail?: string; label?: string };

      // Отсутствие строки — это «не подключено», а не ошибка проверки.
      if (response.status === 404) {
        setError(t("connections.notConnectedYet"));
        return;
      }

      if (!response.ok) {
        setError(data.error ?? data.detail ?? "Проверка не удалась");
        return;
      }

      if (data.ok === false) {
        setError(data.detail ?? t("connections.problemNoToken"));
        return;
      }

      setVerdicts((prev) => ({ ...prev, [platformId]: { ok: true } }));

      // Канал мог смениться: показываем новое имя, а не старое из базы.
      if (data.label) {
        setLabels((prev) => ({ ...prev, [platformId]: data.label! }));
      }
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
                          {row && !verdict?.detail ? <p className="mono text-xs text-mute">{metaSummary(row, t, labels[platform.id])}</p> : null}
                          {row && !isConnected(platform, row) ? (
                            <p className="text-xs text-amber">{t("connections.notConnectedYet")}</p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
    
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
                                disabled={busy === platform.id || platform.level === "oauth"}
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
                          ) : platform.level === "oauth" ? (
                            <a href={platform.oauthPath ?? `/api/platforms/${platform.id}/authorize`}>
                              <Button type="button" variant="signal" size="sm">
                                {t("connections.connect")}
                              </Button>
                            </a>
                          ) : (
                            <Button
                              type="button"
                              variant="signal"
                              size="sm"
                              onClick={() => (isOpen ? setOpenId(null) : setOpenId(platform.id))}
                            >
                              {t("connections.connect")}
                            </Button>
                          )}
                        </div>
                      </div>

                      {isOpen ? (
                        <ConnectForm
                          platform={platform}
                          busy={busy === platform.id}
                          onConnect={connect}
                        />
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
function metaSummary(row: ConnectionRow, t: (key: TranslationKey) => string, fresh?: string): string {
  const meta = row.meta ?? {};
  const parts: string[] = [];

  if (meta.chatId) parts.push(String(meta.chatId));
  if (meta.groupId) parts.push(String(meta.groupId));
  if (fresh) parts.push(fresh);
  if (!fresh && row.label) parts.push(row.label);

  if (parts.length > 0) return parts.join(" · ");
  return row.hasToken ? t("connections.secretStored") : t("connections.secretMissing");
}
