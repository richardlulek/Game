/* Ägarens privatliv på kartan – lyxköpen (Bolag → Arv) blir synliga
   objekt i staden: sportbilen kryssar utanför huvudkontoret, sommarvillan
   ligger på en skärgårdsö och den privata helikoptern står på kontorets
   helipad. Ren dekor, ingen spellogik. */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { ExtrudeGeometry, Shape, type Group, type Mesh } from "three";
import { useGameStore } from "../store/gameStore";

/** Riktigt sadeltak: extruderad triangel (fyllda gavlar) längs takåsen (x). */
function GableRoof({ w, d, rise, color, overhang = 0.6 }: {
  w: number; d: number; rise: number; color: string; overhang?: number;
}) {
  const geo = useMemo(() => {
    const dd = d / 2 + overhang;
    const s = new Shape();
    s.moveTo(-dd, 0);
    s.lineTo(dd, 0);
    s.lineTo(0, rise);
    s.closePath();
    const g = new ExtrudeGeometry(s, { depth: w + overhang * 2, bevelEnabled: false });
    g.translate(0, 0, -(w + overhang * 2) / 2);
    g.rotateY(Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }, [w, d, rise, overhang]);
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

// Huvudkontorets position (spegel av POS i Headquarters.tsx).
const HQ: [number, number] = [-225, 215];
// Egen liten holme i sydvästra vattnet (fri yta mellan skärgårdsöarna).
const ISLAND: [number, number] = [-300, 466];

/* ── Sportbil ─────────────────────────────────────────────────────── */

/** Ekrad fälg med däck – vänd på tvären (axel längs z). `side` = ±1 utåt. */
function Wheel({ x, z, side }: { x: number; z: number; side: number }) {
  const R = 0.52;
  return (
    <group position={[x, R, z]} rotation-x={Math.PI / 2}>
      {/* Däck */}
      <mesh castShadow>
        <cylinderGeometry args={[R, R, 0.42, 22]} />
        <meshStandardMaterial color="#0d0d0f" roughness={0.85} />
      </mesh>
      {/* Fälgskål (utåtvänd) */}
      <mesh position={[0, side * 0.22, 0]}>
        <cylinderGeometry args={[R * 0.66, R * 0.66, 0.04, 22]} />
        <meshStandardMaterial color="#cfd3da" metalness={0.95} roughness={0.22} />
      </mesh>
      {/* Ekrar */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[0, side * 0.22, 0]} rotation-y={(i / 5) * Math.PI * 2}>
          <boxGeometry args={[R * 1.1, 0.05, 0.1]} />
          <meshStandardMaterial color="#b7bcc6" metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
      {/* Nav */}
      <mesh position={[0, side * 0.245, 0]}>
        <cylinderGeometry args={[0.11, 0.11, 0.06, 12]} />
        <meshStandardMaterial color="#8a1f18" metalness={0.6} roughness={0.35} />
      </mesh>
    </group>
  );
}

/** Låg, bred grand tourer i italienskt rött som sakta kryssar framför kontoret. */
function SportsCar() {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime * 0.18;
    const span = 46;
    g.position.x = HQ[0] + Math.sin(t) * span;
    g.rotation.y = Math.cos(t) >= 0 ? Math.PI / 2 : -Math.PI / 2;
  });
  const RED = "#c81f16";
  const paint = { color: RED, metalness: 0.6, roughness: 0.18 };
  const glass = { color: "#101a24", metalness: 0.5, roughness: 0.08 };
  return (
    <group ref={ref} position={[HQ[0], 0, HQ[1] + 16]}>
      {/* Underrede/tröskel (mörk) */}
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[5.9, 0.4, 2.0]} />
        <meshStandardMaterial color="#1a1a1d" roughness={0.7} />
      </mesh>
      {/* Huvudkaross – bred, låg */}
      <mesh castShadow position={[0, 0.78, 0]}>
        <boxGeometry args={[5.7, 0.66, 2.24]} />
        <meshStandardMaterial {...paint} />
      </mesh>
      {/* Sänkt, avsmalnande motorhuv fram */}
      <mesh castShadow position={[2.05, 0.74, 0]}>
        <boxGeometry args={[1.7, 0.4, 2.0]} />
        <meshStandardMaterial {...paint} />
      </mesh>
      {/* Nosspoiler */}
      <mesh position={[3.0, 0.5, 0]}>
        <boxGeometry args={[0.3, 0.3, 2.1]} />
        <meshStandardMaterial color="#151517" roughness={0.6} />
      </mesh>
      {/* Bakparti (något högre) */}
      <mesh castShadow position={[-2.1, 0.86, 0]}>
        <boxGeometry args={[1.5, 0.5, 2.14]} />
        <meshStandardMaterial {...paint} />
      </mesh>
      {/* Kupé – rakat tak, avsmalnande upptill */}
      <mesh castShadow position={[-0.2, 1.28, 0]}>
        <boxGeometry args={[3.0, 0.62, 1.86]} />
        <meshStandardMaterial {...paint} />
      </mesh>
      {/* Vindruta (lutande glas) */}
      <mesh position={[1.15, 1.24, 0]} rotation-z={-0.5}>
        <boxGeometry args={[1.1, 0.62, 1.7]} />
        <meshStandardMaterial {...glass} transparent opacity={0.85} />
      </mesh>
      {/* Sidorutor */}
      <mesh position={[-0.2, 1.42, 0.9]}>
        <boxGeometry args={[2.4, 0.5, 0.06]} />
        <meshStandardMaterial {...glass} transparent opacity={0.8} />
      </mesh>
      <mesh position={[-0.2, 1.42, -0.9]}>
        <boxGeometry args={[2.4, 0.5, 0.06]} />
        <meshStandardMaterial {...glass} transparent opacity={0.8} />
      </mesh>
      {/* Bakruta */}
      <mesh position={[-1.5, 1.26, 0]} rotation-z={0.55}>
        <boxGeometry args={[0.9, 0.55, 1.7]} />
        <meshStandardMaterial {...glass} transparent opacity={0.85} />
      </mesh>
      {/* Bakvinge */}
      <mesh castShadow position={[-2.7, 1.16, 0]}>
        <boxGeometry args={[0.5, 0.08, 2.0]} />
        <meshStandardMaterial color="#151517" roughness={0.5} />
      </mesh>
      <mesh position={[-2.5, 1.0, 0.8]}><boxGeometry args={[0.12, 0.32, 0.12]} /><meshStandardMaterial color="#151517" /></mesh>
      <mesh position={[-2.5, 1.0, -0.8]}><boxGeometry args={[0.12, 0.32, 0.12]} /><meshStandardMaterial color="#151517" /></mesh>
      {/* Sidobackspeglar */}
      <mesh position={[0.9, 1.15, 1.12]}><boxGeometry args={[0.16, 0.14, 0.3]} /><meshStandardMaterial {...paint} /></mesh>
      <mesh position={[0.9, 1.15, -1.12]}><boxGeometry args={[0.16, 0.14, 0.3]} /><meshStandardMaterial {...paint} /></mesh>
      {/* Strålkastare (smala LED-remsor) */}
      <mesh position={[2.86, 0.82, 0.66]}><boxGeometry args={[0.12, 0.16, 0.5]} /><meshStandardMaterial color="#f4faff" emissive="#dce6ff" emissiveIntensity={0.8} /></mesh>
      <mesh position={[2.86, 0.82, -0.66]}><boxGeometry args={[0.12, 0.16, 0.5]} /><meshStandardMaterial color="#f4faff" emissive="#dce6ff" emissiveIntensity={0.8} /></mesh>
      {/* Baklyktor (röd glöd) */}
      <mesh position={[-2.86, 0.9, 0.7]}><boxGeometry args={[0.1, 0.18, 0.44]} /><meshStandardMaterial color="#ff2a1a" emissive="#ff2a1a" emissiveIntensity={0.7} /></mesh>
      <mesh position={[-2.86, 0.9, -0.7]}><boxGeometry args={[0.1, 0.18, 0.44]} /><meshStandardMaterial color="#ff2a1a" emissive="#ff2a1a" emissiveIntensity={0.7} /></mesh>
      {/* Hjul */}
      <Wheel x={1.85} z={1.05} side={1} />
      <Wheel x={1.85} z={-1.05} side={-1} />
      <Wheel x={-1.85} z={1.05} side={1} />
      <Wheel x={-1.85} z={-1.05} side={-1} />
    </group>
  );
}

