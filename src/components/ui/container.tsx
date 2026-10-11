import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1560px] px-6 lg:px-12", className)}>{children}</div>;
}

/** mono dateline above a section, with a hairline and a lime marker */
export function SectionHead({
  label,
  hint,
  title,
  action,
}: {
  label: string;
  hint?: string;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 pb-5">
      <div className="flex items-center gap-3">
        {/*
          Заголовок раздела — ориентир в длинной форме, поэтому он на ступень
          крупнее обычной .label и отмечен акцентом: на чёрном фоне полоса из
          одинаковых серых плашек читалась как одна стена, и прокручивая
          форму, человек не понимал, где оказался.
        */}
        <span aria-hidden className="size-1.5 shrink-0 bg-accent" />
        <span className="text-sm font-semibold uppercase tracking-wider text-paper">{label}</span>
        {hint ? <span className="label ml-auto hidden text-mute sm:block">{hint}</span> : null}
        {action}
      </div>
      {title ? <h2 className="mt-5 font-display text-section uppercase text-paper">{title}</h2> : null}
    </div>
  );
}