import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { LoginVisual } from "@/components/auth/login-visual";
import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";
import { getSessionUser } from "@/lib/supabase/user";

export const metadata: Metadata = {
  title: "Вход",
  description: "Вход и регистрация в BeatDesk: загружай биты, получай блоки для BeatChain, YouTube, ВК и Telegram.",
  robots: { index: false, follow: true },
};

const BENEFITS = [
  {
    key: "login.benefitUpload",
    title: "login.benefitUploadTitle",
    note: "login.benefitUploadNote",
    icon: (
      <>
        <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" strokeWidth="1.6" />
        <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" strokeWidth="1.6" />
      </>
    ),
  },
  {
    key: "login.benefitPublish",
    title: "login.benefitPublishTitle",
    note: "login.benefitPublishNote",
    icon: (
      <>
        <path d="M4 12a16 16 0 0 1 16 0" strokeWidth="1.6" />
        <path d="M4 12a16 16 0 0 0 16 0" strokeWidth="1.6" transform="rotate(180 12 12)" />
        <circle cx="12" cy="12" r="2" strokeWidth="1.6" />
        <path d="M12 12l8-5" strokeWidth="1.6" />
      </>
    ),
  },
  {
    key: "login.benefitFeed",
    title: "login.benefitFeedTitle",
    note: "login.benefitFeedNote",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="1.5" strokeWidth="1.6" />
        <path d="M8 20h8m-4-4v4" strokeWidth="1.6" />
      </>
    ),
  },
] as const;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, t, user] = await Promise.all([searchParams, getT(), getSessionUser()]);

  if (user) {
    redirect("/profile");
  }

  const nextPath = next?.startsWith("/") ? next : "/";

  return (
    <section className="relative min-h-[calc(100vh-4.5rem)] overflow-x-clip py-16 lg:py-20">
      <div className="absolute inset-0 hidden lg:block">
        <LoginVisual />
      </div>

      <Container>
        <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-20">
          <div className="relative flex min-w-0 flex-col gap-10">
            <span className="flex items-center gap-3">
              <span aria-hidden className="size-1.5 bg-signal" />
              <span className="label text-paper">{t("auth.signIn")} / {t("auth.signUp")}</span>
            </span>

            <h1 className="max-w-[13ch] font-display text-title font-black text-paper uppercase lg:max-w-[15ch]">
              {t("login.sub")}
            </h1>

            <ul className="flex max-w-[42rem] flex-col gap-px">
              {BENEFITS.map((benefit) => (
                <li key={benefit.key} className="flex items-start gap-4 border-t border-line py-4 last:border-b">
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-9 shrink-0 place-items-center border border-line text-signal"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" className="size-4.5">
                      {benefit.icon}
                    </svg>
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="font-display text-sm tracking-tight text-paper uppercase">{t(benefit.title)}</span>
                    <span className="max-w-[52ch] text-sm leading-relaxed text-mute">{t(benefit.note)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="signal-rail relative min-w-0 border border-line bg-ink-2/92 p-6 pl-7 backdrop-blur-sm lg:p-8 lg:pl-9">
            <h2 className="font-display text-title font-black text-paper uppercase">{t("login.title")}</h2>
            <div className="mt-8">
              <AuthForm nextPath={nextPath} />
            </div>

          </div>
        </div>
      </Container>
    </section>
  );
}