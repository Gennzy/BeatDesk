"use client";

import { Canvas } from "@react-three/fiber";
import dynamic from "next/dynamic";

type PulseRingCanvasProps = {
  reducedMotion: boolean;
  frameloop: "always" | "never";
};

const Scene = dynamic(() => import("@/components/three/pulse-ring").then((module) => module.PulseRing), {
  ssr: false,
  loading: () => null,
});

export function PulseRingCanvas({ reducedMotion, frameloop }: PulseRingCanvasProps) {
  return (
    <Canvas
      frameloop={frameloop}
      dpr={[1, 1.6]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, 5.4], fov: 42 }}
      style={{ width: "100%", height: "100%" }}
    >
      <Scene reducedMotion={reducedMotion} />
    </Canvas>
  );
}