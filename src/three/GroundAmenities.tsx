import { useEffect, useMemo } from "react";
import { BoxGeometry, Color, MeshStandardMaterial, TorusGeometry } from "three";
import type { Property } from "../engine/types";
import type { groundsPlan } from "./groundsLayout";
import { buildInstances, type Inst } from "./meshHelpers";
import { frontageState } from "./frontageDesign";
import { useUiStore } from "../store/uiStore";

/** Furnish only reserved clear ground. Up to four amenities per viewed property. */
export function GroundAmenities({ plan, property }: { plan: ReturnType<typeof groundsPlan>; property: Property }) {
  const low = useUiStore(s => s.graphics === "low");
  const { open, working, restored } = frontageState(property);
  const meshes = useMemo(() => {
    const paving: Inst[] = [], paint: Inst[] = [], steel: Inst[] = [], dark: Inst[] = [], body: Inst[] = [], wheels: Inst[] = [];
    for (const [i, a] of plan.amenities.entries()) {
      const put = (items: Inst[], x: number, y: number, z: number, sx: number, sy: number, sz: number, color?: string, rotZ?: number) => items.push({
        x: a.x + x * Math.cos(a.rotation) + z * Math.sin(a.rotation), y,
        z: a.z - x * Math.sin(a.rotation) + z * Math.cos(a.rotation), sx, sy, sz,
        rotY: a.rotation, rotZ, ...(color ? { color: new Color(color) } : {}),
      });
      if (a.kind === "parking" || a.kind === "loading") {
        put(paving, 0, 0.17, 0, 5.35, 0.025, 2.15);
        for (const side of [-1, 1]) {
          put(paint, side * 2.55, 0.188, 0, 0.08, 0.01, 2.05);
          put(paint, 0, 0.188, side * 1.02, 5.1, 0.01, 0.08);
        }
        if (working) {
          // Materials and a short fence occupy the reserved bay, never the door route.
          for (const x of [-0.75, 0.75]) {
            put(body, x, 0.55, 0, 1.2, 0.75, 1.1, "#ad9271");
            put(steel, x, 0.2, 0, 1.25, 0.15, 1.15);
          }
          for (const x of [-2, 2]) put(steel, x, 0.85, -1, 0.08, 1.4, 0.08);
          for (const y of [0.55, 1.25]) put(paint, 0, y, -1, 4.1, 0.13, 0.09);
        } else if (open && !low && (a.kind === "loading" || i < Math.ceil(property.tenants.length / Math.max(1, property.capacity) * 2))) {
          const van = a.kind === "loading";
          put(body, 0, van ? 0.95 : 0.67, 0, 3.9, van ? 1.25 : 0.65, 1.65, van ? "#ccd0cc" : i % 2 ? "#7d5348" : "#607886");
          put(dark, -0.15, van ? 1.5 : 1.18, 0, van ? 1.1 : 2.05, 0.55, 1.4);
          put(body, -0.15, van ? 1.8 : 1.49, 0, van ? 1.3 : 2.15, 0.1, 1.5);
          for (const x of [-1.25, 1.25]) for (const z of [-0.8, 0.8]) put(wheels, x, 0.48, z, 1.2, 1.2, 1.2);
          for (const z of [-0.55, 0.55]) put(paint, 1.96, 0.8, z, 0.035, 0.16, 0.32);
        }
      } else if (a.kind === "bins") {
        for (const x of [-0.38, 0.38]) {
          put(body, x, 0.6, 0, 0.62, 0.84, 0.65, restored ? "#486251" : "#6c6b58");
          put(dark, x, 1.04, 0, 0.68, 0.1, 0.72);
          put(paint, x, 0.8, 0.34, 0.18, 0.13, 0.025);
        }
      } else {
        for (const x of [-0.8, 0, 0.8]) {
          put(steel, x, 0.5, 0, 0.07, 0.7, 0.07);
          put(steel, x, 0.87, 0.15, 0.07, 0.07, 0.4);
        }
        if (open && !low && !working) {
          for (const x of [-0.57, 0.57]) put(wheels, x, 0.48, 0.35, 1, 1, 1);
          put(body, 0, 0.83, 0.35, 0.92, 0.06, 0.06, "#965b48");
          put(body, -0.17, 0.66, 0.35, 0.06, 0.6, 0.06, "#965b48", -0.5);
          put(body, 0.4, 0.72, 0.35, 0.06, 0.65, 0.06, "#965b48", 0.4);
          put(dark, -0.31, 1.01, 0.35, 0.32, 0.08, 0.17);
          put(steel, 0.27, 1.08, 0.35, 0.06, 0.1, 0.36);
        }
      }
    }
    const groups = [{ items: paving, color: restored ? "#888b83" : "#747568" }, { items: paint, color: "#dfd8bb" },
      { items: steel, color: "#858d8b", metal: true }, { items: dark, color: "#303d40" }, { items: body, color: "#c2c6ba" }, { items: wheels, color: "#343835", round: true }];
    return groups.filter(g => g.items.length).map(g => buildInstances(g.round ? new TorusGeometry(0.27, 0.07, 6, 10) : new BoxGeometry(),
      new MeshStandardMaterial({ color: g.color, roughness: g.metal ? 0.45 : 0.8, metalness: g.metal ? 0.5 : 0 }), g.items, { receive: true }));
  }, [plan, low, open, working, restored, property.tenants.length, property.capacity]);
  useEffect(() => () => meshes.forEach(m => { m.geometry.dispose(); (m.material as MeshStandardMaterial).dispose(); m.dispose(); }), [meshes]);
  return <group>{meshes.map((mesh, i) => <primitive key={i} object={mesh} raycast={() => null} />)}</group>;
}
