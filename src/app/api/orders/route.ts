import { NextResponse } from "next/server";

import { isCurrency } from "@/lib/currency";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { parseOrderItems, type OrderItemInput } from "@/lib/sales/order-items";
import { createClient } from "@/lib/supabase/server";

type Body = OrderItemInput & {
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

  const parsed = parseOrderItems(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const email = typeof body.email === "string" ? body.email.trim() : "";

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

    const { data, error } = await (async () => {
      /*
       * Валюта заказа — валюта битов, а не константа. Курсов у площадки нет,
       * поэтому смешанная корзина не оформляется вовсе: USD-бит в рублёвом
       * заказе превращал 25 долларов в 25 рублей. create_order цены не
       * трогает, только штампует валюту в позиции, так что проверка здесь —
       * единственное место, где подмена ловится.
       */
      const { data: beats } = await supabase
        .from("beats")
        .select("id, currency")
        .in("id", parsed.map((item) => item.beat_id));

      const currencies = [...new Set(((beats ?? []) as { currency: string }[]).map((row) => row.currency))];

      if (currencies.length !== 1 || !isCurrency(currencies[0])) {
        return { data: null, error: { message: "Заказ — в одной валюте: убери лишнее из корзины" } };
      }

      /*
       * create_order_checked, а не create_order.
       *
       * Разница в том, что первый сначала убеждается, что файлы уровней
       * есть, и только потом создаёт заказ. Без проверки покупатель платил за
       * Track Out без архива дорожек и получал 404 «Файл не загружен» — деньги
       * уплачены, товар не выдан.
       *
       * Проверка живёт в базе, а не здесь: create_order была выдана и
       * authenticated, и её можно было вызвать напрямую, обойдя маршрут.
       */
      const checked = await supabase.rpc("create_order_checked", {
        p_items: parsed,
        p_currency: currencies[0],
        p_buyer_email: email,
        p_contact: contact,
      });

      /*
       * Откат на старую функцию, пока миграция не применена.
       *
       * Порядок деплоя не в наших руках: код может уехать на сервер раньше,
       * чем миграция 0056 применена. Без отката в этот промежуток ломались бы
       * ВСЕ покупки с текстом «не нашлась функция» — а это не поломка
       * проверки, это поломка продаж.
       *
       * Проверка файлов при этом не работает, и это честно: она включается
       * с миграцией, а не с деплоем. Ошибка отдаётся покупателю как есть, и
       * по ней видно, что пора применить миграцию.
       */
      if (checked.error && /create_order_checked/.test(checked.error.message)) {
        return supabase.rpc("create_order", {
          p_items: parsed,
          p_currency: currencies[0],
          p_buyer_email: email,
          p_contact: contact,
        });
      }

      return checked;
    })();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data || typeof data !== "object" || !("id" in data)) {
      return NextResponse.json({ error: "Заказ не создался" }, { status: 500 });
    }

    return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "order_error" }, { status: 500 });
  }
}
