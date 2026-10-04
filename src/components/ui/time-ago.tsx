"use client";

import { useEffect, useState } from "react";

import { absoluteDate, timeAgo } from "@/lib/dates";
import type { Locale } from "@/lib/i18n/locale";

/**
 * «5 минут назад», но без расхождения при гидрации.
 *
 * Сервер отдаёт страницу в момент T1, браузер оживляет её в момент T2, и
 * относительное время между ними успевает измениться. React считает это
 * ошибкой и перерисовывает дерево целиком. Поэтому первая отрисовка — на
 * сервере и клиенте одинаковая дата в UTC, а «назад» появляется после
 * монтирования и обновляется раз в полминуты.
 */
export function TimeAgo({ iso, locale, className }: { iso: string; locale: Locale; className?: string }) {
  const [text, setText] = useState(() => absoluteDate(iso, locale));

  useEffect(() => {
    const update = () => setText(timeAgo(iso, locale));

    update();
    const timer = window.setInterval(update, 30_000);

    return () => window.clearInterval(timer);
  }, [iso, locale]);

  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
