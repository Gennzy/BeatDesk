import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Услуга «Защита бита»: покупка.
 *
 * ---------------------------------------------------------------------------
 * ЗАЧЕМ ОТДЕЛЬНЫЙ ВИД ТОВАРА
 *
 * У луп-кита есть файл, который покупатель получает сразу. У защиты файла
 * нет: её результат — отчёт. Тот же вид товара, другое содержимое выдачи, и
 * поэтому в products заведён вид service.
 *
 * ---------------------------------------------------------------------------
 * ЧТО ПОКУПАЕТСЯ
 *
 * Один запуск сканирования по биту. Находок может не быть — и это не значит,
 * что услуга плохая: она отвечает на вопрос «есть ли», а вопрос «где» без
 * доступа к площадкам не имеет ответа. Об этом сказано в отчёте.
 *
 * Оплата идёт обычным заказом: битмейкер нажимает кнопку, мы создаём заказ
 * с позицией-услугой, деньги списываются тем же путём, что и за биты.
 */

/** Сколько стоит один запуск. */
const PRICE_MINOR = 99_00;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { beatId?: unknown; productId?: unknown } | null;

  const beatId = typeof body?.beatId === "string" ? body.beatId : "";
  const productId = typeof body?.productId === "string" ? body.productId : "";

  if (!beatId) return NextResponse.json({ error: "Нужен бит" }, { status: 400 });

  const { data: beat } = await supabase
    .from("beats")
    .select("id, title, owner_id, prices")
    .eq("id", beatId)
    .maybeSingle();

  if (!beat) return NextResponse.json({ error: "Бит не найден" }, { status: 404 });

  if (beat.owner_id !== user.id) {
    return NextResponse.json({ error: "Это не твой бит" }, { status: 403 });
  }

  /*
   * Товар-услуга создаётся площадкой, а не продавцом: услугу оказывает
   * BeatDesk, и продавец бита её не продаёт. Поэтому ищется наш товар, а не
   * чужой.
   */
  let productIdFound = productId;

  if (!productIdFound) {
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("kind", "service")
      .eq("owner_id", user.id)
      .limit(1)
      .maybeSingle();

    productIdFound = product?.id ?? "";
  }

  if (!productIdFound) {
    return NextResponse.json({ error: "Услуга недоступна" }, { status: 404 });
  }

  const { data: product } = await supabase
    .from("products")
    .select("id, title, price_minor, currency, kind")
    .eq("id", productIdFound)
    .maybeSingle();

  if (!product) return NextResponse.json({ error: "Услуга не найдена" }, { status: 404 });

  return NextResponse.json({
    productId: product.id,
    title: product.title,
    priceMinor: product.price_minor ?? PRICE_MINOR,
    currency: product.currency ?? "RUB",
    beatId,
  });
}
