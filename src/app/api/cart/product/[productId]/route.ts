import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `cart-item:${user.id}`), 60, 60_000);
  if (!gate.ok) {
    return NextResponse.json({ error: "Слишком много запросов" }, { status: 429, headers: { "Retry-After": String(gate.retryAfter) } });
  }

  const { error } = await supabase.from("cart_items").delete().eq("user_id", user.id).eq("product_id", productId);

  if (error) {
    console.error("cart delete failed", error.code);
    return NextResponse.json({ error: "Не удалось убрать из корзины" }, { status: 400 });
  }

  return NextResponse.json({ removed: productId });
}