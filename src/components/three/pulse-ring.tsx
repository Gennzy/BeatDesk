"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

type PulseRingProps = {
  reducedMotion: boolean;
};

const COUNT = 96;
const RADIUS = 1.85;
const BPM = 124;

const LIME = new THREE.Color("#d8ff3e");
const INK = new THREE.Color("#33333c");

/** Ритмика: бочка на доли, малый барабан на 2 и 4, хэты на восьмых. */
function levelAt(time: number, index: number): number {
  const beat = (time * BPM) / 60;
  const phase = beat - Math.floor(beat);

  const kick = Math.pow(1 - phase, 2.6);
  const snare = Math.pow(Math.abs(Math.sin(beat * Math.PI)), 10);
  const hat = (Math.sin(beat * Math.PI * 4) + 1) / 2;
  const bass = 0.5 + 0.5 * Math.sin(beat * Math.PI * 0.5);
  const sweep = Math.abs(Math.sin(index * 0.63 + time * 1.1));

  return kick * 0.85 + snare * 0.42 + hat * 0.1 + bass * 0.22 + sweep * 0.16;
}

export function PulseRing({ reducedMotion }: PulseRingProps) {
  const group = useRef<THREE.Group>(null);
  const bars = useRef<THREE.InstancedMesh>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const clock = useRef(0);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const { viewport } = useThree();

  useLayoutEffect(() => {
    const element = group.current?.parent?.parent;
    if (!element) return;

    const onMove = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.current.y = (event.clientY / window.innerHeight - 0.5) * 2;
    };

    window.addEventListener("pointermove", onMove, { passive: true });

    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((_, delta) => {
    if (!reducedMotion) clock.current += delta;

    const time = clock.current;
    const mesh = bars.current;
    const root = group.current;

    if (!mesh || !root) return;

    root.rotation.y = time * 0.09 + pointer.current.x * 0.16;
    root.rotation.x = -0.18 + pointer.current.y * 0.1;

    const scale = Math.min(1, viewport.width / 6.4);

    for (let index = 0; index < COUNT; index += 1) {
      const angle = (index / COUNT) * Math.PI * 2;
      const level = reducedMotion ? 0.18 + 0.32 * Math.abs(Math.sin(index * 0.8)) : levelAt(time, index);
      const height = 0.08 + level * 1.5;

      dummy.position.set(Math.cos(angle) * RADIUS, Math.sin(angle) * RADIUS, 0);
      dummy.rotation.set(0, 0, angle + Math.PI / 2);
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();

      mesh.setMatrixAt(index, dummy.matrix);

      const hot = Math.min(1, Math.max(0, (level - 0.3) / 0.6));
      color.copy(INK).lerp(LIME, hot * 0.92);
      mesh.setColorAt(index, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.scale.setScalar(scale);
  });

  return (
    <group ref={group}>
      <instancedMesh ref={bars} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <boxGeometry args={[0.032, 1, 0.032]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {/* ось и центральная шайба, как у винила */}
      <mesh>
        <torusGeometry args={[0.5, 0.0035, 8, 96]} />
        <meshBasicMaterial color="#d8ff3e" transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.24, 0.003, 8, 72]} />
        <meshBasicMaterial color="#f2f2ec" transparent opacity={0.16} toneMapped={false} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.055, 0.055, 0.07, 24]} />
        <meshBasicMaterial color="#d8ff3e" toneMapped={false} />
      </mesh>

      {/* внешние дуги-измерители */}
      <mesh>
        <torusGeometry args={[RADIUS + 0.5, 0.003, 6, 128]} />
        <meshBasicMaterial color="#f2f2ec" transparent opacity={0.14} toneMapped={false} />
      </mesh>
      <mesh>
        <torusGeometry args={[RADIUS + 0.74, 0.003, 6, 128]} />
        <meshBasicMaterial color="#d8ff3e" transparent opacity={0.1} toneMapped={false} />
      </mesh>
    </group>
  );
}