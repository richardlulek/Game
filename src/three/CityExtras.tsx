import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group, Mesh, MeshStandardMaterial } from "three";
import { useGameStore } from "../store/gameStore";
import { LANDMARKS } from "./landmarks";

/** En rökpuff som stiger, växer och tonar ut i loop. */
function Puff({ x, y, z, phase, drift }: { x: number; y: number; z: number; phase: number; drift: number }) {
  const ref = useRef<Mesh>(null);
  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const t = (state.clock.elapsedTime * 0.22 + phase) % 1;
    m.position.set(x + t * drift, y + t * 11, z);
    const sc = 0.7 + t * 2.1;
    m.scale.set(sc, sc, sc);
    (m.material as MeshStandardMaterial).opacity = 0.42 * (1 - t);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[1.1, 8, 6]} />
      <meshStandardMaterial color="#e8e6e0" transparent opacity={0.4} depthWrite={false} />
    </mesh>
  );
}

/** Rökpelare: tre pulserande puffar ur en skorsten. */
export function Smoke({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <>
      {[0, 0.33, 0.66].map((phase, i) => (
        <Puff key={i} x={x} y={y} z={z} phase={phase} drift={4 + i} />
      ))}
    </>
  );
}

/** Måsar som cirklar över hamnen. */
function Bird({ cx, cz, r, y, phase, speed }: { cx: number; cz: number; r: number; y: number; phase: number; speed: number }) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime * speed + phase;
    g.position.set(cx + Math.cos(t) * r, y + Math.sin(t * 2.3) * 3, cz + Math.sin(t) * r);
    g.rotation.y = -t - Math.PI / 2;
    // vingslag
    const flap = Math.sin(state.clock.elapsedTime * 7 + phase) * 0.5;
    if (g.children[0]) g.children[0].rotation.z = flap;
    if (g.children[1]) g.children[1].rotation.z = -flap;
  });
  return (
    <group ref={ref}>
      <mesh position={[-0.9, 0, 0]}>
        <boxGeometry args={[1.8, 0.08, 0.35]} />
        <meshStandardMaterial color="#eceff1" />
      </mesh>
      <mesh position={[0.9, 0, 0]}>
        <boxGeometry args={[1.8, 0.08, 0.35]} />
        <meshStandardMaterial color="#eceff1" />
      </mesh>
    </group>
  );
}

export function Birds() {
  return (
    <>
      <Bird cx={20} cz={340} r={70} y={42} phase={0} speed={0.25} />
      <Bird cx={-60} cz={330} r={50} y={36} phase={2.1} speed={0.32} />
      <Bird cx={120} cz={350} r={60} y={48} phase={4.2} speed={0.21} />
    </>
  );
}

/** Vajande flagga på en stång. */
export function Flag({ x, y, z, color }: { x: number; y: number; z: number; color: string }) {
  const ref = useRef<Mesh>(null);
  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    m.rotation.y = Math.sin(state.clock.elapsedTime * 2.2) * 0.35;
  });
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 2.5, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 5, 6]} />
        <meshStandardMaterial color="#8a8f8a" />
      </mesh>
      <mesh ref={ref} position={[1.4, 4.2, 0]}>
        <planeGeometry args={[2.8, 1.6]} />
        <meshStandardMaterial color={color} side={2} />
      </mesh>
    </group>
  );
}

const CONCRETE = "#b9b4a8";
const CONTAINER_COLORS = ["#b6413a", "#3c6ca8", "#c9a13b", "#4d8b52", "#7a5c8f", "#3f3f3f"];

/** Hamnkran vid kajen – större än byggkranarna, långsamt svängande arm. */
function HarborCrane({ x, z, phase }: { x: number; z: number; phase: number }) {
  const jib = useRef<Group>(null);
  useFrame((state) => {
    if (jib.current)
      jib.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.15 + phase) * 0.9;
  });
  return (
    <group position={[x, 0, z]}>
      <mesh castShadow position={[0, 9, 0]}>
        <boxGeometry args={[2.2, 18, 2.2]} />
        <meshStandardMaterial color="#c05a2e" />
      </mesh>
      <group ref={jib} position={[0, 18, 0]}>
        <mesh castShadow position={[9, 0.6, 0]}>
          <boxGeometry args={[22, 1.2, 1.2]} />
          <meshStandardMaterial color="#c05a2e" />
        </mesh>
        <mesh position={[16, -4, 0]}>
          <boxGeometry args={[0.2, 8, 0.2]} />
          <meshStandardMaterial color="#555555" />
        </mesh>
        <mesh castShadow position={[16, -8.4, 0]}>
          <boxGeometry args={[2.4, 1, 1.2]} />
          <meshStandardMaterial color="#3f3f3f" />
        </mesh>
      </group>
    </group>
  );
}

/** Stapel med fraktcontainrar. */
function Containers({ x, z, seed }: { x: number; z: number; seed: number }) {
  const boxes = useMemo(() => {
    const out: { x: number; y: number; z: number; c: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const col = (seed * 7 + i * 13) % CONTAINER_COLORS.length;
      out.push({
        x: (i % 3) * 5.4 - 5.4,
        y: 1.1 + Math.floor(i / 3) * 2.2,
        z: ((i * 7) % 2) * 2.6 - 1.3,
        c: CONTAINER_COLORS[col],
      });
    }
    return out;
  }, [seed]);
  return (
    <group position={[x, 0, z]}>
      {boxes.map((b, i) => (
        <mesh key={i} castShadow position={[b.x, b.y, b.z]}>
          <boxGeometry args={[5, 2.2, 2.4]} />
          <meshStandardMaterial color={b.c} />
        </mesh>
      ))}
    </group>
  );
}

/** Lastfartyg som guppar stilla i vattnet. */
function Boat({ x, z, phase, color }: { x: number; z: number; phase: number; color: string }) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.position.y = Math.sin(t * 0.7 + phase) * 0.25;
    g.rotation.z = Math.sin(t * 0.5 + phase) * 0.02;
  });
  return (
    <group ref={ref} position={[x, 0, z]}>
      <mesh castShadow position={[0, 1.1, 0]}>
        <boxGeometry args={[16, 2.2, 5.5]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh castShadow position={[-4.5, 3.1, 0]}>
        <boxGeometry args={[4, 2.4, 4.4]} />
        <meshStandardMaterial color="#e8e4da" />
      </mesh>
      <mesh position={[-4.5, 4.9, 0]}>
        <cylinderGeometry args={[0.35, 0.45, 1.6, 8]} />
        <meshStandardMaterial color="#b6413a" />
      </mesh>
      <Smoke x={-4.5} y={5.8} z={0} />
      {/* Containrar på däck */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} castShadow position={[1.5 + i * 2.6, 2.6, 0]}>
          <boxGeometry args={[2.4, 1.4, 3.6]} />
          <meshStandardMaterial color={CONTAINER_COLORS[(i + Math.round(phase)) % 6]} />
        </mesh>
      ))}
    </group>
  );
}

