"use client";

import Link from "next/link";

type Props = {
  /** Куда вернуть человека после входа. */
  nextPath: string;
  username?: string | null;
  /** Что человек собирался сделать: поставить лайк, ответить, написать. */
  action: "like" | "reply" | "post";
};

const TITLES: Record<Props["action"], string> = {
  like: "Нравится?",
  reply: "Ответить?",
  post: "Писать в ветки?",
};

const HINTS: Record<Props["action"], string> = {
  like: "Без аккаунта лайк не сохранится.",
  reply: "Войди и ответь — ветка живая, когда в ней есть два голоса.",
  post: "Покажи свой бит, получи ответ и найди артиста.",
};

/**
 * Незаменимая подсказка вместо отката действия. Раньше лайк у гостя
 * на секунду загорался и тут же гас, и человек не понимал почему.
 */
export function AuthPrompt({ nextPath, username, action }: Props) {
  const href = `/login?next=${encodeURIComponent(nextPath)}`;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-6">
      <div className="pointer-events-auto flex w-full max-w-md flex-col gap-3 border border-signal/40 bg-ink-2 p-5 shadow-[0_20px_60px_rgba(0,0,0,.6)]">
        <div className="flex items-center gap-3">
          <span aria-hidden className="size-1.5 bg-signal" />
          <p className="font-display text-sm text-paper uppercase">{TITLES[action]}</p>
        </div>

        <p className="text-sm text-mute">{HINTS[action]}</p>

        <div className="flex flex-wrap items-center gap-3">
          {/* Отдельной страницы регистрации нет: вход и регистрация живут на /login */}
          <Link href={href} className="label border border-signal bg-signal px-3 py-2 text-ink transition-colors hover:bg-paper">
            Войти или зарегистрироваться
          </Link>
          {username ? (
            <Link href={`/beatmakers/${username}`} className="label ml-auto text-mute hover:text-paper">
              профиль
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
