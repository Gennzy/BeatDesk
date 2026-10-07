import { NextResponse } from "next/server";

import { encryptSecret } from "@/lib/crypto";
import { isPlatformId, PLATFORM_MAP } from "@/lib/platforms/registry";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

type Body = {
  platform?: string;
  meta?: Record<string, string | number | null>;
  accessToken?: string;
  label?: string;
};

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Ключи, которые нельзя оставлять в meta: токены живут только в зашифрованной колонке. */
const SECRET_KEYS = new Set(["accesstoken", "token", "secret", "password", "webhookurl"]);

function stripSecrets(meta: Record<string, string | number | null>): Record<string, string | number | null> {
  return Object.fromEntries(Object.entries(meta).filter(([key]) => !SECRET_KEYS.has(key.toLowerCase())));
}

/** Подключение или обновление площадки. */
export async function POST(request: Request) {
  const body = (await request.json()) as Body;

  if (!body.platform || !isPlatformId(body.platform)) {
    return NextResponse.json({ error: "Неизвестная площадка" }, { status: 400 });
  }

  const platform = PLATFORM_MAP[body.platform];

  if (platform.kind !== "api") {
    return NextResponse.json({ error: "Эта площадка подключается вручную" }, { status: 400 });
  }

const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  // Маршрут пишет зашифрованные токены, поэтому лимит обязателен.
  const gate = rateLimit(clientKey(request, `connect:${user.id}`), 20, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много попыток подключения, подожди минуту" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const meta = body.meta ?? {};

  const accessToken = body.accessToken?.trim() || String(meta.accessToken ?? "").trim();

  if (platform.auth === "token") {
    const missing = (platform.fields ?? [])
      .filter((field) => field.key !== "accessToken")
      .filter((field) => !String(meta[field.key] ?? "").trim());

    if (missing.length > 0 && !accessToken) {
      return NextResponse.json({ error: `Заполни: ${missing.map((field) => field.label).join(", ")}` }, { status: 400 });
    }
  }

  const row = {
    user_id: user.id,
    platform: body.platform,
    label: body.label ?? null,
    meta: stripSecrets(meta),
    access_token_cipher: null as string | null,
  };

  try {
    row.access_token_cipher = accessToken ? encryptSecret(accessToken) : null;
  } catch {
    return NextResponse.json({ error: "Сервер не настроен: не задан PLATFORM_TOKEN_SECRET" }, { status: 503 });
  }

  const { error } = await supabase
    .from("platform_connections")
    .upsert(row, { onConflict: "user_id,platform" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, platform: body.platform });
}

/** Отключение площадки. */
export async function DELETE(request: Request) {
  const body = (await request.json()) as Body;

  if (!body.platform || !isPlatformId(body.platform)) {
    return NextResponse.json({ error: "Неизвестная площадка" }, { status: 400 });
  }

  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `disconnect:${user.id}`), 20, 60_000);
  if (!gate.ok) {
    return NextResponse.json({ error: "Слишком много попыток, подожди минуту" }, { status: 429 });
  }

  const { error } = await supabase
    .from("platform_connections")
    .delete()
    .eq("user_id", user.id)
    .eq("platform", body.platform);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
