import { isCurrency } from "@/lib/currency";
import { NextResponse } from "next/server";

import { MAX_COVER_BYTES, extensionOf, validateCoverFile } from "@/lib/beats";
import { createClient } from "@/lib/supabase/server";
import { pricesForDb } from "@/lib/prices";

async function requireOwner(beatId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: NextResponse.json({ error: "Нужно войти" }, { status: 401 }) };

  const { data: beat } = await supabase.from("beats").select("id, owner_id").eq("id", beatId).maybeSingle();

  if (!beat) return { error: NextResponse.json({ error: "Бит не найден" }, { status: 404 }) };
  if (beat.owner_id !== user.id) return { error: NextResponse.json({ error: "Это не твой бит" }, { status: 403 }) };

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
  if (musicalKey) patch.key = musicalKey;

  const tags = parseJson<string[]>(form.get("tags"));
  if (tags) {
    patch.tags = tags
      .map((tag) => String(tag).replace(/^#/, "").trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  const prices = parseJson<Record<string, unknown>>(form.get("prices"));
  if (prices) {
    const toNumber = (value: unknown) => {
      const parsed = Number(value);
      return value !== null && value !== "" && Number.isFinite(parsed) ? parsed : null;
    };
    patch.prices = pricesForDb({
      mp3: toNumber(prices.mp3),
      // bundle — историческое имя колонки для уровня WAV.
      wav: toNumber(prices.wav) ?? toNumber(prices.bundle),
      trackout: toNumber(prices.trackout),
      exclusive: toNumber(prices.exclusive),
    });
  }

  const isPublic = text("isPublic");
  if (isPublic !== null) patch.is_public = isPublic === "true";

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
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOwner(id);
  if ("error" in access) return access.error;

  const folder = `${access.user.id}/${id}`;

  await Promise.all([
    removeFolder(access.supabase, "beats", folder),
    removeFolder(access.supabase, "masters", folder),
    removeFolder(access.supabase, "covers", folder),
  ]);

  const { error } = await access.supabase.from("beats").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, cleaned: folder });
}