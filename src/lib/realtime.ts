"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

type Table = "posts" | "post_likes" | "follows" | "notifications";

type Handler = () => void;

// Колокольчик стоит в двух шапках — на широком экране и на узком, и оба
// рендерятся в дереве. Без номера они подписывались бы на один и тот же
// канал, и вторая подписка падала бы с «cannot add callbacks».
let sequence = 0;

/**
 * Подписка на изменения таблицы. Фильтры намеренно не используем: клиент
 * не знает, чьи строки ему интересны, а фильтр на сервере по
 * RLS-ограниченной подписке всё равно присылает лишнее.
 *
 * Вызывать только в клиентском компоненте: подписка требует живого
 * соединения, на сервере её создавать бессмысленно.
 */
export function useRealtime(table: Table, onChange: Handler, enabled = true): void {
  // Колбэк держим в ref, чтобы подписка не пересоздавалась на каждый рендер.
  // Присваиваем его в эффекте: трогать ref во время рендера нельзя.
  const handler = useRef(onChange);

  useEffect(() => {
    handler.current = onChange;
  });

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    sequence += 1;

    const channel = supabase
      .channel(`beatdesk:${table}:${sequence}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => handler.current())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, enabled]);
}
