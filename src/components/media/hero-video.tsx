"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { useMediaQuery } from "@/hooks/use-media-query";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type HeroVideoProps = {
  src: string;
  className?: string;
};

/** Кадр рисуем уже 640px и берём примерно 15 в секунду: память держится в разумных рамках. */
const FRAME_WIDTH = 560;
const SAMPLE_MS = 66;
const MAX_FRAMES = 60;
const PLAYBACK_FPS = 24;

/**
 * Фон-видео с бумерангом: кадры пишутся в canvas, потом проигрываются туда-сюда.
 * Без повтора ролик не зацикливается рывком, а качается.
 */
export function HeroVideo({ src, className }: HeroVideoProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const framesRef = useRef<HTMLCanvasElement[]>([]);
  const reducedMotion = useReducedMotion();
  // ролик на 6.7 МБ на телефоне не грузим: там остаётся статичный фон
  const allowVideo = useMediaQuery("(min-width: 768px)");
  const [boomerang, setBoomerang] = useState(false);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    const host = hostRef.current;
    if (!video || !host) return;

    let cancelled = false;
    let rafCapture = 0;
    let videoCallback = 0;
    let lastCapture = 0;
    const frames: HTMLCanvasElement[] = framesRef.current;

    function capture(now: number) {
      if (cancelled) return;

      if (now - lastCapture >= SAMPLE_MS && frames.length < MAX_FRAMES) {
        lastCapture = now;

        if (video && video.videoWidth > 0 && !video.paused && !video.ended) {
          const scale = Math.min(1, FRAME_WIDTH / video.videoWidth);
          const width = Math.round(video.videoWidth * scale);
          const height = Math.round(video.videoHeight * scale);
          const offscreen = document.createElement("canvas");
          offscreen.width = width;
          offscreen.height = height;
          const context = offscreen.getContext("2d");
          context?.drawImage(video, 0, 0, width, height);
          frames.push(offscreen);
        }
      }

      if (typeof video?.requestVideoFrameCallback === "function") {
        videoCallback = video.requestVideoFrameCallback(capture);
      } else {
        rafCapture = requestAnimationFrame(capture);
      }
    }

    function onEnded() {
      if (cancelled) return;

      if (frames.length > 2) {
        setBoomerang(true);
      } else if (video) {
        // кадры не собрались, просто зацикливаем ролик
        video.loop = true;
        void video.play().catch(() => {});
      }
    }

    function play() {
      if (reducedMotion || !video) return;
      void video.play().catch(() => {});
      if (typeof video?.requestVideoFrameCallback === "function") {
        videoCallback = video.requestVideoFrameCallback(capture);
      } else {
        rafCapture = requestAnimationFrame(capture);
      }
    }

    function pause() {
      video?.pause();
      if (typeof video?.cancelVideoFrameCallback === "function" && videoCallback) {
        video.cancelVideoFrameCallback(videoCallback);
      }
      if (rafCapture) cancelAnimationFrame(rafCapture);
    }

    video.addEventListener("ended", onEnded);

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        play();
      } else {
        setInView(false);
        pause();
      }
    });

    observer.observe(host);

    if (reducedMotion || !allowVideo) {
      // статичный первый кадр: ни видео, ни бумеранга
      video.currentTime = 0;
    } else {
      play();
    }

    return () => {
      cancelled = true;
      observer.disconnect();
      video.removeEventListener("ended", onEnded);
      pause();
    };
  }, [allowVideo, reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!boomerang || !canvas || !host) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const frames = framesRef.current;
    const total = frames.length;
    if (total === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const rect = host.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    let index = 0;
    let direction = 1;
    let raf = 0;
    let last = performance.now();

    const render = (now: number) => {
      raf = requestAnimationFrame(render);

      const elapsed = now - last;
      if (elapsed < 1000 / PLAYBACK_FPS) return;
      last = now - (elapsed % (1000 / PLAYBACK_FPS));

      const frame = frames[index];
      if (frame === undefined || canvas.width === 0 || canvas.height === 0) return;

      const ratio = Math.max(canvas.width / frame.width, canvas.height / frame.height);
      const width = frame.width * ratio;
      const height = frame.height * ratio;
      context.drawImage(frame, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);

      index += direction;
      if (index >= total - 1) {
        index = total - 1;
        direction = -1;
      } else if (index <= 0) {
        index = 0;
        direction = 1;
      }
    };

    if (inView) {
      raf = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
    };
  }, [boomerang, inView]);

  return (
    <div ref={hostRef} aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden select-none", className)}>
      {allowVideo ? (
        <>
          <video
            ref={videoRef}
            src={src}
            muted
            playsInline
            preload="auto"
            className={cn("size-full scale-[1.12] object-cover blur-[4px]", boomerang && "opacity-0")}
          />
          <canvas
            ref={canvasRef}
            className={cn("absolute inset-0 size-full scale-[1.12] blur-[4px]", !boomerang && "opacity-0")}
          />
        </>
      ) : (
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(90%_70%_at_70%_20%,rgba(216,255,62,0.07),transparent_60%)]" />
      )}
      {/* затемнение под текст и виньетка по краям */}
      <div className="absolute inset-0 bg-ink/66" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_85%_at_50%_45%,transparent_20%,rgba(8,8,10,0.9)_100%)]" />
      <div className="absolute inset-y-0 left-0 w-[78%] bg-linear-to-r from-ink via-ink/85 to-transparent" />
    </div>
  );
}