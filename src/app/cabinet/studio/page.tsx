import type { Metadata } from "next";

import { StudioWorkbench } from "@/components/studio/studio-workbench";
import { Container, SectionHead } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Студия",
  robots: { index: false, follow: false },
};

/**
 * Студия битмейкера: разбор файла целиком на устройстве.
 *
 * Инструмент сознательно живёт отдельно от ленты и от кабинета: здесь
 * человек работает с черновиком, а не публикует его.
 */
export default async function StudioPage() {
  const t = await getT();

  return (
    <section className="py-14 lg:py-20">
      <Container>
        <div className="flex flex-col gap-6">
          <SectionHead label={t("nav.studio")} title={t("studio.title")} />
          <p className="max-w-[62ch] text-sub text-mute">{t("studio.intro")}</p>
        </div>

        <div className="pt-10">
          <StudioWorkbench />
        </div>
      </Container>
    </section>
  );
}