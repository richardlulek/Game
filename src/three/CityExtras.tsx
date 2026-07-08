import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group, Mesh, MeshStandardMaterial } from "three";

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

/** Kajen med kranar, containrar och fartyg – Hamnens ansikte. */
export function Harbor() {
  return (
    <>
      {/* Kajkant i betong längs vattnet, söder om hamnkvarteren */}
      <mesh castShadow receiveShadow position={[20, 0.5, 312]}>
        <boxGeometry args={[640, 1, 16]} />
        <meshStandardMaterial color={CONCRETE} />
      </mesh>
      <HarborCrane x={70} z={312} phase={0} />
      <HarborCrane x={-90} z={312} phase={2.2} />
      <HarborCrane x={230} z={312} phase={4.1} />
      <Containers x={150} z={312} seed={1} />
      <Containers x={-170} z={312} seed={4} />
      <Containers x={300} z={312} seed={7} />
      <Boat x={10} z={352} phase={0.4} color="#38556a" />
      <Boat x={190} z={368} phase={2.8} color="#6a4a38" />
      <Boat x={-160} z={360} phase={4.6} color="#4a5e46" />
    </>
  );
}

/** Landmärken som ger distrikten identitet. */
export function Landmarks() {
  return (
    <>
      {/* Stadshusets klocktorn – i parkstråket öster om Centrum */}
      <group position={[168, 0, -80]}>
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
        <Flag x={0} y={29.5} z={0} color="#4f63e4" />
      </group>
      {/* Vattentorn – norr om Villakullen */}
      <group position={[-310, 0, -290]}>
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
        <group key={i} position={[465, 0, -110 + dz]}>
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
