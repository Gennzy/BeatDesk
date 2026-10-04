"use client";

import { CURRENCIES, type CurrencyCode } from "@/lib/currency";
import { cn } from "@/lib/cn";

type Props = {
  name: string;
  value: string;
  onChange: (code: CurrencyCode) => void;
  className?: string;
};

/**
 * Выбор валюты цены. Три кнопки вместо списка: вариантов ровно три,
 * и выбор должен занимать меньше места, чем заголовок поля.
 */
export function CurrencyPicker({ name, value, onChange, className }: Props) {
  return (
    <div className={cn("flex gap-1.5", className)} role="radiogroup" aria-label="Валюта">
      <input type="hidden" name={name} value={value} />

      {CURRENCIES.map((item) => (
        <button
          key={item.code}
          type="button"
          role="radio"
          aria-checked={value === item.code}
          onClick={() => onChange(item.code)}
          className={cn(
            "label flex items-center gap-1.5 border px-2.5 py-1.5 transition-colors",
            value === item.code
              ? "border-signal bg-signal text-ink"
              : "border-line text-mute hover:border-line-2 hover:text-paper",
          )}
        >
          <span aria-hidden>{item.symbol}</span>
          {item.code}
        </button>
      ))}
    </div>
  );
}
