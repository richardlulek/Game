import { propertyBoundaries } from "./propertyBoundaries";
import { useEffect, useMemo } from "react";
import { BoxGeometry, Color, MeshStandardMaterial, SphereGeometry } from "three";
import type { Parcel } from "../engine/city";
import type { Property } from "../engine/types";
import { useUiStore } from "../store/uiStore";
import { buildInstances, type Inst } from "./meshHelpers";
import { GroundAmenities } from "./GroundAmenities";
import { parcelHash } from "../engine/city";
import { groundsPlan } from "./groundsLayout";
import { DISTRICT_FRONTAGES, frontageState } from "./frontageDesign";

/** Ground embellishment has no picking handlers: the parcel remains clickable.
 * All placement comes from a deterministic collision-checked plan. */
export function PropertyGround({ parcel, property }: { parcel: Parcel; property: Property }) {
  const plan = useMemo(() => groundsPlan(parcel, property.type), [parcel, property.type]);
  const low = useUiStore(s => s.graphics === "low");
  const evening = useUiStore(s => s.lightMode === "evening");
  const { restored, worn, open, working } = frontageState(property);
  const style = DISTRICT_FRONTAGES[parcel.district] ?? DISTRICT_FRONTAGES.kulle;
  const industrial = parcel.district === "industri" || parcel.district === "hamnen";
  const meshes = useMemo(() => {
    const stone: Inst[] = [], joints: Inst[] = [], soil: Inst[] = [], plants: Inst[] = [], metal: Inst[] = [], lamps: Inst[] = [];
    for (const r of plan.paving) {
      stone.push({ x: r.x, y: 0.157, z: r.z, sx: r.w, sy: 0.025, sz: r.d });
      if (!low) {
        const horizontal = r.w > r.d, length = horizontal ? r.w : r.d;
        for (let offset = 0.4; offset < length - 0.2; offset += restored ? 0.8 : 1.1) {
          joints.push({ x: r.x + (horizontal ? offset - length / 2 : 0), y: 0.173, z: r.z + (horizontal ? 0 : offset - length / 2),
            sx: horizontal ? 0.025 : r.w * 0.85, sy: 0.006, sz: horizontal ? r.d * 0.85 : 0.025 });
        }
      }
    }
    for (const [i, r] of (low ? plan.beds.slice(0, 2) : plan.beds).entries()) {
      stone.push({ x: r.x, y: 0.29, z: r.z, sx: r.w, sy: 0.3, sz: r.d });
      soil.push({ x: r.x, y: 0.452, z: r.z, sx: r.w - 0.14, sy: 0.025, sz: r.d - 0.14 });
      if (!industrial) {
        plants.push({ x: r.x, y: restored ? 0.7 : 0.85, z: r.z, sx: 0.42, sy: restored ? 0.3 + ((parcelHash(parcel.id) + i) % 3) * 0.2 : 0.65, sz: 0.55 });
        if (restored && !low && !working) for (const side of [-1, 1]) plants.push({
          x: r.x + side * 0.2, y: 0.98, z: r.z + side * 0.28, sx: 0.12, sy: 0.12, sz: 0.12,
          color: new Color(i % 2 ? "#d6b0b3" : "#e3ce99"),
        });
      } else if (!low) {
        // Gravel service island with a low steel fitting; no invented garden.
        metal.push({ x: r.x, y: 0.66, z: r.z, sx: 0.38, sy: 0.44, sz: 0.55 });
      }
      if (restored && open && !working && i % 2 === 0 && !low) {
        metal.push({ x: r.x, y: 1.03, z: r.z - 0.55, sx: 0.14, sy: 1.15, sz: 0.14 });
        lamps.push({ x: r.x, y: 1.53, z: r.z - 0.55, sx: 0.2, sy: 0.18, sz: 0.2 });
      }
    }
    for(const r of propertyBoundaries(parcel,plan)) soil.push({x:r.x,y:.52,z:r.z,sx:r.w,sy:.75,sz:r.d});
    const groups = [
      { items: stone, color: restored ? style.stone : "#827f70" },
      { items: joints, color: worn ? "#504d41" : "#8c8b80" },
      { items: soil, color: industrial ? "#767971" : "#747567" },
      { items: plants, color: restored ? "#526c4c" : "#7b8050", round: true },
      { items: metal, color: style.frame, metal: true },
      { items: lamps, color: "#efd9ab", glow: true },
    ];
    return groups.filter(g => g.items.length).map(g => buildInstances(g.round ? new SphereGeometry(1, 7, 5) : new BoxGeometry(),
      new MeshStandardMaterial({ color: g.color, roughness: g.metal ? 0.45 : 0.94, metalness: g.metal ? 0.5 : 0,
        emissive: g.glow && evening ? "#edc68c" : "#000000", emissiveIntensity: g.glow && evening ? 0.85 : 0 }),
      g.items, { receive: true }));
  }, [plan, parcel.id, low, evening, restored, worn, open, working, style, industrial]);
  useEffect(() => () => meshes.forEach(m => { m.geometry.dispose(); (m.material as MeshStandardMaterial).dispose(); m.dispose(); }), [meshes]);
  return <group><GroundAmenities plan={plan} property={property} />{meshes.map((mesh, i) => <primitive key={i} object={mesh} raycast={() => null} />)}</group>;
}
