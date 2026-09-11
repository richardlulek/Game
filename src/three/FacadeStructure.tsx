import { architecturePalette } from "./architecturePalette";
import { useEffect, useMemo } from "react";
import { BoxGeometry, MeshStandardMaterial } from "three";
import { useUiStore } from "../store/uiStore";
import { buildInstances } from "./meshHelpers";
import { facadeStructure, type StructureKind, type StructureVolume } from "./facadeStructure";

export function FacadeStructure({ volumes, kind, enabled = true, color }: { volumes: StructureVolume[]; kind: StructureKind; enabled?: boolean; color?: string }) {
  const coarse = useUiStore(s => s.lodFar || s.graphics === "low");
  const overlay = useUiStore(s => s.overlay !== "ingen");
  // Callers may build a small literal array. Its numeric signature, not array
  // identity, controls GPU reconstruction during otherwise unrelated ticks.
  const signature = JSON.stringify(volumes);
  const meshes = useMemo(() => {
    if (!enabled || overlay) return [];
    const parts = (JSON.parse(signature) as StructureVolume[]).flatMap(v => facadeStructure(v, kind, coarse));
    const palette = color ? architecturePalette(color) : kind === "office" ? { frame: "#9aa9b2", base: "#59666e", glass: "#606a68" }
      : kind === "warehouse" ? { frame: "#6b5746", base: "#888274", glass: "#606a68" }
      : kind === "industrial" ? { frame: "#6b7477", base: "#909186", glass: "#606a68" }
      : { frame: "#c5bba7", base: "#8d8577", glass: "#606a68" };
    return (Object.keys(palette) as (keyof typeof palette)[]).filter(surface => parts.some(p => p.surface === surface)).map(surface =>
      buildInstances(new BoxGeometry(), new MeshStandardMaterial({ color: palette[surface], roughness: surface === "glass" ? 0.3 : 0.8,
        metalness: kind === "office" || kind === "industrial" ? 0.3 : 0.04 }), parts.filter(p => p.surface === surface), { receive: true }));
  }, [signature, kind, coarse, enabled, overlay, color]);
  useEffect(() => () => meshes.forEach(m => { m.geometry.dispose(); (m.material as MeshStandardMaterial).dispose(); m.dispose(); }), [meshes]);
  return <group>{meshes.map((mesh, i) => <primitive key={i} object={mesh} />)}</group>;
}
