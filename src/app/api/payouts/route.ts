import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Заявка продавца на вывод средств с баланса.
 *
 * Маршрут тонкий намеренно. Проверка «свои ли деньги», «хватает ли на
 * балансе» и «не меньше ли десяти рублей» живёт в функции request_payout,
 * потому что там же создаётся запись в журнале. Дублировать эти правила
 * здесь — значит получить две версии одного правила, из которых рано или
 * поздно разойдутся.
 *
 * Здесь только вход: кто вошёл и не слишком ли часто он просит деньги.
 */

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  /*
   * Ограничение жёстче обычного: заявка на вывод — это деньги, и десять
   * попыток в минуту не нужны ни одному живому продавцу. Частые запросы
   * — это либо ошибка в форме, либо попытка перебрать суммы.
   */
  const gate = rateLimit(clientKey(request, `payout-request:${user.id}`), 5, 60_000);

  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много заявок, подожди минуту" },
      { status: 429, headers: { "Retry-Control": `after=${gate.retryAfter}` } },
    );
  }

  const body = (await request.json().catch(() => null)) as { amount?: number } | null;

  /*
   * Рубли из тела запроса переводим в копейки сами. Дробь отбрасываем, а не
   * округляем: копейка из тела запроса — это опечатка, и молча её достраивать
   * значит выдать на рубль больше, чем человек написал.
   */
  const value = Number(body?.amount);
  const minor = Number.isFinite(value) && value > 0 ? Math.floor(value * 100) : null;

  if (minor === null || minor <= 0) {
    return NextResponse.json({ error: "Сумма должна быть положительным числом" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("request_payout", {
    p_seller_id: user.id,
    p_amount_minor: minor,
    p_note: null,
  });

  if (error) {
    /*
     * Текст ошибки из базы показываем как есть: там написано «На балансе
     * 400 ₽, запрошено больше» или «Минимальная сумма вывода — 10 ₽», и
     * это ровно то, что нужно человеку. Обёртка «что-то пошло не так»
     * ничего не сообщала и отправляла в поддержку.
     */
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ payout: data }, { status: 201 });
}