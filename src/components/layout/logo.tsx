import Image from "next/image";

import { cn } from "@/lib/cn";

type LogoProps = {
  /** lockup — знак с названием, mark — только знак */
  variant?: "lockup" | "mark";
  className?: string;
  priority?: boolean;
};

/** Логотип собран из утверждённого файла: знак плюс название в одну линию. */
export function Logo({ variant = "lockup", className, priority = false }: LogoProps) {
  const isMark = variant === "mark";

  return (
    <Image
      src={isMark ? "/brand/beatdesk-mark-180.png" : "/brand/beatdesk-horizontal.png"}
      alt="BeatDesk"
      width={isMark ? 180 : 765}
      height={isMark ? 180 : 150}
      priority={priority}
      className={cn("w-auto shrink-0 select-none", className)}
    />
  );
}