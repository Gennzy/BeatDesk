import { NextResponse } from "next/server";

import { suggestBeatFacts, type BeatFacts } from "@/lib/ai/beat-copy";
import { isConfigured } from "@/lib/ai/openrouter";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Подсказки по оформлению бита.
 *
 * Ключ живёт только на сервере: в браузере он попал бы в исходники страницы и
 * стал бы доступен каждому, кто откроет код.
 *
 * Частоту ограничиваем жёстко: бесплатные модели у OpenRouter имеют общий
 * лимит, и без ограничения один человек мог бы выбрать его целиком.
 */

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const number = (value: unknown): number | undefined => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const list = (value: unknown, max: number, limit: number): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, limit)
    : [];

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "AI не настроен: не задан OPENROUTER_API_KEY" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  // 6 подсказок в минуту: хватает на оформление бита и не съедает лимит.
  const gate = rateLimit(clientKey(request, `ai-beat:${user.id}`), 6, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов к AI. Подожди минуту." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(gate.retryAfter / 1000)) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Нужен JSON" }, { status: 400 });
  }

  const facts: BeatFacts = {
    title: text(body.title, 80) || undefined,
    bpm: number(body.bpm),
    musicalKey: text(body.key, 12) || undefined,
    tags: list(body.tags, 24, 12),
    artists: list(body.artists, 60, 30),
    duration: number(body.duration),
    hasStems: body.hasStems === true,
    hasWav: body.hasWav === true,
  };

  if (!facts.bpm && !facts.tags?.length && !facts.title) {
    return NextResponse.json({ error: "Нужны хотя бы название, темп или теги" }, { status: 400 });
  }

  const result = await suggestBeatFacts(facts);

  if ("error" in result) {
    // 502: наш сервер жив, упал внешний сервис — это его проблема, не бита.
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json(result);
}
