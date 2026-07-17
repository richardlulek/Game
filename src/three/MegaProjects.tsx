/* Megaprojekten på kartan – landmärken med fasta platser i stadens
   omland. Under uppförande: byggarbetsplats med kranar; invigda:
   arena (skål med läktare), universitetscampus (fakulteter + klock-
   torn) och sjukhuskvarter (vita längor, kors och helikopterplatta). */

import { useMemo } from "react";
import { MeshStandardMaterial, type Group } from "three";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MEGA_PROJECTS } from "../engine/lateGame";
import { useGameStore } from "../store/gameStore";
import { windowEmissiveTexture, windowTexture } from "./textures";

const CRANE = "#d98e2b";
const CONCRETE = "#b9b4a8";

function useFacade(color: string, cols: number, floors: number) {
  return useMemo(() => {
    const m = new MeshStandardMaterial({ color, roughness: 0.7 });
    m.map = windowTexture(Math.max(2, cols), Math.max(2, floors));
    m.emissiveMap = windowEmissiveTexture(Math.max(2, cols), Math.max(2, floors));
    m.emissive.set("#ffffff");
    m.emissiveIntensity = 0.5;
    return m;
  }, [color, cols, floors]);
}

function Crane({ x, z, h, rot }: { x: number; z: number; h: number; rot: number }) {
  const jib = useRef<Group>(null);
  useFrame((_, dt) => { if (jib.current) jib.current.rotation.y += dt * 0.18; });
  return (
    <group position={[x, 0, z]} rotation-y={rot}>
      <mesh castShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[0.9, h, 0.9]} />
        <meshStandardMaterial color={CRANE} />
      </mesh>
      <group ref={jib} position={[0, h, 0]}>
        <mesh castShadow position={[h * 0.3, 0.4, 0]}>
          <boxGeometry args={[h * 0.8, 0.7, 0.7]} />
          <meshStandardMaterial color={CRANE} />
        </mesh>
      </group>
    </group>
  );
}

function Site({ progress, w, d, h }: { progress: number; w: number; d: number; h: number }) {
  const core = Math.max(1.5, h * progress);
  return (
    <group>
      {([[0, -d / 2, w, 0.4], [0, d / 2, w, 0.4], [-w / 2, 0, 0.4, d], [w / 2, 0, 0.4, d]] as const).map(
        ([px, pz, bw, bd], i) => (
          <mesh key={i} castShadow position={[px, 1.1, pz]}>
            <boxGeometry args={[bw, 2.2, bd]} />
            <meshStandardMaterial color="#c8b98a" />
          </mesh>
        ),
      )}
      <mesh castShadow position={[0, core / 2, 0]}>
        <boxGeometry args={[w * 0.45, core, d * 0.45]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.95} />
      </mesh>
      <Crane x={-w * 0.32} z={d * 0.3} h={h + 8} rot={0.6} />
      <Crane x={w * 0.34} z={-d * 0.28} h={h + 5} rot={-2.1} />
    </group>
  );
}

