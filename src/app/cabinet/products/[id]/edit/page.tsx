import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";
import { getSupabase } from "@/lib/supabase/user";

import { ProductForm } from "@/components/products/product-form";

export const metadata: Metadata = {
  title: "Редактирование товара",
  robots: { index: false, follow: false },
};

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, supabase] = await Promise.all([getT(), getSupabase()]);

  if (!supabase) redirect("/login?next=/cabinet/products");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/cabinet/products");

  const { data: product } = await supabase
    .from("products")
    .select("id, kind, title, description, price_minor, currency, is_public")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!product) redirect("/cabinet/products");

  return (
    <section className="py-10 lg:py-20">
      <Container>
        <div className="flex flex-col gap-4 border-b border-line py-8">
          <h1 className="font-display text-section font-semibold text-paper uppercase">Редактирование товара</h1>
        </div>
        <ProductForm product={product as Parameters<typeof ProductForm>[0]["product"]} />
      </Container>
    </section>
  );
}