/** Ägarens yacht "M/Y Imperium" – syns i hamnen när lyxen är köpt. */
function Yacht() {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.position.y = Math.sin(t * 0.6 + 1.3) * 0.22;
    g.rotation.z = Math.sin(t * 0.45) * 0.015;
  });
  const HULL = "#f4f7fa";
  const GLASS = "#25506e";
  const TEAK = "#b98a4e";
  return (
    <group ref={ref} position={[-60, 0, 340]}>
      {/* Skrov: mittsektion + avsmalnande för + akterspegel */}
      <mesh castShadow position={[0, 1.25, 0]}>
        <boxGeometry args={[15, 2, 4.4]} />
        <meshStandardMaterial color={HULL} roughness={0.2} metalness={0.15} />
      </mesh>
      {/* Avsmalnande bog (kon på sidan → spetsig för) */}
      <mesh castShadow position={[9.4, 1.25, 0]} rotation-z={-Math.PI / 2}>
        <cylinderGeometry args={[2.2, 0.2, 4.4, 4, 1, false, Math.PI / 4, Math.PI / 2]} />
        <meshStandardMaterial color={HULL} roughness={0.2} metalness={0.15} />
      </mesh>
      {/* Vattenlinje/indigorand */}
      <mesh position={[0, 0.5, 0]}><boxGeometry args={[24.4, 0.4, 4.5]} /><meshStandardMaterial color="#3a4bb8" /></mesh>
      {/* Guldrand längs skrovet */}
      <mesh position={[0, 1.9, 2.22]}><boxGeometry args={[22, 0.12, 0.05]} /><meshStandardMaterial color="#c9a13b" metalness={0.7} roughness={0.3} /></mesh>
      <mesh position={[0, 1.9, -2.22]}><boxGeometry args={[22, 0.12, 0.05]} /><meshStandardMaterial color="#c9a13b" metalness={0.7} roughness={0.3} /></mesh>
      {/* Teakdäck fram */}
      <mesh position={[6, 2.28, 0]}><boxGeometry args={[9, 0.12, 4.0]} /><meshStandardMaterial color={TEAK} roughness={0.7} /></mesh>
      {/* Badplattform i aktern */}
      <mesh position={[-8.2, 1.0, 0]}><boxGeometry args={[2, 0.2, 4.0]} /><meshStandardMaterial color={TEAK} roughness={0.7} /></mesh>

      {/* Överbyggnad – huvuddäck med panoramaglas */}
      <mesh castShadow position={[-1.5, 3.15, 0]}>
        <boxGeometry args={[12, 1.9, 3.9]} />
        <meshStandardMaterial color={HULL} roughness={0.25} metalness={0.2} />
      </mesh>
      {/* Fönsterband (tonat glas) */}
      <mesh position={[-1.5, 3.25, 1.98]}><boxGeometry args={[11, 1.0, 0.06]} /><meshStandardMaterial color={GLASS} metalness={0.5} roughness={0.1} /></mesh>
      <mesh position={[-1.5, 3.25, -1.98]}><boxGeometry args={[11, 1.0, 0.06]} /><meshStandardMaterial color={GLASS} metalness={0.5} roughness={0.1} /></mesh>
      {/* Vindruta fram (lutande) */}
      <mesh position={[4.3, 3.35, 0]} rotation-z={-0.5}><boxGeometry args={[1.4, 1.4, 3.7]} /><meshStandardMaterial color={GLASS} metalness={0.5} roughness={0.08} /></mesh>

      {/* Flybridge – övre däck */}
      <mesh castShadow position={[-2.6, 4.55, 0]}>
        <boxGeometry args={[7, 1.0, 3.2]} />
        <meshStandardMaterial color={HULL} roughness={0.25} />
      </mesh>
      {/* Solbädd på flybridge */}
      <mesh position={[-1.0, 5.12, 0]}><boxGeometry args={[2.4, 0.25, 2.6]} /><meshStandardMaterial color="#e7ded0" /></mesh>
      {/* Radar-/antennbåge i aktern */}
      <mesh position={[-5.4, 5.3, 1.1]} rotation-z={0.15}><cylinderGeometry args={[0.12, 0.12, 2.0, 8]} /><meshStandardMaterial color="#c3ccd4" metalness={0.6} /></mesh>
      <mesh position={[-5.4, 5.3, -1.1]} rotation-z={0.15}><cylinderGeometry args={[0.12, 0.12, 2.0, 8]} /><meshStandardMaterial color="#c3ccd4" metalness={0.6} /></mesh>
      <mesh position={[-5.5, 6.25, 0]}><boxGeometry args={[0.6, 0.2, 2.6]} /><meshStandardMaterial color="#dfe8f0" /></mesh>
      {/* Radarkupol */}
      <mesh position={[-5.5, 6.6, 0]}><sphereGeometry args={[0.4, 12, 8]} /><meshStandardMaterial color="#f4f7fa" /></mesh>

      {/* Räcken (relingar) längs fördäck */}
      {([2.0, -2.0] as const).map((rz) => (
        <mesh key={rz} position={[7, 2.7, rz]}><boxGeometry args={[8.5, 0.06, 0.06]} /><meshStandardMaterial color="#cfd6dd" metalness={0.6} /></mesh>
      ))}
      {([10.5, 8, 5.5, 3] as const).map((sx) => (
        [2.0, -2.0].map((rz) => (
          <mesh key={`${sx}-${rz}`} position={[sx, 2.5, rz]}><cylinderGeometry args={[0.04, 0.04, 0.5, 6]} /><meshStandardMaterial color="#cfd6dd" metalness={0.6} /></mesh>
        ))
      ))}

      {/* Ägarflagga i aktern */}
      <Flag x={-8.6} y={2.4} z={0} color="#3a4bb8" />
    </group>
  );
}

/** Portalkran (STS-kran) som straddlar lastkajen med utliggare mot vattnet. */
function GantryCrane({ x, z }: { x: number; z: number }) {
  const trolley = useRef<Group>(null);
  useFrame((state) => {
    if (trolley.current) trolley.current.position.x = 6 + Math.sin(state.clock.elapsedTime * 0.25) * 8;
  });
  const YEL = "#d0a636";
  return (
    <group position={[x, 0, z]}>
      {([[-17, -8], [17, -8], [-17, 8], [17, 8]] as const).map(([lx, lz], i) => (
        <mesh key={i} castShadow position={[lx, 12, lz]}>
          <boxGeometry args={[1.6, 24, 1.6]} />
          <meshStandardMaterial color={YEL} metalness={0.3} roughness={0.6} />
        </mesh>
      ))}
      {[-8, 8].map((lz) => (
        <mesh key={lz} castShadow position={[0, 24.6, lz]}>
          <boxGeometry args={[40, 1.5, 1.6]} />
          <meshStandardMaterial color={YEL} />
        </mesh>
      ))}
      {/* Utliggarbom mot vattnet */}
      <mesh castShadow position={[0, 26, 20]}>
        <boxGeometry args={[3, 1, 30]} />
        <meshStandardMaterial color="#b58a2e" />
      </mesh>
      <mesh castShadow position={[0, 26, -12]}>
        <boxGeometry args={[3, 1, 12]} />
        <meshStandardMaterial color="#b58a2e" />
      </mesh>
      {/* Trolley med hängande spridare */}
      <group ref={trolley}>
        <mesh position={[0, 25.4, 16]}>
          <boxGeometry args={[3.4, 1.4, 3.4]} />
          <meshStandardMaterial color="#37414a" />
        </mesh>
        <mesh position={[0, 19, 16]}>
          <boxGeometry args={[3.6, 0.7, 3.6]} />
          <meshStandardMaterial color="#2a2a2a" />
        </mesh>
      </group>
    </group>
  );
}