/* ── Sommarvilla ──────────────────────────────────────────────────── */

/** Litet lövträd. */
function Tree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh castShadow position={[0, 1.1 * s, 0]}>
        <cylinderGeometry args={[0.22 * s, 0.3 * s, 2.2 * s, 6]} />
        <meshStandardMaterial color="#6b4a2c" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 3.1 * s, 0]}>
        <coneGeometry args={[1.7 * s, 3.6 * s, 7]} />
        <meshStandardMaterial color="#3f6b3a" roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Fönster med vit karm och varmt ljus. */
function Window({ x, y, z, ry = 0 }: { x: number; y: number; z: number; ry?: number }) {
  return (
    <group position={[x, y, z]} rotation-y={ry}>
      <mesh position={[0, 0, 0.02]}><boxGeometry args={[1.1, 1.3, 0.12]} /><meshStandardMaterial color="#efe7d5" /></mesh>
      <mesh position={[0, 0, 0.09]}><boxGeometry args={[0.82, 1.0, 0.06]} /><meshStandardMaterial color="#ffe9a8" emissive="#ffcf6b" emissiveIntensity={0.5} /></mesh>
      {/* Spröjs */}
      <mesh position={[0, 0, 0.12]}><boxGeometry args={[0.08, 1.0, 0.04]} /><meshStandardMaterial color="#efe7d5" /></mesh>
      <mesh position={[0, 0, 0.12]}><boxGeometry args={[0.82, 0.08, 0.04]} /><meshStandardMaterial color="#efe7d5" /></mesh>
    </group>
  );
}

