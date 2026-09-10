import { parcelHash, type Parcel } from "../engine/city";

/** Same dimensions and orientation as the architecture families. Courtyard
 * and quay buildings have fixed entrances even when another edge faces a road. */
export function streetFront(parcel: Parcel) {
  const seed = parcelHash(parcel.id) >> 3;
  let w = parcel.w, d = parcel.d, x = 0, z = 0;
  let fixedSouth = false;
  switch (parcel.district) {
    case "innerstad": w *= 0.96; d *= 0.96; break;
    case "finans": { const scale = seed % 2 === 0 ? 0.92 : 0.72; w *= scale; d *= scale; break; }
    case "industri": w *= 0.92; d *= 0.8; break;
    case "hamnen": w *= 0.9; d *= 0.78; fixedSouth = true; break;
    case "kulle": w *= 0.55; d *= 0.55; fixedSouth = true; break;
    case "förort": {
      const perRow = Math.ceil((4 + seed % 3) / 2);
      w = parcel.w / perRow - 4.5; d = 9;
      x = -parcel.w / 2 + 0.5 * parcel.w / perRow;
      z = -parcel.d / 2 + d / 2 + 2.5;
      fixedSouth = true; break;
    }
  }
  if (fixedSouth || parcel.edges.s) return { rotation: 0, width: w, depth: d, x, z };
  if (parcel.edges.n) return { rotation: Math.PI, width: w, depth: d, x, z };
  if (parcel.edges.e) return { rotation: Math.PI / 2, width: d, depth: w, x, z };
  if (parcel.edges.w) return { rotation: -Math.PI / 2, width: d, depth: w, x, z };
  return null;
}
