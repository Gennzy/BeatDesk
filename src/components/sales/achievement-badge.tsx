import type { AchievementId } from "@/lib/sales/achievements";
import { cn } from "@/lib/cn";

/**
 * Значки достижений.
 *
 * Нарисованы под размер 24×24 и рассчитаны на показ в медальоне: круг или
 * квадрат со скруглением, внутри глиф. Геометрия у всех общая — центр на
 * двенадцати, поля по три, — поэтому в одном ряду они читаются как набор, а
 * не как картинки из разных мест.
 *
 * У каждой своя форма, а не общая звезда с разными цифрами: месяц на
 * площадке и тысяча прослушиваний — разные поводы, и значок это показывает.
 */

type Glyph = (props: { className?: string }) => React.ReactNode;

const GLYPHS: Record<AchievementId, Glyph> = {
  // Первый бит: одна вертикальная ступень эквалайзера на подставке.
  "first-beat": ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("size-5", className)} aria-hidden>
      <path d="M12 3.5v11" />
      <path d="M8.5 7v7.5M15.5 7v7.5" opacity=".55" />
      <path d="M7 18.5h10" />
      <path d="M9.5 21h5" />
    </svg>
  ),

  // Десять битов: стопка дисков со смещением.
  "beats-10": ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("size-5", className)} aria-hidden>
      <path d="M7 6.5h10M6 9.5h12M5 12.5h14" opacity=".55" />
      <rect x="4" y="14" width="16" height="6.5" rx="2" />
      <path d="M12 17.25v.01" />
    </svg>
  ),

  // Пятьдесят битов: полка с рядами и меткой наверху.
  "beats-50": ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("size-5", className)} aria-hidden>
      <path d="M4 8h5v8H4zM9.5 5.5h5v10.5h-5zM15 10h5v6h-5z" />
      <path d="M4 20h16" />
    </svg>
  ),

  // Тысяча прослушиваний: волна звука.
  "plays-1k": ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("size-5", className)} aria-hidden>
      <path d="M3 12h1.5M7 7.5v9M10.5 4.5v15M14 8.5v7M17.5 5.5v13M21 12h-1.5" />
    </svg>
  ),

  // Десять тысяч: та же волна, но в рамке — «в масштабе».
  "plays-10k": ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("size-5", className)} aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M8 12h1M11 9v6M14 10.5v3M16.5 12h-.5" />
    </svg>
  ),

  // Первая продажа: монета с отметкой.
  "first-sale": ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("size-5", className)} aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M14.5 9.5c0-1.1-1.1-2-2.5-2s-2.5.9-2.5 2 1.1 2 2.5 2 2.5.9 2.5 2-1.1 2-2.5 2-2.5-.9-2.5-2" />
    </svg>
  ),

  // Двадцать пять продаж: стопка монет.
  "sales-25": ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("size-5", className)} aria-hidden>
      <ellipse cx="12" cy="7" rx="7.5" ry="3" />
      <path d="M4.5 7v5c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V7" />
      <path d="M4.5 12v5c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-5" />
    </svg>
  ),

  // Дорожки: слои — полосы, разложенные друг над другом.
  "stems-10": ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("size-5", className)} aria-hidden>
      <path d="M12 3.5 20 7.5 12 11.5 4 7.5z" />
      <path d="M4 12l8 4 8-4" opacity=".55" />
      <path d="M4 16.5l8 4 8-4" opacity=".3" />
    </svg>
  ),

  // Месяц: календарь с одной отметкой.
  "days-30": ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("size-5", className)} aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 9.5h17M8 3v3M16 3v3" />
      <path d="M12 12.5v1.5M12 16.5v.01" />
    </svg>
  ),

  // Год: тот же календарь, но с замкнутой стрелкой вокруг — «прошёл круг».
  "days-365": ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("size-5", className)} aria-hidden>
      <rect x="4" y="5.5" width="16" height="14" rx="3" />
      <path d="M4 9.5h16" />
      <path d="M9 13.5a3 3 0 1 1 3 3" />
      <path d="M12 16.5V14" />
    </svg>
  ),

  // Первая публикация в каналы: стрела из круга наружу.
  "first-post": ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("size-5", className)} aria-hidden>
      <path d="M13.5 4.5H7A2.5 2.5 0 0 0 4.5 7v10A2.5 2.5 0 0 0 7 19.5h10a2.5 2.5 0 0 0 2.5-2.5v-6.5" />
      <path d="M15 3.5h5.5V9" />
      <path d="M20.5 3.5 12 12" />
    </svg>
  ),

  // Первый отзыв: реплика в облаке.
  "first-review": ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("size-5", className)} aria-hidden>
      <path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16h-6l-4.5 3.5V16H7a2.5 2.5 0 0 1-2.5-2.5z" />
      <path d="M9 10h6" opacity=".55" />
    </svg>
  ),

  // Десять отзывов: та же реплика с двумя строками.
  "reviews-10": ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("size-5", className)} aria-hidden>
      <path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h6a2.5 2.5 0 0 1 2.5 2.5v6A2.5 2.5 0 0 1 13 15H8l-3.5 2.5V15H7" />
      <path d="M17 8.5h.5A2 2 0 0 1 19.5 10.5v6L16 19v-2h-.5" opacity=".55" />
      <path d="M8 9h4" opacity=".55" />
    </svg>
  ),

  // Десять подписчиков: два силуэта.
  "followers-10": ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("size-5", className)} aria-hidden>
      <path d="M9.5 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M3 20c0-3 2.9-5 6.5-5s6.5 2 6.5 5" />
      <path d="M16.5 5.5a3 3 0 0 1 0 6" opacity=".55" />
      <path d="M18 15.5c1.8.6 3 1.9 3 3.5" opacity=".55" />
    </svg>
  ),

  // Полный набор: четыре полосы, все разных уровней.
  "full-tiers": ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("size-5", className)} aria-hidden>
      <rect x="3.5" y="14" width="4" height="6.5" rx="1.5" />
      <rect x="8.75" y="10" width="4" height="10.5" rx="1.5" />
      <rect x="14" y="6" width="4" height="14.5" rx="1.5" />
      <path d="M20.5 4.5v16" opacity=".5" />
    </svg>
  ),

  // Высокая оценка: звезда в круге.
  "reviews-5": ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("size-5", className)} aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m12 7.5 1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6L6.8 11.3l3.6-.5z" />
    </svg>
  ),
};

/**
 * Медальон достижения.
 *
 * Открытое залито акцентом и слегка светится, закрытое — серым контуром.
 * Разница должна читаться с одного взгляда в списке из шестнадцати значков.
 */
export function AchievementBadge({
  id,
  unlocked,
  title,
  className,
}: {
  id: AchievementId;
  unlocked: boolean;
  title: string;
  className?: string;
}) {
  const Glyph = GLYPHS[id];

  return (
    <span
      title={title}
      aria-label={`${title} — ${unlocked ? "открыто" : "закрыто"}`}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full border transition-colors",
        unlocked
          ? "border-signal/50 bg-signal/12 text-signal shadow-[var(--glow-accent-soft)]"
          : "border-line bg-ink-2 text-mute/60",
        className,
      )}
    >
      <Glyph />
    </span>
  );
}
