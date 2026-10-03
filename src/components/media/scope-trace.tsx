"use client";

import { useEffect, useRef } from "react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";

import { cn } from "@/lib/cn";

type ScopeTraceProps = {
  className?: string;
};

const LIME = "216, 255, 62";
const PAPER = "242, 242, 236";

/**
 * Осциллограф вместо видео на странице входа: тонкая линия сигнала,
 * которая медленно дышит, и бегущий маркер. Ролик с главной здесь
 * не нужен — движение здесь своё и очень лёгкое.
 */
export function ScopeTrace({ className }: ScopeTraceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let running = true;
    const start = performance.now();

    const resize = () => {
      const rect = host.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);

      const elapsed = reducedMotion ? 6.5 : (now - start) / 1000;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const midY = height * 0.52;
      const amp = height * 0.26;
      const head = ((elapsed * 0.06) % 1) * (width + 240) - 120;

      // сетка
      context.strokeStyle = "rgba(242, 242, 236, 0.075)";
      context.lineWidth = 1;

      for (let x = 0; x <= width; x += 48) {
        context.beginPath();
        context.moveTo(x + 0.5, 0);
        context.lineTo(x + 0.5, height);
        context.stroke();
      }

      for (let y = 0; y <= height; y += 48) {
        context.beginPath();
        context.moveTo(0, y + 0.5);
        context.lineTo(width, y + 0.5);
        context.stroke();
      }

      // след сигнала: три гармоники с медленным дрейфом
      const step = 4;

      for (let layer = 0; layer < 3; layer += 1) {
        const alpha = layer === 0 ? 1 : layer === 1 ? 0.42 : 0.2;
        const scale = 1 - layer * 0.34;
        const rgb = layer === 1 ? PAPER : LIME;

        context.beginPath();

        for (let x = -120; x <= width + 120; x += step) {
          const p = x / width;
          const wave =
            Math.sin(p * 24 + elapsed * 0.5) * 0.4 +
            Math.sin(p * 61 - elapsed * 0.31) * 0.15 +
            Math.sin(p * 9.3 + elapsed * 0.19) * 0.3 +
            Math.sin(p * 137 + elapsed * 0.9) * 0.05;

          const envelope = Math.exp(-Math.pow((x - head) / 190, 2));
          const y = midY - wave * amp * scale * (0.32 + envelope * 0.9);

          if (x === -120) context.moveTo(x, y);
          else context.lineTo(x, y);
        }

        context.strokeStyle = `rgba(${rgb}, ${alpha})`;
        context.lineWidth = layer === 0 ? 2 : 1.1;
        context.stroke();
      }

      // бегущий маркер
      if (head > -60 && head < width + 60) {
        const gradient = context.createLinearGradient(head - 70, 0, head + 70, 0);
        gradient.addColorStop(0, `rgba(${LIME}, 0)`);
        gradient.addColorStop(0.5, `rgba(${LIME}, 0.5)`);
        gradient.addColorStop(1, `rgba(${LIME}, 0)`);

        context.strokeStyle = gradient;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(head, height * 0.18);
        context.lineTo(head, height * 0.86);
        context.stroke();

        context.fillStyle = `rgba(${LIME}, 0.9)`;
        context.beginPath();
        context.arc(head, height * 0.18, 2.5, 0, Math.PI * 2);
        context.fill();
      }

      // свечение вокруг бегущего маркера
      const glow = context.createRadialGradient(head, midY, 0, head, midY, 260);
      glow.addColorStop(0, `rgba(${LIME}, 0.12)`);
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      // затухание по краям, чтобы линия не упиралась в границы
      const fade = context.createLinearGradient(0, 0, width, 0);
      fade.addColorStop(0, "rgba(8, 8, 10, 0.9)");
      fade.addColorStop(0.14, "rgba(8, 8, 10, 0)");
      fade.addColorStop(0.86, "rgba(8, 8, 10, 0)");
      fade.addColorStop(1, "rgba(8, 8, 10, 0.9)");

      context.fillStyle = fade;
      context.fillRect(0, 0, width, height);
    };

    const observer = new IntersectionObserver(([entry]) => {
      running = entry.isIntersecting;

      if (!running) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        raf = requestAnimationFrame(draw);
      }
    });

    resize();
    observer.observe(host);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, [reducedMotion]);

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden select-none", className)}>
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />

      <div className="absolute inset-0 bg-[radial-gradient(120%_85%_at_50%_45%,transparent_15%,rgba(8,8,10,0.92)_100%)]" />
      <div className="absolute inset-y-0 left-0 w-[62%] bg-linear-to-r from-ink via-ink/72 to-transparent" />
    </div>
  );
}