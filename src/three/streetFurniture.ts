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
/** Kantstenshöjd. Trottoaren toppar på 0.20; kantstenen ligger bara en
 *  hårsmån över (0.21) så den läses som en diskret lip, inte en mur. Den
 *  tidigare höjden 0.26 stack upp som en klump på gatunivå. */
export const KERB_H = 0.21;

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

/** En platt asfaltinfart som PAVAR trottoaren mellan tomtkanten och gatan –
 *  den fyller den sänkta kantstenens öppning. Den ligger i höjd med
 *  trottoaren (topp ~0.22, precis proud) och sträcker sig ALDRIG ut i
 *  körbanan; den slutar exakt vid gatukanten. Tidigare stack den upp som en
 *  hög grå kloss 0.7 enheter in i gatan – vilket såg ut som ett hinder. */
export function drivewayInstances(hasBuilding: (p: Parcel) => boolean): FurnitureInst[] {
  const items: FurnitureInst[] = [];
  for (const p of PARCELS) {
    if (!hasBuilding(p)) continue;
    const drive = drivewayFootprint(p);
    if (!drive) continue;
    const sw = sidewalkWidth(p.district);
    const { edge, width: dw } = drive;
    // Trottoaren löper från tomtkanten (halva djupet/bredden) och sw utåt.
    // Infarten går från en aning in på tomten till exakt gatukanten.
    const span = sw + 0.2;      // trottoarbredd + liten bit in på tomten
    const y = 0.19, sy = 0.06;  // topp 0.22, strax över trottoarens 0.20
    if (edge === "n" || edge === "s") {
      const sign = edge === "s" ? 1 : -1;
      const center = p.d / 2 + sw / 2 - 0.1; // mitt i trottoaren, dragen 0.1 inåt
      items.push({ x: p.x, y, z: p.z + sign * center, sx: dw, sy, sz: span });
    } else {
      const sign = edge === "e" ? 1 : -1;
      const center = p.w / 2 + sw / 2 - 0.1;
      items.push({ x: p.x + sign * center, y, z: p.z, sx: span, sy, sz: dw });
    }
  }
  return items;
}
