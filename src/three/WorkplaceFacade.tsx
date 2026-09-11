import { useUiStore } from "../store/uiStore";
import { facadeDetailGeometry } from "./facadeDetailGeometry";
import { useEffect, useMemo } from "react";
import { MeshStandardMaterial } from "three";
import { buildInstances } from "./meshHelpers";
import { workplaceFacadeParts, type WorkplaceSpec } from "./workplaceFacadeParts";
export function WorkplaceFacade(props: WorkplaceSpec) {
  const coarse = useUiStore((s) => s.lodFar || s.graphics === "low");
  const signature = JSON.stringify(props);
  const meshes = useMemo(
    () =>
      workplaceFacadeParts(JSON.parse(signature))
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
