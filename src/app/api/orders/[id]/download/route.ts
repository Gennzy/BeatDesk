import { NextResponse } from "next/server";

import { MASTERS_BUCKET } from "@/lib/beats";
import { ServiceRoleNotConfiguredError, getAdminClient } from "@/lib/supabase/admin";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { tierAllows, type FileKind } from "@/lib/sales/delivery";

const SIGN_TTL_SECONDS = 300;

type BeatFiles = Record<string, { name?: string; mime?: string; path?: string; parts?: { path?: string; url?: string }[] }>;

/**
 * Выдача файлов покупателю после оплаты.
 *
 * Подписывает ссылки на мастеров своим ключом: RLS закрытого бакета пускает
 * только владельца пути, а покупатель — не владелец. Право на файл
 * устанавливается здесь и только здесь: заказ оплачен, лицензия не отозвана,
 * уровень включает запрошенный файл.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `order-download:${user.id}`), 30, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов, подожди минуту" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const url = new URL(request.url);
  const itemId = url.searchParams.get("item") ?? "";
  const kind = (url.searchParams.get("kind") ?? "") as FileKind;

  if (!["mp3", "wav", "stems"].includes(kind)) {
    return NextResponse.json({ error: "Неизвестный тип файла" }, { status: 400 });
  }

  // Позицию ищем через заказ: RLS показывает покупателю его заказ, продавцу —
  // заказ с его битом. Чужой заказ вернулся бы пустым ещё здесь.
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, buyer_id")
    .eq("id", id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  if (order.status !== "paid") {
    return NextResponse.json({ error: "Заказ ещё не оплачен" }, { status: 403 });
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("id, beat_id, tier")
    .eq("order_id", id);

  const item = (items ?? []).find((row) => row.id === itemId);

  if (!item) return NextResponse.json({ error: "Позиция не найдена в заказе" }, { status: 404 });

  /*
   * Выдачу контролирует лицензия, а не заказ: оплаченный заказ с отозванной
   * лицензией — это возврат денег, и файлы по нему закрываются.
   */
  const { data: license } = await supabase
    .from("licenses")
    .select("id, revoked_at")
    .eq("order_item_id", item.id)
    .maybeSingle();

  if (!license) return NextResponse.json({ error: "Лицензия не найдена" }, { status: 404 });
  if (license.revoked_at) return NextResponse.json({ error: "Лицензия отозвана" }, { status: 403 });

  if (!tierAllows(item.tier, kind)) {
    return NextResponse.json({ error: "Этот уровень не включает такой файл" }, { status: 403 });
  }

  let admin;

  try {
    admin = getAdminClient();
  } catch (error) {
    if (error instanceof ServiceRoleNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    throw error;
  }

  // Читаем пути админским клиентом: продавец может снять бит с публикации
  // после продажи, а оплаченные файлы от этого исчезать не должны.
  const { data: beat } = await admin
    .from("beats")
    .select("mp3_url, files")
    .eq("id", item.beat_id)
    .maybeSingle();

  if (!beat) return NextResponse.json({ error: "Бит не найден" }, { status: 404 });

  if (kind === "mp3") {
    if (!beat.mp3_url) return NextResponse.json({ error: "Превью не загружено" }, { status: 404 });

    return NextResponse.json({ urls: [beat.mp3_url], name: "preview.mp3" });
  }

  const files = (beat.files ?? {}) as BeatFiles;
  const asset = kind === "wav" ? files.wav : (files.zip ?? files.rar);

  if (!asset) return NextResponse.json({ error: "Файл не загружен: напиши битмейкеру" }, { status: 404 });

  const paths = [
    ...(asset.path ? [asset.path] : []),
    ...(asset.parts ?? []).map((part) => part.path).filter((path): path is string => Boolean(path)),
  ];

  if (paths.length === 0) {
    return NextResponse.json({ error: "Файл лежит в старом хранилище: напиши битмейкеру" }, { status: 404 });
  }

  const urls: string[] = [];

  for (const path of paths) {
    const { data, error } = await admin.storage.from(MASTERS_BUCKET).createSignedUrl(path, SIGN_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Файл недоступен: напиши битмейкеру" }, { status: 502 });
    }

    urls.push(data.signedUrl);
  }

  return NextResponse.json({ urls, name: asset.name ?? `master.${kind === "wav" ? "wav" : "zip"}` });
}
