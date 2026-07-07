import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Color, MeshStandardMaterial, type Group, type Mesh } from "three";
import type { PropTypeKey } from "../engine/types";
import { windowTexture } from "./textures";

export const FLOOR_HEIGHT = 3;

/** Accentfärger för butiksskyltar och markiser. */
const SIGN_COLORS = ["#b6413a", "#3c6ca8", "#c9a13b", "#4d8b52", "#7a5c8f"];

export interface PointerHandlers {
  onClick?: (e: { stopPropagation: () => void }) => void;
  onPointerOver?: (e: { stopPropagation: () => void }) => void;
  onPointerOut?: () => void;
}

/** Fasadmaterial: fönstergrid på sidorna, mörkare tak, emissive vid val. */
function useFacadeMaterials(
  color: string,
  floors: number,
  w: number,
  windows: boolean,
  selected: boolean,
) {
  const { side, top } = useMemo(() => {
    const sideMat = new MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02 });
    if (windows) {
      const cols = Math.max(2, Math.round(w / 5));
      sideMat.map = windowTexture(cols, Math.max(1, floors));
    }
    const topMat = new MeshStandardMaterial({
      color: new Color(color).multiplyScalar(0.72),
      roughness: 0.95,
    });
    return { side: sideMat, top: topMat };
  }, [color, floors, w, windows]);

  useEffect(
    () => () => {
      side.map?.dispose();
      side.dispose();
      top.dispose();
    },
    [side, top],
  );

  useEffect(() => {
    for (const m of [side, top]) {
      m.emissive.set(selected ? "#ffffff" : "#000000");
      m.emissiveIntensity = selected ? 0.18 : 0;
    }
  }, [selected, side, top]);

  return useMemo(() => [side, side, top, top, side, side], [side, top]);
}

