import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const { data } = await supabase
    .from("order_items")
    .select("beat_title, seller_net_minor, currency, created_at, tier")
    .eq("beat_owner_id", user.id)
    .order("created_at", { ascending: false });

  const rows = data ?? [];

  const header = "Дата,Бит,Уровень,Сумма,Валюта";
  const lines = rows.map((row) => {
    const date = new Date(row.created_at).toISOString().slice(0, 10);
    const title = String(row.beat_title ?? "").replace(/"/g, '""');
    const tier = row.tier ?? "";
    const amount = (Number(row.seller_net_minor ?? 0) / 100).toFixed(2);
    const currency = row.currency ?? "RUB";
    return `"${date}","${title}","${tier}","${amount}","${currency}"`;
  });

  const csv = [header, ...lines].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="beatdesk-sales.csv"',
    },
  });
}