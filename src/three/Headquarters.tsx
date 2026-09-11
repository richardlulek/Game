import { FacadeStructure } from "./FacadeStructure";
/* Huvudkontoret – bolagets hem på kartan. Växer med bolagsnivån:
   från liten kontorsvilla till skyskrapa med guldkrona. Den mest
   direkta signalen om att spelarens bolag blir större. */

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { MeshStandardMaterial, type Group } from "three";
import { useGameStore } from "../store/gameStore";
import { nameSignTexture, windowEmissiveTexture, windowTexture } from "./textures";

const POS: [number, number, number] = [-225, 0, 215];
const CREAM = "#e8e0cd";
const BURGUNDY = "#6e1a2a";
const GOLD = "#c9a13b";

const SIGN_STYLE: React.CSSProperties = {
  pointerEvents: "none",
  fontFamily: "'Inter', system-ui, sans-serif",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  color: "#fff",
  background: "rgba(110,26,42,0.92)",
  border: "1px solid #c9a13b",
  borderRadius: 4,
  padding: "3px 9px",
  whiteSpace: "nowrap",
};

/** Kontorstorn med fönsterfasad i bolagets färger. */
function Tower({
  w,
  d,
  floors,
  x = 0,
  z = 0,
}: {
  w: number;
  d: number;
  floors: number;
  x?: number;
  z?: number;
}) {
  const h = floors * 3;
  const mats = useMemo(() => {
    const side = new MeshStandardMaterial({ color: CREAM, roughness: 0.8 });
    side.map = windowTexture(Math.max(2, Math.round(w / 4)), floors);
    side.emissiveMap = windowEmissiveTexture(Math.max(2, Math.round(w / 4)), floors);
    side.emissive.set("#ffffff");
    side.emissiveIntensity = 0.5;
    const top = new MeshStandardMaterial({ color: "#b3aa93", roughness: 0.95 });
    return [side, side, top, top, side, side];
  }, [w, floors]);
  return (
    <><FacadeStructure kind="office" volumes={[{ w, d, h, x, z }]} /><mesh castShadow receiveShadow material={mats} position={[x, h / 2, z]}>
      <boxGeometry args={[w, h, d]} />
    </mesh></>
  );
}

/** Vajande bolagsflagga (egen kopia – CityExtras Flag är intern). */
function CompanyFlag({ y }: { y: number }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = Math.sin(clock.elapsedTime * 2.2) * 0.28;
  });
  return (
    <group position={[0, y, 0]}>
      <mesh castShadow position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.09, 0.12, 3.6, 6]} />
        <meshStandardMaterial color="#8f9398" metalness={0.5} roughness={0.5} />
      </mesh>
      <group ref={ref} position={[0, 2.7, 0]}>
        <mesh position={[1.05, 0, 0]}>
          <planeGeometry args={[2, 1.1]} />
          <meshStandardMaterial color={BURGUNDY} side={2} />
        </mesh>
      </group>
    </group>
  );
}

/** Bolagsskylt i 3D på taket: namnet på vinröd panel med guldram som
 *  lyser svagt – syns på håll långt innan HTML-skylten går att läsa. */
