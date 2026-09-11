import { bayWindowParts } from "./bayWindowParts";
import { useEffect, useMemo } from "react";
import { BoxGeometry, MeshStandardMaterial } from "three";
import { useUiStore } from "../store/uiStore";
import { buildInstances } from "./meshHelpers";

/** Shallow upper-floor bays: windowed projections with floor slabs and side lights. */
export function BayWindows({ w, d, floors, sx, sz, color, seed, occupied }: {
  w: number; d: number; floors: number; sx: number; sz: number; color: string; seed: number; occupied: boolean;
}) {
  const width = sx ? d : w, rotation = sx ? sx * Math.PI / 2 : sz < 0 ? Math.PI : 0;
  const evening = useUiStore(s => s.lightMode === "evening");
  const meshes = useMemo(() => {
    return bayWindowParts(width, floors, color, seed, occupied, evening)
      .filter(g => g.items.length).map(g => buildInstances(new BoxGeometry(), new MeshStandardMaterial({ color: g.color,
        roughness: g.glass ? 0.3 : 0.85, metalness: g.glass ? 0.2 : 0, emissive: g.lit ? "#e6bd82" : "#000000", emissiveIntensity: g.lit ? 0.55 : 0 }), g.items, { receive: true }));
  }, [width, floors, color, seed, occupied, evening]);
  useEffect(() => () => meshes.forEach(m => { m.geometry.dispose(); (m.material as MeshStandardMaterial).dispose(); m.dispose(); }), [meshes]);
  return <group position={[sx * w / 2, 0, sz * d / 2]} rotation-y={rotation}>{meshes.map((m, i) => <primitive key={i} object={m} />)}</group>;
}