/** Containerfartyg vid kaj, lastat med staplade containrar. */
function CargoShip({ x, z, phase }: { x: number; z: number; phase: number }) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.position.y = Math.sin(t * 0.4 + phase) * 0.14;
    g.rotation.z = Math.sin(t * 0.3 + phase) * 0.008;
  });
  const stacks = useMemo(() => {
    const out: { px: number; py: number; pz: number; c: string }[] = [];
    for (let cx = 0; cx < 9; cx++)
      for (let cz = 0; cz < 3; cz++)
        for (let cy = 0; cy < 2 + ((cx * 7 + cz * 3) % 3); cy++)
          out.push({ px: -32 + cx * 8, py: 5 + cy * 2.3, pz: (cz - 1) * 4.6, c: CONTAINER_COLORS[(cx * 5 + cz * 3 + cy) % CONTAINER_COLORS.length] });
    return out;
  }, []);
  return (
    <group ref={ref} position={[x, 0, z]}>
      <mesh castShadow position={[0, 2.2, 0]}>
        <boxGeometry args={[92, 5, 17]} />
        <meshStandardMaterial color="#5a3f38" />
      </mesh>
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[92.2, 2, 17.2]} />
        <meshStandardMaterial color="#2f2a26" />
      </mesh>
      {/* Brygghus akterut */}
      <mesh castShadow position={[-38, 8, 0]}>
        <boxGeometry args={[11, 10, 15]} />
        <meshStandardMaterial color="#e8e4da" />
      </mesh>
      <mesh castShadow position={[-38, 14, 0]}>
        <boxGeometry args={[8, 2.5, 11]} />
        <meshStandardMaterial color="#b7c2cc" />
      </mesh>
      <mesh position={[-42, 17, 0]}>
        <cylinderGeometry args={[0.5, 0.6, 3.5, 6]} />
        <meshStandardMaterial color="#b6413a" />
      </mesh>
      <Smoke x={-42} y={19} z={0} />
      {stacks.map((s, i) => (
        <mesh key={i} castShadow position={[s.px, s.py, s.pz]}>
          <boxGeometry args={[6.4, 2.1, 4.2]} />
          <meshStandardMaterial color={s.c} />
        </mesh>
      ))}
    </group>
  );
}

/** Lastbil med släp på kajen. */
function Truck({ x, z, ry = 0, cab = "#b6413a" }: { x: number; z: number; ry?: number; cab?: string }) {
  return (
    <group position={[x, 0, z]} rotation-y={ry}>
      <mesh castShadow position={[0, 1.6, -2]}>
        <boxGeometry args={[3.6, 2.6, 7]} />
        <meshStandardMaterial color="#c9c3b6" />
      </mesh>
      <mesh castShadow position={[0, 1.5, 3]}>
        <boxGeometry args={[3.4, 2.6, 3]} />
        <meshStandardMaterial color={cab} />
      </mesh>
      {([[-1.6, -4], [1.6, -4], [-1.6, 3], [1.6, 3]] as const).map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.6, wz]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.6, 0.6, 0.5, 8]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      ))}
    </group>
  );
}

