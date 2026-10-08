"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Поделиться битом.
 *
 * Копирование ссылки — основной способ: человек отправляет её артисту в
 * личные сообщения, и для этого не нужно открывать сеть. Соцсети и почта
 * дополняют, но не заменяют.
 *
 * Web Share на телефоне полезнее копирования: там кнопка «Поделиться» уже
 * есть в системе, и приложению не нужно угадывать список приложений.
 */
export function BeatShare({ beatId, title }: { beatId: string; title: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  /*
   * Адрес собирается после монтирования: на сервере window нет, и подстановка
   * origin прямо в рендере давала расхождение с разметкой на клиенте — React
   * перерисовывал дерево целиком и ругался в консоль.
   */
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(`${window.location.origin}/beats/${beatId}`);
  }, [beatId]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.show({ icon: "check", title: t("share.copied") });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.show({ icon: "close", title: t("share.copyFailed") });
    }
  }

  async function nativeShare() {
    if (!("share" in navigator)) return;

    try {
      await navigator.share({ title, text: title, url });
    } catch {
      // Человек закрыл системное окно — это не ошибка.
    }
  }

  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void copy()}
        className={cn(
          "flex items-center gap-2 rounded-pill border px-3 py-1.5 text-xs transition-colors",
          copied ? "border-signal text-signal" : "border-line text-mute hover:border-line-2 hover:text-paper",
        )}
      >
        <Icon name={copied ? "check" : "link"} className="size-3.5" />
        {copied ? t("share.copied") : t("share.copyLink")}
      </button>

      {canNativeShare ? (
        <button
          type="button"
          onClick={() => void nativeShare()}
          aria-label={t("share.open")}
          className="flex items-center gap-2 rounded-pill border border-line px-3 py-1.5 text-xs text-mute transition-colors hover:border-line-2 hover:text-paper"
        >
          <Icon name="share" className="size-3.5" />
          {t("share.open")}
        </button>
      ) : null}
    </div>
  );
}