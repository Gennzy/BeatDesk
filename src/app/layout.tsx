import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope, Unbounded } from "next/font/google";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PlayerBar } from "@/components/player/player-bar";
import { PlayerProvider } from "@/components/player/player-provider";
import { AuthPromptProvider } from "@/components/posts/auth-prompt-provider";
import { I18nProvider } from "@/lib/i18n/provider";
import { getLocale } from "@/lib/i18n/server";
import { getSessionUser } from "@/lib/supabase/user";
import { evaluateGate } from "@/lib/release";
import { getSiteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

import "./globals.css";

const unbounded = Unbounded({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "600", "700", "900"],
  variable: "--font-unbounded",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["cyrillic", "latin"],
  variable: "--font-manrope",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const metadataBase = new URL(await getSiteUrl());

  return {
    metadataBase,
    title: {
      default: "BeatDesk · публикация битов без рутины",
      template: `%s · ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "ru_RU",
    title: "BeatDesk · публикация битов без рутины",
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "BeatDesk · публикация битов без рутины",
    description: SITE_DESCRIPTION,
  },
    robots: { index: true, follow: true },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#08080a",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, user] = await Promise.all([getLocale(), getSessionUser()]);

  /*
   * Пока сервис в разработке, наружу показываем заглушку.
   *
   * Проверка идёт после получения сессии, иначе владелец тоже увидит
   * заглушку и не сможет проверить правку.
   */
  const gate = evaluateGate({
    gate: process.env.BEATDESK_GATE,
    email: user?.email,
    production: process.env.VERCEL_ENV === "production",
  });

  return (
    <html lang={locale} className={`${unbounded.variable} ${manrope.variable} ${jetbrains.variable}`}>
      <body className="min-h-svh bg-ink text-paper">
        <I18nProvider locale={locale}>
          <AuthPromptProvider loggedIn={Boolean(user)}>
            {gate.open ? (
              <PlayerProvider>
                <div className="flex min-h-svh flex-col">
                  <SiteHeader user={user} />
                  <main className="flex-1 pb-20 pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</main>
                  <SiteFooter />
                  <PlayerBar />
                </div>
              </PlayerProvider>
            ) : (
              <ComingSoon />
            )}
          </AuthPromptProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

/**
 * Заглушка на время разработки.
 *
 * Показывает, что сервис скоро открывается, и ничего лишнего: ссылок на
 * разделы нет, чтобы человек не попал в недостроенный интерфейс.
 */
function ComingSoon() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader user={null} />
      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="flex max-w-[54ch] flex-col gap-6 text-center">
          <span className="label text-mute">скоро</span>
          <h1 className="font-display text-[clamp(2rem,6vw,3.5rem)] leading-[1.05] font-black tracking-tight text-paper uppercase">
            BeatDesk <span className="text-signal">в разработке</span>
          </h1>
          <p className="text-sm leading-relaxed text-mute">
            Сервис почти готов. Пока мы его доводим, площадки для битов закрыты — заходите позже, мы напишем.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
