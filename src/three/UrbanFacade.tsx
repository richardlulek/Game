import { facadeDetailGeometry } from "./facadeDetailGeometry";
import { useEffect, useMemo } from "react";
import { MeshStandardMaterial } from "three";
import { useUiStore } from "../store/uiStore";
import { buildInstances } from "./meshHelpers";
import { urbanFacadeParts, type UrbanFacadeSpec } from "./urbanFacadeParts";
export function UrbanFacade(props: UrbanFacadeSpec) {
  const evening = useUiStore((s) => s.lightMode === "evening");
  const coarse = useUiStore((s) => s.lodFar || s.graphics === "low");
  const signature = JSON.stringify({ ...props, evening });
  const meshes = useMemo(
    () =>
      urbanFacadeParts(JSON.parse(signature))
        .filter((g) => g.items.length)
        .map((g) =>
          buildInstances(
            facadeDetailGeometry(g, coarse),
            new MeshStandardMaterial({
              color: g.color,
              roughness: g.glass ? 0.35 : 0.86,
              metalness: g.glass ? 0.12 : 0,
              emissive: g.lit ? "#e2c18b" : "#000000",
              emissiveIntensity: g.lit ? 0.55 : 0,
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
