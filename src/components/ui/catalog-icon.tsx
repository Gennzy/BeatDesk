/**
 * Иконки каталога.
 *
 * Все нарисованы на одной сетке 24 и одной толщине штриха: ряд из трёх
 * иконок, взятых из разных наборов, выглядит как случайная россыпь, и
 * плитки перестают быть частью одного раздела.
 *
 * Иконка — это штрих без заливки, кроме одной детали. Заливка внутри
 * силуэта превращается в пятно на мелком размере и съедает сам рисунок.
 */

export type CatalogIconName =
  | "bolt"
  | "spark"
  | "tag"
  | "wave"
  | "drop"
  | "grid";

export function CatalogIcon({ name, className }: { name: CatalogIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {name === "bolt" ? (
        <path d="M13.5 2.5 5 13.5h5.5L10 21.5 19 10h-5.5z" />
      ) : null}

      {name === "spark" ? (
        <>
          <path d="M12 3v4.5M12 16.5V21M3 12h4.5M16.5 12H21" />
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
        </>
      ) : null}

      {name === "tag" ? (
        <>
          <path d="M3.5 11.2V4.5a1 1 0 0 1 1-1h6.7a1 1 0 0 1 .7.3l7.3 7.3a1 1 0 0 1 0 1.4l-6.7 6.7a1 1 0 0 1-1.4 0L4.5 11.9a1 1 0 0 1-.3-.7z" />
          <circle cx="8" cy="8" r="1.3" />
        </>
      ) : null}

      {name === "wave" ? (
        <>
          <path d="M3 12h1.5M7.5 7.5v9M11.5 4.5v15M15.5 9v6M19.5 11h1.5" />
        </>
      ) : null}

      {name === "drop" ? (
        <>
          <path d="M12 3.5c3.4 3.7 5.5 6.6 5.5 9.4A5.5 5.5 0 0 1 6.5 13c0-2.8 2.1-5.7 5.5-9.5z" />
          <path d="M9.2 14.2a2.8 2.8 0 0 0 2.8 2.6" />
        </>
      ) : null}

      {name === "grid" ? (
        <>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
        </>
      ) : null}
    </svg>
  );
}