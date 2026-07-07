import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { ZONE_STREETS } from "../engine/city";
import { CAR_COLORS, ROAD, ROAD_DASH } from "./colors";

/**
 * Huvudleder som binder ihop de sju distrikten. Handritade rektanglar
 * i världskoordinater, avstämda mot zonerna i engine/city.ts.
 */
interface RoadSeg {
  x: number;
  z: number;
  w: number;
  d: number;
}

const ROADS: RoadSeg[] = [
  { x: 0, z: 165, w: 16, d: 140 }, // Esplanaden: Centrum ↓ Hamnen
  { x: 0, z: -88, w: 14, d: 26 }, // Centrum ↑ Innerstaden
  { x: 130, z: 56, w: 12, d: 268 }, // Östra avenyn: Centrum → Finans
  { x: 168, z: -40, w: 80, d: 12 }, // Mot Industriområdet
  { x: 214, z: 211, w: 12, d: 46 }, // Finans ↓ Hamnen
  { x: -148, z: 30, w: 50, d: 12 }, // Centrum ← Förorten
  { x: -186, z: -190, w: 54, d: 12 }, // Innerstaden ← Villakullen
  { x: -300, z: -101, w: 12, d: 70 }, // Villakullen ↓ Förorten
  { x: -295, z: 222, w: 12, d: 90 }, // Förorten ↓ mot kajen
  { x: -230, z: 262, w: 132, d: 12 }, // Västra kajvägen
];

/** Mittlinjens streck för ett vägsegment. */
function Dashes({ seg }: { seg: RoadSeg }) {
  const horizontal = seg.w > seg.d;
  const len = horizontal ? seg.w : seg.d;
  const count = Math.max(2, Math.floor(len / 12));
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const t = (i + 0.5) / count - 0.5;
        const x = seg.x + (horizontal ? t * len : 0);
        const z = seg.z + (horizontal ? 0 : t * len);
        return (
          <mesh key={i} rotation-x={-Math.PI / 2} position={[x, 0.03, z]}>
            <planeGeometry args={horizontal ? [5, 0.9] : [0.9, 5]} />
            <meshBasicMaterial color={ROAD_DASH} />
          </mesh>
        );
      })}
    </>
  );
}

/** En bil som pendlar längs ett vägsegment (eget körfält per riktning). */
function Car({
  seg,
  offset,
  speed,
  color,
}: {
  seg: RoadSeg;
  offset: number;
  speed: number;
  color: string;
}) {
  const ref = useRef<Group>(null);
  const horizontal = seg.w > seg.d;
  const len = (horizontal ? seg.w : seg.d) - 6;

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime * speed + offset;
    const phase = t % 2;
    const k = phase < 1 ? phase : 2 - phase;
    const forward = phase < 1;
    const along = (k - 0.5) * len;
    const lane = forward ? 2.6 : -2.6;
    if (horizontal) {
      g.position.set(seg.x + along, 0, seg.z + lane);
      g.rotation.y = forward ? 0 : Math.PI;
    } else {
      g.position.set(seg.x + lane, 0, seg.z + along);
      g.rotation.y = forward ? -Math.PI / 2 : Math.PI / 2;
    }
  });

  return (
    <group ref={ref}>
      <mesh castShadow position={[0, 0.75, 0]}>
        <boxGeometry args={[3.4, 1.1, 1.7]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh castShadow position={[-0.2, 1.5, 0]}>
        <boxGeometry args={[1.7, 0.7, 1.5]} />
        <meshStandardMaterial color="#dce4e8" />
      </mesh>
    </group>
  );
}

/** Klassiskt zebramönstrat övergångsställe vid ett vägsegments ände. */
function Crosswalk({ seg, end }: { seg: RoadSeg; end: -1 | 1 }) {
  const horizontal = seg.w > seg.d;
  const across = (horizontal ? seg.d : seg.w) - 3;
  const stripes = Math.max(3, Math.floor(across / 2.4));
  const alongPos = end * ((horizontal ? seg.w : seg.d) / 2 - 3.4);
  return (
    <>
      {Array.from({ length: stripes }, (_, i) => {
        const t = ((i + 0.5) / stripes - 0.5) * across;
        const x = seg.x + (horizontal ? alongPos : t);
        const z = seg.z + (horizontal ? t : alongPos);
        return (
          <mesh key={i} rotation-x={-Math.PI / 2} position={[x, 0.032, z]}>
            <planeGeometry args={horizontal ? [2.2, 1.3] : [1.3, 2.2]} />
            <meshBasicMaterial color="#dfdcd2" />
          </mesh>
        );
      })}
    </>
  );
}

