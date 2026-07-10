/* Ägarens privatliv på kartan – lyxköpen (Bolag → Arv) blir synliga
   objekt i staden: sportbilen kryssar utanför huvudkontoret, sommarvillan
   ligger på en skärgårdsö och den privata helikoptern står på kontorets
   helipad. Ren dekor, ingen spellogik. */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh } from "three";
import { useGameStore } from "../store/gameStore";

// Huvudkontorets position (spegel av POS i Headquarters.tsx).
const HQ: [number, number] = [-225, 215];
// Egen liten holme i sydvästra vattnet (fri yta mellan skärgårdsöarna).
const ISLAND: [number, number] = [-300, 466];

/** Låg, bred sportbil i italienskt rött som sakta kryssar framför kontoret. */
function SportsCar() {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime * 0.18;
    // Fram och tillbaka längs "Esplanaden" (x-led) framför kontoret.
    const span = 46;
    const x = HQ[0] + Math.sin(t) * span;
    g.position.x = x;
    // Vänd nosen efter körriktningen.
    g.rotation.y = Math.cos(t) >= 0 ? Math.PI / 2 : -Math.PI / 2;
  });
  const RED = "#c0281f";
  return (
    <group ref={ref} position={[HQ[0], 0, HQ[1] + 16]}>
      {/* Kaross */}
      <mesh castShadow position={[0, 0.7, 0]}>
        <boxGeometry args={[5.4, 1.0, 2.2]} />
        <meshStandardMaterial color={RED} metalness={0.55} roughness={0.25} />
      </mesh>
      {/* Kupé/vindruta */}
      <mesh castShadow position={[-0.3, 1.35, 0]}>
        <boxGeometry args={[2.6, 0.8, 1.9]} />
        <meshStandardMaterial color="#1c2530" metalness={0.4} roughness={0.2} />
      </mesh>
      {/* Strålkastare fram */}
      <mesh position={[2.75, 0.75, 0.7]}>
        <boxGeometry args={[0.2, 0.35, 0.5]} />
        <meshStandardMaterial color="#fff6d6" emissive="#ffe9a8" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[2.75, 0.75, -0.7]}>
        <boxGeometry args={[0.2, 0.35, 0.5]} />
        <meshStandardMaterial color="#fff6d6" emissive="#ffe9a8" emissiveIntensity={0.6} />
      </mesh>
      {/* Hjul */}
      {([[1.7, 1.1], [1.7, -1.1], [-1.7, 1.1], [-1.7, -1.1]] as const).map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.45, wz]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.45, 0.45, 0.35, 12]} />
          <meshStandardMaterial color="#141414" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/** Sommarvilla på en egen liten holme med veranda och brygga. */
function SummerVilla() {
  return (
    <group position={[ISLAND[0], 0, ISLAND[1]]}>
      {/* Egen holme: låg gräsplatå strax över vattenytan */}
      <mesh receiveShadow position={[0, 0.5, 0]}>
        <cylinderGeometry args={[17, 20, 1.6, 24]} />
        <meshStandardMaterial color="#8fa075" roughness={0.95} />
      </mesh>
      {/* Sandstrand runt kanten */}
      <mesh receiveShadow position={[0, 0.35, 0]}>
        <cylinderGeometry args={[19, 20.5, 0.9, 24]} />
        <meshStandardMaterial color="#d9c89b" roughness={1} />
      </mesh>
      {/* Huskropp i faluröd panel */}
      <mesh castShadow receiveShadow position={[0, 3.3, -1]}>
        <boxGeometry args={[12, 4, 8]} />
        <meshStandardMaterial color="#8c3b2e" roughness={0.85} />
      </mesh>
      {/* Vitknutar */}
      <mesh position={[6, 3.3, 3]}>
        <boxGeometry args={[0.5, 4.1, 0.5]} />
        <meshStandardMaterial color="#efe7d5" />
      </mesh>
      <mesh position={[-6, 3.3, 3]}>
        <boxGeometry args={[0.5, 4.1, 0.5]} />
        <meshStandardMaterial color="#efe7d5" />
      </mesh>
      {/* Sadeltak */}
      <mesh castShadow position={[0, 6.2, -1]} rotation-y={Math.PI / 2}>
        <cylinderGeometry args={[3, 3, 12.4, 3, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#37424c" roughness={0.8} />
      </mesh>
      {/* Veranda mot vattnet */}
      <mesh receiveShadow position={[0, 1.4, 5]}>
        <boxGeometry args={[12, 0.4, 4]} />
        <meshStandardMaterial color="#c9b78f" roughness={0.9} />
      </mesh>
      {/* Brygga som når ut i vattnet */}
      <mesh receiveShadow position={[0, 0.5, 22]}>
        <boxGeometry args={[3, 0.4, 20]} />
        <meshStandardMaterial color="#a68a5e" roughness={0.9} />
      </mesh>
      {/* Flaggstång */}
      <mesh position={[8, 5.3, 0]}>
        <cylinderGeometry args={[0.12, 0.16, 8, 6]} />
        <meshStandardMaterial color="#e8e2d2" />
      </mesh>
    </group>
  );
}

/** Privat helikopter på en helipad bredvid kontoret; rotorn snurrar sakta. */
function Helicopter() {
  const rotor = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (rotor.current) rotor.current.rotation.y += dt * 3.2;
  });
  return (
    <group position={[HQ[0] + 20, 0, HQ[1] - 14]}>
      {/* Helipad */}
      <mesh receiveShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[7, 7, 0.24, 24]} />
        <meshStandardMaterial color="#3a3f45" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.26, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[4.2, 5, 24]} />
        <meshStandardMaterial color="#e8c451" />
      </mesh>
      {/* Kabin */}
      <mesh castShadow position={[0, 2.1, 0]}>
        <sphereGeometry args={[1.8, 14, 12]} />
        <meshStandardMaterial color="#20262e" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh castShadow position={[0, 2.1, 0]} scale={[1.02, 1.02, 1.02]}>
        <sphereGeometry args={[1.4, 12, 10]} />
        <meshStandardMaterial color="#8fb6e0" metalness={0.4} roughness={0.15} opacity={0.85} transparent />
      </mesh>
      {/* Stjärtbom */}
      <mesh castShadow position={[-3.4, 2.4, 0]}>
        <boxGeometry args={[5, 0.5, 0.5]} />
        <meshStandardMaterial color="#2a313a" />
      </mesh>
      <mesh position={[-5.9, 2.4, 0]} rotation-x={Math.PI / 2}>
        <boxGeometry args={[1.6, 0.1, 0.3]} />
        <meshStandardMaterial color="#20262e" />
      </mesh>
      {/* Medar */}
      <mesh position={[0, 0.55, 1]}>
        <boxGeometry args={[3.4, 0.12, 0.12]} />
        <meshStandardMaterial color="#4a5158" metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.55, -1]}>
        <boxGeometry args={[3.4, 0.12, 0.12]} />
        <meshStandardMaterial color="#4a5158" metalness={0.4} />
      </mesh>
      {/* Huvudrotor */}
      <group position={[0, 3.7, 0]}>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.6, 8]} />
          <meshStandardMaterial color="#31383f" />
        </mesh>
        <mesh ref={rotor} position={[0, 0.35, 0]}>
          <boxGeometry args={[13, 0.08, 0.5]} />
          <meshStandardMaterial color="#15191d" />
        </mesh>
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
