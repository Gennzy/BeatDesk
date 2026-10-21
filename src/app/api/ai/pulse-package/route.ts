import { NextResponse, type NextRequest } from "next/server";

import { mergeWithRules, suggestPackage } from "@/lib/ai/pulse-package";
import { demandTagsFor } from "@/lib/demand-server";
import { isConfigured } from "@/lib/ai/openrouter";
import { buildPulseMetadata, type PulseTemplate } from "@/lib/pulse/metadata";
import type { GenreSlug } from "@/lib/beat-validation";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Упаковка ролика: модель дополняет то, что собрали правила.
 *
 * Отдельный маршрут, а не флаг у /api/pulse/jobs: правила считаются на
 * устройстве мгновенно, модель отвечает секундами, и публикация не должна
 * ждать ответа модели.
 */

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const list = (value: unknown, max: number): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, max)).filter(Boolean)
    : [];

export async function POST(request: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "AI не настроен: не задан OPENROUTER_API_KEY" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  // 6 в минуту: хватает на перебор битов и не съедает общий лимит бесплатных
  // моделей, который делится на всех.
  const gate = rateLimit(clientKey(request, `ai-package:${user.id}`), 6, 60_000);

  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов к AI. Подожди минуту." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body) return NextResponse.json({ error: "Пустой запрос" }, { status: 400 });

  const template: PulseTemplate = body.template === "nonProfit" ? "nonProfit" : "paid";

  const beat = {
    title: text(body.title, 120),
    bpm: Math.round(Number(body.bpm)) || 0,
    musicalKey: text(body.musicalKey, 20),
    genre: (text(body.genre, 40) || null) as GenreSlug | null,
    genreLabel: text(body.genreLabel, 40) || null,
    tags: list(body.tags, 40).slice(0, 8),
    artists: list(body.artists, 40).slice(0, 6),
    producer: text(body.producer, 60),
    beatUrl: text(body.beatUrl, 300),
  };

  if (!beat.title || !beat.bpm) {
    return NextResponse.json({ error: "Нужны название и темп бита" }, { status: 400 });
  }

  /*
   * Правила считаются всегда, даже если модель ответит.
   *
   * Это не запасной путь, а страховка: человек нажал «собрать ролик» и ждёт
   * двадцать минут рендера, и вместо ролика получил бы ошибку из-за того,
   * что бесплатная модель была перегружена. Публикация не должна зависеть от
   * чужой очереди.
   */
  const ruled = buildPulseMetadata(beat, template);

  /*
   * Спрос площадки достаётся до обращения к модели.
   *
   * Это и есть то, что отличает нашу подсказку от любой другой: модель
   * получает не общие знания о битах, а теги, которые у нас действительно
   * приводят прослушивания. Без этого модель выдаёт красивые и бесполезные
   * слова — и это ровно то, что делает подсказки Echo обычными.
   */
  const demandTags = await demandTagsFor(beat.genre);

  const ai = await suggestPackage({ beat, template, demandTags });
  const merged = mergeWithRules(ai, ruled);

  return NextResponse.json({
    // false — человек должен знать, что перед ним правила, а не модель:
    // иначе непонятно, почему подсказка не изменилась.
    ai: Boolean(ai),
    title: merged.title,
    description: merged.description,
    tags: merged.tags,
  });
}