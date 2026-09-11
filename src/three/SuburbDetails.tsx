import { useEffect, useMemo } from "react";
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, DoubleSide, MeshStandardMaterial } from "three";
import type { Parcel } from "../engine/city";
import type { Property } from "../engine/types";
import { useUiStore } from "../store/uiStore";
import { buildInstances, type Inst } from "./meshHelpers";
import { suburbFloors, suburbLayout } from "./suburbLayout";

/** Two roof planes and closed triangular gables, with ridge along the long wall. */
export function SuburbRoof({ w, d, y, color }: { w: number; d: number; y: number; color: string }) {
  const run = d / 2 + 0.22, rise = Math.min(2.2, d * 0.22);
  const slope = Math.atan2(rise, run), length = Math.hypot(run, rise);
  const gable = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute([
      -w / 2, 0, -d / 2, -w / 2, rise, 0, -w / 2, 0, d / 2,
      w / 2, 0, d / 2, w / 2, rise, 0, w / 2, 0, -d / 2,
    ], 3));
    g.computeVertexNormals(); return g;
  }, [w, d, rise]);
  useEffect(() => () => gable.dispose(), [gable]);
  return <group position={[0, y, 0]}>
    <mesh geometry={gable} dispose={null}><meshStandardMaterial color="#b5aaa0" side={DoubleSide} roughness={0.92} /></mesh>
    {[-1, 1].map(side => <mesh key={side} castShadow position={[0, rise / 2, side * run / 2]} rotation-x={side * slope}>
      <boxGeometry args={[w + 0.45, 0.12, length]} /><meshStandardMaterial color={color} roughness={0.88} />
    </mesh>)}
  </group>;
}

/** Repeated windows and balcony parts use one instanced batch per material
 * across the whole property, rather than one mesh per opening. */