/** Cylindrisk lagringstank (industri/hamn). */
function Tank({ x, z, r = 4, h = 9, color = "#b7bcc0" }: { x: number; z: number; r?: number; h?: number; color?: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh castShadow position={[0, h / 2, 0]}>
        <cylinderGeometry args={[r, r, h, 16]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, h + 0.2, 0]}>
        <sphereGeometry args={[r, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Kajen: kommersiell hamn framför hamnkvarteret + rekreationsfartyg.
 *  All hamnverksamhet ligger söder om hamnzonen (z ≥ 298) och i vattnet. */
export function Harbor() {
  const hasYacht = useGameStore((s) => (s.state.ownerLuxuries ?? []).includes("yacht"));
  return (
    <>
      {/* Kajkant i betong längs vattnet, söder om hamnkvarteren */}
      <mesh castShadow receiveShadow position={[20, 0.5, 312]}>
        <boxGeometry args={[640, 1, 16]} />
        <meshStandardMaterial color={CONCRETE} />
      </mesh>
      {hasYacht && <Yacht />}

      {/* ── Kommersiell lasthamn (central–östra kajen) ──────────────────── */}
      {/* Lastkaj som skjuter ut i vattnet */}
      <mesh castShadow receiveShadow position={[120, 0.6, 330]}>
        <boxGeometry args={[150, 1.2, 44] } />
        <meshStandardMaterial color="#9a968c" roughness={0.95} />
      </mesh>
      <GantryCrane x={80} z={330} />
      <GantryCrane x={165} z={330} />
      <CargoShip x={120} z={366} phase={0.6} />
      {/* Containergård i rader på kajen */}
      {([70, 100, 130, 160] as const).map((cx, i) => (
        <Containers key={cx} x={cx} z={320 + (i % 2) * 8} seed={cx} />
      ))}
      {/* Hamnterminal / magasin på kajplan (söder om hamnzonen) */}
      <mesh castShadow receiveShadow position={[-40, 5.5, 305]}>
        <boxGeometry args={[96, 11, 13]} />
        <meshStandardMaterial color="#8f9aa1" metalness={0.2} roughness={0.7} />
      </mesh>
      <mesh position={[-40, 11.4, 305]}>
        <boxGeometry args={[97, 0.6, 14]} />
        <meshStandardMaterial color="#5c6469" />
      </mesh>
      {/* Bränsletankar vid terminalen */}
      <Tank x={-100} z={306} r={4} h={9} />
      <Tank x={-90} z={306} r={4} h={9} />
      {/* Lastbilar på kajen */}
      <Truck x={0} z={318} ry={Math.PI / 2} cab="#b6413a" />
      <Truck x={200} z={318} ry={-Math.PI / 2} cab="#3c6ca8" />

      {/* Ursprungliga kranar/containrar/fartyg (östra + västra kajen) */}
      <HarborCrane x={-90} z={312} phase={2.2} />
      <HarborCrane x={250} z={312} phase={4.1} />
      <Containers x={-170} z={312} seed={4} />
      <Boat x={-40} z={356} phase={0.4} color="#38556a" />
      <Boat x={235} z={366} phase={2.8} color="#6a4a38" />
    </>
  );
}

/** Stadshusets klocktorn. */
export function LmStadshus({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {/* Torg framför stadshuset */}
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.05, 4]}>
        <planeGeometry args={[34, 28]} />
        <meshStandardMaterial color="#bcb4a3" roughness={0.95} />
      </mesh>
      {/* Huvudbyggnad (sandsten, tre våningar) med taklist och ändpaviljonger */}
      <mesh castShadow receiveShadow position={[0, 5.5, -2]}>
        <boxGeometry args={[30, 11, 15]} />
        <meshStandardMaterial color="#cbbd9a" />
      </mesh>
      <mesh position={[0, 11.3, -2]}>
        <boxGeometry args={[31, 0.9, 16]} />
        <meshStandardMaterial color="#b7a988" />
      </mesh>
      {[-13, 13].map((px) => (
        <mesh key={px} castShadow position={[px, 6.5, -1]}>
          <boxGeometry args={[6, 13, 17]} />
          <meshStandardMaterial color="#c4b48f" />
        </mesh>
      ))}
      {/* Fönsterrader – huvudfasad och ändpaviljonger */}
      {[-10, -5, 5, 10].flatMap((px) =>
        [3, 7.5].map((py) => (
          <mesh key={`${px}-${py}`} position={[px, py, 5.6]}>
            <boxGeometry args={[2, 3, 0.3]} />
            <meshStandardMaterial color="#5a6b74" />
          </mesh>
        )),
      )}
      {[-13, 13].flatMap((px) =>
        [3.4, 8.4].map((py) => (
          <mesh key={`p${px}-${py}`} position={[px, py, 7.65]}>
            <boxGeometry args={[2.2, 3, 0.3]} />
            <meshStandardMaterial color="#5a6b74" />
          </mesh>
        )),
      )}
      {/* Entrédörr bakom kolonnerna */}
      <mesh position={[0, 2.3, 5.62]}>
        <boxGeometry args={[3.2, 4.6, 0.2]} />
        <meshStandardMaterial color="#4a4238" roughness={0.85} />
      </mesh>
      {/* Entré: trappa + portik med pelare + entablement */}
      <mesh receiveShadow position={[0, 0.4, 7.4]}>
        <boxGeometry args={[13, 0.8, 3]} />
        <meshStandardMaterial color={CONCRETE} />
      </mesh>
      <mesh receiveShadow position={[0, 0.9, 6.4]}>
        <boxGeometry args={[11, 0.8, 2]} />
        <meshStandardMaterial color={CONCRETE} />
      </mesh>
      {[-4, -1.3, 1.3, 4].map((px) => (
        <mesh key={px} castShadow position={[px, 4.4, 6.6]}>
          <cylinderGeometry args={[0.6, 0.6, 7, 10]} />
          <meshStandardMaterial color="#e0d6bf" />
        </mesh>
      ))}
      <mesh castShadow position={[0, 8.4, 6.6]}>
        <boxGeometry args={[11, 1.6, 2.6]} />
        <meshStandardMaterial color="#d8ccae" />
      </mesh>
      {/* Klocktorn reser sig ur fasaden – med ljudgluggar under uret */}
      <mesh castShadow position={[0, 19, 2]}>
        <boxGeometry args={[7, 22, 7]} />
        <meshStandardMaterial color="#c9b896" />
      </mesh>
      {[-1.6, 1.6].map((gx) => (
        <mesh key={gx} position={[gx, 16, 5.6]}>
          <boxGeometry args={[1.1, 2.4, 0.2]} />
          <meshStandardMaterial color="#4f4a3e" />
        </mesh>
      ))}
      <mesh position={[0, 25, 5.6]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[1.7, 1.7, 0.3, 16]} />
        <meshStandardMaterial color="#f3ead3" emissive="#3a3a30" emissiveIntensity={0.3} />
      </mesh>
      <mesh castShadow position={[0, 31.4, 2]} rotation-y={Math.PI / 4}>
        <coneGeometry args={[5.6, 5, 4]} />
        <meshStandardMaterial color="#4a6a55" />
      </mesh>
      <Flag x={0} y={34} z={2} color="#4f63e4" />
    </group>
  );
}

/** Vattentorn på ben. */
export function LmVattentorn({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {/* Grusad inhägnad kringutrustning på landsbygdssidan */}
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.05, 2]}>
        <planeGeometry args={[42, 40]} />
        <meshStandardMaterial color="#a89f8c" roughness={1} />
      </mesh>
      {([[0, -18, 42, 0.25], [0, 22, 42, 0.25], [-20, 2, 0.25, 40], [20, 2, 0.25, 40]] as const).map(
        ([fx, fz, fw, fd], i) => (
          <mesh key={i} position={[fx, 0.8, fz]}>
            <boxGeometry args={[fw, 1.6, fd]} />
            <meshStandardMaterial color="#8f959a" metalness={0.3} roughness={0.7} transparent opacity={0.5} />
          </mesh>
        ),
      )}
      {/* Litet pumphus med dörr */}
      <mesh castShadow position={[-13, 1.6, 13]}>
        <boxGeometry args={[6, 3.2, 5]} />
        <meshStandardMaterial color="#b7ac96" />
      </mesh>
      <mesh position={[-13, 1.0, 15.56]}>
        <boxGeometry args={[1.2, 2.0, 0.12]} />
        <meshStandardMaterial color="#4a4238" roughness={0.85} />
      </mesh>
      <mesh castShadow position={[-13, 3.4, 13]} rotation-y={Math.PI / 4}>
        <coneGeometry args={[4.4, 1.6, 4]} />
        <meshStandardMaterial color="#7d6f58" />
      </mesh>
      <Tree x={15} z={-13} s={0.8} />
      <Tree x={-16} z={-9} s={0.7} />
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          castShadow
          position={[Math.cos((i * Math.PI) / 2) * 3.2, 6, Math.sin((i * Math.PI) / 2) * 3.2]}
        >
          <cylinderGeometry args={[0.35, 0.45, 12, 6]} />
          <meshStandardMaterial color="#8a8f8a" />
        </mesh>
      ))}
      {/* Stigarrör i mitten upp till tanken */}
      <mesh castShadow position={[0, 6, 0]}>
        <cylinderGeometry args={[0.45, 0.55, 12.5, 8]} />
        <meshStandardMaterial color="#7d8a7a" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 14, 0]}>
        <cylinderGeometry args={[5.5, 4.5, 5, 12]} />
        <meshStandardMaterial color="#aab4ac" />
      </mesh>
      <mesh castShadow position={[0, 17.6, 0]}>
        <coneGeometry args={[5.6, 2.4, 12]} />
        <meshStandardMaterial color="#7d8a7a" />
      </mesh>
    </group>
  );
}

/** Enskild fabriksskorsten med rök. */
export function LmSkorsten({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {/* Grusad industriplan runt skorstenen */}
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.05, 4]}>
        <planeGeometry args={[26, 26]} />
        <meshStandardMaterial color="#8f887c" roughness={1} />
      </mesh>
      {/* Betongfundament */}
      <mesh castShadow receiveShadow position={[0, 0.6, 0]}>
        <boxGeometry args={[8, 1.2, 8]} />
        <meshStandardMaterial color={CONCRETE} />
      </mesh>
      {/* Lagringstank + rörgata bredvid */}
      <Tank x={8} z={7} r={3} h={7} color="#b0a48f" />
      <mesh castShadow position={[3.5, 1.2, 7]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.4, 0.4, 6, 8]} />
        <meshStandardMaterial color="#7d7468" metalness={0.3} />
      </mesh>
      <mesh castShadow position={[0, 9, 0]}>
        <cylinderGeometry args={[1.4, 1.9, 18, 10]} />
        <meshStandardMaterial color="#9c5a4a" />
      </mesh>
      <mesh position={[0, 17.6, 0]}>
        <cylinderGeometry args={[1.45, 1.45, 1.2, 10]} />
        <meshStandardMaterial color="#e8e4da" />
      </mesh>
      <Smoke x={0} y={18.5} z={0} />
    </group>
  );
}

/** Litet träd (stam + krona). */
function Tree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh castShadow position={[0, 2, 0]}>
        <cylinderGeometry args={[0.5, 0.7, 4, 6]} />
        <meshStandardMaterial color="#6b4a2f" />
      </mesh>
      <mesh castShadow position={[0, 5.4, 0]}>
        <sphereGeometry args={[3, 8, 7]} />
        <meshStandardMaterial color="#3f7a44" flatShading />
      </mesh>
    </group>
  );
}

