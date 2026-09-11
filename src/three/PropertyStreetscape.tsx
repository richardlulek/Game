import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BoxGeometry, Color, Group, MeshStandardMaterial, SphereGeometry } from "three";
import type { Parcel } from "../engine/city";
import type { Property } from "../engine/types";
import { buildInstances, type Inst } from "./meshHelpers";
import { useEffect } from "react";
import { propertyAppearance } from "./propertyAppearance";
import { DISTRICT_FRONTAGES } from "./frontageDesign";
import { streetFront } from "./frontagePlacement";
import { getReduceMotion } from "../store/prefs";
import { useUiStore } from "../store/uiStore";
import { groundsPlan, walkingPath, sampleWalker, type WalkingPath } from "./groundsLayout";

function Visitor({ width, phase, color, path }: { width: number; phase: number; color: string; path?: WalkingPath }) {
  const ref = useRef<Group>(null);
  const point = useRef({ x: 0, z: 0, heading: 0, visible: false });
  const left = useRef<Group>(null), right = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    if (getReduceMotion()) { ref.current.visible = false; return; }
    if (path && path.length > 0) {
      const cycle = path.length / 1.1 / 0.4;
      sampleWalker(path, clock.elapsedTime / cycle + phase, point.current);
      ref.current.visible = point.current.visible;
      ref.current.position.set(point.current.x, 0, point.current.z);
      ref.current.rotation.y = point.current.heading;
    } else {
      const t = (clock.elapsedTime * 0.055 + phase) % 1;
      ref.current.visible = t < 0.86;
      const progress = Math.min(1, t / 0.68);
      ref.current.position.set((-width * 0.36) * (1 - progress), 0, t > 0.68 ? -(t - 0.68) * 8 : 0);
      ref.current.rotation.y = t > 0.68 ? Math.PI : Math.PI / 2;
    }
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
  const front = useMemo(() => streetFront(parcel), [parcel]);
  const path = useMemo(() => {
    if (!front) return undefined;
    const points = groundsPlan(parcel).route;
    if (points.length < 2) return undefined;
    const cos = Math.cos(front.rotation), sin = Math.sin(front.rotation);
    return walkingPath(points.map(p => {
      const dx = p.x - front.x, dz = p.z - front.z;
      return { x: dx * cos - dz * sin, z: dx * sin + dz * cos - front.depth / 2 - 1.05 };
    }));
  }, [parcel, front]);
  const style = DISTRICT_FRONTAGES[parcel.district] ?? DISTRICT_FRONTAGES.kulle;
  const appearance = propertyAppearance(parcel, p);
  const low = useUiStore(s => s.graphics === "low");
  const meshes = useMemo(() => {
    if (!front) return [];
    const w = front.width, d = front.depth;
    const size = Math.min(1, w / 10);
    const metal: Inst[] = [], timber: Inst[] = [], stone: Inst[] = [], green: Inst[] = [];
    // Corner planters bridge the facade and pavement without covering the entry.
    for (const side of [-1, 1]) {
      if (parcel.district === "industri" || parcel.district === "hamnen") {
        metal.push({ x: side * w * 0.4, y: 0.6, z: d / 2 + 0.85, sx: 0.24, sy: 1.2, sz: 0.24 });
        stone.push({ x: side * w * 0.4, y: 0.9, z: d / 2 + 0.85, sx: 0.26, sy: 0.16, sz: 0.26, color: new Color(style.accent) });
      } else {
        stone.push({ x: side * w * 0.36, y: 0.42 * size, z: d / 2 + 0.7, sx: 1.5 * size, sy: 0.84 * size, sz: 0.95 * size });
        green.push({ x: side * w * 0.36, y: (appearance.caredFor ? 1.25 : 0.86) * size, z: d / 2 + 0.7, sx: 0.65 * size, sy: (appearance.caredFor ? 0.9 : 0.45) * size, sz: 0.45 * size });
        if (appearance.caredFor && !low) for (const dx of [-0.25, 0.25]) green.push({
          x: side * w * 0.36 + dx * size, y: 1.4 * size, z: d / 2 + 0.87,
          sx: 0.2 * size, sy: 0.2 * size, sz: 0.16 * size, color: new Color(parcel.district === "kulle" ? "#dfb7b0" : "#dbc994"),
        });
      }
    }
    if (appearance.renovating) {
      const cap = parcel.district === "kulle" ? 6 : parcel.district === "industri" ? 10 : parcel.district === "förort" ? 15 : 22;
      const h = Math.min(height, cap);
      const z = d / 2 + 0.45;
      for (const x of [-w * 0.42, -w * 0.14, w * 0.14, w * 0.42])
        metal.push({ x, y: h / 2, z, sx: 0.12, sy: h, sz: 0.12 });
      for (let y = 3; y <= h; y += 3) {
        timber.push({ x: 0, y, z, sx: w * 0.86, sy: 0.16, sz: 1.15 });
        metal.push({ x: 0, y: y + 1, z: z + 0.48, sx: w * 0.86, sy: 0.1, sz: 0.1 });
      }
      timber.push({ x: -w * 0.24, y: 0.8, z: d / 2 + 0.7, sx: Math.min(2.4, w * 0.2), sy: 1.6, sz: 1.1, color: new Color("#b78e4a") });
    } else if (appearance.active && p.type !== "industri" && !low && w > 12) {
      // A bench, not a restaurant terrace invented for every retail tenant.
      const x = -w * 0.23;
      timber.push({ x, y: 0.65, z: d / 2 + 1.05, sx: 1.7, sy: 0.12, sz: 0.55 });
      timber.push({ x, y: 1.03, z: d / 2 + 0.82, sx: 1.7, sy: 0.52, sz: 0.1 });
      for (const dx of [-0.62, 0.62]) metal.push({ x: x + dx, y: 0.3, z: d / 2 + 1.05, sx: 0.1, sy: 0.6, sz: 0.45 });
    }
    return [
      buildInstances(new BoxGeometry(), new MeshStandardMaterial({ color: style.frame, roughness: 0.45, metalness: style.metalness }), metal, { cast: true }),
      buildInstances(new BoxGeometry(), new MeshStandardMaterial({ color: style.wood, roughness: 0.85 }), timber, { cast: true }),
      buildInstances(new BoxGeometry(), new MeshStandardMaterial({ color: appearance.caredFor ? style.stone : "#777c6b", roughness: 0.95 }), stone, { cast: true }),
      buildInstances(new SphereGeometry(1, 8, 6), new MeshStandardMaterial({ color: appearance.caredFor ? "#4c7050" : "#777c46", roughness: 1 }), green, { cast: true }),
    ];
  }, [parcel, front, style, low, height, appearance.renovating, appearance.caredFor, appearance.active, p.type]);
  useEffect(() => () => meshes.forEach(m => { m.geometry.dispose(); (m.material as MeshStandardMaterial).dispose(); m.dispose(); }), [meshes]);
  if (!front) return null;
  return <group position={[front.x, 0, front.z]} rotation-y={front.rotation}>
    {meshes.map((m, i) => <primitive key={i} object={m} />)}
    {appearance.active && !appearance.renovating && !low && !p.storyTag && <group position={[0, 0, front.depth / 2 + 1.05]}>
      <Visitor width={front.width} phase={0.12} color="#a55d46" path={path} />
      {appearance.occupancy > 0.5 && <Visitor width={front.width} phase={0.62} color="#4a667b" path={path} />}
    </group>}
  </group>;
}
