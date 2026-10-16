import { isCurrency } from "@/lib/currency";
import { NextResponse } from "next/server";

import { MAX_COVER_BYTES, extensionOf, validateCoverFile } from "@/lib/beats";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { normalizeGenre } from "@/lib/beat-validation";
import { applyDiscount, normalizeDiscount, normalizePrices, pricesForDb } from "@/lib/prices";
import { canPutOnSale, canTakeOffSale, type SaleState } from "@/lib/sales/state";

async function requireOwner(beatId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: NextResponse.json({ error: "Нужно войти" }, { status: 401 }) };

  const { data: beat } = await supabase
    .from("beats")
    .select("id, owner_id, sale_state, is_public, prices, genre")
    .eq("id", beatId)
    .maybeSingle();

  if (!beat) return { error: NextResponse.json({ error: "Бит не найден" }, { status: 404 }) };
  if (beat.owner_id !== user.id) return { error: NextResponse.json({ error: "Чужой бит" }, { status: 403 }) };

  return { supabase, user, beat };
}

async function removeFolder(supabase: Awaited<ReturnType<typeof createClient>>, bucket: string, prefix: string) {
  const { data } = await supabase.storage.from(bucket).list(prefix);
  const paths = (data ?? []).map((item) => `${prefix}/${item.name}`).filter((path) => !path.endsWith("/"));

  if (paths.length > 0) {
    await supabase.storage.from(bucket).remove(paths);
  }
}

