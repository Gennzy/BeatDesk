import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Мои товары",
  robots: { index: false, follow: false },
};

export default async function CabinetProductsPage() {
  const supabase = await createClient();
  const t = await getT();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/cabinet/products");

  const { data: products } = await supabase
    .from("products")
    .select("id, kind, title, price_minor, currency, is_public, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const list = products ?? [];

  return (
    <section className="py-10 lg:py-20">
      <Container>
        <div className="flex flex-col gap-6 border-b border-line py-8">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-section font-semibold text-paper uppercase">Мои товары</h1>
            <Link href="/cabinet/products/new" className="label border border-signal bg-signal px-3 py-2 text-ink transition-colors hover:bg-paper">
              Добавить товар
            </Link>
          </div>
          <p className="label text-mute">Киты, пресеты и услуги, которые вы продаёте отдельно от битов.</p>
        </div>

        {list.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-mute">Пока нет товаров. Добавьте первый — кит, пресет или услугу.</p>
          </div>
        ) : (
          <ul className="grid gap-4 pt-10 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((product) => (
              <li key={product.id} className="panel flex flex-col gap-3 p-5">
                <span className="label text-mute">{product.kind}</span>
                <h2 className="text-base font-semibold text-paper">{product.title}</h2>
                <span className="label text-signal">
                  {(product.price_minor / 100).toFixed(2)} {product.currency}
                </span>
                <span className="label text-mute">{product.is_public ? "Публично" : "Черновик"}</span>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}