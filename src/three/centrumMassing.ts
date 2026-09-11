import type { Parcel } from "../engine/city";
const FLOOR_HEIGHT = 3;
export function centrumMassing(parcel: Parcel, seed: number) {
  const [sx, sz] = [
    parcel.edges.s ? 0 : parcel.edges.n ? 0 : parcel.edges.e ? 1 : parcel.edges.w ? -1 : 0,
    parcel.edges.s ? 1 : parcel.edges.n ? -1 : parcel.edges.e || parcel.edges.w ? 0 : 1,
  ];
  // Gårdsflygel: om tomten har en insida (motsatt gatusida) dras
  // huvudvolymen mot gatan och en låg flygel fyller gårdssidan.
  const hasInside =
    (sz !== 0 && !(parcel.edges.n && parcel.edges.s)) ||
    (sx !== 0 && !(parcel.edges.e && parcel.edges.w));
  const mainD = hasInside && sz !== 0 ? parcel.d * 0.68 : parcel.d;
  const mainW = hasInside && sx !== 0 ? parcel.w * 0.68 : parcel.w;
  const offX = hasInside && sx !== 0 ? (sx * (parcel.w - mainW)) / 2 : 0;
  const offZ = hasInside && sz !== 0 ? (sz * (parcel.d - mainD)) / 2 : 0;
  const wingH = FLOOR_HEIGHT * (1 + (seed % 2));
  const wingW = sx !== 0 ? parcel.w - mainW : parcel.w * 0.86;
  const wingD = sz !== 0 ? parcel.d - mainD : parcel.d * 0.86;
  // Hörntorn: tomter i gatukors (två angränsande gatusidor) får ett runt
  // torn med tälttak – stenstadens klassiska accent mot korsningen.
  const ex = parcel.edges.e ? 1 : parcel.edges.w ? -1 : 0;
  const ez = parcel.edges.s ? 1 : parcel.edges.n ? -1 : parcel.edges.e || parcel.edges.w ? 0 : 1;
  const turret = ex !== 0 && ez !== 0 && seed % 3 !== 0;
  return { sx, sz, hasInside, mainD, mainW, offX, offZ, wingH, wingW, wingD, ex, ez, turret };
}
