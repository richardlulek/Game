import { useEffect, useMemo } from "react";
import { MeshStandardMaterial } from "three";
import type { Inst } from "./meshHelpers";
import { buildInstances } from "./meshHelpers";
import { facadeDetailGeometry, type FacadeSurface } from "./facadeDetailGeometry";
import { useUiStore } from "../store/uiStore";
export interface ModelDetailGroup extends FacadeSurface {
  items: Inst[];
  color: string;
}
export function ModelDetails({ groups }: { groups: ModelDetailGroup[] }) {
  const coarse = useUiStore((s) => s.lodFar || s.graphics === "low"),
    signature = JSON.stringify(groups);
  const meshes = useMemo(
    () =>
      (JSON.parse(signature) as ModelDetailGroup[])
        .filter((g) => g.items.length)
        .map((g) =>
          buildInstances(
            facadeDetailGeometry(g, coarse),
            new MeshStandardMaterial({
              color: g.color,
              roughness: g.glass ? 0.35 : 0.85,
              metalness: g.glass ? 0.15 : 0,
            }),
            g.items,
            { receive: true },
          ),
        ),
    [signature, coarse],
  );
  useEffect(
    () => () =>
      meshes.forEach((m) => {
        m.geometry.dispose();
        (m.material as MeshStandardMaterial).dispose();
        m.dispose();
      }),
    [meshes],
  );
  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}
