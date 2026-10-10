import Link from "next/link";

import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Каталог: три входа в ленту.
 *
 * Первый вариант был плитками с контурными значками и цветными пятнами за
 * ними. Выглядело это как типовая вёрстка: геометрия, которая ничего не
 * значит, и одинаковые по форме блоки. Обложки битов здесь не украшение —
 * это материал, который уже есть, он настоящий и каждой плитке свой.
 *
 * Жанровые плитки убраны: строкой ниже стоят чипы жанров с теми же
 * ссылками. Две подряд работающие кнопки с одинаковым смыслом — это
 * дубликат, который мешает, а не помогает.
 *
 * Обложки тянутся по одной на раздел. Списком ради списка они не нужны, а
 * тянуть шесть картинок ради трёх плит — трата трафика, которую покупатель
 * заметит на мобильном.
 */

type Tile = {
  key: string;
  title: string;
  note: string;
  href: string;
  /** Обложка бита, который открывает этот раздел. */
  cover: string | null;
  beatTitle: string | null;
};

type TileSpec = {
  key: string;
  titleKey: string;
  noteKey: string;
  href: string;
  order: "top" | "new" | "discount";
};

const SPECS: TileSpec[] = [
  { key: "popular", titleKey: "catalog.popular", noteKey: "catalog.popularNote", href: "/?sort=popular#feed", order: "top" },
  { key: "new", titleKey: "catalog.new", noteKey: "catalog.newNote", href: "/?sort=new#feed", order: "new" },
  { key: "deals", titleKey: "catalog.deals", noteKey: "catalog.dealsNote", href: "/?scope=discounted#feed", order: "discount" },
];

export async function CatalogTiles() {
  const [t, supabase] = await Promise.all([getT(), createClient()]);

  /*
   * Обложки не должны повторяться.
   *
   * Порядок разный, а бит один и тот же: самый прослушиваемый часто и самый
   * свежий. Две одинаковые картинки в ряду читаются как ошибка, а не как
   * совпадение, поэтому каждая плитка берёт свой бит.
   */
  const used = new Set<string>();

  const tiles: Tile[] = [];
  for (const spec of SPECS) {
    {
      const base = supabase
        .from("beats")
        .select("id, title, cover_url")
        .eq("is_public", true)
        .eq("sale_state", "on_sale")
        .not("cover_url", "is", null)
        // Не одна строка: плитке нужен бит, которого ещё не занял сосед.
        // При limit(1) выбор был безальтернативным, и обе плитки брали
        // один и тот же трек независимо от сортировки.
        .limit(3);

      // Ветками, а не общим хелпером: сборка запроса PostgREST уже
      // типизирована по колонкам, и любая обёртка её ломает.
      const { data } =
        spec.order === "discount"
          ? await base.gt("discount_percent", 0)
          : spec.order === "new"
            ? await base.order("created_at", { ascending: false })
            : await base.order("plays", { ascending: false });

      const free = ((data ?? []) as { id: string; title: string; cover_url: string }[]).filter(
        (beat) => !used.has(beat.id),
      );

      // Свободных может не оказаться — например, битов всего два, а
      // разделов три. Тогда берём любой: лучше совпадение обложек, чем
      // плитка без картинки, но это редкий случай и он виден глазом.
      const beat = free[0] ?? ((data ?? [])[0] as { id: string } | undefined);

      if (beat) used.add(beat.id);

      tiles.push({
        key: spec.key,
        title: t(spec.titleKey as "catalog.popular"),
        // Раздел без битов говорит об этом прямо: пустая плитка рядом с
        // картинками читалась бы как недоделанная вёрстка.
        note: (data ?? []).length === 0 ? t("catalog.emptyNote") : t(spec.noteKey as "catalog.popularNote"),
        href: spec.href,
        cover: beat?.cover_url ?? null,
        beatTitle: beat?.title ?? null,
      });
    }
  }

  return (
    <Container>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <li key={tile.key}>
            <Link
              href={tile.href}
              className="group relative flex h-full min-h-44 flex-col justify-end overflow-hidden rounded-panel border border-line bg-ink-2 p-5 transition-colors hover:border-line-2 focusable lg:min-h-52"
            >
              {tile.cover ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tile.cover}
                    alt=""
                    className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                  {/*
                    Затемнение плотное, а не декоративное.
                    
                    На обложках битов уже есть свой текст — название на
                    снимке, и не одно. Со слабым затемнением подпись плитки
                    ложилась прямо на него, и получалось два названия друг
                    на друге. Плотная низкая часть решает это и заодно
                    оставляет верх картинки открытым, чтобы её было видно.
                  */}
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink from-35% via-ink/80 to-ink/35" />
                </>
              ) : null}

              <span className="relative font-display text-lg uppercase leading-tight tracking-tight text-paper lg:text-xl">
                {tile.title}
              </span>
              <span className="relative mt-1.5 text-sm leading-relaxed text-mute">{tile.note}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}