/** Imperium Arena: oval skål med läktarringar och grön plan. */
export function Arena() {
  return (
    <group>
      <group scale={[1.35, 1, 1]}>
        <mesh castShadow receiveShadow position={[0, 5, 0]}>
          <cylinderGeometry args={[30, 34, 10, 28, 1, true]} />
          <meshStandardMaterial color="#d8d2c2" roughness={0.8} side={2} />
        </mesh>
        <mesh castShadow position={[0, 10.6, 0]} rotation-x={-Math.PI / 2}>
          <torusGeometry args={[30.5, 1.4, 8, 28]} />
          <meshStandardMaterial color="#6e1a2a" roughness={0.7} />
        </mesh>
        <mesh receiveShadow position={[0, 0.6, 0]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[26, 28]} />
          <meshStandardMaterial color="#5f854c" roughness={1} />
        </mesh>
      </group>
      {/* Strålkastarmaster */}
      {[[-42, -24], [42, -24], [-42, 24], [42, 24]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh castShadow position={[0, 9, 0]}>
            <cylinderGeometry args={[0.3, 0.4, 18, 6]} />
            <meshStandardMaterial color="#8f9398" />
          </mesh>
          <mesh position={[0, 18.4, 0]}>
            <boxGeometry args={[3.2, 1.6, 0.6]} />
            <meshStandardMaterial color="#f5f2e8" emissive="#fff6d8" emissiveIntensity={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Universitetscampus: fakultetslängor kring en aula med klocktorn. */
export function Campus() {
  const brick = useFacade("#9c5a43", 8, 4);
  const stone = useFacade("#ded5bd", 6, 3);
  return (
    <group>
      {([[-24, -10, 34, 12, brick], [24, -10, 34, 12, brick], [0, 16, 44, 13, stone]] as const).map(
        ([x, z, w, d, mat], i) => (
          <group key={i} position={[x as number, 0, z as number]}>
            <mesh castShadow receiveShadow material={mat as MeshStandardMaterial} position={[0, 6, 0]}>
              <boxGeometry args={[w as number, 12, d as number]} />
            </mesh>
            <mesh castShadow position={[0, 12.9, 0]}>
              <boxGeometry args={[(w as number) + 0.8, 1.8, (d as number) + 0.8]} />
              <meshStandardMaterial color="#4a5b4e" roughness={0.85} />
            </mesh>
          </group>
        ),
      )}
      {/* Aulans klocktorn med guldur */}
      <group position={[0, 0, 16]}>
        <mesh castShadow position={[0, 12, 0]}>
          <boxGeometry args={[5, 24, 5]} />
          <meshStandardMaterial color="#ded5bd" roughness={0.8} />
        </mesh>
        <mesh castShadow position={[0, 25.4, 0]} rotation-y={Math.PI / 4}>
          <coneGeometry args={[4.2, 4.5, 4]} />
          <meshStandardMaterial color="#3e5e51" roughness={0.7} />
        </mesh>
        <mesh position={[0, 21, 2.6]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[1.4, 1.4, 0.2, 16]} />
          <meshStandardMaterial color="#c9a13b" metalness={0.5} roughness={0.4} />
        </mesh>
      </group>
      {/* Campusgrönska */}
      {[[-8, 2], [9, 1], [-2, -22], [16, -24]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh castShadow position={[0, 1.6, 0]}>
            <cylinderGeometry args={[0.35, 0.45, 3.2, 6]} />
            <meshStandardMaterial color="#7a5a3a" />
          </mesh>
          <mesh castShadow position={[0, 4.6, 0]}>
            <coneGeometry args={[3, 5.2, 7]} />
            <meshStandardMaterial color="#5f854c" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Sjukhuskvarteret: vita längor i H-form, rött kors och helikopterplatta. */
export function Hospital() {
  const white = useFacade("#eef0ee", 10, 6);
  return (
    <group>
      {([[-18, 0, 14, 40], [18, 0, 14, 40], [0, 0, 24, 12]] as const).map(([x, z, w, d], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh castShadow receiveShadow material={white} position={[0, 9, 0]}>
            <boxGeometry args={[w, 18, d]} />
          </mesh>
          <mesh castShadow position={[0, 18.5, 0]}>
            <boxGeometry args={[w + 0.6, 1, d + 0.6]} />
            <meshStandardMaterial color="#aab3ac" />
          </mesh>
        </group>
      ))}
      {/* Rött kors på mittlängan */}
      <group position={[0, 14, 6.2]}>
        <mesh><boxGeometry args={[4.2, 1.3, 0.3]} /><meshStandardMaterial color="#c0392b" emissive="#c0392b" emissiveIntensity={0.35} /></mesh>
        <mesh><boxGeometry args={[1.3, 4.2, 0.3]} /><meshStandardMaterial color="#c0392b" emissive="#c0392b" emissiveIntensity={0.35} /></mesh>
      </group>
      {/* Helikopterplatta */}
      <group position={[-18, 19.2, 0]}>
        <mesh><cylinderGeometry args={[6, 6, 0.4, 20]} /><meshStandardMaterial color="#3b4450" /></mesh>
        <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[4.2, 4.2, 0.05, 20]} /><meshStandardMaterial color="#e8e4d5" /></mesh>
      </group>
      {/* Ambulansentré */}
      <mesh castShadow position={[0, 2.2, 10]}>
        <boxGeometry args={[10, 0.4, 6]} />
        <meshStandardMaterial color="#c9a13b" />
      </mesh>
    </group>
  );
}

const SIZES: Record<string, { w: number; d: number; h: number }> = {
  arena: { w: 96, d: 74, h: 12 },
  campus: { w: 100, d: 50, h: 14 },
  sjukhus: { w: 60, d: 46, h: 19 },
};

export function MegaLandmarks() {
  const megaActive = useGameStore((s) => s.state.megaActive);
  const megaCompleted = useGameStore((s) => s.state.megaCompleted);
  return (
    <>
      {(megaActive ?? []).map((m) => {
        const proj = MEGA_PROJECTS.find((x) => x.id === m.projectId);
        if (!proj) return null;
        const sz = SIZES[proj.id] ?? { w: 60, d: 50, h: 14 };
        return (
          <group key={proj.id} position={[proj.site.x, 0, proj.site.z]}>
            <Site progress={1 - m.monthsLeft / Math.max(1, m.totalMonths)} w={sz.w} d={sz.d} h={sz.h} />
          </group>
        );
      })}
      {(megaCompleted ?? []).map((id) => {
        const proj = MEGA_PROJECTS.find((x) => x.id === id);
        if (!proj) return null;
        return (
          <group key={id} position={[proj.site.x, 0, proj.site.z]}>
            {id === "arena" ? <Arena /> : id === "campus" ? <Campus /> : <Hospital />}
          </group>
        );
      })}
    </>
  );
}