/** Stadspark: gräsyta, korsande grusgångar, fontän och träd. */
export function LmStadspark({ x, z }: { x: number; z: number }) {
  // Trädplaceringar avstämda mot damm (r 8,4 vid −20,14), lusthus (r 5 vid
  // 20,−13), rabatter (r 3) och gångarna – inga stammar i vatten eller hus.
  const trees = useMemo(
    () =>
      [[-24, -18], [-12, 6], [12, -9], [26, 16], [-28, -8], [13, 24], [22, -22], [-6, -20]].map(
        ([tx, tz], i) => ({ tx, tz, s: 0.8 + ((i * 7) % 5) * 0.12 }),
      ),
    [],
  );
  return (
    <group position={[x, 0, z]}>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.12, 0]}>
        <planeGeometry args={[66, 56]} />
        <meshStandardMaterial color="#3c7a41" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.16, 0]}>
        <planeGeometry args={[66, 6]} />
        <meshStandardMaterial color="#c8bfa6" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.16, 0]}>
        <planeGeometry args={[6, 56]} />
        <meshStandardMaterial color="#c8bfa6" />
      </mesh>
      {/* Fontän: två skålar med vatten och en pelare. Vattenytan ligger
          strax ÖVER betongens topplock (cylindrarna är solida – låg yta
          hamnade inuti betongen och syntes aldrig); den smalare radien
          lämnar en synlig kantring och undviker z-fight. */}
      <mesh castShadow position={[0, 0.6, 0]}>
        <cylinderGeometry args={[5, 5.4, 1.2, 20]} />
        <meshStandardMaterial color={CONCRETE} />
      </mesh>
      <mesh position={[0, 0.75, 0]}>
        <cylinderGeometry args={[4.4, 4.4, 0.96, 20]} />
        <meshStandardMaterial color="#3f7fb8" roughness={0.3} metalness={0.1} />
      </mesh>
      <mesh position={[0, 1.9, 0]}>
        <cylinderGeometry args={[0.5, 0.7, 2, 8]} />
        <meshStandardMaterial color={CONCRETE} />
      </mesh>
      <mesh position={[0, 2.95, 0]}>
        <cylinderGeometry args={[1.6, 1.6, 0.25, 16]} />
        <meshStandardMaterial color="#3f7fb8" roughness={0.3} metalness={0.1} />
      </mesh>
      {/* Damm med stenkant – vattenytan över kantens topplock (se fontänen) */}
      <mesh castShadow position={[-20, 0.35, 14]}>
        <cylinderGeometry args={[8.4, 8.4, 0.7, 24]} />
        <meshStandardMaterial color={CONCRETE} />
      </mesh>
      <mesh position={[-20, 0.4, 14]}>
        <cylinderGeometry args={[7.6, 7.6, 0.66, 24]} />
        <meshStandardMaterial color="#3f7fb8" roughness={0.3} metalness={0.1} />
      </mesh>
      {/* Lusthus (paviljong) */}
      <group position={[20, 0, -13]}>
        <mesh receiveShadow position={[0, 0.3, 0]}>
          <cylinderGeometry args={[5, 5, 0.6, 8]} />
          <meshStandardMaterial color="#c8bfa6" />
        </mesh>
        {Array.from({ length: 6 }, (_, i) => (i / 6) * Math.PI * 2).map((a, i) => (
          <mesh key={i} castShadow position={[Math.cos(a) * 4.2, 3, Math.sin(a) * 4.2]}>
            <cylinderGeometry args={[0.22, 0.22, 5.4, 6]} />
            <meshStandardMaterial color="#efe8d6" />
          </mesh>
        ))}
        <mesh castShadow position={[0, 6.4, 0]}>
          <coneGeometry args={[6, 2.6, 8]} />
          <meshStandardMaterial color="#7a5a48" />
        </mesh>
      </group>
      {/* Blomsterrabatter (fria från trädstammar) */}
      {([[-24, -8, "#c94f7a"], [26, 9, "#d7a63a"], [7, 21, "#7a5c8f"]] as const).map(([fx, fz, fc], i) => (
        <mesh key={`fb-${i}`} receiveShadow rotation-x={-Math.PI / 2} position={[fx, 0.15, fz]}>
          <circleGeometry args={[3, 16]} />
          <meshStandardMaterial color={fc} />
        </mesh>
      ))}
      {/* Bänkar BREDVID gångarna (inte mitt på dem), vända mot fontänen */}
      <Bench x={4.6} z={9} ry={Math.PI} />
      <Bench x={-4.6} z={-9} ry={0} />
      <Bench x={9} z={-4.6} ry={-Math.PI / 2} />
      <Bench x={-9} z={4.6} ry={Math.PI / 2} />
      {/* Lyktor – ute ur dammen och av lusthusets platta */}
      {([[16, 16], [-8, 18], [14, -18], [-16, -16]] as const).map(([lx, lz], i) => (
        <PierLamp key={`pl-${i}`} x={lx} z={lz} />
      ))}
      <group position={[28, 0, -23]}>
        <mesh castShadow position={[0, 1, 0]}>
          <boxGeometry args={[2, 2, 2]} />
          <meshStandardMaterial color={CONCRETE} />
        </mesh>
        <mesh castShadow position={[0, 3, 0]}>
          <cylinderGeometry args={[0.5, 0.6, 2.4, 8]} />
          <meshStandardMaterial color="#7d7468" metalness={0.4} />
        </mesh>
        <mesh castShadow position={[0, 4.6, 0]}>
          <sphereGeometry args={[0.55, 10, 8]} />
          <meshStandardMaterial color="#7d7468" metalness={0.4} />
        </mesh>
      </group>
      {trees.map((t, i) => (
        <Tree key={i} x={t.tx} z={t.tz} s={t.s} />
      ))}
    </group>
  );
}

