import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { slugify, validateRosterMember } from "@/lib/roster";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const { data, error } = await supabase
    .from("roster_members")
    .select("id, name, slug, avatar_url, bio, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ members: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `roster:${user.id}`), 20, 60_000);
  if (!gate.ok) {
    return NextResponse.json({ error: "Слишком много запросов" }, { status: 429, headers: { "Retry-After": String(gate.retryAfter) } });
  }

  let body: { name?: unknown; bio?: unknown };
  try {
    body = (await request.json()) as { name?: unknown; bio?: unknown };
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const validated = validateRosterMember(body);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  const slug = slugify(validated.value.name);
  if (!slug) return NextResponse.json({ error: "Имя не подходит для ссылки" }, { status: 400 });

  const { data, error } = await supabase
    .from("roster_members")
    .insert({ owner_id: user.id, name: validated.value.name, slug, bio: validated.value.bio })
    .select("id, name, slug, avatar_url, bio, created_at")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Артист с таким именем уже есть" }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ member: data });
}