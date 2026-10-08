import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Переключение роли: продавец или покупатель.
 *
 * Это не тип аккаунта, а то, что показывается по умолчанию: продавец может
 * покупать, покупатель — выложить бит. Поэтому проверок на «кто ты» здесь
 * нет, есть только запись выбора.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { mode?: unknown } | null;
  const mode = body?.mode === "seller" ? "seller" : body?.mode === "buyer" ? "buyer" : null;

  if (!mode) return NextResponse.json({ error: "Некорректный режим" }, { status: 400 });

  const { error } = await supabase.from("profiles").update({ mode }).eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ mode });
}