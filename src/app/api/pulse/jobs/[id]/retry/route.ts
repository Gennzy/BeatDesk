import { NextResponse, type NextRequest } from "next/server";

import { JobError, retryJob } from "@/lib/pulse/jobs-server";
import { createClient } from "@/lib/supabase/server";

/**
 * Повтор задачи.
 *
 * Возвращает задачу в черновики, чтобы браузер отрендерил ролик заново.
 *
 * Главный повод для повтора — не отказ, а зависание: вкладку закрыли
 * посередине, статус остался «рендерится», и сдвинуть его некому. Поэтому
 * повтор доступен и для задачи без отказа.
 */

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  try {
    const job = await retryJob(id);

    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof JobError) return NextResponse.json({ error: error.message }, { status: error.status });

    return NextResponse.json({ error: "Не удалось повторить задачу" }, { status: 500 });
  }
}
