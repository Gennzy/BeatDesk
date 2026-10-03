"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { usePlaybackSignal } from "@/hooks/use-playback-signal";
import type { PlaybackState } from "@/lib/playback";

type VinylSceneProps = {
  /** прогресс прокрутки 0..1 — сцена реагирует на скролл */
  scroll: number;
  reducedMotion: boolean;
};

function createGrooveTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const center = size / 2;
  const radius = size / 2;

  ctx.fillStyle = "#15151b";
  ctx.fillRect(0, 0, size, size);

  // дорожки: светлая и тёмная пара на каждом кольце, чтобы ловить блик
  const count = 240;
  for (let index = 0; index < count; index += 1) {
    const t = index / count;
    const ring = radius * (0.28 + t * 0.7);
    ctx.beginPath();
    ctx.arc(center, center, ring, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(242, 242, 236, ${0.14 + (index % 4) * 0.07})`;
    ctx.lineWidth = 1.1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center, center, ring + 1.4, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // блик по краю
  ctx.beginPath();
  ctx.arc(center, center, radius - 3, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(242, 242, 236, 0.5)";
  ctx.lineWidth = 4;
  ctx.stroke();

  // отражённый свет
  const sheen = ctx.createRadialGradient(
    center + radius * 0.32,
    center - radius * 0.28,
    radius * 0.04,
    center,
    center,
    radius,
  );
  sheen.addColorStop(0, "rgba(242, 242, 236, 0.22)");
  sheen.addColorStop(0.4, "rgba(242, 242, 236, 0.07)");
  sheen.addColorStop(1, "rgba(242, 242, 236, 0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function smoothLevel(signal: React.RefObject<PlaybackState>, current: React.RefObject<number>, delta: number, rate = 8) {
  const target = signal.current.playing ? signal.current.level : 0;
  current.current += (target - current.current) * Math.min(delta * rate, 1);
  return current.current;
}

function Disc({ scroll, reducedMotion, signal }: { scroll: number; reducedMotion: boolean; signal: React.RefObject<PlaybackState> }) {
  const tilt = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const level = useRef(0);
  const texture = useMemo(() => createGrooveTexture(), []);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((state, delta) => {
    if (!tilt.current || !spin.current) return;

    const time = state.clock.elapsedTime;
    const levelValue = smoothLevel(signal, level, delta);

    if (reducedMotion) {
      tilt.current.rotation.set(0.7, 0, 0);
      tilt.current.position.set(0, 0.28, 0);
      tilt.current.scale.setScalar(1);
      spin.current.rotation.y = 0.35;
      return;
    }

    // винил крутится вокруг своей оси
    spin.current.rotation.y += delta * (0.5 + levelValue * 2.4);

    // наклон: от почти ребра к лицу камере по мере прокрутки
    tilt.current.rotation.x = THREE.MathUtils.lerp(0.55, 0.98, scroll) + Math.sin(time * 0.5) * 0.012;
    tilt.current.rotation.z = Math.sin(time * 0.32) * 0.06 - 0.05;
    tilt.current.position.y = 0.28 + Math.sin(time * 0.55) * 0.05 + levelValue * 0.08;
    tilt.current.scale.setScalar(1 + levelValue * 0.07 + scroll * 0.06);
  });

  return (
    <group ref={tilt} rotation={[0.55, 0, 0]}>
      <group ref={spin} rotation={[0, 0.35, 0]}>
        {/* корпус */}
        <mesh>
          <cylinderGeometry args={[1.18, 1.18, 0.04, 128]} />
          <meshStandardMaterial color="#14141a" roughness={0.55} metalness={0.25} />
        </mesh>

        {/* верхняя грань с дорожками */}
        <mesh position={[0, 0.023, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.178, 128]} />
          <meshStandardMaterial map={texture} roughness={0.42} metalness={0.28} />
        </mesh>

        {/* лаймовый контур диска */}
        <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.13, 1.152, 160]} />
          <meshBasicMaterial color="#d8ff3e" transparent opacity={0.55} />
        </mesh>

        {/* ярлык */}
        <mesh position={[0, 0.026, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.4, 64]} />
          <meshStandardMaterial color="#d8ff3e" roughness={0.6} metalness={0} emissive="#d8ff3e" emissiveIntensity={0.22} />
        </mesh>
        <mesh position={[0, 0.029, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.27, 0.292, 64]} />
          <meshBasicMaterial color="#0a0a0c" />
        </mesh>
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.052, 32]} />
          <meshBasicMaterial color="#0a0a0c" />
        </mesh>
      </group>
    </group>
  );
}

function SignalRings({ reducedMotion, signal }: { reducedMotion: boolean; signal: React.RefObject<PlaybackState> }) {
  const group = useRef<THREE.Group>(null);
  const level = useRef(0);

  useFrame((state, delta) => {
    if (!group.current) return;

    const time = state.clock.elapsedTime;
    const levelValue = smoothLevel(signal, level, delta, 6);

    group.current.children.forEach((ring, index) => {
      const base = 1.95 + index * 0.3;
      const breathe = reducedMotion ? 0 : Math.sin(time * (1.1 + index * 0.35)) * 0.008;
      const pulse = reducedMotion ? 0 : levelValue * (0.09 + index * 0.05);
      ring.scale.setScalar((base + breathe + pulse) / base);
    });
  });

  return (
    <group ref={group} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
      {[0, 1, 2].map((index) => (
        <mesh key={index}>
          <ringGeometry args={[1.95 + index * 0.3, 1.972 + index * 0.3, 160]} />
          <meshBasicMaterial color="#d8ff3e" transparent opacity={0.5 - index * 0.14} />
        </mesh>
      ))}
    </group>
  );
}

export function VinylScene({ scroll, reducedMotion }: VinylSceneProps) {
  const signal = usePlaybackSignal();
  const rig = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!rig.current || reducedMotion) return;
    rig.current.rotation.y = THREE.MathUtils.lerp(rig.current.rotation.y, state.pointer.x * 0.18, 0.05);
    rig.current.rotation.x = THREE.MathUtils.lerp(rig.current.rotation.x, -state.pointer.y * 0.08, 0.05);
  });

  return (
    <group ref={rig}>
      <Disc scroll={scroll} reducedMotion={reducedMotion} signal={signal} />
      <SignalRings reducedMotion={reducedMotion} signal={signal} />
      <ambientLight intensity={0.95} />
      <directionalLight position={[-2.5, 4, 5]} intensity={1.9} color="#f2f2ec" />
      <directionalLight position={[4, -1, 2]} intensity={0.5} color="#8fa0b8" />
      <pointLight position={[3, -2, 2.6]} intensity={30} distance={12} color="#d8ff3e" />
      <pointLight position={[-2.4, 2.6, -2.4]} intensity={26} distance={11} color="#d8ff3e" />
    </group>
  );
}