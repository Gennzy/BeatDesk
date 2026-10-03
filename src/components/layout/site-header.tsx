"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { LanguageSwitch } from "@/components/language-switch";
import { Logo } from "@/components/layout/logo";
import { Container } from "@/components/ui/container";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
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
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = () => setOpen(false);

  const links = [
    { href: "/", label: t("nav.feed") },
    ...(user ? [{ href: "/share", label: t("nav.share") }] : []),
    { href: "/upload", label: t("nav.upload") },
  ];

  return (
    <header className="liquid-glass liquid-glass-strong sticky top-0 z-50 border-b border-line pt-[env(safe-area-inset-top)]">
      <Container>
        <div className="flex h-16 items-center gap-6">
          <Wordmark />

          <nav className="hidden items-center gap-6 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "label transition-colors duration-150 hover:text-paper",
                  pathname === link.href ? "text-signal" : "text-mute",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-3 sm:flex">
              <LanguageSwitch />
              {user ? (
                <>
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
                <>
                  <Link href="/login" className={buttonClass({ variant: "ghost", size: "sm" })}>
                    {t("nav.login")}
                  </Link>
                  <Link href="/login" className={buttonClass({ variant: "signal", size: "sm" })}>
                    {t("nav.signup")}
                  </Link>
                </>
              )}
            </div>

            <div className="flex items-center gap-3 sm:hidden">
              {user ? (
                <Link href="/profile" aria-label={t("auth.myProfile")}>
                  <Avatar user={user} size="md" />
                </Link>
              ) : (
                <Link href="/login" className={buttonClass({ variant: "ghost", size: "sm" })}>
                  {t("nav.login")}
                </Link>
              )}
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
                  <form action={signOut} className="py-5">
                    <button type="submit" className="font-display text-lg uppercase text-signal">
                      {t("auth.logOut")}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={close} className="py-5 font-display text-lg uppercase text-paper">
                    {t("nav.login")}
                  </Link>
                  <Link href="/login" onClick={close} className="py-5 font-display text-lg uppercase text-signal">
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