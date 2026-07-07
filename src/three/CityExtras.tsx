import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import { PITCH, ZONE_GRIDS } from "../engine/city";

const STREET = "#82898e";
const CONCRETE = "#b9b4a8";
const CONTAINER_COLORS = ["#b6413a", "#3c6ca8", "#c9a13b", "#4d8b52", "#7a5c8f", "#3f3f3f"];

/** Kvartersgator: asfaltstråk mellan tomtrutorna inne i varje distrikt. */
export function InnerStreets() {
  const strips = useMemo(() => {
    const out: { x: number; z: number; w: number; d: number }[] = [];
    for (const g of ZONE_GRIDS) {
      const W = g.cols * PITCH;
      const D = g.rows * PITCH;
      for (let c = 0; c < g.cols - 1; c++)
        out.push({ x: g.cx + (c + 0.5 - (g.cols - 1) / 2) * PITCH, z: g.cz, w: 8.5, d: D });
      for (let r = 0; r < g.rows - 1; r++)
        out.push({ x: g.cx, z: g.cz + (r + 0.5 - (g.rows - 1) / 2) * PITCH, w: W, d: 8.5 });
    }
    return out;
  }, []);
  return (
    <>
      {strips.map((s, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[s.x, 0.012, s.z]} receiveShadow>
          <planeGeometry args={[s.w, s.d]} />
          <meshStandardMaterial color={STREET} />
        </mesh>
      ))}
    </>
  );
}

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

/** Kajen med kranar, containrar och fartyg – Hamnens ansikte. */
export function Harbor() {
  return (
    <>
      {/* Kajkant i betong längs vattnet */}
      <mesh castShadow receiveShadow position={[10, 0.5, 276]}>
        <boxGeometry args={[560, 1, 14]} />
        <meshStandardMaterial color={CONCRETE} />
      </mesh>
      <HarborCrane x={70} z={276} phase={0} />
      <HarborCrane x={-90} z={276} phase={2.2} />
      <Containers x={150} z={276} seed={1} />
      <Containers x={-170} z={276} seed={4} />
      <Boat x={10} z={318} phase={0.4} color="#38556a" />
      <Boat x={190} z={335} phase={2.8} color="#6a4a38" />
    </>
  );
}

/** Landmärken som ger distrikten identitet. */
export function Landmarks() {
  return (
    <>
      {/* Stadshusets klocktorn – nordost om Centrum */}
      <group position={[140, 0, -138]}>
        <mesh castShadow receiveShadow position={[0, 1, 0]}>
          <boxGeometry args={[16, 2, 16]} />
          <meshStandardMaterial color={CONCRETE} />
        </mesh>
        <mesh castShadow position={[0, 13, 0]}>
          <boxGeometry args={[7, 24, 7]} />
          <meshStandardMaterial color="#c9b896" />
        </mesh>
        <mesh position={[0, 22, 3.6]}>
          <cylinderGeometry args={[1.6, 1.6, 0.2, 16]} />
          <meshStandardMaterial color="#f3ead3" />
        </mesh>
        <mesh castShadow position={[0, 27.2, 0]} rotation-y={Math.PI / 4}>
          <coneGeometry args={[5.4, 4.5, 4]} />
          <meshStandardMaterial color="#4a6a55" />
        </mesh>
      </group>
      {/* Vattentorn – väster om Villakullen */}
      <group position={[-190, 0, -150]}>
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
        <mesh castShadow position={[0, 14, 0]}>
          <cylinderGeometry args={[5.5, 4.5, 5, 12]} />
          <meshStandardMaterial color="#aab4ac" />
        </mesh>
        <mesh castShadow position={[0, 17.6, 0]}>
          <coneGeometry args={[5.6, 2.4, 12]} />
          <meshStandardMaterial color="#7d8a7a" />
        </mesh>
      </group>
      {/* Fabriksskorstenar öster om Industriområdet */}
      {[-48, 4].map((dz, i) => (
        <group key={i} position={[372, 0, -20 + dz]}>
          <mesh castShadow position={[0, 9, 0]}>
            <cylinderGeometry args={[1.4, 1.9, 18, 10]} />
            <meshStandardMaterial color="#9c5a4a" />
          </mesh>
          <mesh position={[0, 17.6, 0]}>
            <cylinderGeometry args={[1.45, 1.45, 1.2, 10]} />
            <meshStandardMaterial color="#e8e4da" />
          </mesh>
        </group>
      ))}
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
          <meshStandardMaterial color="#f4f7f9" transparent opacity={0.92} flatShading />
        </mesh>
      ))}
    </group>
  );
}

export function Clouds() {
  return (
    <>
      <Cloud x={-300} y={150} z={-100} s={1.4} speed={2.2} />
      <Cloud x={-40} y={170} z={120} s={1.9} speed={1.6} />
      <Cloud x={220} y={140} z={-220} s={1.1} speed={2.8} />
      <Cloud x={420} y={160} z={60} s={1.6} speed={1.9} />
      <Cloud x={-460} y={145} z={240} s={1.3} speed={2.5} />
    </>
  );
}
