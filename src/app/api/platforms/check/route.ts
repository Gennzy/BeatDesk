import { NextResponse } from "next/server";

import { decryptSecret, isSecretConfigured } from "@/lib/crypto";
import { isPlatformId, PLATFORM_MAP } from "@/lib/platforms/registry";
import { getBotToken } from "@/lib/platforms/telegram-client";
import { createClient } from "@/lib/supabase/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

type Body = { platform?: string };

const VK_API_VERSION = "5.199";

/** Что показать пользователю по результату проверки. */
export type CheckResult = {
  ok: boolean;
  /** Короткая причина: токен истёк, канал недоступен и т.п. */
  problem?: "no_token" | "expired" | "not_found" | "forbidden" | "network" | "unknown";
  /** Человекочитаемая подпись, например имя канала. */
  detail?: string;
};

async function checkTelegram(meta: Record<string, unknown>, token: string | null): Promise<CheckResult> {
  if (!token) return { ok: false, problem: "no_token", detail: "Бот не настроен на сервере" };

  const chatId = String(meta.chatId ?? "").trim();
  if (!chatId) return { ok: false, problem: "no_token", detail: "Не указан ID канала" };

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId }),
      cache: "no-store",
    });
    const data = (await response.json()) as { ok?: boolean; result?: { title?: string; username?: string }; description?: string };

    if (data.ok) {
      return { ok: true, detail: data.result?.title ?? data.result?.username ?? chatId };
    }
    if (/chat not found/i.test(data.description ?? "")) {
      return { ok: false, problem: "not_found", detail: "Бот не состоит в этом канале" };
    }
    if (/bot was kicked|bot is not a member|forbidden/i.test(data.description ?? "")) {
      return { ok: false, problem: "forbidden", detail: data.description ?? "Нет доступа к каналу" };
    }
    return { ok: false, problem: "unknown", detail: data.description ?? "Telegram не ответил" };
  } catch {
    return { ok: false, problem: "network", detail: "Telegram недоступен" };
  }
}

async function checkVk(meta: Record<string, unknown>, accessToken: string | null): Promise<CheckResult> {
  if (!accessToken) return { ok: false, problem: "no_token", detail: "Не указан токен" };
  const groupId = String(meta.groupId ?? "").trim();
  if (!groupId) return { ok: false, problem: "no_token", detail: "Не указан ID сообщества" };

  try {
    const response = await fetch(`https://api.vk.com/method/groups.getById`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: accessToken,
        v: VK_API_VERSION,
        group_id: groupId.replace(/^-/, ""),
        fields: "name",
      }),
      cache: "no-store",
    });
    const data = (await response.json()) as { response?: { name?: string }; error?: { error_msg?: string } };

    if (data.response) return { ok: true, detail: data.response.name ?? groupId };
    const message = data.error?.error_msg ?? "ВК не принял запрос";
    if (/access token|authorization/i.test(message)) {
      return { ok: false, problem: "expired", detail: message };
    }
    return { ok: false, problem: "unknown", detail: message };
  } catch {
    return { ok: false, problem: "network", detail: "ВК недоступен" };
  }
}

/** Проверка живости подключения: токен протух или нет — лучше сказать сразу. */
export async function POST(scopedRequest: Request) {
  const request = scopedRequest;
  const body = (await request.json()) as Body;

  if (!body.platform || !isPlatformId(body.platform)) {
    return NextResponse.json({ error: "Неизвестный канал" }, { status: 400 });
  }

  const platform = PLATFORM_MAP[body.platform];
  if (platform.kind !== "api") {
    return NextResponse.json({ error: "У этого канала нет подключения" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `check:${user.id}`), 20, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много проверок, подожди минуту", retryAfter: gate.retryAfter },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const { data: row } = await supabase
    .from("platform_connections")
    .select("meta, access_token_cipher")
    .eq("user_id", user.id)
    .eq("platform", body.platform)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Этот канал не подключён" }, { status: 404 });

  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const cipher = row.access_token_cipher as string | null;

  let accessToken: string | null = null;
  if (cipher) {
    if (!isSecretConfigured()) {
      return NextResponse.json({ error: "Сервер не настроен: не задан PLATFORM_TOKEN_SECRET" }, { status: 503 });
    }
    try {
      accessToken = decryptSecret(cipher);
    } catch {
      return NextResponse.json({ error: "Токен не читается: сервер сменил PLATFORM_TOKEN_SECRET" }, { status: 500 });
    }
  }

  if (body.platform === "telegram") {
    return NextResponse.json(await checkTelegram(meta, accessToken ?? getBotToken()));
  }
  if (body.platform === "vk") {
    return NextResponse.json(await checkVk(meta, accessToken));
  }

  return NextResponse.json({ ok: true, detail: "Подключено" });
}
