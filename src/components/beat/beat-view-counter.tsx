"use client";

import { useEffect } from "react";

/**
 * Отметка просмотра бита.
 *
 * Счётчик увеличивается из браузера, а не на сервере при рендере: рендер
 * может выполняться повторно — на предзагрузке, на перерисовке, на
 * prefetch — и просмотр нашёлся бы без открытия страницы.
 *
 * Владельцу бита просмотр не засчитывается: иначе он сам себя накручивает.
 */
export function BeatViewCounter({ beatId, isOwner }: { beatId: string; isOwner: boolean }) {
  useEffect(() => {
    if (isOwner) return;

    // Один просмотр за приход на страницу: перемотка вверх-вниз не должна
    // увеличивать число заново.
    const key = `beat-view:${beatId}:${Math.floor(Date.now() / 60000)}`;

    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Приватный режим: считаем без защиты от повтора, лучше лишнее, чем
      // молчащий счётчик.
    }

    const timer = window.setTimeout(() => {
      void fetch(`/api/beats/${beatId}/view`, { method: "POST", keepalive: true }).catch(() => {});
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [beatId, isOwner]);

  return null;
}