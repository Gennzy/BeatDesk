import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";
import type { SessionUser } from "@/lib/supabase/user";

export async function SiteFooter({ user }: { user: SessionUser | null }) {
  const t = await getT();

  return (
    <footer className="mt-24 border-t border-line bg-ink-2/40">
      <Container>
        <div className="grid gap-10 py-14 md:grid-cols-3">
          <div className="flex flex-col gap-3">
            <Logo className="h-[19px] self-start" />
            <p className="max-w-[30ch] text-sm text-mute">{t("footer.tagline")}</p>
          </div>

          <div className="flex flex-col gap-4">
            <span className="label text-mute">{t("footer.nav")}</span>
            <Link href="/" className="text-sm text-paper transition-colors hover:text-paper">
              {t("nav.feed")}
            </Link>
            {/* Кабинет гостю не показываем: он отправляет на вход, и ссылка
                в подвале была бы обещанием, которого не выполнится. */}
            {user ? (
              <Link href="/cabinet" className="text-sm text-paper transition-colors hover:text-paper">
                {t("nav.cabinet")}
              </Link>
            ) : (
              <Link href="/login" className="text-sm text-paper transition-colors hover:text-paper">
                {t("nav.login")}
              </Link>
            )}
          </div>

          <div className="flex flex-col gap-4 md:items-end md:text-right">
            <span className="label text-mute">{t("lang.label")}</span>
            <span className="label text-paper">RU · EN</span>
            <span className="label text-mute">{t("footer.placeholder")}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-line py-6 md:flex-row md:items-center md:justify-between">
          <span className="label text-mute">{t("footer.rights")}</span>
          <span className="label text-mute">{t("footer.formats")}</span>
        </div>
      </Container>
    </footer>
  );
}