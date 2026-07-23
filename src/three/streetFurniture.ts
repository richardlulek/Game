/* ============================================================
   Gatumöblering: rena tomtkanter och in-/utfarter.

   Tidigare fick varje tomt bara trottoarboxar på de sidor som
   vette mot gata – vilket gav fragmenterade, hackiga kanter och
   ingen tydlig infart. Här läggs två lager till, båda ren
   placeringslogik (testbar, instansierad i StaticCity):

   · TOMTKANT: en tunn, jämn kantsten runt HELA det bebyggda
     kvarterets tomt, så övergången gräs → tomt → trottoar läses
     som en avsiktlig fastighetsgräns.
   · INFART: en asfalterad platta på tomtens primära gatusida som
     binder ihop huset med trottoaren – en tydlig in-/utfart.

   Ren logik, inga React-beroenden.
   ============================================================ */

import { PARCELS, ZONE_DEFS, type Parcel } from "../engine/city";

export interface FurnitureInst {
  x: number; y: number; z: number;
  sx: number; sy: number; sz: number;
}

/** Trottoarbredd per distrikt (samma regel som Sidewalks). */
export function sidewalkWidth(district: string): number {
  const street = ZONE_DEFS.find((z) => z.district === district)?.street ?? 10;
  return Math.min(3, Math.max(1, street * 0.19));
}

/** Kantstenens bredd (den synliga lippen mot gräs/trottoar). */
export const KERB_W = 0.5;
/** Kantstenshöjd – en aning över trottoaren så kanten fångar ljus. */
export const KERB_H = 0.26;

/** Tunn kantsten längs de sidor av en bebyggd tomt som vetter mot gata –
 *  en crisp lip där tomten möter trottoaren. Inre kvartersgränser (mellan
 *  två hus mitt i kvarteret) får ingen kantsten; där finns ingen gata. */
export function plotKerbInstances(hasBuilding: (p: Parcel) => boolean): FurnitureInst[] {
  const items: FurnitureInst[] = [];
  for (const p of PARCELS) {
    if (!hasBuilding(p)) continue;
    const e = p.edges;
    const hw = p.w / 2 + KERB_W / 2;
    const hd = p.d / 2 + KERB_W / 2;
    const drive = drivewayFootprint(p);
    // En kant längs en gatusida – delad i två stumpar om infarten korsar
    // (sänkt kantsten vid överfarten). `full` = längden längs sidan.
    const edge = (
      cross: "x" | "z", fixed: number, center: number, full: number, cut: number | null,
    ) => {
      const half = full / 2;
      const raw: [number, number][] = cut == null
        ? [[-half, half]]
        : [[-half, -cut / 2], [cut / 2, half]];
      const segs = raw.filter(([a, b]) => b - a > 0.3);
      for (const [a, b] of segs) {
        const len = b - a;
        const off = (a + b) / 2;
        if (cross === "x") items.push({ x: center + off, y: KERB_H / 2, z: fixed, sx: len, sy: KERB_H, sz: KERB_W });
        else items.push({ x: fixed, y: KERB_H / 2, z: center + off, sx: KERB_W, sy: KERB_H, sz: len });
      }
    };
    const cutFor = (side: "n" | "s" | "e" | "w") => (drive?.edge === side ? drive.width + 1 : null);
    if (e.n) edge("x", p.z - hd, p.x, p.w + KERB_W * 2, cutFor("n"));
    if (e.s) edge("x", p.z + hd, p.x, p.w + KERB_W * 2, cutFor("s"));
    if (e.w) edge("z", p.x - hw, p.z, p.d, cutFor("w"));
    if (e.e) edge("z", p.x + hw, p.z, p.d, cutFor("e"));
  }
  return items;
}

/** Tomtens primära gatusida: söder föredras (mot betraktaren), sedan
 *  norr, öster, väster. Returnerar null om ingen sida vetter mot gata. */
export function primaryStreetEdge(p: Parcel): "n" | "s" | "e" | "w" | null {
  const e = p.edges;
  if (e.s) return "s";
  if (e.n) return "n";
  if (e.e) return "e";
  if (e.w) return "w";
  return null;
}

/** Infartens fotavtryck: vilken sida och hur bred. Delas mellan infarts-
 *  plattan och tomtkanten (så kanten kan lämna en öppning – sänkt kantsten). */
export function drivewayFootprint(p: Parcel): { edge: "n" | "s" | "e" | "w"; width: number } | null {
  const edge = primaryStreetEdge(p);
  if (!edge) return null;
  const along = edge === "n" || edge === "s" ? p.w : p.d;
  return { edge, width: Math.min(Math.max(along * 0.32, 3.5), 7) };
}

/** En asfalterad infartsplatta på tomtens primära gatusida, som spänner
 *  från tomtkanten ut över trottoaren till gatan. Bredden skalar med
 *  tomten men hålls måttlig så det blir en infart, inte en hel framsida. */
export function drivewayInstances(hasBuilding: (p: Parcel) => boolean): FurnitureInst[] {
  const items: FurnitureInst[] = [];
  for (const p of PARCELS) {
    if (!hasBuilding(p)) continue;
    const drive = drivewayFootprint(p);
    if (!drive) continue;
    const sw = sidewalkWidth(p.district);
    // Överbrygga: från en bit in på tomten, ut över trottoaren (+ liten
    // marginal in i gatan) så plattan möter körbanan sömlöst.
    const span = sw + 1.4;
    const { edge, width: dw } = drive;
    if (edge === "n" || edge === "s") {
      const sign = edge === "s" ? 1 : -1;
      const inner = p.d / 2 - 0.7; // startar strax innanför tomtkanten
      const z = p.z + sign * (inner + span / 2);
      items.push({ x: p.x, y: 0.11, z, sx: dw, sy: 0.16, sz: span });
    } else {
      const sign = edge === "e" ? 1 : -1;
      const inner = p.w / 2 - 0.7;
      const x = p.x + sign * (inner + span / 2);
      items.push({ x, y: 0.11, z: p.z, sx: span, sy: 0.16, sz: dw });
    }
  }
  return items;
}
