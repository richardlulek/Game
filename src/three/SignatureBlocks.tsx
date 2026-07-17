/* Stadsdelsprojektens 3D: hela kvarteret ritas som EN komposition.
   Under bygget: plank, kranar och betongkärnor som reser sig med
   framdriften. Invigt: arkitektur per profil – kontorskluster (tre
   glastorn kring podium), bostadskvarter (kringbyggd gård med träd)
   eller kulturstråk (sågtandshallar, torg och kampanil).
   Ren renderare av GameState – klickytor och ikoner bor i ParcelNode. */

import { useMemo } from "react";
import { MeshStandardMaterial } from "three";
import { PARCELS } from "../engine/city";
import { cityProfileById } from "../engine/cityProjects";
import { useGameStore } from "../store/gameStore";
import { windowEmissiveTexture, windowTexture } from "./textures";

const CRANE = "#d98e2b";
const CONCRETE = "#b9b4a8";
const GLASS = "#6f93b4";
const BRICK = "#a8674f";
const PLASTER = "#ddd2b8";
const CULTURE = "#8f4f43";

interface Bounds { x: number; z: number; w: number; d: number }

/** Kvarterets samlade fotavtryck i världskoordinater. */
function blockBounds(blockId: string): Bounds | null {
  const ps = PARCELS.filter((p) => p.blockId === blockId);
  if (ps.length === 0) return null;
  const minX = Math.min(...ps.map((p) => p.x - p.w / 2));
  const maxX = Math.max(...ps.map((p) => p.x + p.w / 2));
  const minZ = Math.min(...ps.map((p) => p.z - p.d / 2));
  const maxZ = Math.max(...ps.map((p) => p.z + p.d / 2));
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ };
}

/** Fasadmaterial med fönsterrutnät (delas per färg+storlek via useMemo). */
function useFacade(color: string, cols: number, floors: number) {
  return useMemo(() => {
    const m = new MeshStandardMaterial({ color, roughness: 0.6 });
    m.map = windowTexture(Math.max(2, cols), Math.max(2, floors));
    m.emissiveMap = windowEmissiveTexture(Math.max(2, cols), Math.max(2, floors));
    m.emissive.set("#ffffff");
    m.emissiveIntensity = 0.5;
    return m;
  }, [color, cols, floors]);
}

/** Enkel tornkran – mast, bom och motvikt. */
function Crane({ x, z, h, rot }: { x: number; z: number; h: number; rot: number }) {
  return (
    <group position={[x, 0, z]} rotation-y={rot}>
      <mesh castShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[0.9, h, 0.9]} />
        <meshStandardMaterial color={CRANE} />
      </mesh>
      <mesh castShadow position={[h * 0.32, h + 0.4, 0]}>
        <boxGeometry args={[h * 0.85, 0.7, 0.7]} />
        <meshStandardMaterial color={CRANE} />
      </mesh>
      <mesh castShadow position={[-h * 0.14, h + 0.4, 0]}>
        <boxGeometry args={[h * 0.22, 1.1, 1.1]} />
        <meshStandardMaterial color="#8b8f94" />
      </mesh>
    </group>
  );
}

/** Byggarbetsplats: plank runt kvarteret + betongkärnor efter framdrift. */
export function ConstructionSite({ b, progress, floors }: { b: Bounds; progress: number; floors: number }) {
  const coreH = Math.max(1.5, floors * 3 * progress);
  return (
    <group position={[b.x, 0, b.z]}>
      {/* Byggplank runt kvarteret */}
      {([[0, -b.d / 2, b.w, 0.4], [0, b.d / 2, b.w, 0.4], [-b.w / 2, 0, 0.4, b.d], [b.w / 2, 0, 0.4, b.d]] as const).map(
        ([px, pz, w, d], i) => (
          <mesh key={i} castShadow position={[px, 1.1, pz]}>
            <boxGeometry args={[w, 2.2, d]} />
            <meshStandardMaterial color="#c8b98a" />
          </mesh>
        ),
      )}
      {/* Betongkärnor som växer med framdriften */}
      {([[-b.w * 0.22, -b.d * 0.18, 1], [b.w * 0.2, b.d * 0.15, 0.8], [b.w * 0.05, -b.d * 0.28, 0.6]] as const).map(
        ([cx, cz, k], i) => (
          <mesh key={i} castShadow position={[cx, (coreH * k) / 2, cz]}>
            <boxGeometry args={[b.w * 0.2, coreH * k, b.d * 0.22]} />
            <meshStandardMaterial color={CONCRETE} roughness={0.95} />
          </mesh>
        ),
      )}
      <Crane x={-b.w * 0.34} z={b.d * 0.3} h={floors * 3 * 0.7 + 12} rot={0.7} />
      <Crane x={b.w * 0.36} z={-b.d * 0.32} h={floors * 3 * 0.55 + 10} rot={-1.9} />
    </group>
  );
}

