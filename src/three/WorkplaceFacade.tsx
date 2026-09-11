import { useEffect, useMemo } from "react";
import { BoxGeometry, MeshStandardMaterial } from "three";
import { buildInstances } from "./meshHelpers";
import { workplaceFacadeParts, type WorkplaceSpec } from "./workplaceFacadeParts";
export function WorkplaceFacade(props: WorkplaceSpec) {
  const signature = JSON.stringify(props);
  const meshes = useMemo(
    () =>
      workplaceFacadeParts(JSON.parse(signature))
        .filter((g) => g.items.length)
        .map((g) =>
          buildInstances(
            new BoxGeometry(),
            new MeshStandardMaterial({
              color: g.color,
              roughness: g.glass ? 0.35 : 0.85,
              metalness: g.glass ? 0.15 : 0,
            }),
            g.items,
            { receive: true },
          ),
        ),
    [signature],
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
