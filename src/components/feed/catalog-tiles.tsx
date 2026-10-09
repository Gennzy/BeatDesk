import Link from "next/link";

import { CatalogIcon, type CatalogIconName } from "@/components/ui/catalog-icon";
import { getT } from "@/lib/i18n/server";

/**
 * Плитка каталога.
 *
 * Тот уровень, к которому стоит тянуться, — не цвет рамки, а глубина.
 * Плоская заливка читается как заглушка: плитка перестаёт быть местом и
 * становится прямоугольником с подписью. Поэтому внутри три слоя:
 *
 *   1. тёмная основа
 *   2. подсветка — размытые пятна разных оттенков, дающие перелив
 *   3. зерно поверх, чтобы перелив не выглядел как размытая картинка
 *
 * Перелив собран из пятен, а не из одного градиента: линейный градиент
 * читается как заливка, а пятна — как свет, падающий на поверхность.
 *
 * Все ссылки ведут в реальные разделы. Плитка, ведущая в пустоту, хуже
 * отсутствующей: человек кликает и решает, что площадка сломана.
 */

type Tile = {
  icon: CatalogIconName;
  title: string;
  note: string;
  href: string;
  /**
   * Оттенок подсветки и объект.
   *
   * Оттенков всего три на весь каталог: лаймовый как основной и два
   * холодных подпоски. Раньше их было шесть, ряд читался радугой, и
   * фирменный цвет площадки переставал быть её цветом.
   */
  glow: [string, string];
  art: CatalogIconName;
};

const TILES: Tile[] = [
  {
    icon: "bolt",
    art: "bolt",
    title: "catalog.popular",
    note: "catalog.popularNote",
    href: "/?sort=popular#feed",
    glow: ["rgba(216,255,62,0.22)", "rgba(0,255,214,0.07)"],
  },
  {
    icon: "spark",
    art: "spark",
    title: "catalog.new",
    note: "catalog.newNote",
    href: "/?sort=new#feed",
    glow: ["rgba(216,255,62,0.16)", "rgba(110,200,255,0.08)"],
  },
  {
    icon: "tag",
    art: "tag",
    title: "catalog.deals",
    note: "catalog.dealsNote",
    href: "/?scope=discounted#feed",
    glow: ["rgba(216,255,62,0.18)", "rgba(110,200,255,0.07)"],
  },
  {
    icon: "wave",
    art: "wave",
    title: "genre.trap",
    note: "catalog.genreNote",
    href: "/?genre=trap#feed",
    glow: ["rgba(110,200,255,0.15)", "rgba(216,255,62,0.06)"],
  },
  {
    icon: "drop",
    art: "drop",
    title: "genre.opium",
    note: "catalog.genreNote",
    href: "/?genre=opium#feed",
    glow: ["rgba(160,150,255,0.16)", "rgba(110,200,255,0.07)"],
  },
  {
    icon: "grid",
    art: "grid",
    title: "genre.drill",
    note: "catalog.genreNote",
    href: "/?genre=drill#feed",
    glow: ["rgba(216,255,62,0.14)", "rgba(160,150,255,0.09)"],
  },
];

/**
 * Объект плитки: иконка с градиентной обводкой и бликом за ней.
 *
 * Градиент задан в SVG, а не классом: обводка — это stroke, а не фон, и
 * обычный линейный градиент фона её бы не покрыл. Идентификаторы
 * детерминированные — компонент серверный, useId там недоступен.
 */
function TileArt({ name, glow }: { name: CatalogIconName; glow: string }) {
  const gradientId = `cat-art-${name}`;

  return (
    <span aria-hidden className="pointer-events-none relative block size-20 lg:size-24">
      {/* Блик: та же фигура, размытая и приглушённая. */}
      <span
        className="absolute inset-0 scale-[1.15] opacity-60 blur-xl transition-opacity duration-500 group-hover:opacity-90"
        style={{ color: glow.replace(/[\d.]+\)$/, "0.55)") }}
      >
        <CatalogIcon name={name} className="size-full" />
      </span>

      <span className="absolute inset-0 transition-transform duration-500 group-hover:-translate-y-0.5">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" className="size-full">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#eaff7a" />
              <stop offset="55%" stopColor="#d8ff3e" />
              <stop offset="100%" stopColor="#7ad7ff" />
            </linearGradient>
          </defs>
          <g stroke={`url(#${gradientId})`}>{CATALOG_ART[name]}</g>
        </svg>
      </span>
    </span>
  );
}

