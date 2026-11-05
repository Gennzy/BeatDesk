import { NextResponse } from "next/server";

import { assetsBelongTo } from "@/lib/beats";
import { validateBeat } from "@/lib/beat-validation";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { notifySelf } from "@/lib/notifications/self";
import { createClient } from "@/lib/supabase/server";
import { applyDiscount, normalizeDiscount, pricesForDb } from "@/lib/prices";
import { normalizeLicenseTerms } from "@/lib/licenses";
import { normalizeCollaborators } from "@/lib/collaborators";
import { initialSaleState } from "@/lib/sales/state";

type Body = {
  title?: unknown;
  type_beat_artists?: unknown;
  bpm?: unknown;
  key?: unknown;
  tags?: unknown;
  prices?: unknown;
  discount_percent?: unknown;
  genre?: unknown;
  currency?: unknown;
  mp3_url?: unknown;
  cover_url?: unknown;
  files?: unknown;
  is_public?: unknown;
  free_download?: unknown;
  license_terms?: unknown;
  collaborators?: unknown;
};

function text(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

/**
 * Создание бита идёт через сервер: браузер отвечает только за файлы,
 * а нормализацию и проверки делает сервер.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const limit = rateLimit(clientKey(request, `beat:${user.id}`), 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Слишком много битов подряд" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: Body;

  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const validated = validateBeat({
    title: body.title,
    typeBeatArtists: body.type_beat_artists,
    bpm: body.bpm,
    musicalKey: body.key,
    tags: body.tags,
    prices: body.prices,
    currency: body.currency,
    genre: body.genre,
  });

  if (!validated.ok) {
    return NextResponse.json({ error: validated.errors.join("; ") }, { status: 400 });
  }

  const mp3Url = text(body.mp3_url, 500);
  const coverUrl = text(body.cover_url, 500);

  // Соавторы могут прийти как {user_id, share_bps} или {username, share_bps}.
  // Во втором случае разрешаем имя в id профиля здесь, на сервере.
  let rawCollaborators = body.collaborators;
  if (Array.isArray(rawCollaborators)) {
    const resolved: { user_id: string; share_bps: number }[] = [];
    for (const item of rawCollaborators) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const share = typeof rec.share_bps === "number" ? rec.share_bps : Number(rec.share_bps);
      let userId = typeof rec.user_id === "string" ? rec.user_id.trim() : "";
      if (!userId && typeof rec.username === "string") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", rec.username.trim())
          .maybeSingle();
        userId = (profile as { id?: string } | null)?.id ?? "";
      }
      resolved.push({ user_id: userId, share_bps: share });
    }
    rawCollaborators = resolved;
  }

  const collaboratorsResult = normalizeCollaborators(rawCollaborators);
  if (!collaboratorsResult.ok) {
    return NextResponse.json({ error: collaboratorsResult.error }, { status: 400 });
  }

  if (!mp3Url) {
    return NextResponse.json({ error: "Нужен аудиофайл" }, { status: 400 });
  }

  /*
   * Скидка применяется здесь, один раз, при создании. Раньше этого делал
   * клиент, и это была ошибка: браузер можно подделать, а цена — деньги.
   * Теперь скидку считает сервер из присланных исходных цен, и в prices
   * кладётся ровно то, что спишет заказ.
   */
  const basePrices = pricesForDb(validated.value.prices);
  const discountPercent = normalizeDiscount(body.discount_percent);

  /*
   * Файлы проверяются на принадлежность владельцу.
   *
   * Правка бита такую проверку имела, а создание — нет. Разница была
   * достаточна: в созданный бит можно было вписать путь к мастеру чужого
   * бита, и покупатель уровня «MP3 + WAV» получил бы подписанную ссылку
   * на чужой мастер из закрытого бакета.
   */
  const incomingFiles = typeof body.files === "object" && body.files !== null ? body.files : {};

  if (!assetsBelongTo(user.id, incomingFiles as Record<string, unknown>)) {
    return NextResponse.json({ error: "Файл не принадлежит этому биту" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("beats")
    .insert({
      owner_id: user.id,
      title: validated.value.title,
      type_beat_artists: validated.value.type_beat_artists,
      bpm: validated.value.bpm,
      key: validated.value.key,
      tags: validated.value.tags,
      prices: (discountPercent > 0
        ? pricesForDb(applyDiscount(validated.value.prices, discountPercent))
        : basePrices) satisfies Record<string, number | null>,
      // Прежние цены — только для зачёркивания на витрине.
      prices_before: discountPercent > 0 ? basePrices : null,
      discount_percent: discountPercent,
      currency: validated.value.currency,
      genre: validated.value.genre,
      mp3_url: mp3Url,
      cover_url: coverUrl,
      files: incomingFiles,
      is_public: Boolean(body.is_public),
      /*
       * Бесплатное скачивание — решение битмейкера, и вместе с ним бит встаёт
       * под защиту: мы запоминаем, кто и когда брал файл.
       */
      free_download: Boolean(body.free_download),
      license_terms: normalizeLicenseTerms(body.license_terms),
      collaborators: collaboratorsResult.value,
      /*
       * Бит выставляется в продажу сам, без второго шага.
       *
       * Раньше sale_state здесь не задавался, и база подставляла свой дефолт
       * «черновик». Человек выкладывал бит, проставлял цены, загружал файлы —
       * и получал бит, который не продаётся, пока он не догадается ещё раз
       * открыть правку и нажать кнопку. Правило одно с правкой бита, поэтому
       * и живёт в sales/state, а не написано здесь заново.
       */
      sale_state: initialSaleState({ prices: basePrices, isPublic: Boolean(body.is_public) }),
    })
    .select("id, title")
    .single();

  /*
   * Итог загрузки попадает в уведомления: файл в 500 МБ идёт долго, и к
   * концу человек уже ушёл с вкладки. Уведомление — способ узнать, чем
   * закончилось дело, вернувшись.
   *
   * Само уведомление не должно ломать загрузку: бит уже создан, и ошибка
   * записи уведомления не повод отвечать 500 на успешный запрос.
   */
  await notifySelf(user.id, error ? "beat_failed" : "beat_uploaded", (data as { id?: string } | null)?.id ?? null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}