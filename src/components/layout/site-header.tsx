"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { LanguageSwitch } from "@/components/language-switch";
import { Logo } from "@/components/layout/logo";
import { Container } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { NotificationBell } from "@/components/posts/notification-bell";
import { useI18n } from "@/lib/i18n/provider";
import { signOut } from "@/lib/supabase/actions";
import type { SessionUser } from "@/lib/supabase/user";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center", className)} aria-label="BeatDesk">
      <Logo priority className="h-[26px]" />
    </Link>
  );
}

function Avatar({ user, size = "sm" }: { user: SessionUser; size?: "sm" | "md" }) {
  const className = size === "md" ? "size-9" : "size-7";

  if (user.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={user.avatarUrl} alt="" className={cn(className, "shrink-0 object-cover")} />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(className, "grid shrink-0 place-items-center bg-ink-3 font-display text-[10px] text-mute")}
    >
      {user.username.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function SiteHeader({ user }: { user: SessionUser | null }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const params = useSearchParams();
  // Значение из адреса: возврат из поиска не должен терять запрос.
  const searchQuery = params.get("q") ?? "";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = () => setOpen(false);

  const links = [
    /*
     * Публичную навигацию видят и гости, поэтому инструменты продавца в ней
     * стояли зря: «Загрузить бит» и «Студия» вели в личные инструменты,
     * а «Каналы» вообще требовали входа. Для вошедшего остаётся лента и
     * кабинет, где собрано всё остальное.
     */
    { href: "/", label: t("nav.feed") },
    ...(user ? [{ href: "/cabinet", label: t("nav.cabinet") }] : []),
  ];

  return (
    <header className="liquid-glass liquid-glass-strong sticky top-0 z-50 border-b border-line-2 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgb(0_0_0/0.4)]">
      <Container>
        {/*
          Поиск стоит по центру шапки, между навигацией и действиями. Так он
          на виду у того, кто пришёл искать бит, и не занимает место рядом с
          логотипом, где его задвигали.
        */}
        <div className="flex h-16 items-center gap-6">
          <div className="flex items-center gap-6">
            <Wordmark />

            <nav className="hidden items-center gap-6 md:flex">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "label rounded-pill px-3 py-1.5 transition-colors duration-150",
                    pathname === link.href
                      ? "bg-ink-3 text-paper"
                      : "text-mute hover:bg-ink-2 hover:text-paper",
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <form action="/" className="hidden flex-1 justify-center md:flex">
            <label className="relative block w-full max-w-md">
              <span className="sr-only">{t("feed.searchMarket")}</span>
              <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute" />
              <input
                name="q"
                type="search"
                defaultValue={searchQuery}
                placeholder={t("feed.searchMarket")}
                className="h-10 w-full rounded-pill border border-line bg-ink-2 pr-4 pl-10 text-sm shadow-[inset_0_1px_1px_rgb(0_0_0/0.35)] outline-none transition-colors placeholder:text-mute hover:border-line-2 focus:border-signal"
              />
            </label>
          </form>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-3 sm:flex">
              <LanguageSwitch />
              {user ? (
                <>
                  <NotificationBell />
                  <Link href="/profile" className="flex items-center gap-2 transition-opacity hover:opacity-80">
                    <Avatar user={user} />
                    <span className="label max-w-24 truncate text-paper">{user.username}</span>
                  </Link>
                  <form action={signOut}>
                    <button type="submit" className="label text-mute transition-colors hover:text-paper">
                      {t("auth.logOut")}
                    </button>
                  </form>
                </>
              ) : (
                /*
                 * В шапке одна главная кнопка, а не две.
                 *
                 * Раньше рядом стояли залитые «Войти» и «Регистрация»: взгляд
                 * цеплялся за обе и не решал, куда нажимать. Регистрация живёт
                 * на странице входа, тут она тихая ссылка.
                 */
                <>
                  <Link href="/login" className="label text-mute transition-colors hover:text-paper">
                    {t("nav.signup")}
                  </Link>
                  <Link href="/login" className={buttonClass({ variant: "signal", size: "sm" })}>
                    {t("nav.login")}
                  </Link>
                </>
              )}
            </div>

            {/*
             * Гость на телефоне получает ту же одну кнопку входа, что и на
             * широком экране: раньше здесь была только «Войти», а рядом на
             * странице входа ждала «Регистрация» — путь различался.
             */}
            {!user ? (
              <div className="sm:hidden">
                <Link href="/login" className={buttonClass({ variant: "signal", size: "sm" })}>
                  {t("nav.login")}
                </Link>
              </div>
            ) : null}

            <div className="flex items-center gap-3 sm:hidden">
              {user ? (
                <>
                  <NotificationBell />
                  <Link href="/profile" aria-label={t("auth.myProfile")}>
                    <Avatar user={user} size="md" />
                  </Link>
                </>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-label={open ? t("nav.close") : t("nav.menu")}
              className="label grid size-10 place-items-center border border-line text-mute transition-colors hover:border-line-2 hover:text-paper sm:hidden"
            >
              {open ? "✕" : "☰"}
            </button>
          </div>
        </div>
      </Container>

      {open ? (
        <div className="liquid-glass liquid-glass-strong border-t border-line md:hidden">
          <Container>
            <nav className="flex flex-col divide-y divide-line">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={close}
                  className="flex items-center justify-between py-5 font-display text-lg uppercase text-paper"
                >
                  {link.label}
                  <span aria-hidden className="label text-mute">
                    {link.href}
                  </span>
                </Link>
              ))}
              {user ? (
                <>
                  <Link href="/profile" onClick={close} className="py-5 font-display text-lg uppercase text-paper">
                    {t("auth.myProfile")}
                  </Link>
                  <Link href="/settings/connections" onClick={close} className="py-5 font-display text-lg uppercase text-paper">
                    {t("connections.title")}
                  </Link>
                  <form action={signOut} className="py-5">
                    <button type="submit" className="font-display text-lg uppercase text-paper">
                      {t("auth.logOut")}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={close} className="py-5 font-display text-lg uppercase text-paper">
                    {t("nav.login")}
                  </Link>
                  <Link href="/login" onClick={close} className="py-5 font-display text-lg uppercase text-paper">
                    {t("nav.signup")}
                  </Link>
                </>
              )}
            </nav>
            <div className="flex items-center justify-between py-5">
              <LanguageSwitch />
              <span className="label text-mute">RU / EN</span>
            </div>
          </Container>
        </div>
      ) : null}
    </header>
  );
}