/** Kyrka med långhus, sadeltak och torn med spira. */
export function LmKyrka({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {/* Kyrkogård: gräs, grusgång, låg stenmur, gravstenar och träd */}
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.04, -1]}>
        <planeGeometry args={[36, 38]} />
        <meshStandardMaterial color="#4f7d4a" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.07, 12.4]}>
        <planeGeometry args={[3.5, 10.8]} />
        <meshStandardMaterial color="#c8bfa6" />
      </mesh>
      {([[0, -19, 36, 0.5], [-17, 0, 0.5, 38], [17, 0, 0.5, 38], [-11, 18, 13, 0.5], [11, 18, 13, 0.5]] as const).map(
        ([wx, wz, ww, wd], i) => (
          <mesh key={`w-${i}`} castShadow position={[wx, 0.6, wz]}>
            <boxGeometry args={[ww, 1.2, wd]} />
            <meshStandardMaterial color="#9a9384" roughness={0.9} />
          </mesh>
        ),
      )}
      {([[-12, -13], [12, -13], [-13, 3], [13, 4], [-13, 14], [13, 14], [-6, -15], [6, -15]] as const).map(
        ([gx, gz], i) => (
          <mesh key={`hs-${i}`} castShadow position={[gx, 0.7, gz]} rotation-y={((i % 3) - 1) * 0.3}>
            <boxGeometry args={[0.9, 1.4, 0.25]} />
            <meshStandardMaterial color="#b7b2a6" />
          </mesh>
        ),
      )}
      <Tree x={-14} z={-16} s={0.9} />
      <Tree x={14} z={-16} s={0.9} />
      <Tree x={-15} z={11} s={0.8} />
      {/* Sockel + långhus */}
      <mesh receiveShadow position={[0, 0.4, -2]}>
        <boxGeometry args={[12.6, 0.8, 20.6]} />
        <meshStandardMaterial color="#c9c2b2" roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 5, -2]}>
        <boxGeometry args={[12, 10, 20]} />
        <meshStandardMaterial color="#e6e0d4" />
      </mesh>
      {/* Höga spetsfönster längs långhusets båda sidor – varmt kyrkglas */}
      {[-8, -2, 4].flatMap((wz) =>
        [-1, 1].map((s) => (
          <group key={`${wz}-${s}`} position={[s * 6.05, 5.8, wz]}>
            <mesh>
              <boxGeometry args={[0.18, 4.6, 1.5]} />
              <meshStandardMaterial color="#4a4a44" />
            </mesh>
            <mesh position={[s * 0.08, 0, 0]}>
              <boxGeometry args={[0.14, 4.2, 1.1]} />
              <meshStandardMaterial color="#7f95a8" roughness={0.4} emissive="#aa8f5c" emissiveIntensity={0.15} />
            </mesh>
          </group>
        )),
      )}
      {/* Valmat tak med taksprång – skalan i yttergruppen appliceras efter
          konens 45°-rotation (samma knep som HipRoof i districtBuildings).
          De gamla två lutande skivorna lät vägghörnen sticka igenom taket
          och gapade i nocken. */}
      <group position={[0, 11.4, -2]} scale={[(12 * 1.1) / 20, 1, (20 * 1.1) / 20]}>
        <mesh castShadow rotation-y={Math.PI / 4}>
          <coneGeometry args={[20 * 0.72, 3.8, 4]} />
          <meshStandardMaterial color="#7a4a38" />
        </mesh>
      </group>
      {/* Torn längst fram med portal, rosettfönster och ljudgluggar */}
      <mesh castShadow position={[0, 11, 10]}>
        <boxGeometry args={[7, 22, 7]} />
        <meshStandardMaterial color="#ded7c8" />
      </mesh>
      {/* Huvudportal med stenomfattning och trappa */}
      <mesh position={[0, 2.3, 13.52]}>
        <boxGeometry args={[3.2, 4.6, 0.14]} />
        <meshStandardMaterial color="#c9c2b2" />
      </mesh>
      <mesh position={[0, 2.0, 13.6]}>
        <boxGeometry args={[2.4, 4.0, 0.14]} />
        <meshStandardMaterial color="#5c4633" roughness={0.85} />
      </mesh>
      <mesh receiveShadow position={[0, 0.2, 14.4]}>
        <boxGeometry args={[3.8, 0.4, 1.6]} />
        <meshStandardMaterial color="#c9c2b2" roughness={0.9} />
      </mesh>
      {/* Rosettfönster med guldring */}
      <mesh position={[0, 8.6, 13.55]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[1.5, 1.5, 0.12, 14]} />
        <meshStandardMaterial color="#c9a13b" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 8.6, 13.62]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[1.15, 1.15, 0.12, 14]} />
        <meshStandardMaterial color="#7f95a8" roughness={0.4} emissive="#aa8f5c" emissiveIntensity={0.18} />
      </mesh>
      {/* Ljudgluggar i klockvåningen */}
      {[-1.4, 1.4].map((gx) => (
        <mesh key={gx} position={[gx, 18.6, 13.55]}>
          <boxGeometry args={[1.0, 2.2, 0.12]} />
          <meshStandardMaterial color="#3f4448" />
        </mesh>
      ))}
      <mesh castShadow position={[0, 25, 10]} rotation-y={Math.PI / 4}>
        <coneGeometry args={[4.6, 9, 4]} />
        <meshStandardMaterial color="#5a6b62" />
      </mesh>
      {/* Kors */}
      <mesh position={[0, 31, 10]}>
        <boxGeometry args={[0.4, 3, 0.4]} />
        <meshStandardMaterial color="#c9a13b" />
      </mesh>
      <mesh position={[0, 31.5, 10]}>
        <boxGeometry args={[1.6, 0.4, 0.4]} />
        <meshStandardMaterial color="#c9a13b" />
      </mesh>
    </group>
  );
}

/** Idrottsarena: elliptisk läktarring, grön plan och strålkastarmaster. */
export function LmArena({ x, z }: { x: number; z: number }) {
  const N = 28;
  const stands = useMemo(
    () =>
      Array.from({ length: N }, (_, i) => {
        const a = (i / N) * Math.PI * 2;
        return { px: Math.cos(a) * 22, pz: Math.sin(a) * 15, a, alt: i % 2 === 0 };
      }),
    [],
  );
  // Två rader om nio bilar – ryms med marginal inne på p-rutan (den gamla
  // tredje raden hamnade utanför både rutan och torget).
  const cars = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        cx: -20 + (i % 9) * 5,
        cz: 25.5 + Math.floor(i / 9) * 6.5,
        c: GONDOLA_COLORS[(i * 3) % GONDOLA_COLORS.length],
      })),
    [],
  );
  return (
    <group position={[x, 0, z]}>
      {/* Entrétorg (stenlagt) runt arenan */}
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.06, 2]}>
        <planeGeometry args={[78, 70]} />
        <meshStandardMaterial color="#bcb4a3" roughness={0.95} />
      </mesh>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.15, 0]}>
        <planeGeometry args={[34, 22]} />
        <meshStandardMaterial color="#3f7a44" />
      </mesh>
      {stands.map((s, i) => (
        <mesh key={i} castShadow position={[s.px, 3, s.pz]} rotation-y={-s.a}>
          <boxGeometry args={[3.2, 6, 5]} />
          <meshStandardMaterial color={s.alt ? "#c9c3b6" : "#b3ada0"} />
        </mesh>
      ))}
      {([[-20, -13], [20, -13], [-20, 13], [20, 13]] as const).map(([px, pz], i) => (
        <group key={i} position={[px, 0, pz]}>
          <mesh castShadow position={[0, 9, 0]}>
            <cylinderGeometry args={[0.4, 0.5, 18, 6]} />
            <meshStandardMaterial color="#6b7075" />
          </mesh>
          <mesh position={[0, 18, 0]}>
            <boxGeometry args={[4, 1.4, 1]} />
            <meshStandardMaterial color="#fff6d8" emissive="#ffe9a8" emissiveIntensity={0.6} />
          </mesh>
        </group>
      ))}
      {/* Parkering med bilar (söder om arenan) */}
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.1, 29]}>
        <planeGeometry args={[50, 15]} />
        <meshStandardMaterial color="#5b5f63" roughness={1} />
      </mesh>
      {cars.map((c, i) => (
        <mesh key={`car-${i}`} castShadow position={[c.cx, 0.7, c.cz]}>
          <boxGeometry args={[3.2, 1.3, 5]} />
          <meshStandardMaterial color={c.c} />
        </mesh>
      ))}
      {/* Biljettkiosker vid entrén */}
      {([-8, 8] as const).map((bx) => (
        <mesh key={`b-${bx}`} castShadow position={[bx, 1.4, -26]}>
          <boxGeometry args={[4, 2.8, 3]} />
          <meshStandardMaterial color="#e7ddc7" />
        </mesh>
      ))}
      {/* Flaggor + träd runt torget */}
      {([[-30, -20], [30, -20], [-34, 16], [34, 16]] as const).map(([fx, fz], i) => (
        <Flag key={`fl-${i}`} x={fx} y={0} z={fz} color={GONDOLA_COLORS[i % GONDOLA_COLORS.length]} />
      ))}
      <Tree x={-32} z={-4} s={0.9} />
      <Tree x={32} z={-4} s={0.9} />
    </group>
  );
}

