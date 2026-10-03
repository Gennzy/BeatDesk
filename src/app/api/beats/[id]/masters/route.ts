import { NextResponse } from "next/server";

import { MASTERS_BUCKET } from "@/lib/beats";
import { createClient } from "@/lib/supabase/server";

const SIGN_TTL_SECONDS = 300;

/**
 * Подписанные ссылки на мастера. Отдаём только автору бита:
 * путь обязан начинаться с его user_id, иначе это чужой файл.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const { data: beat } = await supabase
    .from("beats")
    .select("owner_id")
    .eq("id", id)
    .maybeSingle();

  if (!beat) return NextResponse.json({ error: "Бит не найден" }, { status: 404 });
  if (beat.owner_id !== user.id) {
    return NextResponse.json({ error: "Мастера доступны только автору бита" }, { status: 403 });
  }

  let paths: string[];

  try {
    const body = (await request.json()) as { paths?: unknown };
    paths = Array.isArray(body.paths) ? body.paths.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  if (paths.length === 0) return NextResponse.json({ urls: [] });
  if (paths.length > 60) return NextResponse.json({ error: "Слишком много частей" }, { status: 400 });

  const mine = paths.every((path) => path.startsWith(`${user.id}/`));
  if (!mine) return NextResponse.json({ error: "Это не твой файл" }, { status: 403 });

  const urls: string[] = [];

  for (const path of paths) {
    const { data, error } = await supabase.storage.from(MASTERS_BUCKET).createSignedUrl(path, SIGN_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Файл недоступен: перезалей его в мастера" }, { status: 502 });
    }

    urls.push(data.signedUrl);
  }

  return NextResponse.json({ urls });
}