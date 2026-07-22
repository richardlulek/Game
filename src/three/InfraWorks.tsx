/* Infrastrukturen på 3D-kartan (tunna delar 3/7). Fas 2 gjorde invigd
   infrastruktur permanent i ekonomin – men osynlig i staden. Varje
   invigt projekt får en byggd symbol vid distriktets kant och pågående
   kommunala byggen syns som arbetsplats med snurrande kran.
   Placeringslogiken bor i infraSpots.ts (ren och testbar). */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { useGameStore } from "../store/gameStore";
import type { GameState } from "../engine/types";
import { infraSpotsFor } from "./infraSpots";

const METRO_BLUE = "#2456a8";
const STEEL = "#8a8f96";
const WOOD = "#7a5a38";

function SpinCrane({ h }: { h: number }) {
  const jib = useRef<Group>(null);
  useFrame((_, dt) => { if (jib.current) jib.current.rotation.y += dt * 0.22; });
  return (
    <group>
      <mesh castShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[0.5, h, 0.5]} />
        <meshStandardMaterial color="#d98e2b" />
      </mesh>
      <group ref={jib} position={[0, h, 0]}>
        <mesh castShadow position={[h * 0.28, 0.25, 0]}>
          <boxGeometry args={[h * 0.75, 0.4, 0.4]} />
          <meshStandardMaterial color="#d98e2b" />
        </mesh>
      </group>
    </group>
  );
}

/** Byggarbetsplats för pågående kommunalt projekt. */
function WorkSite({ progress }: { progress: number }) {
  const core = Math.max(0.6, 3.4 * progress);
  return (
    <group>
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[6.4, 0.16, 4.2]} />
        <meshStandardMaterial color="#9a8f76" />
      </mesh>
      <mesh castShadow position={[-1.6, core / 2 + 0.16, 0]}>
        <boxGeometry args={[2.4, core, 2.2]} />
        <meshStandardMaterial color="#b9b4a8" />
      </mesh>
      <group position={[1.9, 0, 0.8]}>
        <SpinCrane h={4.6} />
      </group>
    </group>
  );
}

