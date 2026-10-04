import { cn } from "@/lib/cn";

type Props = {
  username: string;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
};

const sizes = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-[11px]",
  md: "size-10 text-xs",
  lg: "size-14 text-sm",
} as const;

/**
 * Аватар битмейкера. Без картинки показываем первые две буквы ника:
 * пустой квадрат в ленте выглядит как недогруженная картинка.
 */
export function Avatar({ username, src, size = "sm", className }: Props) {
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-ink-3 font-display text-mute",
        sizes[size],
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );
}
