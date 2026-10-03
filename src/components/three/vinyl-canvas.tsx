"use client";

import { Canvas } from "@react-three/fiber";
import dynamic from "next/dynamic";

type VinylCanvasProps = {
  scroll: number;
  reducedMotion: boolean;
  frameloop: "always" | "never";
};

/** three грузится только в браузере: сервер рендерит статичный винил */
const Scene = dynamic(() => import("@/components/three/vinyl-scene").then((module) => module.VinylScene), {
  ssr: false,
  loading: () => null,
});

export function VinylCanvas({ scroll, reducedMotion, frameloop }: VinylCanvasProps) {
  return (
    <Canvas
      frameloop={frameloop}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, 4.8], fov: 40 }}
      style={{ width: "100%", height: "100%" }}
    >
      <Scene scroll={scroll} reducedMotion={reducedMotion} />
    </Canvas>
  );
}