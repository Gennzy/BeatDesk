"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { useI18n } from "@/lib/i18n/provider";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="py-24 lg:py-32">
      <Container>
        <div className="signal-rail flex max-w-[56ch] flex-col gap-6 pl-8">
          <span className="flex items-center gap-3">
            <span aria-hidden className="size-1.5 bg-amber" />
            <span className="label text-amber">{t("error.kicker")}</span>
          </span>
          <h1 className="font-display text-section font-semibold text-paper uppercase">{t("error.title")}</h1>
          <p className="text-sub text-mute">{t("error.sub")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={reset}>
              {t("error.retry")}
            </Button>
            <Button href="/" variant="ink" size="lg">
              {t("error.home")}
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}