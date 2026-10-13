"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  /*
   * Словаря здесь нет: упал корень вместе с провайдерами. Локаль читаем из
   * куки напрямую, тексты — маленькой картой. Два языка, без суррогатов.
   */
  const en = typeof document !== "undefined" && document.cookie.includes("bd-locale=en");
  const text = en
    ? { kick: "Error 500", title: "Something broke on our side", sub: "Reload the page. If that doesn't help, come back later — your data is safe.", retry: "Reload", home: "To the feed", lang: "en" as const }
    : { kick: "Ошибка 500", title: "Что-то сломалось на нашей стороне", sub: "Перезагрузи страницу. Если не помогло, вернись позже — данные на месте.", retry: "Перезагрузить", home: "В ленту", lang: "ru" as const };

  return (
    <html lang={text.lang}>
      <body className="bg-ink text-paper">
        <Container>
          <div className="flex min-h-svh flex-col justify-center gap-6 py-24">
            <span className="flex items-center gap-3">
              <span aria-hidden className="size-1.5 bg-mute/50" />
              <span className="label text-mute">{text.kick}</span>
            </span>
            <h1 className="max-w-[18ch] font-display text-section font-semibold text-paper uppercase">
              {text.title}
            </h1>
            <p className="max-w-[52ch] text-sub text-mute">{text.sub}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={reset}>
                {text.retry}
              </Button>
              <Button href="/" variant="ink" size="lg">
                {text.home}
              </Button>
            </div>
          </div>
        </Container>
      </body>
    </html>
  );
}