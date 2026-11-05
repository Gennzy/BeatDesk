import Link from "next/link";
import { redirect } from "next/navigation";

import { Container } from "@/components/ui/container";
import Image from "next/image";
import { resolve } from "@/lib/short-links-store";
import { createClient } from "@/lib/supabase/server";
import { normalizePrices } from "@/lib/prices";

export default async function ShortLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await resolve(code);

  if ("error" in result) redirect("/?shortlink=notfound");

  const path = result.path;

  // Короткая ссылка на бит показывается как лендинг: обложка, метаданные
  // и кнопка покупки. Остальные цели по-прежнему редиректят.
  const beatMatch = path.match(/^\/beats\/([0-9a-f-]{36})$/i);
  if (beatMatch) {
    const beatId = beatMatch[1];
    const supabase = await createClient();
    const { data } = await supabase
      .from("beats")
      .select("id, title, bpm, key, cover_url, prices, currency, is_public")
      .eq("id", beatId)
      .maybeSingle();

    if (data && data.is_public) {
      const prices = normalizePrices(data.prices);
      const cheapest = Object.values(prices).filter((v): v is number => typeof v === "number").sort((a, b) => a - b)[0];

      return (
        <section className="py-10 lg:py-20">
          <Container>
            <div className="mx-auto flex max-w-md flex-col gap-6">
              <div className="relative aspect-square overflow-hidden rounded-lg border border-line bg-ink-3">
                {data.cover_url ? (
                  <Image src={data.cover_url} alt="" fill sizes="448px" className="object-cover" />
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <h1 className="font-display text-title font-semibold text-paper">{data.title}</h1>
                <p className="label text-mute">
                  {data.bpm} BPM · {data.key}
                  {cheapest !== undefined ? ` · от ${cheapest}` : ""}
                </p>
              </div>
              <Link
                href={`/beats/${data.id}`}
                className="flex h-12 items-center justify-center rounded-control bg-signal px-5 text-sm font-medium text-ink transition-opacity hover:opacity-90"
              >
                Открыть и купить
              </Link>
            </div>
          </Container>
        </section>
      );
    }
  }

  redirect(path);
}