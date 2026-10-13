"use client";

import Link from "next/link";

import { useI18n } from "@/lib/i18n/provider";

type Props = {
  /** Куда вернуть человека после входа. */
  nextPath: string;
  username?: string | null;
  /** Что человек собирался сделать: поставить лайк, ответить, написать. */
  action: "like" | "reply" | "post";
  onClose: () => void;
};

/**
 * Незаменимая подсказка вместо отката действия. Раньше лайк у гостя
 * на секунду загорался и тут же гас, и человек не понимал почему.
 */
export function AuthPrompt({ nextPath, username, action, onClose }: Props) {
  const { t } = useI18n();
  const href = `/login?next=${encodeURIComponent(nextPath)}`;

  const titleKey = `auth.${action}Title` as "auth.likeTitle";
  const hintKey = `auth.${action}Hint` as "auth.likeHint";

  return (
    <div role="dialog" aria-label={t(titleKey)} className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-6">
      <div className="pointer-events-auto flex w-full max-w-md flex-col gap-3 border border-signal/40 bg-ink-2 p-5 shadow-[var(--shadow-3)]">
        <div className="flex items-center gap-3">
          <span aria-hidden className="size-1.5 bg-mute/50" />
          <p className="font-display text-sm text-paper uppercase">{t(titleKey)}</p>
          <button type="button" onClick={onClose} aria-label={t("auth.close")} className="label ml-auto text-mute transition-colors hover:text-paper">
            <span aria-hidden>✕</span>
          </button>
        </div>

        <p className="text-sm text-mute">{t(hintKey)}</p>

        <div className="flex flex-wrap items-center gap-3">
          {/* Отдельной страницы регистрации нет: вход и регистрация живут на /login */}
          <Link href={href} className="label border border-signal bg-signal px-3 py-2 text-ink transition-colors hover:bg-paper">
            {t("auth.loginCta")}
          </Link>
          {username ? (
            <Link href={`/beatmakers/${username}`} className="label ml-auto text-mute hover:text-paper">
              {t("auth.viewProfile")}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
