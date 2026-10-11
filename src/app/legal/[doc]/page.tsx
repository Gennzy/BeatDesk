import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { LEGAL_BY_SLUG, LEGAL_DOCS, legalHasPlaceholders } from "@/lib/legal";
import { getT } from "@/lib/i18n/server";

export function generateStaticParams() {
  return LEGAL_DOCS.map((doc) => ({ doc: doc.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>;
}): Promise<Metadata> {
  const { doc: slug } = await params;
  const doc = LEGAL_BY_SLUG.get(slug);
  if (!doc) return {};

  return { title: doc.title, description: doc.summary };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc: slug } = await params;
  const doc = LEGAL_BY_SLUG.get(slug);
  if (!doc) notFound();

  const t = await getT();

  return (
    <Container className="flex flex-col gap-10 py-12">
      <nav aria-label={t("legal.breadcrumb")} className="text-sm text-mute">
        <Link href="/" className="transition-colors hover:text-paper">
          {t("nav.feed")}
        </Link>
      </nav>

      <header className="flex flex-col gap-3">
        <h1 className="font-display text-hero uppercase leading-none tracking-tight">
          {doc.title}
        </h1>
        <p className="max-w-[70ch] text-sub text-mute">{doc.summary}</p>
        <p className="label text-mute">
          {t("legal.updated")} · {doc.updated}
        </p>
      </header>

      {/*
        Пока в тексте остались двойные фигурные скобки, документ — черновик.
        Публиковать такой нельзя: на видном месте стоит «{{ИНН}}», и страница
        выглядит недоделанной. Полоса объясняет это прямо, а не прячет.
      */}
      {legalHasPlaceholders(doc) ? (
        <p className="max-w-[70ch] rounded-panel border border-line bg-ink-3 px-4 py-3 text-sm leading-relaxed text-amber">
          {t("legal.draft")}
        </p>
      ) : null}

      <div className="flex flex-col gap-10">
        {doc.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-3">
            <h2 className="text-sub font-semibold text-paper">{section.heading}</h2>

            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph} className="max-w-[72ch] text-sub leading-relaxed text-mute">
                {paragraph}
              </p>
            ))}

            {section.list ? (
              <ul className="flex flex-col gap-2">
                {section.list.map((item) => (
                  <li key={item} className="flex gap-3 text-sub leading-relaxed text-mute">
                    <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-mute/60" />
                    <span className="max-w-[70ch]">{item}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <nav aria-label={t("legal.more")} className="flex flex-wrap gap-2 border-t border-line pt-8">
        {LEGAL_DOCS.filter((item) => item.slug !== doc.slug).map((item) => (
          <Link key={item.slug} href={`/legal/${item.slug}`} className="chip chip-hover">
            {item.title}
          </Link>
        ))}
      </nav>
    </Container>
  );
}