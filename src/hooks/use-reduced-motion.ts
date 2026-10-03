"use client";

import { useMediaQuery } from "@/hooks/use-media-query";

export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}