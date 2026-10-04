import { NextResponse, type NextRequest } from "next/server";

import { fetchReplies, REPLIES_PAGE_SIZE } from "@/lib/posts";
import { createClient } from "@/lib/supabase/server";

/** Ответы к одному посту постранично — для кнопки «показать ещё». */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const raw = Number(request.nextUrl.searchParams.get("offset") ?? 0);
  const offset = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;

  const replies = await fetchReplies(supabase, id, user?.id ?? null, offset, REPLIES_PAGE_SIZE);

  return NextResponse.json({
    replies,
    nextOffset: replies.length === REPLIES_PAGE_SIZE ? offset + REPLIES_PAGE_SIZE : null,
  });
}