/** Gatlykta med varmt sken – ljuset är emissivt (inga riktiga lampor, billigt). */
function StreetLamp({ x, z, side, rotY = 0 }: { x: number; z: number; side: number; rotY?: number }) {
  return (
    <group position={[x, 0, z]} rotation-y={rotY}>
      <mesh castShadow position={[0, 3.4, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 6.8, 6]} />
        <meshStandardMaterial color="#3d4348" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[side * 1.1, 6.7, 0]}>
        <boxGeometry args={[2.2, 0.14, 0.14]} />
        <meshStandardMaterial color="#3d4348" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[side * 2.1, 6.55, 0]}>
        <sphereGeometry args={[0.34, 8, 6]} />
        <meshStandardMaterial color="#ffe9c0" emissive="#ffca6e" emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

/** Lyktrader längs ett vägsegment, växelvis sida. */
function Lamps({ seg }: { seg: RoadSeg }) {
  const horizontal = seg.w > seg.d;
  const len = horizontal ? seg.w : seg.d;
  const count = Math.max(2, Math.floor(len / 36));
  const edge = (horizontal ? seg.d : seg.w) / 2 + 1.6;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const t = ((i + 0.5) / count - 0.5) * (len - 10);
        const side = i % 2 === 0 ? 1 : -1;
        const x = seg.x + (horizontal ? t : edge * side);
        const z = seg.z + (horizontal ? edge * side : t);
        // Armen pekar in mot vägbanan; öst–västliga vägar kräver 90° vridning
        // (lokal +x blir världens −z efter rotationen).
        return (
          <StreetLamp
            key={i}
            x={x}
            z={z}
            side={horizontal ? side : -side}
            rotY={horizontal ? Math.PI / 2 : 0}
          />
        );
      })}
    </>
  );
}

/** Huvudlederna mellan distrikten: körbana, mittlinjer, lyktor, trafik. */
export function Roads() {
  return (
    <>
      {ROADS.map((seg, i) => (
        <group key={i}>
          <mesh rotation-x={-Math.PI / 2} position={[seg.x, 0.015, seg.z]} receiveShadow>
            <planeGeometry args={[seg.w, seg.d]} />
            <meshStandardMaterial color={ROAD} roughness={0.95} />
          </mesh>
          <Dashes seg={seg} />
          <Crosswalk seg={seg} end={-1} />
          <Crosswalk seg={seg} end={1} />
          <Lamps seg={seg} />
          <Car
            seg={seg}
            offset={i * 0.7}
            speed={0.11 + (i % 3) * 0.03}
            color={CAR_COLORS[i % CAR_COLORS.length]}
          />
          {Math.max(seg.w, seg.d) > 60 && (
            <Car
              seg={seg}
              offset={i * 0.7 + 1.1}
              speed={0.09 + ((i + 1) % 3) * 0.03}
              color={CAR_COLORS[(i + 3) % CAR_COLORS.length]}
            />
          )}
        </group>
      ))}
    </>
  );
}

/** Kvartersgatorna inne i distrikten – härledda ur kvartersmodellen. */
export function ZoneStreetGrid() {
  return (
    <>
      {ZONE_STREETS.map((s, i) => (
        <mesh
          key={i}
          rotation-x={-Math.PI / 2}
          position={[s.x, 0.012, s.z]}
          receiveShadow
        >
          <planeGeometry args={[s.w, s.d]} />
          <meshStandardMaterial color={ROAD} roughness={0.95} />
        </mesh>
      ))}
    </>
  );
}

/** Lokal trafik: bilar som cirkulerar på ett urval kvartersgator. */
export function LocalTraffic() {
  // Var femte kvartersgata får en bil – deterministiskt urval.
  const streets = ZONE_STREETS.filter((_, i) => i % 5 === 2);
  return (
    <>
      {streets.map((s, i) => (
        <Car
          key={i}
          seg={{ x: s.x, z: s.z, w: s.w, d: s.d }}
          offset={i * 0.83 + 0.4}
          speed={0.05 + (i % 3) * 0.015}
          color={CAR_COLORS[(i + 2) % CAR_COLORS.length]}
        />
      ))}
    </>
  );
}
