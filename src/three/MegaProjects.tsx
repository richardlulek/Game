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

/** Imperium Arena: oval tvåstegsskål med svävande takkanopi, läktarband
 *  i lagfärg, planmarkeringar och entrépartier – ett riktigt stadion. */
export function Arena() {
  return (
    <group>
      <group scale={[1.35, 1, 1]}>
        {/* Tvåstegs läktarskål – undre och övre etage med avsats */}
        <mesh castShadow receiveShadow position={[0, 4, 0]}>
          <cylinderGeometry args={[31, 34, 8, 28, 1, true]} />
          <meshStandardMaterial color="#d8d2c2" roughness={0.8} side={2} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 10, 0]}>
          <cylinderGeometry args={[27, 31, 6, 28, 1, true]} />
          <meshStandardMaterial color="#cfc8b6" roughness={0.8} side={2} />
        </mesh>
        {/* Läktarband i lagfärg längs övre kanten */}
        <mesh castShadow position={[0, 13.2, 0]} rotation-x={-Math.PI / 2}>
          <torusGeometry args={[27.5, 1.2, 8, 28]} />
          <meshStandardMaterial color="#6e1a2a" roughness={0.7} />
        </mesh>
        {/* Svävande takkanopi över läktarna på smäckra pelare */}
        <mesh castShadow position={[0, 16.4, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[20, 31.5, 28]} />
          <meshStandardMaterial color="#ece8dc" roughness={0.55} metalness={0.15} side={2} />
        </mesh>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <mesh key={i} castShadow position={[Math.cos(a) * 29.5, 13, Math.sin(a) * 29.5]}>
              <cylinderGeometry args={[0.35, 0.35, 7, 6]} />
              <meshStandardMaterial color="#8f9398" metalness={0.4} roughness={0.5} />
            </mesh>
          );
        })}
        {/* Planen med mittcirkel och mittlinje */}
        <mesh receiveShadow position={[0, 0.6, 0]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[26, 28]} />
          <meshStandardMaterial color="#5f854c" roughness={1} />
        </mesh>
        <mesh position={[0, 0.68, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[4.6, 5.1, 24]} />
          <meshStandardMaterial color="#e8e4d5" roughness={1} />
        </mesh>
        <mesh position={[0, 0.68, 0]}>
          <boxGeometry args={[0.5, 0.02, 44]} />
          <meshStandardMaterial color="#e8e4d5" roughness={1} />
        </mesh>
      </group>
      {/* Entrépartier med glasade portar i öst och väst */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 45, 0, 0]}>
          <mesh castShadow position={[0, 3, 0]}>
            <boxGeometry args={[9, 6, 14]} />
            <meshStandardMaterial color="#cfc8b6" roughness={0.85} />
          </mesh>
          <mesh position={[s * 4.6, 2.2, 0]}>
            <boxGeometry args={[0.3, 4.4, 9]} />
            <meshStandardMaterial color="#3b4450" emissive="#c8b070" emissiveIntensity={0.25} />
          </mesh>
          <mesh castShadow position={[0, 6.5, 0]}>
            <boxGeometry args={[10, 1, 15]} />
            <meshStandardMaterial color="#6e1a2a" roughness={0.7} />
          </mesh>
        </group>
      ))}
      {/* Strålkastarmaster */}
      {[[-42, -24], [42, -24], [-42, 24], [42, 24]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh castShadow position={[0, 10, 0]}>
            <cylinderGeometry args={[0.3, 0.4, 20, 6]} />
            <meshStandardMaterial color="#8f9398" />
          </mesh>
          <mesh position={[0, 20.4, 0]} rotation-y={Math.atan2(-x, -z)} rotation-x={0.35}>
            <boxGeometry args={[3.2, 1.6, 0.6]} />
            <meshStandardMaterial color="#f5f2e8" emissive="#fff6d8" emissiveIntensity={0.55} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Valmat tak – samma skal-efter-rotation-knep som HipRoof i
 *  districtBuildings: skalan i yttergruppen appliceras EFTER konens
 *  45°-rotation, annars skjuvas taket till en diamant. */
function HipRoofM({ w, d, y, rise, color }: { w: number; d: number; y: number; rise: number; color: string }) {
  const base = Math.max(w, d);
  return (
    <group position={[0, y, 0]} scale={[(w * 1.06) / base, 1, (d * 1.06) / base]}>
      <mesh castShadow rotation-y={Math.PI / 4}>
        <coneGeometry args={[base * 0.72, rise, 4]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Universitetscampus: fakultetslängor kring en aula med klocktorn,
 *  kolonnportik och grusgångar över gräsmattan. */
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
            <HipRoofM w={w as number} d={d as number} y={13.1} rise={2.8} color="#4a5b4e" />
          </group>
        ),
      )}
      {/* Aulans kolonnportik mot gräsmattan: trapp, kolonner och fronton */}
      <group position={[0, 0, 8.2]}>
        <mesh receiveShadow position={[0, 0.5, 0.6]}>
          <boxGeometry args={[16, 1, 4]} />
          <meshStandardMaterial color="#cfc4ae" roughness={0.95} />
        </mesh>
        {[-6, -2, 2, 6].map((px) => (
          <mesh key={px} castShadow position={[px, 5, 0]}>
            <cylinderGeometry args={[0.5, 0.6, 9, 8]} />
            <meshStandardMaterial color="#e8e0cd" roughness={0.8} />
          </mesh>
        ))}
        <mesh castShadow position={[0, 10, 0]}>
          <boxGeometry args={[16, 1.2, 3.6]} />
          <meshStandardMaterial color="#ded5bd" roughness={0.8} />
        </mesh>
        <group position={[0, 11.2, 0]} scale={[16 / 4, 1, 1]}>
          <mesh castShadow rotation-y={Math.PI / 4}>
            <coneGeometry args={[2.6, 1.6, 4]} />
            <meshStandardMaterial color="#4a5b4e" roughness={0.85} />
          </mesh>
        </group>
      </group>
      {/* Grusgångar över gräsmattan */}
      <mesh receiveShadow position={[0, 0.12, -2]}>
        <boxGeometry args={[3, 0.1, 22]} />
        <meshStandardMaterial color="#cfc4ae" roughness={0.95} />
      </mesh>
      <mesh receiveShadow position={[0, 0.12, -8]}>
        <boxGeometry args={[42, 0.1, 2.4]} />
        <meshStandardMaterial color="#cfc4ae" roughness={0.95} />
      </mesh>
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
      {/* Helikopterplatta med H-markering */}
      <group position={[-18, 19.2, 0]}>
        <mesh><cylinderGeometry args={[6, 6, 0.4, 20]} /><meshStandardMaterial color="#3b4450" /></mesh>
        <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[4.2, 4.2, 0.05, 20]} /><meshStandardMaterial color="#e8e4d5" /></mesh>
        {[-1.2, 1.2].map((px) => (
          <mesh key={px} position={[px, 0.32, 0]}>
            <boxGeometry args={[0.55, 0.04, 3.6]} />
            <meshStandardMaterial color="#3b4450" />
          </mesh>
        ))}
        <mesh position={[0, 0.32, 0]}>
          <boxGeometry args={[2.9, 0.04, 0.55]} />
          <meshStandardMaterial color="#3b4450" />
        </mesh>
      </group>
      {/* Glasad huvudentré under ambulanskanopin */}
      <mesh castShadow position={[0, 2.4, 7.8]}>
        <boxGeometry args={[12, 4.8, 3.4]} />
        <meshStandardMaterial color="#9fc0d4" metalness={0.4} roughness={0.25} emissive="#cfe0ec" emissiveIntensity={0.18} />
      </mesh>
      {/* Ambulanskanopi på pelare */}
      <mesh castShadow position={[0, 4.9, 11]}>
        <boxGeometry args={[10, 0.4, 5]} />
        <meshStandardMaterial color="#c9a13b" />
      </mesh>
      {[-4, 4].map((px) => (
        <mesh key={px} castShadow position={[px, 2.4, 12.8]}>
          <cylinderGeometry args={[0.22, 0.22, 4.8, 6]} />
          <meshStandardMaterial color="#8f9398" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      {/* Teknik på taken: fläktrum och ventilationshuvar */}
      <mesh castShadow position={[18, 19.9, -8]}>
        <boxGeometry args={[6, 1.6, 4]} />
        <meshStandardMaterial color="#aab3ac" roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh castShadow position={[18, 19.7, 8]}>
        <cylinderGeometry args={[0.9, 1.1, 1.4, 8]} />
        <meshStandardMaterial color="#b8bdc2" metalness={0.4} roughness={0.5} />
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
