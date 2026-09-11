import { useEffect, useMemo } from "react";
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, DoubleSide, MeshStandardMaterial } from "three";
import type { Parcel } from "../engine/city";
import type { Property } from "../engine/types";
import { useUiStore } from "../store/uiStore";
import { suburbParts } from "./suburbParts";
import { buildInstances } from "./meshHelpers";

/** Two roof planes and closed triangular gables, with ridge along the long wall. */
export function SuburbRoof({ w, d, y, color, wallColor = "#b5aaa0" }: { w: number; d: number; y: number; color: string; wallColor?: string }) {
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
    <mesh geometry={gable} dispose={null}><meshStandardMaterial color={wallColor} side={DoubleSide} roughness={0.92} /></mesh>
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
    return suburbParts(parcel, seed, floors, occupied, maintained, evening, far || low, residential).filter(g => g.items.length).map(g => buildInstances(new BoxGeometry(), new MeshStandardMaterial({
      color: g.color, roughness: g.glass ? 0.3 : 0.85, metalness: g.glass ? 0.25 : 0,
      emissive: g.lit && evening ? "#f3ce90" : "#000000", emissiveIntensity: g.lit && evening ? 0.65 : 0,
    }), g.items, { receive: true }));
  }, [parcel, seed, floors, occupied, maintained, far, low, evening, enabled, residential]);
  useEffect(() => () => meshes.forEach(m => { m.geometry.dispose(); (m.material as MeshStandardMaterial).dispose(); m.dispose(); }), [meshes]);
  return <group>{meshes.map((m, i) => <primitive key={i} object={m} />)}</group>;
}
