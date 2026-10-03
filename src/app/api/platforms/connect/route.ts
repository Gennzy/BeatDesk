import { NextResponse } from "next/server";

import { encryptSecret } from "@/lib/crypto";
import { isPlatformId, PLATFORM_MAP } from "@/lib/platforms/registry";
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

  const meta = body.meta ?? {};

  if (platform.auth === "token" || platform.auth === "webhook") {
    const missing = (platform.fields ?? []).filter((field) => !String(meta[field.key] ?? "").trim());
    if (missing.length > 0 && !body.accessToken) {
      return NextResponse.json({ error: `Заполни: ${missing.map((field) => field.label).join(", ")}` }, { status: 400 });
    }
  }

  const row = {
    user_id: user.id,
    platform: body.platform,
    label: body.label ?? null,
    meta,
    access_token_cipher: body.accessToken ? encryptSecret(body.accessToken) : null,
  };

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

  const { error } = await supabase
    .from("platform_connections")
    .delete()
    .eq("user_id", user.id)
    .eq("platform", body.platform);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
