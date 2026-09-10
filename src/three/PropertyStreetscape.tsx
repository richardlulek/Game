import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BoxGeometry, Color, Group, MeshStandardMaterial, SphereGeometry } from "three";
import type { Parcel } from "../engine/city";
import type { Property } from "../engine/types";
import { buildInstances, type Inst } from "./meshHelpers";
import { useEffect } from "react";
import { propertyAppearance } from "./propertyAppearance";
import { nameSignTexture } from "./textures";
import { useUiStore } from "../store/uiStore";

/** Matches the street-facing side used by the district architecture. */
export function streetFront(parcel: Parcel) {
  if (parcel.edges.s) return { rotation: 0, width: parcel.w, depth: parcel.d };
  if (parcel.edges.n) return { rotation: Math.PI, width: parcel.w, depth: parcel.d };
  if (parcel.edges.e) return { rotation: Math.PI / 2, width: parcel.d, depth: parcel.w };
  if (parcel.edges.w) return { rotation: -Math.PI / 2, width: parcel.d, depth: parcel.w };
  return null;
}

function Visitor({ width, phase, color }: { width: number; phase: number; color: string }) {
  const ref = useRef<Group>(null);
  const left = useRef<Group>(null), right = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (clock.elapsedTime * 0.055 + phase) % 1;
    ref.current.visible = t < 0.86;
    const progress = Math.min(1, t / 0.68);
    ref.current.position.set((-width * 0.36) * (1 - progress), 0, t > 0.68 ? -(t - 0.68) * 8 : 0);
    ref.current.rotation.y = t > 0.68 ? Math.PI : Math.PI / 2;
    const step = Math.sin(clock.elapsedTime * 8 + phase * 10) * 0.38;
    if (left.current) left.current.rotation.x = step;
    if (right.current) right.current.rotation.x = -step;
  });
  return <group ref={ref}>
    <mesh position={[0, 1.05, 0]} castShadow><boxGeometry args={[0.46, 0.65, 0.28]} /><meshStandardMaterial color={color} roughness={0.95} /></mesh>
    <mesh position={[0, 1.58, 0]}><sphereGeometry args={[0.2, 8, 6]} /><meshStandardMaterial color="#b98d70" /></mesh>
    {[-1, 1].map((side, i) => <group key={side} ref={i ? right : left} position={[side * 0.13, 0.75, 0]}>
      <mesh position={[0, -0.33, 0]}><boxGeometry args={[0.18, 0.66, 0.2]} /><meshStandardMaterial color="#303b42" /></mesh>
    </group>)}
  </group>;
}

/** Only the viewed block receives these details (bounded by LodController).
 * Everything stays on the property's street edge; roads/layout/saves are untouched. */
export function PropertyStreetscape({ parcel, property: p, height }: { parcel: Parcel; property: Property; height: number }) {
  const front = streetFront(parcel);
  const appearance = propertyAppearance(parcel, p);
  const low = useUiStore(s => s.graphics === "low");
  const meshes = useMemo(() => {
    if (!front) return [];
    const w = front.width, d = front.depth;
    const metal: Inst[] = [], timber: Inst[] = [], stone: Inst[] = [], green: Inst[] = [];
    // Corner planters bridge the facade and pavement without covering the entry.
    for (const side of [-1, 1]) {
      stone.push({ x: side * w * 0.36, y: 0.42, z: d / 2 + 0.7, sx: 1.5, sy: 0.84, sz: 0.95 });
      green.push({ x: side * w * 0.36, y: appearance.caredFor ? 1.25 : 0.86, z: d / 2 + 0.7, sx: 0.65, sy: appearance.caredFor ? 0.9 : 0.45, sz: 0.45 });
    }
    if (appearance.renovating) {
      const h = Math.min(height, 22);
      const z = d / 2 + 0.45;
      for (const x of [-w * 0.42, -w * 0.14, w * 0.14, w * 0.42])
        metal.push({ x, y: h / 2, z, sx: 0.12, sy: h, sz: 0.12 });
      for (let y = 3; y <= h; y += 3) {
        timber.push({ x: 0, y, z, sx: w * 0.86, sy: 0.16, sz: 1.15 });
        metal.push({ x: 0, y: y + 1, z: z + 0.48, sx: w * 0.86, sy: 0.1, sz: 0.1 });
      }
      timber.push({ x: -w * 0.24, y: 0.8, z: d / 2 + 0.7, sx: 2.4, sy: 1.6, sz: 1.1, color: new Color("#b78e4a") });
    } else if (appearance.active && p.type === "butik") {
      // Two compact cafe tables with stools on the pavement, away from the door.
      for (const side of [-1, 1]) {
        const x = side * w * 0.22;
        timber.push({ x, y: 0.95, z: d / 2 + 1, sx: 1, sy: 0.12, sz: 0.75 });
        metal.push({ x, y: 0.45, z: d / 2 + 1, sx: 0.12, sy: 0.9, sz: 0.12 });
        for (const dx of [-0.68, 0.68]) timber.push({ x: x + dx, y: 0.42, z: d / 2 + 1, sx: 0.45, sy: 0.12, sz: 0.45 });
      }
    }
    return [
      buildInstances(new BoxGeometry(), new MeshStandardMaterial({ color: "#727b80", roughness: 0.45, metalness: 0.65 }), metal, { cast: true }),
      buildInstances(new BoxGeometry(), new MeshStandardMaterial({ color: "#a5825c", roughness: 0.85 }), timber, { cast: true }),
      buildInstances(new BoxGeometry(), new MeshStandardMaterial({ color: appearance.caredFor ? "#aaa89c" : "#777c6b", roughness: 0.95 }), stone, { cast: true }),
      buildInstances(new SphereGeometry(1, 8, 6), new MeshStandardMaterial({ color: appearance.caredFor ? "#4c7050" : "#777c46", roughness: 1 }), green, { cast: true }),
    ];
  }, [parcel, front?.width, front?.depth, height, appearance.renovating, appearance.caredFor, appearance.active, p.type]);
  useEffect(() => () => meshes.forEach(m => { m.geometry.dispose(); (m.material as MeshStandardMaterial).dispose(); m.dispose(); }), [meshes]);
  if (!front) return null;
  const label = appearance.renovating ? "WORK IN PROGRESS" : !appearance.active ? "SPACE AVAILABLE" : p.type === "butik" ? p.tenants[0]?.name ?? "OPEN" : "";
  return <group rotation-y={front.rotation}>
    {meshes.map((m, i) => <primitive key={i} object={m} />)}
    {label && <mesh position={[0, 2.75, front.depth / 2 + 0.15]}>
      <planeGeometry args={[Math.min(front.width * 0.62, 8), 1.15]} />
      <meshStandardMaterial map={nameSignTexture(label.slice(0, 26))} roughness={0.7} emissive={appearance.active ? "#b39562" : "#000000"} emissiveIntensity={0.2} />
    </mesh>}
    {appearance.active && !appearance.renovating && !low && <group position={[0, 0, front.depth / 2 + 1.05]}>
      <Visitor width={front.width} phase={0.12} color="#a55d46" />
      {appearance.occupancy > 0.5 && <Visitor width={front.width} phase={0.62} color="#4a667b" />}
    </group>}
  </group>;
}