/** Invigd infrastruktur: en kompakt symbolbyggnad per typ. */
function BuiltWork({ kind }: { kind: string }) {
  switch (kind) {
    case "tunnelbana":
      return (
        <group>
          <mesh castShadow position={[0, 1.1, 0]}>
            <boxGeometry args={[3.2, 2.2, 2.4]} />
            <meshStandardMaterial color={METRO_BLUE} />
          </mesh>
          <mesh castShadow position={[0, 2.9, 0]}>
            <cylinderGeometry args={[0.65, 0.65, 1.3, 12]} />
            <meshStandardMaterial color="#ffffff" emissive={METRO_BLUE} emissiveIntensity={0.6} />
          </mesh>
        </group>
      );
    case "sparvag":
      return (
        <group>
          <mesh position={[0, 0.25, 0]} castShadow>
            <boxGeometry args={[5.2, 0.5, 1.6]} />
            <meshStandardMaterial color="#a8a49a" />
          </mesh>
          <mesh castShadow position={[0, 1.7, -0.5]}>
            <boxGeometry args={[3.6, 0.15, 1.1]} />
            <meshStandardMaterial color={STEEL} />
          </mesh>
          {[-1.5, 1.5].map((x) => (
            <mesh key={x} castShadow position={[x, 1, -0.5]}>
              <cylinderGeometry args={[0.09, 0.09, 1.6, 8]} />
              <meshStandardMaterial color={STEEL} />
            </mesh>
          ))}
        </group>
      );
    case "pendeltag":
      return (
        <group>
          <mesh castShadow position={[0, 1, 0]}>
            <boxGeometry args={[4.4, 2, 2.2]} />
            <meshStandardMaterial color="#8f3b2c" />
          </mesh>
          <mesh castShadow position={[0, 2.3, 0]}>
            <boxGeometry args={[4.9, 0.5, 2.7]} />
            <meshStandardMaterial color="#4a4038" />
          </mesh>
        </group>
      );
    case "bro":
      return (
        <group>
          {[-2.2, 2.2].map((x) => (
            <mesh key={x} castShadow position={[x, 2.2, 0]}>
              <boxGeometry args={[0.6, 4.4, 0.6]} />
              <meshStandardMaterial color="#b9b4a8" />
            </mesh>
          ))}
          <mesh castShadow position={[0, 2.6, 0]}>
            <boxGeometry args={[6.4, 0.35, 1.6]} />
            <meshStandardMaterial color={STEEL} />
          </mesh>
        </group>
      );
    case "hamnutbyggnad":
      return (
        <group>
          <mesh position={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[5.6, 0.6, 2.6]} />
            <meshStandardMaterial color="#7d7668" />
          </mesh>
          <group position={[0, 0.6, 0]}>
            <SpinCrane h={4.2} />
          </group>
        </group>
      );
    case "campus":
      return (
        <group>
          <mesh castShadow position={[0, 1.3, 0]}>
            <boxGeometry args={[4.2, 2.6, 2.4]} />
            <meshStandardMaterial color="#a8763e" />
          </mesh>
          <mesh castShadow position={[0, 3.5, 0]}>
            <boxGeometry args={[1, 2, 1]} />
            <meshStandardMaterial color="#8f5e2f" />
          </mesh>
          <mesh castShadow position={[0, 4.7, 0]}>
            <coneGeometry args={[0.85, 0.9, 4]} />
            <meshStandardMaterial color="#3f6b4f" />
          </mesh>
        </group>
      );
    case "skola":
      return (
        <group>
          <mesh castShadow position={[0, 1, 0]}>
            <boxGeometry args={[3.6, 2, 2.2]} />
            <meshStandardMaterial color="#c9a44a" />
          </mesh>
          <mesh castShadow position={[1.5, 2.6, 0.8]}>
            <cylinderGeometry args={[0.05, 0.05, 2.4, 6]} />
            <meshStandardMaterial color={STEEL} />
          </mesh>
          <mesh position={[1.75, 3.5, 0.8]}>
            <boxGeometry args={[0.55, 0.35, 0.02]} />
            <meshStandardMaterial color="#c8342c" />
          </mesh>
        </group>
      );
    case "stadspark":
      return (
        <group>
          <mesh position={[0, 0.06, 0]} receiveShadow>
            <cylinderGeometry args={[2.8, 2.8, 0.12, 20]} />
            <meshStandardMaterial color="#4d7a4a" />
          </mesh>
          {[[-1.4, 0.5], [1.2, -0.8], [0.2, 1.3]].map(([x, z], i) => (
            <group key={i} position={[x, 0, z]}>
              <mesh castShadow position={[0, 0.7, 0]}>
                <cylinderGeometry args={[0.12, 0.16, 1.4, 6]} />
                <meshStandardMaterial color={WOOD} />
              </mesh>
              <mesh castShadow position={[0, 1.7, 0]}>
                <coneGeometry args={[0.8, 1.6, 8]} />
                <meshStandardMaterial color="#3f6b4f" />
              </mesh>
            </group>
          ))}
        </group>
      );
    default:
      return (
        <mesh castShadow position={[0, 0.9, 0]}>
          <boxGeometry args={[2.4, 1.8, 1.8]} />
          <meshStandardMaterial color={STEEL} />
        </mesh>
      );
  }
}

export function InfraWorks() {
  const infraBuilt = useGameStore((s) => s.state.infraBuilt);
  const infraProjects = useGameStore((s) => s.state.infraProjects);
  const spots = useMemo(
    () => infraSpotsFor({ infraBuilt, infraProjects } as GameState),
    [infraBuilt, infraProjects],
  );
  return (
    <group>
      {spots.map((spot, i) => (
        <group key={`${spot.kind}-${spot.district}-${i}`} position={[spot.x, 0, spot.z]}>
          {spot.progress >= 1 ? <BuiltWork kind={spot.kind} /> : <WorkSite progress={spot.progress} />}
        </group>
      ))}
    </group>
  );
}
