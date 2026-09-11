import { useEffect, useMemo } from "react";
import { BoxGeometry, MeshStandardMaterial } from "three";
import { useUiStore } from "../store/uiStore";
import { buildInstances, type Inst } from "./meshHelpers";

/** Shallow upper-floor bays: windowed projections with floor slabs and side lights. */
export function BayWindows({ w, d, floors, sx, sz, color, seed, occupied }: {
  w: number; d: number; floors: number; sx: number; sz: number; color: string; seed: number; occupied: boolean;
}) {
  const width = sx ? d : w, rotation = sx ? sx * Math.PI / 2 : sz < 0 ? Math.PI : 0;
  const evening = useUiStore(s => s.lightMode === "evening");
  const meshes = useMemo(() => {
    const walls: Inst[] = [], glass: Inst[] = [], trim: Inst[] = [], glow: Inst[] = [];
    const positions = width > 20 && seed % 2 === 0 ? [-width * 0.25, width * 0.25] : [width * 0.24];
    for (const x of positions) for (let floor = 1; floor < floors; floor++) {
      const y = floor * 3;
      walls.push({ x, y: y + 1.5, z: 0.21, sx: 2.4, sy: 3, sz: 0.55 });
      glass.push({ x, y: y + 1.65, z: 0.51, sx: 1.95, sy: 1.75, sz: 0.05 });
      if (evening && occupied && (seed + floor) % 3 === 0) glow.push({ x, y: y + 1.65, z: 0.545, sx: 1.8, sy: 1.65, sz: 0.015 });
      for (const side of [-1, 1]) {
        glass.push({ x: x + side * 1.22, y: y + 1.65, z: 0.26, sx: 0.035, sy: 1.75, sz: 0.37 });
        trim.push({ x: x + side * 1.08, y: y + 1.65, z: 0.55, sx: 0.12, sy: 1.92, sz: 0.12 });
      }
      trim.push({ x, y: y + 1.65, z: 0.56, sx: 0.075, sy: 1.75, sz: 0.08 });
      trim.push({ x, y: y + 0.7, z: 0.4, sx: 2.5, sy: 0.16, sz: 0.45 });
      trim.push({ x, y: y + 2.9, z: 0.22, sx: 2.55, sy: 0.2, sz: 0.7 });
    }
    return [{ items: walls, color }, { items: glass, color: "#596f76" }, { items: trim, color: "#d6cbb7" }, { items: glow, color: "#e9d4aa" }]
      .filter(g => g.items.length).map(g => buildInstances(new BoxGeometry(), new MeshStandardMaterial({ color: g.color,
        roughness: g.items === glass ? 0.3 : 0.85, metalness: g.items === glass ? 0.2 : 0, emissive: g.items === glow ? "#e6bd82" : "#000000", emissiveIntensity: g.items === glow ? 0.55 : 0 }), g.items, { receive: true }));
  }, [width, floors, color, seed, occupied, evening]);
  useEffect(() => () => meshes.forEach(m => { m.geometry.dispose(); (m.material as MeshStandardMaterial).dispose(); m.dispose(); }), [meshes]);
  return <group position={[sx * w / 2, 0, sz * d / 2]} rotation-y={rotation}>{meshes.map((m, i) => <primitive key={i} object={m} />)}</group>;
}
