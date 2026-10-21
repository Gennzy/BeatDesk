import { NextResponse, type NextRequest } from "next/server";

import { MASTERS_BUCKET } from "@/lib/beats";
import { createClient } from "@/lib/supabase/server";

/**
 * Мастер бита — для расчёта эталона.
 *
 * ---------------------------------------------------------------------------
 * ЗАЧЕМ
 *
 * Чтобы найти бит внутри чужого трепа, нужен эталон: отпечаток нашего
 * мастера. Он считается в браузере, и для этого файл надо отдать.
 *
 * Отдаём только владельцу бита: мастер — это его материал, и раздавать его
 * тем, кто защиту запускает, нельзя. Тот, у кого мастер уже куплен, получает
 * его после оплаты.
 *
 * Если мастера нет, защиту запустить нечем, и кнопка не показывается.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const beatId = request.nextUrl.searchParams.get("beatId") ?? "";

  if (!beatId) return NextResponse.json({ error: "Нужен бит" }, { status: 400 });

  const { data: beat } = await supabase
    .from("beats")
    .select("owner_id, files")
    .eq("id", beatId)
    .maybeSingle();

  if (!beat) return NextResponse.json({ error: "Бит не найден" }, { status: 404 });

  if (beat.owner_id !== user.id) {
    return NextResponse.json({ error: "Это не твой бит" }, { status: 403 });
  }

  const files = (beat.files ?? {}) as {
    wav?: { path?: string; parts?: { path?: string }[] };
    zip?: { path?: string; parts?: { path?: string }[] };
  };

  // Мастер — WAV. Архив дорожек годится для защиты хуже: в нём стемы, а не
  // тот звук, который слышно в трепе.
  const asset = files.wav ?? files.zip;
  const path = asset?.path ?? asset?.parts?.[0]?.path;

  if (!path) {
    return NextResponse.json({ error: "У бита нет мастера" }, { status: 404 });
  }

  const { data: signed, error } = await supabase.storage.from(MASTERS_BUCKET).createSignedUrl(path, 300);

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: "Файл недоступен" }, { status: 502 });
  }

  /*
   * Отдаём ссылку, а не сам файл.
   *
   * Мастер — это десятки и сотни мегабайт, и проксировать его через Next.js
   * означало держать соединение и память на всё время скачивания. Страница бита
   * вставала на этой загрузке, и кнопка «В корзину» не успевала отрисоваться.
   *
   * Подписанная ссылка работает и напрямую: хранилище отдаёт её браузеру
   * без CORS-препятствий, а доступ у неё временный.
   */
  return NextResponse.json({ url: signed.signedUrl });
}
