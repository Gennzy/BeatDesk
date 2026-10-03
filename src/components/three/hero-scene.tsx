"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { useMediaQuery } from "@/hooks/use-media-query";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useScrollProgress } from "@/hooks/use-scroll-progress";
import { cn } from "@/lib/cn";

const VinylCanvas = dynamic(() => import("@/components/three/vinyl-canvas").then((module) => module.VinylCanvas), {
  ssr: false,
  loading: () => null,
});

/** Статичная замена 3D на телефоне: та же графика, без WebGL */
function VinylFallback({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative grid place-items-center overflow-hidden bg-ink-2", className)}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(216,255,62,0.14),transparent_62%)]" />
      <svg viewBox="0 0 200 200" className="spin-slow size-[72%] max-w-[280px]">
        <circle cx="100" cy="100" r="98" fill="#0a0a0c" stroke="#f2f2ec" strokeOpacity="0.18" strokeWidth="2" />
        {Array.from({ length: 22 }, (_, index) => (
          <circle
            key={index}
            cx="100"
            cy="100"
            r={30 + index * 3.05}
            fill="none"
            stroke="#f2f2ec"
            strokeOpacity={0.05 + (index % 3) * 0.03}
            strokeWidth="0.7"
          />
        ))}
        <circle cx="100" cy="100" r="30" fill="#d8ff3e" />
        <circle cx="100" cy="100" r="21" fill="none" stroke="#0a0a0c" strokeWidth="1.6" />
        <circle cx="100" cy="100" r="4" fill="#0a0a0c" />
        <circle cx="100" cy="100" r="106" fill="none" stroke="#d8ff3e" strokeOpacity="0.4" strokeWidth="1" />
        <circle cx="100" cy="100" r="118" fill="none" stroke="#d8ff3e" strokeOpacity="0.22" strokeWidth="1" />
      </svg>
    </div>
  );
}

/**
 * Hero-сцена: 3D винил на десктопе, статичная графика на телефоне.
 * Рендер останавливается, когда hero уходит из экрана.
 */
export function HeroScene() {
  const scroll = useScrollProgress();
  const reducedMotion = useReducedMotion();
  const three = useMediaQuery("(min-width: 768px)");
  const [visible, setVisible] = useState(true);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !three) return;

    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 });
    observer.observe(host);
    return () => observer.disconnect();
  }, [three]);

  return (
    <div ref={hostRef} className="relative aspect-[4/3] w-full lg:aspect-square">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(216,255,62,0.15),transparent_64%)]" />
      <div className="cover-grid absolute inset-0 opacity-40" />

      {three ? (
        <VinylCanvas scroll={scroll} reducedMotion={reducedMotion} frameloop={visible ? "always" : "never"} />
      ) : (
        <VinylFallback className="absolute inset-0" />
      )}

      <span aria-hidden className="absolute -top-px -left-px size-2 border-t border-l border-signal/70" />
      <span aria-hidden className="absolute -top-px -right-px size-2 border-t border-r border-signal/70" />
      <span aria-hidden className="absolute -bottom-px -left-px size-2 border-b border-l border-signal/70" />
      <span aria-hidden className="absolute -bottom-px -right-px size-2 border-b border-r border-signal/70" />
    </div>
  );
}