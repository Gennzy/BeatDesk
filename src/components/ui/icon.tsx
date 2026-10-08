import { cn } from "@/lib/cn";

/**
 * Иконки в одном месте.
 *
 * Раньше значки набирали символами Unicode («◔» вместо колокольчика), и они
 * рисовались по-разному в зависимости от шрифта и платформы. Здесь явная
 * геометрия: вид одинаков везде и не зависит от загруженных шрифтов.
 *
 * Все иконки наследуют цвет через currentColor и рисуются обводкой в
 * координатной сетке 24×24.
 */
export type IconName =
  | "bell"
  | "upload"
  | "waveform"
  | "broadcast"
  | "heart"
  | "reply"
  | "follow"
  | "sale"
  | "achievement"
  | "download"
  | "check"
  | "close"
  | "chevronRight"
  | "search"
  | "bookmark"
  | "eye"
  | "trend"
  | "verified"
  | "link"
  | "share"
  | "trash";

const PATHS: Record<IconName, React.ReactNode> = {
  bell: (
    <>
      {/* Купол: симметричный, с мягкими плечами и ровным ободком. */}
      <path d="M12 3.5a5.5 5.5 0 0 0-5.5 5.5v3.2l-1.2 2.3a.8.8 0 0 0 .7 1.2h12a.8.8 0 0 0 .7-1.2l-1.2-2.3V9A5.5 5.5 0 0 0 12 3.5Z" />
      {/* Язык: короткая дуга снизу, отделена от купола, чтобы читалась. */}
      <path d="M9.7 18.6a2.5 2.5 0 0 0 4.6 0" />
      {/* Ось сверху: без неё купол выглядит как наушник. */}
      <path d="M12 3.5V2.4" />
    </>
  ),
  heart: <path d="M12 20.5 4.5 13a4.5 4.5 0 0 1 6.4-6.4l1.1 1.1 1.1-1.1A4.5 4.5 0 0 1 19.5 13L12 20.5Z" />,
  reply: <path d="M9 7 4 12l5 5M4 12h9a7 7 0 0 1 7 7v1" />,
  follow: (
    <>
      <path d="M10 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M3.5 20.5c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
      <path d="M18.5 7v5M21 9.5h-5" />
    </>
  ),
  sale: (
    <>
      <path d="M20 12.5 12.5 20a2 2 0 0 1-2.8 0L4 14.3V4h10.3l5.7 5.7a2 2 0 0 1 0 2.8Z" />
      <path d="M8 8.5h.01" />
    </>
  ),
  achievement: (
    <>
      <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5.5H5.5A2.5 2.5 0 0 0 8 8M16 5.5h2.5A2.5 2.5 0 0 1 16 8" />
      <path d="M12 12v3.5M9 20h6M10 20l.8-4.5h2.4L14 20" />
    </>
  ),
  upload: <path d="M12 20V10m0 0 3.5 3.5M12 10 8.5 13.5M5 7V5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5V7" />,
  waveform: <path d="M3 12h2m2-4v8m3-11v14m3-10v6m3-9v12m3-8v4m2-3h2" />,
  broadcast: (
    <>
      <path d="M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4" />
      <path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 19.1a10 10 0 0 0 0-14.2" />
    </>
  ),
  download: <path d="M12 4v10m0 0 3.5-3.5M12 14 8.5 10.5M5 17v1.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V17" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  bookmark: <path d="M6 4h12v16l-6-4.5L6 20V4Z" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    </>
  ),
  trend: <path d="m3 16 5.5-5.5 3.5 3.5L21 5M21 5h-5m5 0v5" />,
  verified: (
    <>
      <path d="M12 3.5 14.2 6l3.3-.4.9 3.2 3 1.4-1.4 3 .4 3.3-2.6 2.1-1 3.1-3.2-.9-2.2 2.2-2.2-2.2-3.2.9-1-3.1L2.6 16l.4-3.3-1.4-3 3-1.4.9-3.2L8.8 6 12 3.5Z" />
      <path d="m9.5 12.5 1.8 1.8 3.4-3.6" />
    </>
  ),
  link: (
    <>
      <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
      <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 1 0 5.7 5.7l1.3-1.3" />
    </>
  ),
  share: (
    <>
      <path d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5" />
      <path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
    </>
  ),
  trash: <path d="M5 7h14M10 7V5h4v2M6.5 7l1 12h9l1-12M10.5 10.5v5M13.5 10.5v5" />,
  search: (
    <>
      <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" />
      <path d="m16.5 16.5 4 4" />
    </>
  ),
};

export function Icon({
  name,
  className,
  filled = false,
}: {
  name: IconName;
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-5 shrink-0", className)}
    >
      {PATHS[name]}
    </svg>
  );
}