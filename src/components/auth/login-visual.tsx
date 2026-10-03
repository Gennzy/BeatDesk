"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { useMediaQuery } from "@/hooks/use-media-query";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const PulseRingCanvas = dynamic(
  () => import("@/components/three/pulse-ring-canvas").then((module) => module.PulseRingCanvas),
  { ssr: false, loading: () => null },
);

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Без WebGL остаётся та же композиция, просто статичная. */
function PulseRingFallback() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden className="size-full">
      {Array.from({ length: 72 }, (_, index) => {
        const angle = (index / 72) * Math.PI * 2;
        const height = 12 + Math.abs(Math.sin(index * 0.8)) * 54;
        const x = 200 + Math.cos(angle) * 128;
        const y = 200 + Math.sin(angle) * 128;

        return (
          <line
            key={index}
            x1={x}
            y1={y}
            x2={x + Math.cos(angle) * height}
            y2={y + Math.sin(angle) * height}
            stroke={index % 9 === 0 ? "#d8ff3e" : "#2a2a31"}
            strokeWidth={index % 9 === 0 ? 2 : 1.2}
            strokeLinecap="round"
            opacity={index % 9 === 0 ? 0.9 : 0.6}
          />
        );
      })}
      <circle cx="200" cy="200" r="62" fill="none" stroke="#d8ff3e" strokeOpacity="0.5" />
      <circle cx="200" cy="200" r="30" fill="none" stroke="#f2f2ec" strokeOpacity="0.16" />
      <circle cx="200" cy="200" r="9" fill="#d8ff3e" />
      <circle cx="200" cy="200" r="168" fill="none" stroke="#d8ff3e" strokeOpacity="0.14" />
    </svg>
  );
}

export function LoginVisual() {
  const reducedMotion = useReducedMotion();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [visible, setVisible] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = host.current;
    if (!node) return;

    // проверка WebGL уходит в эффект: на сервере canvas недоступен
    const probe = requestAnimationFrame(() => setWebgl(hasWebGL()));

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.05 },
    );

    observer.observe(node);

    return () => {
      cancelAnimationFrame(probe);
      observer.disconnect();
    };
  }, []);

  const use3d = isDesktop && webgl;

  return (
    <div ref={host} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-1/2 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(216,255,62,0.1),transparent_62%)] blur-2xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_38%,rgba(8,8,10,0.86)_100%)]" />

      <div className="absolute inset-0 mx-auto h-[min(70vh,34rem)] max-w-[42rem] opacity-55">
        {use3d ? (
          <PulseRingCanvas reducedMotion={reducedMotion} frameloop={visible ? "always" : "never"} />
        ) : (
          <div className="mx-auto size-[min(78vw,26rem)]">
            <PulseRingFallback />
          </div>
        )}
      </div>

      {/* горизонтальная шкала в духе микшерного консоли */}
      <div className="absolute inset-x-6 bottom-8 hidden lg:block">
        <div className="flex items-end justify-between gap-1 opacity-45">
          {Array.from({ length: 48 }, (_, index) => (
            <span
              key={index}
              className="w-px bg-signal"
              style={{ height: `${6 + ((index * 7) % 5) * 4}px`, opacity: 0.2 + ((index % 4) * 0.15) }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}