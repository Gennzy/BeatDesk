import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createLink, deleteLink, isAvailable, listLinks, shortUrl } from "@/lib/short-links-store";
import { getSiteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

/** Завести короткую ссылку на свой бит. */
export async function POST(request: Request) {
  if (!isAvailable()) {
    return NextResponse.json({ error: "Сервер не настроен: не задан SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  // 20 ссылок в минуту: достаточно, чтобы не съесть лимит таблицы.
  const gate = rateLimit(clientKey(request, `short-links:${user.id}`), 20, 60_000);
  if (!gate.ok) {
    return NextResponse.json({ error: "Слишком много ссылок, подожди минуту" }, { status: 429 });
  }

  let path: unknown;
  try {
    path = ((await request.json()) as { path?: unknown }).path;
  } catch {
    return NextResponse.json({ error: "Нужен JSON" }, { status: 400 });
  }

  const result = await createLink(user.id, typeof path === "string" ? path : "");

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  const siteUrl = await getSiteUrl();

  return NextResponse.json({ code: result.code, url: shortUrl(result.code, siteUrl) });
}

/** Свои ссылки с числом переходов. */
export async function GET() {
  if (!isAvailable()) return NextResponse.json({ links: [] });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const siteUrl = await getSiteUrl();
  const links = await listLinks(user.id);

  return NextResponse.json({ links: links.map((link) => ({ ...link, url: shortUrl(link.code, siteUrl) })) });
}

/** Удалить ссылку. */
export async function DELETE(request: Request) {
  if (!isAvailable()) {
    return NextResponse.json({ error: "Сервер не настроен" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const code = new URL(request.url).searchParams.get("code");

  const gate = rateLimit(clientKey(request, `short-links-del:${user.id}`), 30, 60_000);
  if (!gate.ok) return NextResponse.json({ error: "Слишком много попыток" }, { status: 429 });

  const removed = code ? await deleteLink(user.id, code) : false;

  return NextResponse.json({ ok: removed }, { status: removed ? 200 : 404 });
}