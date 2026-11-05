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

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const { data, error } = await supabase
    .from("products")
    .select("id, kind, title, description, price_minor, currency, is_public, created_at, cover_url")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ products: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `products:${user.id}`), 30, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
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
      is_public: form.get("is_public") === "on" || form.get("is_public") === "true" ? true : form.get("is_public") === "false" ? false : undefined,
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

  const kind = isProductKind(body.kind) ? body.kind : null;
  if (!kind) return NextResponse.json({ error: "Неверный тип товара" }, { status: 400 });

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const priceMinor = typeof body.price_minor === "number" ? body.price_minor : Number(body.price_minor);
  const currency = body.currency === "USD" || body.currency === "EUR" ? body.currency : "RUB";

  const problem = productProblem({ kind, title, priceMinor, files: {} });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const { data, error } = await supabase
    .from("products")
    .insert({
      owner_id: user.id,
      kind,
      title,
      description,
      price_minor: priceMinor,
      currency,
      is_public: Boolean(body.is_public),
      files: {},
    })
    .select("id, kind, title")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (coverFile && data?.id) {
    const path = `${user.id}/products/${data.id}/cover-${Date.now()}.${coverFile.name.split(".").pop() ?? "jpg"}`;
    const { error: uploadError } = await supabase.storage.from("covers").upload(path, coverFile, { cacheControl: "3600", upsert: true });
    if (!uploadError) {
      const coverUrl = supabase.storage.from("covers").getPublicUrl(path).data.publicUrl;
      await supabase.from("products").update({ cover_url: coverUrl }).eq("id", data.id);
    }
  }

  return NextResponse.json({ product: data });
}