const GONDOLA_COLORS = ["#c94f4f", "#3c6ca8", "#c9a13b", "#4d8b52", "#7a5c8f", "#d98536"];

/** Liten förtöjd segeljolle som guppar stilla vid bryggan. */
function Dinghy({ x, z, phase, color }: { x: number; z: number; phase: number; color: string }) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.position.y = 0.3 + Math.sin(t * 0.9 + phase) * 0.12;
    g.rotation.z = Math.sin(t * 0.7 + phase) * 0.05;
  });
  return (
    <group ref={ref} position={[x, 0.3, z]}>
      <mesh castShadow position={[0, 0.35, 0]}>
        <boxGeometry args={[2.4, 0.7, 5]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[1.5, 0.3, 3.4]} />
        <meshStandardMaterial color="#e8e0d0" />
      </mesh>
      <mesh position={[0, 1.6, -0.6]}>
        <cylinderGeometry args={[0.06, 0.06, 3, 6]} />
        <meshStandardMaterial color="#cfcabd" />
      </mesh>
    </group>
  );
}

/** Gatlykta för promenad och pir. */
function PierLamp({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh castShadow position={[0, 2.4, 0]}>
        <cylinderGeometry args={[0.12, 0.17, 4.8, 6]} />
        <meshStandardMaterial color="#37414a" metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh position={[0, 4.9, 0]}>
        <sphereGeometry args={[0.3, 8, 6]} />
        <meshStandardMaterial color="#ffe9c0" emissive="#ffca6e" emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

/** Parkbänk som vetter mot vattnet. */
function Bench({ x, z, ry = 0 }: { x: number; z: number; ry?: number }) {
  return (
    <group position={[x, 0, z]} rotation-y={ry}>
      <mesh castShadow position={[0, 0.5, 0]}>
        <boxGeometry args={[3, 0.18, 0.9]} />
        <meshStandardMaterial color="#7a5a3c" />
      </mesh>
      <mesh position={[0, 0.95, -0.38]}>
        <boxGeometry args={[3, 0.8, 0.14]} />
        <meshStandardMaterial color="#7a5a3c" />
      </mesh>
      {[-1.3, 1.3].map((sx) => (
        <mesh key={sx} position={[sx, 0.25, 0]}>
          <boxGeometry args={[0.16, 0.5, 0.85]} />
          <meshStandardMaterial color="#454b45" />
        </mesh>
      ))}
    </group>
  );
}

/** Förtöjd segelbåt som guppar, med mast och segel. */
function SailBoat({ x, z, phase, hull, sail }: { x: number; z: number; phase: number; hull: string; sail: string }) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.position.y = 0.35 + Math.sin(t * 0.75 + phase) * 0.14;
    g.rotation.z = Math.sin(t * 0.6 + phase) * 0.05;
  });
  return (
    <group ref={ref} position={[x, 0.35, z]}>
      <mesh castShadow position={[0, 0.45, 0]}>
        <boxGeometry args={[2.7, 0.85, 6.4]} />
        <meshStandardMaterial color={hull} />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <boxGeometry args={[1.7, 0.3, 4.4]} />
        <meshStandardMaterial color="#efe8d6" />
      </mesh>
      <mesh castShadow position={[0, 3.6, -0.2]}>
        <cylinderGeometry args={[0.08, 0.1, 6.4, 6]} />
        <meshStandardMaterial color="#d8d2c4" />
      </mesh>
      {/* Storsegel + fock */}
      <mesh castShadow position={[0, 3.1, 0.9]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[3.6, 4.4]} />
        <meshStandardMaterial color={sail} side={2} roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.7, -1.7]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[2.2, 3.2]} />
        <meshStandardMaterial color="#f4f1e8" side={2} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Pariserhjul + strandpromenad, pir och småbåtshamn – ett trevligt kajområde. */