/** Kontorskluster: tre glastorn i olika höjd kring ett upphöjt podium. */
export function OfficeCluster({ b, floors }: { b: Bounds; floors: number }) {
  const tall = useFacade(GLASS, 6, floors);
  const mid = useFacade(GLASS, 5, Math.round(floors * 0.75));
  const low = useFacade(GLASS, 4, Math.round(floors * 0.5));
  const h1 = floors * 3, h2 = h1 * 0.75, h3 = h1 * 0.5;
  return (
    <group position={[b.x, 0, b.z]}>
      <mesh receiveShadow castShadow position={[0, 2.2, 0]}>
        <boxGeometry args={[b.w * 0.96, 4.4, b.d * 0.96]} />
        <meshStandardMaterial color={PLASTER} roughness={0.85} />
      </mesh>
      <mesh castShadow material={tall} position={[-b.w * 0.22, 4.4 + h1 / 2, -b.d * 0.16]}>
        <boxGeometry args={[b.w * 0.34, h1, b.d * 0.4]} />
      </mesh>
      <mesh castShadow material={mid} position={[b.w * 0.24, 4.4 + h2 / 2, b.d * 0.18]}>
        <boxGeometry args={[b.w * 0.3, h2, b.d * 0.36]} />
      </mesh>
      <mesh castShadow material={low} position={[b.w * 0.22, 4.4 + h3 / 2, -b.d * 0.24]}>
        <boxGeometry args={[b.w * 0.26, h3, b.d * 0.3]} />
      </mesh>
      {/* Krona på högsta tornet */}
      <mesh position={[-b.w * 0.22, 4.4 + h1 + 0.8, -b.d * 0.16]}>
        <boxGeometry args={[b.w * 0.28, 1.6, b.d * 0.34]} />
        <meshStandardMaterial color="#c9a13b" metalness={0.5} roughness={0.4} emissive="#c9a13b" emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}

/** Bostadskvarter: kringbyggd gård – fyra längor runt en grön gård. */
export function ResidentialBlock({ b, floors }: { b: Bounds; floors: number }) {
  const h = floors * 3;
  const t = Math.min(b.w, b.d) * 0.24;
  const north = useFacade(BRICK, 8, floors);
  const south = useFacade(PLASTER, 8, floors);
  return (
    <group position={[b.x, 0, b.z]}>
      {([
        [0, -(b.d - t) / 2, b.w, t, north, 1],
        [0, (b.d - t) / 2, b.w, t, south, 0.92],
        [-(b.w - t) / 2, 0, t, b.d - 2 * t, south, 0.85],
        [(b.w - t) / 2, 0, t, b.d - 2 * t, north, 0.95],
      ] as const).map(([px, pz, w, d, mat, hk], i) => (
        <group key={i}>
          <mesh castShadow receiveShadow material={mat} position={[px, (h * hk) / 2, pz]}>
            <boxGeometry args={[w, h * hk, d]} />
          </mesh>
          {/* Sadeltaksås i falu */}
          <mesh castShadow position={[px, h * hk + 0.9, pz]}>
            <boxGeometry args={[w + 0.6, 1.8, d + 0.6]} />
            <meshStandardMaterial color="#7d3b31" roughness={0.85} />
          </mesh>
        </group>
      ))}
      {/* Gården: gräs och träd */}
      <mesh receiveShadow position={[0, 0.25, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[b.w - 2 * t, b.d - 2 * t]} />
        <meshStandardMaterial color="#7fa05a" roughness={1} />
      </mesh>
      {([[-0.2, 0.15], [0.18, -0.12], [0.02, 0.24]] as const).map(([kx, kz], i) => (
        <group key={i} position={[kx * b.w, 0, kz * b.d]}>
          <mesh castShadow position={[0, 1.4, 0]}>
            <cylinderGeometry args={[0.3, 0.4, 2.8, 6]} />
            <meshStandardMaterial color="#7a5a3a" />
          </mesh>
          <mesh castShadow position={[0, 4, 0]}>
            <coneGeometry args={[2.6, 4.6, 7]} />
            <meshStandardMaterial color="#5f854c" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Kulturstråk: två sågtandshallar, ett torg och en kampanil. */
export function CultureDistrict({ b, floors }: { b: Bounds; floors: number }) {
  const h = floors * 3 * 0.8;
  const hall = useFacade(CULTURE, 10, Math.max(2, floors - 1));
  const teeth = 5;
  return (
    <group position={[b.x, 0, b.z]}>
      {([-b.d * 0.26, b.d * 0.26] as const).map((pz, hi) => (
        <group key={hi} position={[0, 0, pz]}>
          <mesh castShadow receiveShadow material={hall} position={[0, h / 2, 0]}>
            <boxGeometry args={[b.w * 0.9, h, b.d * 0.34]} />
          </mesh>
          {/* Sågtandstak av snedställda prismor */}
          {Array.from({ length: teeth }, (_, i) => (
            <mesh
              key={i}
              castShadow
              position={[-b.w * 0.45 + ((i + 0.5) * (b.w * 0.9)) / teeth, h + 1.3, 0]}
              rotation-z={0.5}
            >
              <boxGeometry args={[(b.w * 0.9) / teeth - 0.4, 2.4, b.d * 0.32]} />
              <meshStandardMaterial color="#e2d8c2" roughness={0.7} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Torget mellan hallarna */}
      <mesh receiveShadow position={[0, 0.22, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[b.w * 0.9, b.d * 0.14]} />
        <meshStandardMaterial color="#cfc4ae" roughness={0.95} />
      </mesh>
      {/* Kampanil (klocktorn) i hörnet */}
      <group position={[b.w * 0.38, 0, 0]}>
        <mesh castShadow position={[0, h * 1.1, 0]}>
          <boxGeometry args={[2.6, h * 2.2, 2.6]} />
          <meshStandardMaterial color={CULTURE} roughness={0.8} />
        </mesh>
        <mesh castShadow position={[0, h * 2.2 + 1.2, 0]} rotation-y={Math.PI / 4}>
          <coneGeometry args={[2.4, 2.8, 4]} />
          <meshStandardMaterial color="#c9a13b" metalness={0.4} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

/** Alla stadsdelsprojekt på kartan – pågående och invigda. */
export function SignatureBlocks() {
  const cityProjects = useGameStore((s) => s.state.cityProjects);
  const signatureBlocks = useGameStore((s) => s.state.signatureBlocks);
  return (
    <>
      {(cityProjects ?? []).map((m) => {
        const b = blockBounds(m.blockId);
        const prof = cityProfileById(m.profile);
        if (!b || !prof) return null;
        return (
          <ConstructionSite
            key={m.blockId}
            b={b}
            progress={1 - m.monthsLeft / Math.max(1, m.totalMonths)}
            floors={prof.floors}
          />
        );
      })}
      {(signatureBlocks ?? []).map((sb) => {
        const b = blockBounds(sb.blockId);
        const prof = cityProfileById(sb.profile);
        if (!b || !prof) return null;
        if (sb.profile === "kontorskluster") return <OfficeCluster key={sb.blockId} b={b} floors={prof.floors} />;
        if (sb.profile === "bostadskvarter") return <ResidentialBlock key={sb.blockId} b={b} floors={prof.floors} />;
        return <CultureDistrict key={sb.blockId} b={b} floors={prof.floors} />;
      })}
    </>
  );
}
