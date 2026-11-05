import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { isProductKind, productProblem } from "@/lib/products";

type Body = {
  kind?: unknown;
  title?: unknown;
  description?: unknown;
  price_minor?: unknown;
  currency?: unknown;
  is_public?: unknown;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `product-edit:${user.id}`), 30, 60_000);
  if (!gate.ok) {
    return NextResponse.json({ error: "Слишком много запросов" }, { status: 429, headers: { "Retry-After": String(gate.retryAfter) } });
  }

  const { data: existing } = await supabase.from("products").select("id, owner_id").eq("id", id).maybeSingle();
  if (!existing || existing.owner_id !== user.id) {
    return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let body: Body = {};
  let coverFile: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    body = {
      kind: form.get("kind") ?? undefined,
      title: form.get("title") ?? undefined,
      description: form.get("description") ?? undefined,
      price_minor: form.get("price_minor") ?? undefined,
      currency: form.get("currency") ?? undefined,
      is_public: form.get("is_public") === "on" ? true : form.get("is_public") === "false" ? false : undefined,
    };
    const cf = form.get("coverFile");
    if (cf instanceof File && cf.size > 0) coverFile = cf;
  } else {
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
    }
  }

  const patch: Record<string, unknown> = {};

  if (body.kind !== undefined) {
    if (!isProductKind(body.kind)) return NextResponse.json({ error: "Неверный тип товара" }, { status: 400 });
    patch.kind = body.kind;
  }
  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: "У товара должно быть название" }, { status: 400 });
    patch.title = title;
  }
  if (body.description !== undefined) {
    patch.description = typeof body.description === "string" ? body.description.trim() : "";
  }
  if (body.price_minor !== undefined) {
    const priceMinor = typeof body.price_minor === "number" ? body.price_minor : Number(body.price_minor);
    if (!Number.isFinite(priceMinor) || priceMinor < 0) {
      return NextResponse.json({ error: "Цена задана неверно" }, { status: 400 });
    }
    patch.price_minor = priceMinor;
  }
  if (body.currency !== undefined) {
    patch.currency = body.currency === "USD" || body.currency === "EUR" ? body.currency : "RUB";
  }
  if (body.is_public !== undefined) {
    patch.is_public = Boolean(body.is_public);
  }

  if (coverFile) {
    const path = `${user.id}/products/${id}/cover-${Date.now()}.${coverFile.name.split(".").pop() ?? "jpg"}`;
    const { error: uploadError } = await supabase.storage.from("covers").upload(path, coverFile, { cacheControl: "3600", upsert: true });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
    patch.cover_url = supabase.storage.from("covers").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabase.from("products").update(patch).eq("id", id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const { error } = await supabase.from("products").delete().eq("id", id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}