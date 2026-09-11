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
import { buildingWorkState } from "./buildingWorkState";
import { groundsPlan, walkingPath, sampleWalker, type WalkingPath } from "./groundsLayout";

function Visitor({ phase, color, path, role }: { phase: number; color: string; path: WalkingPath; role: "resident" | "visitor" | "worker" }) {
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
    }
    const step = Math.sin(clock.elapsedTime * 8 + phase * 10) * 0.38;
    if (left.current) left.current.rotation.x = step;
    if (right.current) right.current.rotation.x = -step;
  });
  return <group ref={ref}>
    <mesh position={[0, 1.05, 0]} castShadow><boxGeometry args={[0.46, 0.65, 0.28]} /><meshStandardMaterial color={color} roughness={0.95} /></mesh>
    <mesh position={[0, 1.58, 0]}><sphereGeometry args={[0.2, 8, 6]} /><meshStandardMaterial color="#b98d70" /></mesh>
    {role === "worker" && <mesh position={[0, 1.76, 0]}><sphereGeometry args={[0.23, 8, 5]} /><meshStandardMaterial color="#d6ad4e" /></mesh>}
    {role !== "resident" && <mesh position={[0.32, 0.88, 0]}><boxGeometry args={[0.18, 0.35, 0.3]} /><meshStandardMaterial color={role === "worker" ? "#b88748" : "#5b4e42"} /></mesh>}
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
    const points = groundsPlan(parcel, p.type).route;
    if (points.length < 2) return undefined;
    const cos = Math.cos(front.rotation), sin = Math.sin(front.rotation);
    return walkingPath(points.map(p => {
      const dx = p.x - front.x, dz = p.z - front.z;
      return { x: dx * cos - dz * sin, z: dx * sin + dz * cos - front.depth / 2 - 1.05 };
    }));
  }, [parcel, front, p.type]);
  const style = DISTRICT_FRONTAGES[parcel.district] ?? DISTRICT_FRONTAGES.kulle;
  const appearance = propertyAppearance(parcel, p);
  const work = buildingWorkState(p);
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
    // Dirt stays on plinths and corner seams instead of covering occupied windows.
    if (p.condition < 65 && !low) for (let i = 0; i < 7; i++) {
      const x = (i - 3) * w * 0.12;
      if (Math.abs(x) < 2) continue;
      stone.push({ x, y: 0.4, z: d / 2 + 0.19, sx: w * 0.055, sy: 0.2 + (i % 3) * 0.1, sz: 0.025,
        color: new Color(p.condition < 40 ? "#666657" : "#8c8775") });
    }
    if (work.active) {
      const cap = parcel.district === "kulle" ? 6 : parcel.district === "industri" ? 10 : parcel.district === "förort" ? 12 : 22;
      const h = Math.min(height, cap), z = d / 2 + 0.55;
      if (work.scaffold) {
        // Both sides keep the central doorway free; finishing reduces the work area.
        const sides = work.stage === "finishing" ? [1] : [-1, 1];
        for (const side of sides) {
          const span = Math.max(0, w * 0.43 - 2.5);
          if (span < 0.8) continue;
          const x = side * (2.5 + span / 2);
          for (const dx of [-span / 2, span / 2]) metal.push({ x: x + dx, y: h / 2, z, sx: 0.1, sy: h, sz: 0.1 });
          for (let y = 3; y <= h; y += 3) {
            timber.push({ x, y, z, sx: span + 0.2, sy: 0.12, sz: 0.85 });
            metal.push({ x, y: y + 0.85, z: z + 0.36, sx: span, sy: 0.08, sz: 0.08 });
          }
          // Guardrails, not a solid fence across access to an occupied property.
          for (const y of [0.5, 1]) timber.push({ x, y, z: z + 0.5, sx: span, sy: 0.13, sz: 0.08, color: new Color("#c6a266") });
        }
      } else if (w > 12) {
        // Small jobs use a tool cabinet beside the entry, not a full-height scaffold.
        timber.push({ x: w * 0.23, y: 0.57, z: d / 2 + 0.55, sx: 0.7, sy: 0.85, sz: 0.6, color: new Color("#ba924d") });
      }
      if (work.facadeProgress > 0) stone.push({ x: -w * 0.45 + w * 0.9 * work.facadeProgress / 2,
        y: 0.18, z: d / 2 + 0.22, sx: w * 0.9 * work.facadeProgress, sy: 0.25, sz: 0.1, color: new Color(style.stone) });
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
  }, [parcel, front, style, low, height, appearance.renovating, appearance.caredFor, appearance.active, p.type, p.condition, work.active, work.scaffold, work.stage, work.facadeProgress]);
  useEffect(() => () => meshes.forEach(m => { m.geometry.dispose(); (m.material as MeshStandardMaterial).dispose(); m.dispose(); }), [meshes]);
  if (!front) return null;
  return <group position={[front.x, 0, front.z]} rotation-y={front.rotation}>
    {meshes.map((m, i) => <primitive key={i} object={m} />)}
    {path && !low && !p.storyTag && <group position={[0, 0, front.depth / 2 + 1.05]}>
      {appearance.active && <Visitor phase={0.12} color={p.type === "bostad" ? "#a55d46" : "#4a667b"} path={path} role={p.type === "bostad" ? "resident" : "visitor"} />}
      {work.active ? <Visitor phase={0.55} color="#d6a64c" path={path} role="worker" />
        : appearance.active && appearance.occupancy > 0.5 && <Visitor phase={0.62} color="#4a667b" path={path} role={p.type === "bostad" ? "resident" : "visitor"} />}
    </group>}
  </group>;
}