function parseJson<T>(value: FormDataEntryValue | null): T | null {
  if (typeof value !== "string" || value.trim() === "") return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/** Правка метаданных бита и замена обложки. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOwner(id);
  if ("error" in access) return access.error;

  const gate = rateLimit(clientKey(request, `beat-edit:${access.user.id}`), 60, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов, подожди минуту" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const form = await request.formData();
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : null;
  };

  const patch: Record<string, unknown> = {};

  const title = text("title");
  if (title !== null) {
    const clean = title.trim();
    if (!clean) return NextResponse.json({ error: "Название не может быть пустым" }, { status: 400 });
    patch.title = clean;
  }

  const typeBeat = text("typeBeat");
  if (typeBeat !== null) {
    patch.type_beat_artists = typeBeat
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 6);
  }

  const bpm = text("bpm");
  if (bpm !== null) {
    const value = Math.round(Number(bpm));
    if (!Number.isFinite(value) || value < 40 || value > 300) {
      return NextResponse.json({ error: "BPM от 40 до 300" }, { status: 400 });
    }
    patch.bpm = value;
  }

  const musicalKey = text("key");
  if (musicalKey) patch.key = musicalKey.trim();

/*
 * Жанр сверяется со списком и не может быть пустым: снять его нельзя,
 * потому что без жанра бит выпадает из фильтра и из подсчёта. Правая
 * кнопка «Сохранить» без жанра обязана честно сказать об этом, а не
 * сохранить бит, который потом нигде не находится.
 *
 * Но жанр берётся из бита, а не только из формы. Иначе требование
 * превращалось в требование к запросу: любой частичный PATCH — скажем,
 * переключение «в продаже» — падал бы с «Укажите жанр», хотя жанр у бита
 * есть и менять его никто не собирался. Пустота запрещена у результата,
 * а не у того, что прислали.
 */
const incomingGenre = form.get("genre");
const genre = incomingGenre === null ? access.beat.genre : normalizeGenre(incomingGenre);

if (!genre) {
  return NextResponse.json({ error: "Укажите жанр" }, { status: 400 });
}

patch.genre = normalizeGenre(genre);

  const tags = parseJson<string[]>(form.get("tags"));
  if (tags) {
    patch.tags = tags
      .map((tag) => String(tag).replace(/^#/, "").trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  const prices = parseJson<Record<string, unknown>>(form.get("prices"));
  if (prices) {
    const base = normalizePrices(prices);

    /*
     * Скидка применяется здесь, до записи. В prices уходит цена, которую
     * спишет заказ, в prices_before — прежняя, для зачёркивания на витрине.
     * Так списание и показ берут одно и то же число: оформление заказа уже
     * читает prices и про скидку ничего знать не должен.
     */
    const percent = normalizeDiscount(form.get("discountPercent"));

    if (percent > 0) {
      patch.prices = pricesForDb(applyDiscount(base, percent));
      patch.prices_before = pricesForDb(base);
      patch.discount_percent = percent;
    } else {
      patch.prices = pricesForDb(base);
      patch.prices_before = null;
      patch.discount_percent = 0;
    }
  }

  const isPublic = text("isPublic");
  if (isPublic !== null) patch.is_public = isPublic === "true";

  /*
   * Выставка на продажу и снятие с неё.
   *
   * До этого места состояние меняли только заказы: бит уходил в «Оплачивается»
   * при покупке и возвращался в «В продаже» после неё. Бита, который кто-то
   * не купил, перевести в продажу было нечем — переключатель публикации в
   * ленте менял только is_public. Итог: бит со всеми ценами и обложкой висел
   * в черновике, не попадал ни в корзину, ни в индекс продавцов, ни в
   * sitemap, и продавец не имел ни одной кнопки, чтобы это исправить.
   *
   * Переходы спрашиваются у правил в sales/state, а не пишутся здесь свои:
   * придержанный заказ снимать нельзя, проданный эксклюзив — нельзя вернуть.
   */
  const onSale = text("onSale");
  if (onSale !== null) {
    const current = (access.beat.sale_state ?? "draft") as SaleState;
    const wantSale = onSale === "true";

    if (wantSale && !canPutOnSale(current)) {
      return NextResponse.json({ error: "Этот бит уже нельзя выставить в продажу" }, { status: 400 });
    }

    if (!wantSale && !canTakeOffSale(current)) {
      return NextResponse.json({ error: "Бит нельзя снять с продажи, его уже оплачивают" }, { status: 400 });
    }

    if (wantSale) {
      // Без цены продавать нечего, а без публикации купить нельзя: корзина
      // требует оба условия, и молча выставить бит в продажу при закрытой
      // витрине значило бы показать продавцу «в продаже» при нулевых
      // покупках.
      const priced = Object.values(normalizePrices(access.beat.prices)).some((value) => Number(value) > 0);

      if (!priced) {
        return NextResponse.json({ error: "Поставь цену хотя бы на MP3 — без цены бит не купить" }, { status: 400 });
      }

      if (!access.beat.is_public) {
        return NextResponse.json(
          { error: "Сначала покажи бит в ленте: в продаже может быть только то, что видно" },
          { status: 400 },
        );
      }
    }

    patch.sale_state = wantSale ? "on_sale" : "draft";
  }

  /*
   * Бит, убранный из ленты, с продажи снимается: купить его всё равно нельзя,
   * а «в продаже» на бите, которого нет в витрине, врёт дважды — и продавцу,
   * и покупателю, который приходит по прямой ссылке.
   */
  if (patch.is_public === false && access.beat.sale_state === "on_sale") {
    patch.sale_state = "draft";
  }

  const currency = text("currency");
  if (currency !== null) {
    if (!isCurrency(currency)) {
      return NextResponse.json({ error: "Валюта должна быть RUB, USD или EUR" }, { status: 400 });
    }
    patch.currency = currency;
  }

  const cover = form.get("coverFile");
  if (cover instanceof File && cover.size > 0) {
    if (validateCoverFile(cover)) {
      return NextResponse.json({ error: "Обложка: JPG, PNG или WEBP до 5 МБ" }, { status: 400 });
    }
    if (cover.size > MAX_COVER_BYTES) {
      return NextResponse.json({ error: "Обложка больше 5 МБ" }, { status: 400 });
    }

    const path = `${access.user.id}/${id}/cover-${Date.now()}.${extensionOf(cover.name)}`;
    const { error: uploadError } = await access.supabase.storage
      .from("covers")
      .upload(path, cover, { cacheControl: "3600", upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    patch.cover_url = access.supabase.storage.from("covers").getPublicUrl(path).data.publicUrl;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Нет изменений" }, { status: 400 });
  }

  const { error } = await access.supabase.from("beats").update(patch).eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, cover: patch.cover_url ?? null });
}

/** Удаление бита вместе с файлами: освобождаем хранилище. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOwner(id);
  if ("error" in access) return access.error;

  const gate = rateLimit(clientKey(request, `beat-delete:${access.user.id}`), 20, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов, подожди минуту" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const folder = `${access.user.id}/${id}`;

  await Promise.all([
    removeFolder(access.supabase, "beats", folder),
    removeFolder(access.supabase, "masters", folder),
    removeFolder(access.supabase, "covers", folder),
  ]);

  const { error } = await access.supabase.from("beats").delete().eq("id", id);

  if (error) {
    console.error("beat delete failed", error.code);
    return NextResponse.json({ error: "Не удалось удалить бит" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cleaned: folder });
}