function RoofSign({ name, y, z = 0 }: { name: string; y: number; z?: number }) {
  const mat = useMemo(() => {
    const m = new MeshStandardMaterial({ map: nameSignTexture(name), side: 2, roughness: 0.5 });
    m.emissiveMap = m.map;
    m.emissive.set("#ffffff");
    m.emissiveIntensity = 0.35;
    return m;
  }, [name]);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <group position={[0, y, z]}>
      {[-2.6, 2.6].map((px) => (
        <mesh key={px} position={[px, -1.0, 0]}>
          <cylinderGeometry args={[0.09, 0.11, 1.6, 6]} />
          <meshStandardMaterial color="#8f9398" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      <mesh material={mat}>
        <planeGeometry args={[7.5, 1.4]} />
      </mesh>
    </group>
  );
}

/** Byggnadsformen per bolagsnivå. */
function HqBuilding({ level }: { level: number }) {
  switch (Math.min(6, Math.max(1, level))) {
    case 1:
      // Kontorsvilla – ett rum och ett skrivbord
      return (
        <>
          <mesh castShadow receiveShadow position={[0, 2, 0]}>
            <boxGeometry args={[9, 4, 8]} />
            <meshStandardMaterial color={CREAM} roughness={0.85} />
          </mesh>
          <mesh castShadow position={[0, 5.2, 0]} rotation-y={Math.PI / 4}>
            <coneGeometry args={[7, 2.6, 4]} />
            <meshStandardMaterial color={BURGUNDY} roughness={0.8} />
          </mesh>
        </>
      );
    case 2:
      return (
        <>
          <Tower w={12} d={10} floors={2} />
          <mesh castShadow position={[0, 6.6, 0]}>
            <boxGeometry args={[12.6, 0.5, 10.6]} />
            <meshStandardMaterial color={BURGUNDY} />
          </mesh>
        </>
      );
    case 3:
      return (
        <>
          <Tower w={13} d={11} floors={4} />
          <mesh castShadow position={[0, 12.4, 0]}>
            <boxGeometry args={[13.6, 0.6, 11.6]} />
            <meshStandardMaterial color={BURGUNDY} />
          </mesh>
        </>
      );
    case 4:
      return (
        <>
          <Tower w={14} d={12} floors={7} />
          <Tower w={9} d={8} floors={2} x={9} z={2} />
          <mesh castShadow position={[0, 21.4, 0]}>
            <boxGeometry args={[14.6, 0.7, 12.6]} />
            <meshStandardMaterial color={BURGUNDY} />
          </mesh>
        </>
      );
    case 5:
      return (
        <>
          <Tower w={14} d={12} floors={10} />
          <Tower w={10} d={9} floors={4} x={10} z={2} />
          <mesh castShadow position={[0, 30.4, 0]}>
            <boxGeometry args={[14.6, 0.7, 12.6]} />
            <meshStandardMaterial color={BURGUNDY} />
          </mesh>
          <CompanyFlag y={30.8} />
        </>
      );
    default:
      // Nivå 6: skyskrapa med guldkrona
      return (
        <>
          <Tower w={15} d={13} floors={12} />
          <Tower w={11} d={9.5} floors={3} x={0} z={0} />
          <mesh castShadow position={[0, 37.6, 0]}>
            <boxGeometry args={[11, 1.4, 9.5]} />
            <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={0.3} metalness={0.6} roughness={0.35} />
          </mesh>
          <CompanyFlag y={38.3} />
        </>
      );
  }
}

/** Huvudkontoret med skylt och entréplatta. Växer in vid nivåhöjning. */
export function Headquarters() {
  const level = useGameStore((s) => s.state.companyLevel ?? 1);
  const name = useGameStore((s) => s.state.companyName ?? "My Property Co.");
  const ref = useRef<Group>(null);
  const prevLevel = useRef(level);

  // Nivåhöjning: byggnaden växer upp ur marken igen (ägs av useFrame).
  useLayoutEffect(() => {
    if (ref.current && prevLevel.current !== level) {
      ref.current.scale.y = 0.1;
      prevLevel.current = level;
    }
  }, [level]);
  useFrame((_, dt) => {
    const g = ref.current;
    if (g && g.scale.y < 1) g.scale.y = Math.min(1, g.scale.y + (1 - g.scale.y) * Math.min(1, dt * 2.5));
  });

  const signHeight = [0, 8, 10, 16, 25, 34, 42][Math.min(6, level)] ?? 8;

  return (
    <group position={POS}>
      {/* Entréplatta med gårdsplan */}
      <mesh receiveShadow position={[0, 0.09, 0]}>
        <boxGeometry args={[24, 0.18, 22]} />
        <meshStandardMaterial color="#cfccbf" roughness={0.95} />
      </mesh>
      <group ref={ref}>
        <HqBuilding level={level} />
        {/* Takskylt med bolagsnamnet från nivå 3 – flaggnivåerna får den
            bakomskjuten så flaggstången inte skär genom panelen. */}
        {level >= 3 && (
          <RoofSign
            name={name}
            y={[0, 0, 0, 13.9, 22.9, 31.9, 39.4][Math.min(6, level)]}
            z={level >= 5 ? -3.2 : 0}
          />
        )}
      </group>
      {/* distanceFactor: skylten krymper med avståndet i stället för att
          täcka halva kvarteret i utzoomad vy. */}
      <Html position={[0, signHeight + 2, 0]} center zIndexRange={[30, 0]} distanceFactor={220}>
        <div style={SIGN_STYLE}>★ {name}</div>
      </Html>
    </group>
  );
}