export function LmPariserhjul({ x, z }: { x: number; z: number }) {
  const wheel = useRef<Group>(null);
  useFrame((state) => {
    if (wheel.current) wheel.current.rotation.z = state.clock.elapsedTime * 0.22;
  });
  const R = 14;
  const N = 8;
  const spokes = useMemo(
    () => Array.from({ length: N }, (_, i) => (i / N) * Math.PI * 2),
    [],
  );
  return (
    <group position={[x, 0, z]}>
      {/* Stödben (A-ram) på båda sidor om hjulet */}
      {[-3.5, 3.5].map((zz, i) => (
        <group key={i} position={[0, 0, zz]}>
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow position={[s * 5, 8, 0]} rotation-z={s * 0.55}>
              <boxGeometry args={[0.8, 20, 0.8]} />
              <meshStandardMaterial color="#9aa4ad" metalness={0.4} roughness={0.5} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Nav + roterande hjul (fälg i XY-planet, axel längs Z) */}
      <group ref={wheel} position={[0, R + 2, 0]}>
        <mesh rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[1, 1, 8, 12]} />
          <meshStandardMaterial color="#8a94a0" metalness={0.5} />
        </mesh>
        <mesh>
          <torusGeometry args={[R, 0.5, 8, 28]} />
          <meshStandardMaterial color="#c94f4f" metalness={0.3} roughness={0.5} />
        </mesh>
        {spokes.map((a, i) => {
          const gx = Math.cos(a) * R;
          const gy = Math.sin(a) * R;
          return (
            <group key={i}>
              <mesh position={[gx / 2, gy / 2, 0]} rotation-z={a}>
                <boxGeometry args={[R, 0.2, 0.2]} />
                <meshStandardMaterial color="#d9d4c8" />
              </mesh>
              <mesh castShadow position={[gx, gy, 0]}>
                <boxGeometry args={[2.4, 2.2, 2.6]} />
                <meshStandardMaterial color={GONDOLA_COLORS[i % GONDOLA_COLORS.length]} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* ── Strandpromenad, pir och småbåtshamn ─────────────────────────
         Ankaret ligger på land (z285); vattnet börjar ~35 enheter söderut
         (världs-z 320). Torg + promenad ligger på land, piren sträcker sig
         UT i vattnet med bryggfingrar och förtöjda båtar. */}

      {/* Stenlagt torg runt hjulet, kopplar till promenaden */}
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.06, 15]}>
        <planeGeometry args={[52, 34]} />
        <meshStandardMaterial color="#c3bcab" roughness={0.95} />
      </mesh>

      {/* Trädäckspromenad längs strandkanten (på land) med räcke mot vattnet */}
      <mesh castShadow receiveShadow position={[0, 0.45, 26]}>
        <boxGeometry args={[88, 0.5, 12]} />
        <meshStandardMaterial color="#9a7b55" roughness={0.85} />
      </mesh>
      {Array.from({ length: 18 }, (_, i) => -42 + i * 5).map((px) => (
        <mesh key={`rail-${px}`} castShadow position={[px, 1.1, 31.6]}>
          <cylinderGeometry args={[0.1, 0.1, 1.3, 6]} />
          <meshStandardMaterial color="#6f5636" />
        </mesh>
      ))}
      <mesh position={[0, 1.7, 31.6]}>
        <boxGeometry args={[88, 0.14, 0.14]} />
        <meshStandardMaterial color="#6f5636" />
      </mesh>

      {/* Huvudpir ut i vattnet + två bryggfingrar */}
      <mesh castShadow receiveShadow position={[0, 1.05, 58]}>
        <boxGeometry args={[8, 0.4, 56]} />
        <meshStandardMaterial color="#8a6b4a" roughness={0.85} />
      </mesh>
      {[46, 66].map((fz) => (
        <mesh key={`fing-${fz}`} castShadow receiveShadow position={[0, 0.95, fz]}>
          <boxGeometry args={[30, 0.35, 4.6]} />
          <meshStandardMaterial color="#8a6b4a" roughness={0.85} />
        </mesh>
      ))}
      {/* Pålar ner i vattnet under pir och fingrar */}
      {[
        ...[36, 48, 60, 72, 82].flatMap((pz) => [-3.4, 3.4].map((px) => [px, pz] as const)),
        ...[46, 66].flatMap((fz) => [-13, -6, 6, 13].map((px) => [px, fz] as const)),
      ].map(([px, pz], i) => (
        <mesh key={`pile-${i}`} position={[px, 0.2, pz]}>
          <cylinderGeometry args={[0.32, 0.32, 6, 6]} />
          <meshStandardMaterial color="#4f3d2d" />
        </mesh>
      ))}
      {/* Förtöjningspollare */}
      {([[4.2, 40], [-4.2, 54], [4.2, 72], [-16, 46], [16, 66]] as const).map(([px, pz], i) => (
        <mesh key={`poll-${i}`} castShadow position={[px, 1.5, pz]}>
          <cylinderGeometry args={[0.35, 0.45, 1.1, 8]} />
          <meshStandardMaterial color="#3a3a3a" />
        </mesh>
      ))}

      {/* Förtöjda båtar i vattnet längs fingrarna */}
      <SailBoat x={-11} z={44} phase={0.3} hull="#38556a" sail="#f4f1e8" />
      <SailBoat x={11} z={48} phase={2.4} hull="#7a3b3b" sail="#efe6d2" />
      <SailBoat x={11} z={70} phase={4.1} hull="#2f5f52" sail="#f4f1e8" />
      <Dinghy x={-11} z={56} phase={1.2} color="#6a4a38" />
      <Dinghy x={-11} z={70} phase={3.0} color="#4a5e46" />
      <Dinghy x={11} z={60} phase={5.0} color="#7a5c8f" />

      {/* Fyrbåk längst ut på piren */}
      <group position={[0, 0, 84]}>
        <mesh castShadow position={[0, 2.4, 0]}>
          <cylinderGeometry args={[0.7, 0.9, 4.8, 10]} />
          <meshStandardMaterial color="#e2e0d8" />
        </mesh>
        <mesh position={[0, 3.6, 0]}>
          <cylinderGeometry args={[0.72, 0.72, 1.1, 10]} />
          <meshStandardMaterial color="#b6413a" />
        </mesh>
        <mesh position={[0, 5.1, 0]}>
          <sphereGeometry args={[0.5, 10, 8]} />
          <meshStandardMaterial color="#ffd27a" emissive="#ffb43a" emissiveIntensity={1.1} />
        </mesh>
        <mesh castShadow position={[0, 5.9, 0]}>
          <coneGeometry args={[0.7, 1.1, 10]} />
          <meshStandardMaterial color="#3a3a3a" />
        </mesh>
      </group>

      {/* Lyktor längs promenad och pir */}
      {[-38, -14, 14, 38].map((px) => <PierLamp key={`lp-${px}`} x={px} z={22} />)}
      {[42, 62, 80].map((pz) => <PierLamp key={`lpp-${pz}`} x={3.8} z={pz} />)}

      {/* Bänkar mot vattnet + planteringar */}
      <Bench x={-26} z={20} />
      <Bench x={-6} z={20} />
      <Bench x={18} z={20} />
      <Tree x={-40} z={12} s={0.9} />
      <Tree x={40} z={12} s={0.9} />
      <Tree x={-30} z={6} s={1.0} />
      <Tree x={30} z={6} s={1.0} />

      {/* Liten glasskiosk med randig markis */}
      <group position={[34, 0, 18]}>
        <mesh castShadow position={[0, 1.4, 0]}>
          <boxGeometry args={[6, 2.8, 5]} />
          <meshStandardMaterial color="#e7ddc7" />
        </mesh>
        <mesh castShadow position={[0, 3, 2.6]} rotation-x={-0.5}>
          <boxGeometry args={[6.4, 0.15, 2.2]} />
          <meshStandardMaterial color="#b6413a" />
        </mesh>
        <mesh position={[0, 2.9, 0]}>
          <boxGeometry args={[6.2, 0.3, 5.2]} />
          <meshStandardMaterial color="#c9a13b" />
        </mesh>
      </group>
    </group>
  );
}

/** Landmärken som ger distrikten identitet – renderas ur LANDMARKS-datan. */
export function Landmarks() {
  return (
    <>
      {LANDMARKS.map((l) => {
        switch (l.type) {
          case "stadshus":    return <LmStadshus key={l.id} x={l.x} z={l.z} />;
          case "vattentorn":  return <LmVattentorn key={l.id} x={l.x} z={l.z} />;
          case "skorsten":    return <LmSkorsten key={l.id} x={l.x} z={l.z} />;
          case "stadspark":   return <LmStadspark key={l.id} x={l.x} z={l.z} />;
          case "kyrka":       return <LmKyrka key={l.id} x={l.x} z={l.z} />;
          case "arena":       return <LmArena key={l.id} x={l.x} z={l.z} />;
          case "pariserhjul": return <LmPariserhjul key={l.id} x={l.x} z={l.z} />;
        }
      })}
    </>
  );
}

/** Mjuka moln som driver långsamt över staden. */
function Cloud({ x, y, z, s, speed }: { x: number; y: number; z: number; s: number; speed: number }) {
  const ref = useRef<Group>(null);
  useFrame((state, dt) => {
    const g = ref.current;
    if (!g) return;
    g.position.x += dt * speed;
    if (g.position.x > 560) g.position.x = -560;
  });
  return (
    <group ref={ref} position={[x, y, z]} scale={s}>
      {[
        [0, 0, 0, 9],
        [8, -1, 2, 6.5],
        [-8, -1.5, -1, 7],
        [3, 2, -2, 5.5],
      ].map(([cx, cy, cz, r], i) => (
        <mesh key={i} position={[cx, cy, cz]}>
          <sphereGeometry args={[r, 10, 8]} />
          <meshStandardMaterial
            color="#f6f9fb"
            transparent
            opacity={0.8}
            depthWrite={false}
            flatShading
          />
        </mesh>
      ))}
    </group>
  );
}

export function Clouds() {
  return (
    <>
      {/* Höga moln – kameran ska aldrig kunna flyga in i dem. */}
      <Cloud x={-300} y={300} z={-100} s={1.8} speed={2.2} />
      <Cloud x={-40} y={330} z={120} s={2.4} speed={1.6} />
      <Cloud x={220} y={290} z={-220} s={1.5} speed={2.8} />
      <Cloud x={420} y={315} z={60} s={2.0} speed={1.9} />
      <Cloud x={-460} y={295} z={240} s={1.7} speed={2.5} />
    </>
  );
}
