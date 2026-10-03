import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** Один прослушивание = один вызов. Счётчик не должен расти от догрузки страницы. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("increment_plays", { beat_id: id });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data } = await supabase.from("beats").select("plays").eq("id", id).maybeSingle();

    return NextResponse.json({ ok: true, plays: data?.plays ?? null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "play_error" }, { status: 500 });
  }
}