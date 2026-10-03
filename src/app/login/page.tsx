import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";
import { getSessionUser } from "@/lib/supabase/user";

export const metadata: Metadata = {
  title: "Вход",
  description: "Вход и регистрация в BeatDesk: загружай биты, получай блоки для BeatChain, YouTube, ВК и Telegram.",
  robots: { index: false, follow: true },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, t, user] = await Promise.all([searchParams, getT(), getSessionUser()]);

  if (user) {
    redirect("/profile");
  }

  const nextPath = next?.startsWith("/") ? next : "/";

  return (
    <section className="py-20 lg:py-28">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_26rem]">
          <div className="hidden lg:flex lg:flex-col lg:gap-8">
            <span className="flex items-center gap-3">
              <span aria-hidden className="size-1.5 bg-signal" />
              <span className="label text-paper">{t("auth.signIn")} / {t("auth.signUp")}</span>
            </span>
            <h1 className="max-w-[16ch] font-display text-title font-black text-paper uppercase">{t("login.sub")}</h1>
            <ul className="mt-2 flex flex-col gap-3">
              {[t("login.email"), t("login.password"), t("login.google")].map((item) => (
                <li key={item} className="label flex items-center gap-3 text-mute">
                  <span aria-hidden className="size-1 bg-line-2" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="signal-rail border border-line bg-ink-2 p-6 pl-7 lg:p-8 lg:pl-9">
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