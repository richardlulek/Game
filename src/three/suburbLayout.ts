import { parcelHash, type Parcel } from "../engine/city";

export function suburbLayout(parcel: Parcel, seed = parcelHash(parcel.id) >> 3) {
  // A 22-unit plot fits two long apartment blocks, not six narrow towers.
  const columns = Math.max(1, Math.min(2, Math.floor((parcel.w - 4) / 16)));
  const count = columns * 2;
  const width = (parcel.w - 4 - (columns - 1) * 3) / columns;
  // Reserve a usable central courtyard even on small 24-unit-deep parcels.
  const depth = Math.min(9, Math.max(3, (parcel.d - 9) / 2));
  const houses = Array.from({ length: count }, (_, i) => ({
    x: -parcel.w / 2 + 2 + width / 2 + i % columns * (width + 3),
    z: i < columns ? -parcel.d / 2 + depth / 2 + 2.5 : parcel.d / 2 - depth / 2 - 2.5,
    w: width, d: depth,
  }));
  return { houses, columns, depth, seed, trees: [{ x: -parcel.w * 0.22, z: 0 }, { x: parcel.w * 0.22, z: 0 }] };
}

export function suburbFloors(floors: number, seed: number, row: number) {
  const base = Math.max(3, Math.min(5, Math.round(floors)));
  return Math.max(3, base - (row === 1 && seed % 4 === 1 ? 1 : 0));
}
