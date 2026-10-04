import { NextResponse, type NextRequest } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/** Только счётчик для колокольчика: список уведомлений он не тянет. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ unread: 0 });

  const gate = rateLimit(clientKey(request, `notifications-unread:${user.id}`), 60, 60_000);
  if (!gate.ok) return NextResponse.json({ unread: 0 });

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return NextResponse.json({ unread: count ?? 0 });
}