/**
 * Рисунки тех же иконок, но крупным планом.
 *
 * Держатся рядом с иконками каталога, а не внутри них: мелкой иконке
 * нужна толщина 1.4, чтобы не рассыпаться, а на плитке 24×24 та же
 * толщина превращалась бы в ворс. Здесь 1.15 — тонкая линия, которая на
 * большом размере читается как грань предмета.
 */
const CATALOG_ART: Record<CatalogIconName, React.ReactNode> = {
  bolt: <path d="M13.5 2.5 5 13.5h5.5L10 21.5 19 10h-5.5z" />,
  spark: (
    <>
      <path d="M12 3v4.5M12 16.5V21M3 12h4.5M16.5 12H21" />
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 11.2V4.5a1 1 0 0 1 1-1h6.7a1 1 0 0 1 .7.3l7.3 7.3a1 1 0 0 1 0 1.4l-6.7 6.7a1 1 0 0 1-1.4 0L4.5 11.9a1 1 0 0 1-.3-.7z" />
      <circle cx="8" cy="8" r="1.3" />
    </>
  ),
  wave: <path d="M3 12h1.5M7.5 7.5v9M11.5 4.5v15M15.5 9v6M19.5 11h1.5" />,
  drop: (
    <>
      <path d="M12 3.5c3.4 3.7 5.5 6.6 5.5 9.4A5.5 5.5 0 0 1 6.5 13c0-2.8 2.1-5.7 5.5-9.5z" />
      <path d="M9.2 14.2a2.8 2.8 0 0 0 2.8 2.6" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </>
  ),
};

export async function CatalogTiles() {
  const t = await getT();

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {TILES.map((tile) => (
        <li key={tile.href}>
          <Link
            href={tile.href}
            className="group relative isolate flex h-full min-h-40 flex-col justify-between overflow-hidden rounded-panel border border-line p-5 transition-colors hover:border-line-2 focusable lg:min-h-44 lg:p-6"
            style={{ backgroundColor: "#0a0b09" }}
          >
            {/*
              Подсветка — фоном самой ссылки, а не отдельным слоем поверх:
              тогда она не перехватывает клик и не мешает фокус-кольцу.
              transition на все стороны не нужен: подсветка едет медленно и
              тяжело, а на цвет рамки — быстро и это читается как отклик.
            */}
            <span
              aria-hidden
              className="absolute inset-0 -z-10 opacity-80 transition-opacity duration-500 group-hover:opacity-100"
              style={{
                backgroundImage: `radial-gradient(85% 70% at 88% 18%, ${tile.glow[0]}, transparent 58%), radial-gradient(70% 70% at 4% 100%, ${tile.glow[1]}, transparent 55%)`,
              }}
            />

            {/*
              Зерно. Без него пятна выглядят как размытая фотография, и
              плитка кажется сломанной, а не дорогой. Пятно непрозрачности
              вместо картинки — SVG-шум тянется один раз и кэшируется.
            */}
            <span
              aria-hidden
              className="absolute inset-0 -z-10 opacity-[0.09] mix-blend-overlay"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
              }}
            />

            {/*
              Иконка здесь — не значок, а предмет плитки.

              Прежний вариант ставил её мелкой меткой в углу, и на большой
              плитке она читалась как забытый элемент управления. Теперь
              рисунок сам занимает поверхность: обводка идёт градиентом,
              за ним — то же самое размытое, то есть блик, и глаз видит
              не символ, а вещь. Это и есть разница между плиткой и
              прямоугольником с подписью.
            */}
            <span className="relative flex items-start justify-between gap-4">
              <TileArt name={tile.art} glow={tile.glow[0]} />
            </span>

            <span>
              <span className="block font-display text-lg uppercase leading-tight tracking-tight text-paper lg:text-xl">
                {t(tile.title as "catalog.popular")}
              </span>
              <span className="mt-1.5 block text-sm leading-relaxed text-mute">{t(tile.note as "catalog.popularNote")}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}