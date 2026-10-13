import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

/** Проверка ника до сохранения: занятый ник показываем словами, а не ошибкой базы. */
export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const limit = rateLimit(clientKey(request, `username:${user.id}`), 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Слишком часто" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const requested = new URL(request.url).searchParams.get("username")?.trim() ?? "";

  if (!USERNAME_PATTERN.test(requested)) {
    return NextResponse.json({ available: false, reason: "3–24 символа, латиница, цифры и _" });
  }

  // Сравнение без учёта регистра: «Beat» и «beat» выглядят одинаково,
  // и второй такой ник — это мимикрия. Добивает уникальный индекс
  // lower(username) в миграции 0050.
  //
  // Подстановка в ilike без экранирования: «_» в шаблоне — джокер на один
  // символ, поэтому точное равенство проверяем в коде, а не запросом.
  const { data } = await supabase.from("profiles").select("id, username").ilike("username", requested).limit(10);

  const taken = ((data ?? []) as { id: string; username: string }[]).some(
    (row) => row.username.toLowerCase() === requested.toLowerCase() && row.id !== user.id,
  );

  if (taken) {
    return NextResponse.json({ available: false, reason: "Ник уже занят" });
  }

  return NextResponse.json({ available: true });
}