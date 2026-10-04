import { NextResponse, type NextRequest } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { fetchThread } from "@/lib/posts";
import { createClient } from "@/lib/supabase/server";

/** Ветка целиком: корень плюс первые уровни вложенности. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const thread = await fetchThread(supabase, id, user?.id ?? null);
  if (!thread.root) return NextResponse.json({ error: "Пост не найден" }, { status: 404 });

  return NextResponse.json(thread);
}

/** Удалить свой пост. Ответы удаляются каскадом вместе с веткой. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `post-delete:${user.id}`), 60, 3_600_000);
  if (!gate.ok) {
    return NextResponse.json({ error: "Слишком много удалений подряд" }, { status: 429 });
  }

  const { error } = await supabase.from("posts").delete().eq("id", id).eq("author_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
