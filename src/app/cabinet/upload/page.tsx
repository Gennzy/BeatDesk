import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { UploadForm } from "@/components/upload/upload-form";
import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";
import { getSupabase } from "@/lib/supabase/user";

export const metadata: Metadata = {
  title: "Загрузка бита",
  description: "Загрузи MP3, WAV или архив со стемами, заполни название, BPM, тональность и теги — BeatDesk соберёт блоки для площадок.",
  robots: { index: false, follow: false },
};

export default async function UploadPage() {
  const [t, supabase] = await Promise.all([getT(), getSupabase()]);

  if (!supabase) {
    redirect("/login?next=/cabinet/upload");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/cabinet/upload");
  }

  return (
    <section className="py-14 lg:py-20">
      <Container>
        <div className="flex flex-col gap-4 border-b border-line pb-8">
          <span className="flex items-center gap-3">
            <span aria-hidden className="size-1.5 bg-mute/50" />
            <span className="label text-mute">{t("upload.sub")}</span>
          </span>
          <h1 className="font-display text-section font-black text-paper uppercase">{t("upload.title")}</h1>
          <p className="label text-mute">
            <Link href="/profile" className="underline-offset-4 hover:text-paper hover:underline">
              ← {t("profile.edit")}
            </Link>
          </p>
        </div>

        <UploadForm userId={user.id} />
      </Container>
    </section>
  );
}