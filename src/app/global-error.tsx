"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ru">
      <body className="bg-ink text-paper">
        <Container>
          <div className="flex min-h-svh flex-col justify-center gap-6 py-24">
            <span className="flex items-center gap-3">
              <span aria-hidden className="size-1.5 bg-mute/50" />
              <span className="label text-mute">Ошибка 500</span>
            </span>
            <h1 className="max-w-[18ch] font-display text-section font-semibold text-paper uppercase">
              Что-то сломалось на нашей стороне
            </h1>
            <p className="max-w-[52ch] text-sub text-mute">Перезагрузи страницу. Если не помогло, вернись позже — данные на месте.</p>
            <Button size="lg" onClick={reset}>
              Перезагрузить
            </Button>
          </div>
        </Container>
      </body>
    </html>
  );
}