/** Sommarvilla på en egen liten holme med veranda, brygga och roddbåt. */
function SummerVilla() {
  const RED = "#a83a26";
  const TRIM = "#efe7d5";
  return (
    <group position={[ISLAND[0], 0, ISLAND[1]]}>
      {/* Egen holme: låg gräsplatå strax över vattenytan */}
      <mesh receiveShadow position={[0, 0.5, 0]}>
        <cylinderGeometry args={[17, 20, 1.6, 28]} />
        <meshStandardMaterial color="#8fa075" roughness={0.95} />
      </mesh>
      {/* Sandstrand runt kanten */}
      <mesh receiveShadow position={[0, 0.32, 0]}>
        <cylinderGeometry args={[19, 20.6, 1.0, 28]} />
        <meshStandardMaterial color="#dcc99a" roughness={1} />
      </mesh>
      {/* Klippor vid vattenlinjen */}
      <mesh castShadow position={[-13, 0.8, 8]}><dodecahedronGeometry args={[2.2]} /><meshStandardMaterial color="#8b8b84" roughness={1} /></mesh>
      <mesh castShadow position={[12, 0.7, -9]}><dodecahedronGeometry args={[1.7]} /><meshStandardMaterial color="#95948c" roughness={1} /></mesh>

      {/* Stenfot */}
      <mesh receiveShadow position={[0, 1.5, -1]}>
        <boxGeometry args={[12.6, 0.7, 8.6]} />
        <meshStandardMaterial color="#9a958a" roughness={1} />
      </mesh>
      {/* Huskropp i faluröd panel */}
      <mesh castShadow receiveShadow position={[0, 3.7, -1]}>
        <boxGeometry args={[12, 4, 8]} />
        <meshStandardMaterial color={RED} roughness={0.85} />
      </mesh>
      {/* Knutbrädor i vitt */}
      {([[6, 3], [-6, 3], [6, -5], [-6, -5]] as const).map(([kx, kz], i) => (
        <mesh key={i} position={[kx, 3.7, kz]}><boxGeometry args={[0.45, 4.05, 0.45]} /><meshStandardMaterial color={TRIM} /></mesh>
      ))}
      {/* Sadeltak (riktig extruderad triangel med fyllda gavlar) */}
      <group position={[0, 5.7, -1]}>
        <GableRoof w={12} d={8} rise={2.2} color="#3b4650" />
        {/* Takås */}
        <mesh position={[0, 2.24, 0]}><boxGeometry args={[12.6, 0.16, 0.3]} /><meshStandardMaterial color="#2b333b" /></mesh>
      </group>
      {/* Skorsten med krönplåt */}
      <mesh castShadow position={[-3.5, 8.1, -1]}><boxGeometry args={[1.1, 2.6, 1.1]} /><meshStandardMaterial color="#b7b2a6" /></mesh>
      <mesh position={[-3.5, 9.5, -1]}><boxGeometry args={[1.4, 0.25, 1.4]} /><meshStandardMaterial color="#2a2a2a" /></mesh>

      {/* Fönster på framsidan (mot vattnet, +z) */}
      <Window x={-3.2} y={3.9} z={3.02} />
      <Window x={3.2} y={3.9} z={3.02} />
      {/* Fönster på gaveln (+x) */}
      <Window x={6.02} y={3.9} z={-1} ry={Math.PI / 2} />
      {/* Ytterdörr */}
      <mesh position={[0, 3.0, 3.05]}><boxGeometry args={[1.3, 2.6, 0.16]} /><meshStandardMaterial color="#5a3320" roughness={0.7} /></mesh>
      <mesh position={[0.4, 3.0, 3.14]}><sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#d8b45a" metalness={0.7} roughness={0.3} /></mesh>

      {/* Veranda med golv, tak och räcke */}
      <mesh receiveShadow position={[0, 1.95, 5.4]}>
        <boxGeometry args={[10, 0.35, 3.6]} />
        <meshStandardMaterial color="#c9b78f" roughness={0.9} />
      </mesh>
      {/* Verandastolpar + tak */}
      {([-4.6, -1.5, 1.5, 4.6] as const).map((px) => (
        <mesh key={px} position={[px, 3.0, 6.9]}><cylinderGeometry args={[0.12, 0.12, 2.3, 8]} /><meshStandardMaterial color={TRIM} /></mesh>
      ))}
      <mesh castShadow position={[0, 4.25, 5.7]}><boxGeometry args={[10.2, 0.25, 3.4]} /><meshStandardMaterial color="#3b4650" roughness={0.8} /></mesh>
      {/* Räcke */}
      <mesh position={[0, 2.5, 7.05]}><boxGeometry args={[9.6, 0.12, 0.12]} /><meshStandardMaterial color={TRIM} /></mesh>

      {/* Trädgårdsgång från dörr till brygga */}
      <mesh receiveShadow position={[0, 1.02, 10]}><boxGeometry args={[1.6, 0.1, 6]} /><meshStandardMaterial color="#cdbfa0" roughness={1} /></mesh>

      {/* Brygga på pålar ut i vattnet */}
      <mesh receiveShadow position={[0, 1.0, 20]}><boxGeometry args={[3, 0.3, 18]} /><meshStandardMaterial color="#a6875a" roughness={0.9} /></mesh>
      {([[1.2, 13], [-1.2, 13], [1.2, 20], [-1.2, 20], [1.2, 27], [-1.2, 27]] as const).map(([px, pz], i) => (
        <mesh key={i} position={[px, -0.3, pz]}><cylinderGeometry args={[0.16, 0.16, 3, 6]} /><meshStandardMaterial color="#5a4632" /></mesh>
      ))}
      {/* Förtöjd roddbåt vid bryggan */}
      <group position={[3, 0.55, 24]} rotation-y={0.3}>
        <mesh castShadow><boxGeometry args={[1.5, 0.6, 3.6]} /><meshStandardMaterial color="#3a6a8a" roughness={0.7} /></mesh>
        <mesh position={[0, 0.05, 0]}><boxGeometry args={[1.0, 0.4, 3.0]} /><meshStandardMaterial color="#e8dfc8" /></mesh>
      </group>

      {/* Flaggstång med vimpel */}
      <group position={[8.5, 0, 2]}>
        <mesh position={[0, 4.5, 0]}><cylinderGeometry args={[0.1, 0.14, 9, 6]} /><meshStandardMaterial color="#e8e2d2" /></mesh>
        <mesh position={[0.7, 8.3, 0]}><boxGeometry args={[1.4, 0.5, 0.05]} /><meshStandardMaterial color="#2f6bb0" side={2} /></mesh>
      </group>

      {/* Träd och buskar */}
      <Tree x={-11} z={-4} s={1.1} />
      <Tree x={9} z={5} s={0.9} />
      <Tree x={-8} z={7} s={0.8} />
      <mesh castShadow position={[4, 0.9, -6]}><sphereGeometry args={[1.1, 8, 6]} /><meshStandardMaterial color="#4a7a44" roughness={0.9} /></mesh>
    </group>
  );
}

