/* ============================================================
   Gemensamma byggstenar för 3D-byggnaderna: våningshöjd,
   pekar-hanterare, uppväxtanimation och byggskal. Själva
   byggnadsfamiljerna per distrikt bor i districtBuildings.tsx.
   ============================================================ */

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import type { Group, Mesh } from "three";

export const FLOOR_HEIGHT = 3;

export interface PointerHandlers {
  onClick?: (e: { stopPropagation: () => void }) => void;
  onPointerOver?: (e: { stopPropagation: () => void }) => void;
  onPointerOut?: () => void;
}

/** Grupp som växer upp ur marken vid mount (skalan ägs av useFrame). */
export function GrowIn({ children, handlers }: { children: React.ReactNode; handlers: PointerHandlers }) {
  const ref = useRef<Group>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.scale.y = 0.05;
  }, []);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.scale.y += (1 - g.scale.y) * Math.min(1, dt * 3);
  });
  return (
    <group ref={ref} {...handlers}>
      {children}
    </group>
  );
}

/**
 * Byggnadskropp under uppförande: ren stomme vars höjd följer
 * byggprogressionen (targetScale 0–1 av full höjd).
 */
export function ConstructionShell({
  w,
  d,
  fullH,
  targetScale,
  color,
  handlers,
}: {
  w: number;
  d: number;
  fullH: number;
  targetScale: number;
  color: string;
  handlers: PointerHandlers;
}) {
  const ref = useRef<Mesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (m) {
      m.scale.y = 0.05;
      m.position.y = (fullH * 0.05) / 2 + 0.04;
    }
  }, [fullH]);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const next = m.scale.y + (targetScale - m.scale.y) * Math.min(1, dt * 3);
    m.scale.y = next;
    m.position.y = (fullH * next) / 2 + 0.04;
  });
  return (
    <mesh ref={ref} castShadow receiveShadow {...handlers}>
      <boxGeometry args={[w, fullH, d]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
