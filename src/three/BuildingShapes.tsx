/* ============================================================
   Gemensamma byggstenar för 3D-byggnaderna: våningshöjd,
   pekar-hanterare, uppväxtanimation, byggskal och fasadboxar.
   Själva byggnadsfamiljerna per distrikt bor i districtBuildings.tsx.
   ============================================================ */

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import { BoxGeometry, type Group, type Mesh } from "three";

export const FLOOR_HEIGHT = 3;

/**
 * Fasadbox: EN geometri, ETT material, EN draw call. Fönsterkaklets
 * upprepning bakas in i UV:erna (sidoytor = kolumner × våningar) och
 * topp/botten pekar på en mörk pixel i kaklet → mörkare tak utan
 * separat toppmaterial. Geometrierna delas via cache – hus med samma
 * mått delar GPU-buffert.
 */
const facadeGeoCache = new Map<string, BoxGeometry>();

export function facadeBoxGeometry(w: number, h: number, d: number, glass = false): BoxGeometry {
  const floors = Math.max(1, Math.round(h / FLOOR_HEIGHT));
  const key = `${w.toFixed(2)}:${h.toFixed(2)}:${d.toFixed(2)}:${glass ? "g" : "w"}`;
  const hit = facadeGeoCache.get(key);
  if (hit) return hit;
  const g = new BoxGeometry(w, h, d);
  g.clearGroups(); // ett material för hela boxen → en draw call
  const uv = g.attributes.uv;
  const scaleFace = (face: number, cols: number, rows: number) => {
    for (let i = face * 4; i < face * 4 + 4; i++)
      uv.setXY(i, (uv.getX(i) * cols) / 4, (uv.getY(i) * rows) / 4);
  };
  const colsX = Math.max(glass ? 3 : 2, Math.round(d / (glass ? 4 : 5)));
  const colsZ = Math.max(glass ? 3 : 2, Math.round(w / (glass ? 4 : 5)));
  scaleFace(0, colsX, floors); // +x
  scaleFace(1, colsX, floors); // -x
  scaleFace(4, colsZ, floors); // +z
  scaleFace(5, colsZ, floors); // -z
  // Topp/botten: enfärgad punkt i kaklet – mörk fönsterpost för putshus,
  // ljust glasparti för tornen (takdäck i stället för svart).
  const solid: [number, number] = glass ? [0.5, 0.965] : [0.123, 0.87];
  for (let i = 8; i < 16; i++) uv.setXY(i, solid[0], solid[1]);
  facadeGeoCache.set(key, g);
  return g;
}

export interface PointerHandlers {
  onClick?: (e: { stopPropagation: () => void }) => void;
  // distance = kamera→träffpunkt (R3F-raycaster), används för avstånds-gate.
  onPointerOver?: (e: { stopPropagation: () => void; distance?: number }) => void;
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
    <group ref={ref} userData={{ thumbnailFullScale: true }} {...handlers}>
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
