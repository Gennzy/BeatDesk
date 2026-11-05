import { cn } from "@/lib/cn";
import Image from "next/image";

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
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-ink-3 font-display text-mute",
        sizes[size],
        className,
      )}
    >
      {src ? (
        <Image src={src} alt="" fill sizes="56px" className="object-cover" />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );
}
