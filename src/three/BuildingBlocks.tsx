/* ============================================================
   Bygg-LOD: i översikt kollapsas alla färdiga hus (egna, rivalers,
   till-salu) till TVÅ InstancedMesh:ar – kroppar + takkapsyler – i
   stället för hundratals fulla DistrictBuilding-komponenter med 5–7
   meshar var. Hundratals draw calls blir 2. Blocken är klickgenomsläppliga
   (raycast av) så tomtplattorna under sköter markering; full detalj
   återkommer när man zoomar in (lodFar → false, ParcelNode ritar husen).
   ============================================================ */

import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, type InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import { PARCELS, parcelById, parcelHash, type Parcel } from "../engine/city";
import { FLOOR_HEIGHT } from "./BuildingShapes";
import { districtFloors } from "./districtBuildings";
import { RIVAL_COLORS, TYPE_COLORS } from "./colors";
import type { ParcelContent } from "./ParcelNode";

const ROOF_RED = "#8a4a3a";
const ROOF_DARK = "#4a4540";
const CAP = PARCELS.length; // fast övre gräns – slipper remonta vid husändringar

interface Block { x: number; z: number; w: number; d: number; h: number; body: string; roof: string; }

/** Grå-lerp mot slitet efter skick (samma som ParcelNode.facadeColor). */
function fade(base: string, condition: number): string {
  const c = new Color(base);
  c.lerp(new Color("#6f6a61"), ((100 - condition) / 100) * 0.55);
  return `#${c.getHexString()}`;
}

/** Blockdata för ett hus – null om tomten inte har ett färdigt hus. */
function blockFor(parcel: Parcel, content: ParcelContent, overlayActive: boolean): Block | null {
  if (!("prop" in content)) return null;
  const p = content.prop;
  if (p.status !== "klar" || p.signature) return null;
  const hash = parcelHash(parcel.id);
  const floors = districtFloors(parcel, hash, p.area) + (p.devLevel ?? 0) * 2;
  const base = content.kind === "rival"
    ? RIVAL_COLORS[content.ownerIndex % RIVAL_COLORS.length]
    : fade(TYPE_COLORS[p.type], p.condition);
  const body = overlayActive
    ? (content.kind === "owned" && content.tint ? content.tint : "#a8adb0")
    : base;
  const roof = overlayActive ? body : (p.type === "bostad" || p.type === "butik" ? ROOF_RED : ROOF_DARK);
  return { x: parcel.x, z: parcel.z, w: parcel.w * 0.86, d: parcel.d * 0.86, h: floors * FLOOR_HEIGHT, body, roof };
}

export function BuildingBlocks({ byParcel, overlayActive }: {
  byParcel: Map<string, ParcelContent>;
  overlayActive: boolean;
}) {
  const bodies = useRef<InstancedMesh>(null);
  const roofs = useRef<InstancedMesh>(null);

  const blocks = useMemo(() => {
    const out: Block[] = [];
    for (const [pid, content] of byParcel) {
      const parcel = parcelById(pid);
      if (!parcel) continue;
      const b = blockFor(parcel, content, overlayActive);
      if (b) out.push(b);
    }
    return out;
  }, [byParcel, overlayActive]);

  useLayoutEffect(() => {
    const bm = bodies.current, rm = roofs.current;
    if (!bm || !rm) return;
    const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), p = new Vector3(), col = new Color();
    blocks.forEach((b, i) => {
      p.set(b.x, 0.14 + b.h / 2, b.z); s.set(b.w, b.h, b.d);
      bm.setMatrixAt(i, m.compose(p, q, s)); bm.setColorAt(i, col.set(b.body));
      const rh = Math.max(1.3, b.h * 0.14);
      p.set(b.x, 0.14 + b.h + rh / 2 - 0.35, b.z); s.set(b.w * 0.98, rh, b.d * 0.98);
      rm.setMatrixAt(i, m.compose(p, q, s)); rm.setColorAt(i, col.set(b.roof));
    });
    bm.count = blocks.length; rm.count = blocks.length;
    bm.instanceMatrix.needsUpdate = true; rm.instanceMatrix.needsUpdate = true;
    if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
    if (rm.instanceColor) rm.instanceColor.needsUpdate = true;
  }, [blocks]);

  return (
    <>
      <instancedMesh ref={bodies} args={[undefined, undefined, CAP]} raycast={() => null} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={roofs} args={[undefined, undefined, CAP]} raycast={() => null} castShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </>
  );
}
