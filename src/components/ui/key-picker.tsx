"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";
import { PITCH_CLASSES } from "@/lib/keys";

const MODES = [
  { suffix: "minor", label: "minor" },
  { suffix: "major", label: "major" },
] as const;

/** Тональность сеткой 12×2 вместо выпадающего списка на 24 пункта. */
export function KeyPicker({ name = "key", defaultValue = "F# minor" }: { name?: string; defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="flex flex-col gap-3">
      {MODES.map((mode) => (
        <div key={mode.suffix} className="flex items-center gap-3">
          <span className="label w-14 shrink-0 text-mute">{mode.label}</span>
          <div className="grid flex-1 grid-cols-6 gap-1 sm:grid-cols-12">
            {PITCH_CLASSES.map((note) => {
              const option = `${note} ${mode.suffix}`;
              const active = value === option;

              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setValue(option)}
                  className={cn(
                    "h-9 rounded-md border font-mono text-xs transition-colors duration-150",
                    active
                      ? "border-signal bg-signal text-ink"
                      : "border-line bg-ink-2 text-mute hover:border-line-2 hover:text-paper",
                  )}
                >
                  {note}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <input type="hidden" name={name} value={value} />
    </div>
  );
}