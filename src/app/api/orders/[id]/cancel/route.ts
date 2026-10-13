import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Отмена неоплаченного заказа или возврат оплаченного.
 *
 * Закрывает дыру «возврат не из чего нажать»: close_order умеет cancelled,
 * failed и refunded, но из интерфейса её никто не звал. Правила те же, что
 * в функции, и продублированы здесь, чтобы лишний вызов не уходил вообще:
 * возврат — только оператор, остальное — продавец бита из заказа или
 * оператор. Продавец отменой освобождает свой бит из придержания.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `order-cancel:${user.id}`), 30, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов, подожди минуту" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => null)) as { status?: unknown; reason?: unknown } | null;
  const status = body?.status === "refunded" || body?.status === "failed" ? body.status : "cancelled";
  const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : null;

  const [{ data: profile }, { data: items }] = await Promise.all([
    supabase.from("profiles").select("is_operator").eq("id", user.id).maybeSingle(),
    supabase.from("order_items").select("beat_owner_id").eq("order_id", id),
  ]);

  const isOperator = profile?.is_operator === true;
  const isSeller = ((items ?? []) as { beat_owner_id: string }[]).some((row) => row.beat_owner_id === user.id);

  if (status === "refunded" && !isOperator) {
    return NextResponse.json({ error: "Возврат средств делает только оператор площадки" }, { status: 403 });
  }

  if (!isOperator && !isSeller) {
    return NextResponse.json({ error: "Чужой заказ" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("close_order", {
    p_order_id: id,
    p_status: status,
    p_manual_reason: reason,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, status: (data as { status?: string } | null)?.status ?? status });
}
