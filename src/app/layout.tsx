import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope, Unbounded } from "next/font/google";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PlayerBar } from "@/components/player/player-bar";
import { PlayerProvider } from "@/components/player/player-provider";
import { AuthPromptProvider } from "@/components/posts/auth-prompt-provider";
import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/lib/i18n/provider";
import { getLocale } from "@/lib/i18n/server";
import { getSessionUser } from "@/lib/supabase/user";
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
  /*
   * Цвет строки браузера. Здесь нужен литерал, а не токен: meta-тег читает
   * значение из разметки, и var() в нём не разрешается. Значение совпадает
   * с --black-950 в globals.css — при смене фона менять в обоих местах.
   */
  themeColor: "#050505",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, user] = await Promise.all([getLocale(), getSessionUser()]);

  return (
    <html lang={locale} className={`${unbounded.variable} ${manrope.variable} ${jetbrains.variable}`}>
      <body className="min-h-svh bg-ink text-paper">
        <I18nProvider locale={locale}>
          <AuthPromptProvider loggedIn={Boolean(user)}>
            <PlayerProvider>
              {/* Баннеры уведомлений живут здесь: они должны переживать смену
                  маршрута, иначе всплывашка исчезала бы на каждом переходе. */}
              <ToastProvider>
                <div className="flex min-h-svh flex-col">
                  <SiteHeader user={user} />
                  <main className="flex-1 pb-20 pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</main>
                  <SiteFooter user={user} />
                  <PlayerBar />
                </div>
              </ToastProvider>
            </PlayerProvider>
          </AuthPromptProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