export function SuburbDetails({ parcel, seed, floors, property, variant, enabled = true, residential = true }: {
  parcel: Parcel; seed: number; floors: number; property?: Property; variant?: string; enabled?: boolean; residential?: boolean;
}) {
  const far = useUiStore(s => s.lodFar), low = useUiStore(s => s.graphics === "low");
  const evening = useUiStore(s => s.lightMode === "evening");
  const occupied = property ? property.status === "klar" && property.tenants.length > 0 : variant !== "släckt";
  const maintained = property ? property.condition >= 70 : variant !== "sliten";
  const meshes = useMemo(() => {
    if (!enabled) return [];
    const layout = suburbLayout(parcel, seed);
    const trim: Inst[] = [], glass: Inst[] = [], concrete: Inst[] = [], panels: Inst[] = [], glow: Inst[] = [];
    layout.houses.forEach((house, i) => {
      const row = Math.floor(i / layout.columns), yard = row === 0 ? 1 : -1;
      const count = suburbFloors(floors, seed, row), h = count * 3;
      const { w, d, x, z } = house;
      const bays = Math.max(3, Math.floor(w / 6) * 2 - 1), spacing = w / bays;
      concrete.push({ x, y: 0.35, z, sx: w + 0.08, sy: 0.7, sz: d + 0.08 });
      trim.push({ x, y: h - 0.12, z, sx: w + 0.26, sy: 0.22, sz: d + 0.26 });
      if (!far && !low) {
        for (const edge of [-1, 1]) panels.push({ x: x + edge * (w / 2 - 0.35), y: h / 2, z: z + yard * (d / 2 + 0.13), sx: 0.1, sy: h, sz: 0.1 });
        const roofRise = seed % 4 === 0 ? 0.6 : Math.min(2.2, d * 0.22);
        concrete.push({ x: x + w * 0.23, y: h + roofRise + 0.35, z, sx: 0.7, sy: 0.7, sz: 0.65 });
      }
      // Courtyard door and a continuous vertical stairwell strip.
      if (residential) {
        panels.push({ x, y: h / 2, z: z + yard * (d / 2 + 0.035), sx: 2.05, sy: h - 0.75, sz: 0.08 });
        glass.push({ x, y: 1.15, z: z + yard * (d / 2 + 0.14), sx: 1.1, sy: 2.15, sz: 0.14 });
        concrete.push({ x, y: 0.12, z: z + yard * (d / 2 + 0.4), sx: 1.65, sy: 0.24, sz: 0.7 });
        trim.push({ x, y: 2.52, z: z + yard * (d / 2 + 0.4), sx: 2.1, sy: 0.12, sz: 0.85 });
        if (occupied) glow.push({ x, y: 2.3, z: z + yard * (d / 2 + 0.24), sx: 0.7, sy: 0.12, sz: 0.04 });
      }
      for (let floor = 0; floor < count; floor++) for (const side of [-1, 1]) for (let bay = 0; bay < bays; bay++) {
        const middle = bay === (bays - 1) / 2, stair = side === yard && middle && residential;
        if (stair && floor === 0) continue;
        const balcony = residential && floor > 0 && side !== yard && bay % 2 === 0;
        const wx = x + (bay - (bays - 1) / 2) * spacing, wy = floor * 3 + (balcony ? 1.35 : 1.85), wz = z + side * (d / 2 + 0.095);
        const width = stair ? 0.8 : Math.min(balcony ? 1.2 : 1.5, spacing * 0.5), height = stair ? 1.8 : balcony ? 2.1 : 1.35;
        trim.push({ x: wx, y: wy, z: wz, sx: width + 0.16, sy: height + 0.16, sz: 0.12 });
        glass.push({ x: wx, y: wy, z: wz + side * 0.075, sx: width, sy: height, sz: 0.06 });
        if (occupied && evening && (seed + i * 7 + floor * 3 + bay + side) % 5 === 0) glow.push({
          x: wx, y: wy, z: wz + side * 0.115, sx: width * 0.86, sy: height * 0.9, sz: 0.025,
        });
        if (!far && !low) {
          trim.push({ x: wx, y: wy, z: wz + side * 0.115, sx: 0.045, sy: height, sz: 0.03 });
          concrete.push({ x: wx, y: wy - height / 2 - 0.1, z: wz + side * 0.08, sx: width + 0.24, sy: 0.1, sz: 0.32 });
          // Outer-wall balconies leave the courtyard walkway clear.
          if (balcony) {
            const bw = Math.min(2.2, spacing * 0.8), bz = z + side * (d / 2 + 0.58), by = floor * 3 + 0.08;
            concrete.push({ x: wx, y: by, z: bz, sx: bw, sy: 0.16, sz: 1.1 });
            panels.push({ x: wx, y: by + 0.5, z: bz + side * 0.48, sx: bw, sy: 0.85, sz: 0.08 });
            for (const edge of [-1, 1]) panels.push({ x: wx + edge * (bw / 2 - 0.04), y: by + 0.5, z: bz, sx: 0.08, sy: 0.85, sz: 1 });
          }
        }
      }
      // Sparse end-wall openings avoid the former texture wrapping around corners.
      for (const side of [-1, 1]) for (let floor = 0; floor < count; floor++) {
        trim.push({ x: x + side * (w / 2 + 0.06), y: floor * 3 + 1.85, z, sx: 0.12, sy: 1.45, sz: 1.25 });
        glass.push({ x: x + side * (w / 2 + 0.14), y: floor * 3 + 1.85, z, sx: 0.06, sy: 1.3, sz: 1.1 });
      }
    });
    return [
      { items: concrete, color: maintained ? "#b8b5a9" : "#858276" },
      { items: panels, color: maintained ? seed % 2 ? "#647b74" : "#88705c" : "#787465" },
      { items: trim, color: maintained ? "#e1ddd2" : "#aaa799" },
      { items: glass, color: occupied ? "#68818a" : "#414f56" },
      { items: glow, color: "#ead7a4", lit: true },
    ].filter(g => g.items.length).map(g => buildInstances(new BoxGeometry(), new MeshStandardMaterial({
      color: g.color, roughness: g.items === glass ? 0.3 : 0.85, metalness: g.items === glass ? 0.25 : 0,
      emissive: g.lit && evening ? "#f3ce90" : "#000000", emissiveIntensity: g.lit && evening ? 0.65 : 0,
    }), g.items, { receive: true }));
  }, [parcel, seed, floors, occupied, maintained, far, low, evening, enabled, residential]);
  useEffect(() => () => meshes.forEach(m => { m.geometry.dispose(); (m.material as MeshStandardMaterial).dispose(); m.dispose(); }), [meshes]);
  return <group>{meshes.map((m, i) => <primitive key={i} object={m} />)}</group>;
}
