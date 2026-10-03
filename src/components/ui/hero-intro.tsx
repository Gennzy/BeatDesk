"use client";

import { gsap } from "gsap";
import { useEffect, useRef } from "react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";

/** Появление hero: строки заголовка выезжают из-под маски, дальше — каскад. */
export function HeroIntro({ children }: { children: React.ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const root = scope.current;
    if (!root || reducedMotion) return;

    const lines = root.querySelectorAll<HTMLElement>("[data-line]");
    const rest = root.querySelectorAll<HTMLElement>("[data-fade]");
    const scene = root.querySelector<HTMLElement>("[data-scene]");

    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });

      timeline
        .from(lines, { yPercent: 118, duration: 0.85, stagger: 0.07 })
        .from(rest, { opacity: 0, y: 18, duration: 0.6, stagger: 0.08 }, "-=0.45");

      if (scene) {
        timeline.from(scene, { opacity: 0, scale: 0.94, duration: 0.9 }, "-=0.7");
      }
    }, root);

    return () => context.revert();
  }, [reducedMotion]);

  return <div ref={scope}>{children}</div>;
}