/** Grupp som växer upp ur marken vid mount (skalan ägs av useFrame). */
function GrowIn({ children, handlers }: { children: React.ReactNode; handlers: PointerHandlers }) {
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

interface TypedBuildingProps {
  type: PropTypeKey;
  floors: number;
  w: number;
  d: number;
  color: string;
  windows: boolean;
  selected: boolean;
  handlers: PointerHandlers;
  /** Deterministiskt frö för accentfärger m.m. */
  seed: number;
}

/**
 * Färdig byggnad med typsiluett:
 * bostad = villa med sadeltak (låga) eller lamellhus med hisshus,
 * kontor = torn med art deco-avsatser, butik = låghus med markis
 * och takskylt, industri = hall med skorsten och cistern.
 */
export function TypedBuilding({
  type,
  floors,
  w,
  d,
  color,
  windows,
  selected,
  handlers,
  seed,
}: TypedBuildingProps) {
  const h = floors * FLOOR_HEIGHT;
  const materials = useFacadeMaterials(color, floors, w, windows, selected);
  const accent = SIGN_COLORS[seed % SIGN_COLORS.length];
  const roofRed = "#8a4a3a";

  let body: React.ReactNode;
  switch (type) {
    case "bostad": {
      if (floors <= 2) {
        // Villa/radhus med sadeltak och skorsten
        const vw = w * 0.62;
        const vd = d * 0.62;
        body = (
          <>
            <mesh castShadow receiveShadow material={materials} position={[0, h / 2, 0]}>
              <boxGeometry args={[vw, h, vd]} />
            </mesh>
            <mesh castShadow position={[0, h + 1.3, 0]} rotation-y={Math.PI / 4}>
              <coneGeometry args={[vw * 0.78, 2.6, 4]} />
              <meshStandardMaterial color={roofRed} />
            </mesh>
            <mesh castShadow position={[vw * 0.22, h + 1.9, vd * 0.1]}>
              <boxGeometry args={[0.8, 1.7, 0.8]} />
              <meshStandardMaterial color="#6f5648" />
            </mesh>
          </>
        );
      } else if (floors <= 4) {
        // Flerbostadshus med lågt tälttak
        body = (
          <>
            <mesh castShadow receiveShadow material={materials} position={[0, h / 2, 0]}>
              <boxGeometry args={[w * 0.88, h, d * 0.72]} />
            </mesh>
            <mesh castShadow position={[0, h + 0.9, 0]} rotation-y={Math.PI / 4}>
              <coneGeometry args={[w * 0.62, 1.8, 4]} />
              <meshStandardMaterial color={roofRed} />
            </mesh>
          </>
        );
      } else {
        // Punkthus med hisshus på taket
        body = (
          <>
            <mesh castShadow receiveShadow material={materials} position={[0, h / 2, 0]}>
              <boxGeometry args={[w * 0.8, h, d * 0.72]} />
            </mesh>
            <mesh castShadow position={[w * 0.12, h + 0.8, 0]}>
              <boxGeometry args={[w * 0.3, 1.6, d * 0.3]} />
              <meshStandardMaterial color={new Color(color).multiplyScalar(0.6).getStyle()} />
            </mesh>
          </>
        );
      }
      break;
    }
    case "kontor": {
      if (floors >= 6) {
        // Art deco-torn med avsatser och antenn
        const h1 = h * 0.55;
        const h2 = h * 0.3;
        const h3 = h * 0.15;
        body = (
          <>
            <mesh castShadow receiveShadow material={materials} position={[0, h1 / 2, 0]}>
              <boxGeometry args={[w, h1, d]} />
            </mesh>
            <mesh castShadow receiveShadow material={materials} position={[0, h1 + h2 / 2, 0]}>
              <boxGeometry args={[w * 0.76, h2, d * 0.76]} />
            </mesh>
            <mesh castShadow receiveShadow material={materials} position={[0, h1 + h2 + h3 / 2, 0]}>
              <boxGeometry args={[w * 0.5, h3, d * 0.5]} />
            </mesh>
            <mesh castShadow position={[0, h + 1.9, 0]}>
              <cylinderGeometry args={[0.13, 0.13, 3.8, 6]} />
              <meshStandardMaterial color="#888888" />
            </mesh>
          </>
        );
      } else {
        body = (
          <>
            <mesh castShadow receiveShadow material={materials} position={[0, h / 2, 0]}>
              <boxGeometry args={[w, h, d]} />
            </mesh>
            <mesh castShadow position={[w * 0.18, h + 0.55, -d * 0.15]}>
              <boxGeometry args={[2.6, 1.1, 1.9]} />
              <meshStandardMaterial color="#9aa0a3" />
            </mesh>
          </>
        );
      }
      break;
    }
    case "butik": {
      body = (
        <>
          <mesh castShadow receiveShadow material={materials} position={[0, h / 2, 0]}>
            <boxGeometry args={[w, h, d]} />
          </mesh>
          {/* Markis över entrén */}
          <mesh castShadow position={[0, 2.9, d / 2 + 0.65]}>
            <boxGeometry args={[w * 0.9, 0.24, 1.4]} />
            <meshStandardMaterial color={accent} />
          </mesh>
          {/* Takskylt */}
          <mesh castShadow position={[0, h + 0.7, d * 0.32]}>
            <boxGeometry args={[Math.min(7, w * 0.45), 1.3, 0.35]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.25} />
          </mesh>
        </>
      );
      break;
    }
    case "industri": {
      const hI = Math.min(h, 4 * FLOOR_HEIGHT); // hallar är låga oavsett yta
      body = (
        <>
          <mesh castShadow receiveShadow material={materials} position={[0, hI / 2, 0]}>
            <boxGeometry args={[w, hI, d * 0.86]} />
          </mesh>
          {/* Takmonitor */}
          <mesh castShadow position={[0, hI + 0.7, 0]}>
            <boxGeometry args={[w * 0.55, 1.4, d * 0.3]} />
            <meshStandardMaterial color={new Color(color).multiplyScalar(0.8).getStyle()} />
          </mesh>
          {/* Skorsten */}
          <mesh castShadow position={[w * 0.34, hI + 2.6, -d * 0.26]}>
            <cylinderGeometry args={[0.55, 0.7, 5.4, 8]} />
            <meshStandardMaterial color="#7d6659" />
          </mesh>
          {/* Cistern */}
          <mesh castShadow position={[-w * 0.32, 1.5, d * 0.5]}>
            <cylinderGeometry args={[1.2, 1.2, 3, 10]} />
            <meshStandardMaterial color="#a8adb0" />
          </mesh>
        </>
      );
      break;
    }
  }

  return <GrowIn handlers={handlers}>{body}</GrowIn>;
}