/* ── Helikopter ───────────────────────────────────────────────────── */

/** Privat helikopter på en helipad bredvid kontoret; rotorerna snurrar. */
function Helicopter() {
  const rotor = useRef<Group>(null);
  const tail = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (rotor.current) rotor.current.rotation.y += dt * 4.5;
    if (tail.current) tail.current.rotation.x += dt * 9;
  });
  const BODY = "#1b2530";
  const TRIM = "#c9a13b";
  return (
    <group position={[HQ[0] + 20, 0, HQ[1] - 14]}>
      {/* Helipad – fyrkantig platta med "H" och kantljus */}
      <mesh receiveShadow position={[0, 0.12, 0]}>
        <boxGeometry args={[13, 0.24, 13]} />
        <meshStandardMaterial color="#33383e" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.25, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[4.6, 5.4, 32]} />
        <meshStandardMaterial color={TRIM} />
      </mesh>
      {/* "H" */}
      <mesh position={[-1.1, 0.26, 0]}><boxGeometry args={[0.5, 0.05, 3]} /><meshStandardMaterial color="#f3f3f0" /></mesh>
      <mesh position={[1.1, 0.26, 0]}><boxGeometry args={[0.5, 0.05, 3]} /><meshStandardMaterial color="#f3f3f0" /></mesh>
      <mesh position={[0, 0.26, 0]}><boxGeometry args={[2.2, 0.05, 0.5]} /><meshStandardMaterial color="#f3f3f0" /></mesh>
      {/* Kantljus */}
      {([[6, 6], [-6, 6], [6, -6], [-6, -6]] as const).map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.35, lz]}><cylinderGeometry args={[0.16, 0.16, 0.3, 8]} /><meshStandardMaterial color="#fff2b0" emissive="#ffd45e" emissiveIntensity={0.6} /></mesh>
      ))}

      {/* Landningsställ – medar + bågar */}
      {([1.1, -1.1] as const).map((sz) => (
        <mesh key={sz} position={[0.1, 0.55, sz]}><boxGeometry args={[4.2, 0.16, 0.16]} /><meshStandardMaterial color="#4a5158" metalness={0.5} roughness={0.4} /></mesh>
      ))}
      {([[1.3, 1.1], [1.3, -1.1], [-1.3, 1.1], [-1.3, -1.1]] as const).map(([bx, bz], i) => (
        <mesh key={i} position={[bx, 1.0, bz]} rotation-z={0.35}><cylinderGeometry args={[0.09, 0.09, 1.1, 6]} /><meshStandardMaterial color="#4a5158" metalness={0.5} /></mesh>
      ))}

      {/* Fuselage – långsträckt kropp (skalad sfär) + noskon */}
      <mesh castShadow position={[0.4, 2.2, 0]} scale={[1.7, 1.15, 1.15]}>
        <sphereGeometry args={[1.5, 20, 16]} />
        <meshStandardMaterial color={BODY} metalness={0.45} roughness={0.3} />
      </mesh>
      {/* Näsa */}
      <mesh castShadow position={[2.6, 2.05, 0]} rotation-z={-Math.PI / 2}>
        <coneGeometry args={[1.15, 1.6, 18]} />
        <meshStandardMaterial color={BODY} metalness={0.45} roughness={0.3} />
      </mesh>
      {/* Cockpitglas (wraparound, tonat) */}
      <mesh position={[1.9, 2.3, 0]} scale={[1.25, 1.0, 1.02]}>
        <sphereGeometry args={[1.15, 18, 14]} />
        <meshStandardMaterial color="#9fc6ea" metalness={0.4} roughness={0.08} transparent opacity={0.7} />
      </mesh>
      {/* Guldrand längs sidan */}
      <mesh position={[0.4, 2.0, 1.32]}><boxGeometry args={[3.6, 0.18, 0.05]} /><meshStandardMaterial color={TRIM} metalness={0.7} roughness={0.3} /></mesh>
      <mesh position={[0.4, 2.0, -1.32]}><boxGeometry args={[3.6, 0.18, 0.05]} /><meshStandardMaterial color={TRIM} metalness={0.7} roughness={0.3} /></mesh>
      {/* Navigationsljus */}
      <mesh position={[3.2, 2.05, 0]}><sphereGeometry args={[0.12, 8, 8]} /><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.9} /></mesh>

      {/* Stjärtbom – avsmalnande */}
      <mesh castShadow position={[-3.4, 2.5, 0]}>
        <cylinderGeometry args={[0.28, 0.55, 4.2, 12]} />
        <meshStandardMaterial color={BODY} metalness={0.4} roughness={0.35} />
      </mesh>
      {/* Vertikalt fena */}
      <mesh castShadow position={[-5.4, 3.0, 0]} rotation-z={0.5}>
        <boxGeometry args={[1.6, 1.4, 0.18]} />
        <meshStandardMaterial color={BODY} metalness={0.4} roughness={0.35} />
      </mesh>
      {/* Horisontell stabilisator */}
      <mesh position={[-5.0, 2.5, 0]}><boxGeometry args={[0.8, 0.14, 2.2]} /><meshStandardMaterial color={BODY} /></mesh>
      {/* Stjärtrotor */}
      <mesh ref={tail} position={[-5.5, 2.9, 0.35]} rotation-y={Math.PI / 2}>
        <boxGeometry args={[2.4, 0.09, 0.28]} />
        <meshStandardMaterial color="#15191d" />
      </mesh>

      {/* Motorhus + rotoraxel på taket */}
      <mesh castShadow position={[0.2, 3.45, 0]}><boxGeometry args={[1.8, 0.7, 1.3]} /><meshStandardMaterial color="#2a323b" metalness={0.5} roughness={0.4} /></mesh>
      <mesh position={[0.2, 3.95, 0]}><cylinderGeometry args={[0.22, 0.22, 0.7, 10]} /><meshStandardMaterial color="#4a5158" metalness={0.6} /></mesh>
      {/* Huvudrotor: nav + fyra vinklade blad */}
      <group ref={rotor} position={[0.2, 4.35, 0]}>
        <mesh><cylinderGeometry args={[0.35, 0.35, 0.2, 12]} /><meshStandardMaterial color="#31383f" metalness={0.6} /></mesh>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation-y={(i / 4) * Math.PI * 2}>
            <mesh position={[3.4, 0, 0]} rotation-z={-0.04}>
              <boxGeometry args={[6.8, 0.07, 0.5]} />
              <meshStandardMaterial color="#12161a" roughness={0.6} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/** Renderar de kartsynliga lyxköpen som ägaren skaffat. */
export function OwnerLuxuries() {
  const owned = useGameStore((s) => s.state.ownerLuxuries ?? []);
  return (
    <>
      {owned.includes("sportbil") && <SportsCar />}
      {owned.includes("villa") && <SummerVilla />}
      {owned.includes("helikopter") && <Helicopter />}
      {/* Yachten renderas i Harbor (redan förtöjd i hamnen). */}
    </>
  );
}
