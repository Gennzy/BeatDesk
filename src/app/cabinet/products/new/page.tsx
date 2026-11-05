import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";
import { getSupabase } from "@/lib/supabase/user";

import { ProductForm } from "@/components/products/product-form";

export const metadata: Metadata = {
  title: "Новый товар",
  robots: { index: false, follow: false },
};

export default async function NewProductPage() {
  const [t, supabase] = await Promise.all([getT(), getSupabase()]);

  if (!supabase) redirect("/login?next=/cabinet/products/new");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/cabinet/products/new");

  return (
    <section className="py-10 lg:py-20">
      <Container>
        <div className="flex flex-col gap-4 border-b border-line py-8">
          <h1 className="font-display text-section font-semibold text-paper uppercase">Новый товар</h1>
          <p className="label text-mute">Кит, пресет или услуга, которую вы продаёте отдельно от битов.</p>
        </div>
        <ProductForm />
      </Container>
    </section>
  );
}