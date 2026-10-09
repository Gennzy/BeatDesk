import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { normalizeTier } from "@/lib/sales/tier";
import { createClient } from "@/lib/supabase/server";

type Body = {
  beatId?: unknown;
  tier?: unknown;
  email?: unknown;
  contact?: unknown;
};


/**
 * Ключ уровня в интерфейсе — `wav`, в базе — историческое имя `bundle`.
 * Без перевода покупка уровня «MP3 + WAV» падала бы на «Неизвестный уровень».
 */

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Создание заказа через create_order.
 *
 * Клиент присылает только бит, уровень и почту: цену функция берёт
 * из строки бита, иначе покупатель доплатил бы рубль за эксклюзив.
 */
export async function POST(request: Request) {
  let body: Body;

  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const beatId = typeof body.beatId === "string" ? body.beatId.trim() : "";
  const rawTier = typeof body.tier === "string" ? body.tier.trim() : "";
  const tier = normalizeTier(rawTier);
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!beatId) return NextResponse.json({ error: "Нужен бит" }, { status: 400 });
  if (!tier) {
    return NextResponse.json({ error: "Неизвестный уровень" }, { status: 400 });
  }
  if (!isEmail(email)) {
    return NextResponse.json({ error: "Нужен адрес для доставки файлов" }, { status: 400 });
  }

  const contact = typeof body.contact === "object" && body.contact !== null ? body.contact : {};

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    /*
     * Покупка только со входом.
     *
     * Миграция разрешает гостя (buyer_id null), но политика orders читает
     * `auth.uid() = buyer_id`, и гостю такой заказ не виден: он создаст
     * заказ и получит 404 на странице. Пока нет ссылки с токеном для
     * гостя, честнее не пустить в покупку, чем показать пустую страницу.
     */
    if (!user) return NextResponse.json({ error: "Нужно войти, чтобы купить" }, { status: 401 });

    const limit = rateLimit(clientKey(request, `order:${user?.id ?? "guest"}`), 10, 60_000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Слишком много заказов подряд" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }

    const { data, error } = await supabase.rpc("create_order", {
      p_items: [{ beat_id: beatId, tier }],
      p_currency: "RUB",
      p_buyer_email: email,
      p_contact: contact,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data || typeof data !== "object" || !("id" in data)) {
      return NextResponse.json({ error: "Заказ не создался" }, { status: 500 });
    }

    return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "order_error" }, { status: 500 });
  }
}
