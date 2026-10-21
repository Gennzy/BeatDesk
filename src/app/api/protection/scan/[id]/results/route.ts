import { NextResponse, type NextRequest } from "next/server";

import { findSuspects } from "@/lib/protection/attribution";
import { createClient } from "@/lib/supabase/server";

/**
 * Приём находок сканирования.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ СЧЁТ СЧИТАЕТ БРАУЗЕР
 *
 * Отпечаток — это огибающая звука, а сервер аудио не расшифровывает. Браузер
 * уже умеет: он расшифровывает превью, считает отпечаток и сверяет с битом.
 *
 * Поэтому браузер присылает уже проверенное: список находок с процентом
 * совпадения и отпечатком совпавшего файла.
 *
 * ---------------------------------------------------------------------------
 * ЧТО ПРОВЕРЯЕТСЯ НА СЕРВЕРЕ
 *
 * Что сканирование действительно наше и по этому биту. Иначе кто угодно смог бы
 * вписать чужую находку в чужой отчёт.
 */

type Incoming = {
  platform: string;
  externalId: string;
  title: string | null;
  artist: string | null;
  url: string | null;
  confidence: number;
  envelope: string | null;
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const { data: scan } = await supabase
    .from("protection_scans")
    .select("id, beat_id, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (!scan) return NextResponse.json({ error: "Сканирование не найдено" }, { status: 404 });

  if (scan.owner_id !== user.id) {
    return NextResponse.json({ error: "Это не твоё сканирование" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { matches?: unknown } | null;

  const incoming = Array.isArray(body?.matches) ? (body.matches as Incoming[]) : [];

  // Сверка с нашими покупателями делается на сервере: там журнал скачиваний, и
  // подозреваемого должен называть сервер, а не браузер.
  const { data: beat } = await supabase
    .from("beats")
    .select("title, type_beat_artists, owner_id")
    .eq("id", scan.beat_id)
    .maybeSingle();

  const { data: downloads } = await supabase
    .from("beat_downloads")
    .select("user_id, envelope, created_at, profiles!beat_downloads_user_id_fkey(username)")
    .eq("beat_id", scan.beat_id);

  const suspectByEnvelope = new Map<string, { userId: string; label: string; createdAt: string }>();

  for (const row of (downloads ?? []) as {
    user_id: string;
    envelope: string;
    created_at: string;
    profiles: { username?: string } | { username?: string }[] | null;
  }[]) {
    if (!row.envelope) continue;

    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

    suspectByEnvelope.set(row.envelope, {
      userId: row.user_id,
      label: profile?.username ?? "покупатель",
      createdAt: row.created_at,
    });
  }

  const downloadRecords = (downloads ?? []).map((row) => {
    const typed = row as {
      user_id: string;
      envelope: string;
      created_at: string;
      profiles: { username?: string } | { username?: string }[] | null;
    };

    const profile = Array.isArray(typed.profiles) ? typed.profiles[0] : typed.profiles;

    return {
      userId: typed.user_id,
      envelope: typed.envelope,
      createdAt: typed.created_at,
      label: profile?.username ?? "покупатель",
    };
  });

  const rows = incoming
    .filter((match) => match && typeof match.platform === "string" && typeof match.externalId === "string")
    .slice(0, 50)
    .map((match) => {
      /*
       * Подозреваемый ищется по схожести, а не по точному совпадению строк.
       *
       * Найденный файл и выданный — это один и тот же звук, но отпечаток
       * считается от разных записей, и строки не равны. Сравнение по
       * порогу — единственный способ, который вообще работает.
       */
      const suspects = match.envelope
        ? findSuspects(
            {
              platform: match.platform,
              title: match.title,
              artist: match.artist,
              url: match.url,
              confidence: match.confidence,
              envelope: match.envelope,
            },
            downloadRecords,
          )
        : [];

      const suspect = suspects[0];

      return {
        scan_id: scan.id,
        platform: match.platform,
        external_id: match.externalId,
        title: match.title ?? null,
        artist: match.artist ?? null,
        confidence: Math.max(0, Math.min(100, Math.round(match.confidence ?? 0))),
        url: match.url ?? null,
        suspect_user_id: suspect?.userId ?? null,
        suspect_label: suspect?.label ?? null,
      };
    });

  if (rows.length > 0) {
    const { error } = await supabase.from("protection_matches").insert(rows);

    if (error) {
      return NextResponse.json({ error: "Не удалось сохранить находки" }, { status: 500 });
    }
  }

  await supabase
    .from("protection_scans")
    .update({
      status: rows.length > 0 ? "done" : "empty",
      matches: rows.length,
      finished_at: new Date().toISOString(),
      detail: { beatTitle: beat?.title ?? null, found: rows.length },
    })
    .eq("id", scan.id);

  return NextResponse.json({ saved: rows.length }, { status: 201 });
}
