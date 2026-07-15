/* ============================================================
   Stadskarta 3.0 – deterministisk spatial modell i tre nivåer:
   distrikt (zon) → kvarter (block) → tomtrutor (parcels).

   Sju distrikt med egen kvartersstruktur:
   Centrum      slutna kvarter 3×2 tomter som delar väggar
   Finans       fristående skyskrapetomter i tätt rutnät
   Innerstad    kvarter 2×2 tomter, blandstad
   Hamnen       kajnära rad längs vattnet
   Industri     stora fristående industritomter
   Förorten     hela kvarter = EN fastighet (kvartersköp)
   Villakullen  små villatomter

   Synliga objekt (portfölj, marknad, tomter, konkurrentinnehav)
   placeras på tomtrutor via placeCity(); världspoolen är abstrakt
   och tar ingen plats förrän objekt avslöjas.
   Ren TypeScript utan React- eller Three-beroenden.
   ============================================================ */

import { ENERGY_SITES } from "./industryData";
import type { GameState, IndustryAsset } from "./types";

/** En tomtruta på kartan (världskoordinater, centrum i x/z). */
export interface Parcel {
  id: string;
  district: string;
  x: number;
  z: number;
  w: number;
  d: number;
  /** Kvarteret tomten ingår i. */
  blockId: string;
  /** Vilka sidor som vetter mot gata (kvarterets ytterkant). */
  edges: { n: boolean; e: boolean; s: boolean; w: boolean };
  /** Expansionskvarter: låst tills detaljplanen auktionerats ut. */
  expansion?: boolean;
}

/** Ett distrikts zon på kartan (centrum i x/z, total bredd/djup). */
export interface DistrictZone {
  district: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Gatusegment (används av 3D-vyn för kvartersgator). */
export interface StreetSeg {
  x: number;
  z: number;
  w: number;
  d: number;
  district: string;
}

interface ZoneDef {
  district: string;
  cx: number;
  cz: number;
  /** Kvartersrutnät. */
  blockCols: number;
  blockRows: number;
  /** Tomter per kvarter. */
  parcelCols: number;
  parcelRows: number;
  /** Tomtstorlek. */
  parcelW: number;
  parcelD: number;
  /** Mellanrum mellan tomter i samma kvarter (0 = delar vägg). */
  innerGap: number;
  /** Gatubredd mellan kvarteren. */
  street: number;
}

const ZONES: ZoneDef[] = [
  // ~490 tomter totalt: samma fotavtryck och byggt/obyggt-förhållande som förr,
  // men tätare rutnät (mindre tomter + smalare gator) så staden rymmer fler.
  // Centrum: slutna kvarter à 3×2 tomter som delar väggar
  { district: "centrum", cx: 0, cz: 10, blockCols: 4, blockRows: 4, parcelCols: 3, parcelRows: 2, parcelW: 17, parcelD: 17, innerGap: 0, street: 12 },
  // Finansdistriktet: skyskrapetomter i tätt rutnät, sydost mot vattnet.
  // Skjutet österut så det syns en tydlig aveny mellan Centrum och Finans.
  { district: "finans", cx: 280, cz: 120, blockCols: 8, blockRows: 6, parcelCols: 1, parcelRows: 1, parcelW: 19, parcelD: 19, innerGap: 0, street: 9 },
  // Innerstaden: kvarter à 2×2 tomter norr om centrum
  { district: "innerstad", cx: -10, cz: -185, blockCols: 7, blockRows: 4, parcelCols: 2, parcelRows: 2, parcelW: 17, parcelD: 17, innerGap: 0, street: 11 },
  // Hamnen: kajnära rad längs vattnet (förskjuten öster om HK)
  { district: "hamnen", cx: 40, cz: 262, blockCols: 19, blockRows: 3, parcelCols: 1, parcelRows: 1, parcelW: 17, parcelD: 17, innerGap: 0, street: 7 },
  // Industriområdet: stora fristående tomter i nordost
  { district: "industri", cx: 320, cz: -150, blockCols: 9, blockRows: 5, parcelCols: 1, parcelRows: 1, parcelW: 27, parcelD: 27, innerGap: 0, street: 9 },
  // Förorten: storkvarter i väst – varje tomt är ETT helt kvarter.
  // Dubbelt så många kvarter (30→63) med samma fotavtryck (tätare, mindre).
  { district: "förort", cx: -295, cz: 55, blockCols: 9, blockRows: 7, parcelCols: 1, parcelRows: 1, parcelW: 22, parcelD: 24, innerGap: 0, street: 8 },
  // Villakullen: villatomter i nordvästra hörnet.
  // Dubbelt så många villatomter (99→192) med samma fotavtryck.
  { district: "kulle", cx: -330, cz: -210, blockCols: 16, blockRows: 12, parcelCols: 1, parcelRows: 1, parcelW: 10, parcelD: 12, innerGap: 0, street: 6 },
];

export const ZONE_DEFS: readonly ZoneDef[] = ZONES;
export type { ZoneDef };

/**
 * Expansionskvarter – mark utanför de färdiga kvarteren. Två slag:
 *  · "kommunal": kommunen planlägger och släpper via detaljplaneauktion
 *  · "plan": privat råmark (åker/äng) – spelaren kan köpa marken och
 *    driva EGEN detaljplan genom planprocessen (cityPlan.ts)
 * Låsta (obyggbara) tills de vunnits i auktion respektive vunnit laga kraft.
 */
export interface ExpansionDef {
  blockId: string;
  district: string;
  cx: number;
  cz: number;
  parcelCols: number;
  parcelRows: number;
  parcelW: number;
  parcelD: number;
  kind: "kommunal" | "plan";
  /** Nära vattnet → strandskydd kan bli en utmaning i planprocessen. */
  waterfront?: boolean;
}

// Dubbelt så många tomter i varje expansionskvarter (kommunal + planmark):
// finare uppdelning med OFÖRÄNDRAT fotavtryck, så geometrivakten håller.
const EXPANSIONS: ExpansionDef[] = [
  { blockId: "innerstad-exp0", district: "innerstad", cx: -73, cz: -311, parcelCols: 2, parcelRows: 4, parcelW: 24, parcelD: 12, kind: "kommunal" },
  { blockId: "industri-exp0", district: "industri", cx: 270, cz: 0, parcelCols: 2, parcelRows: 1, parcelW: 19, parcelD: 38, kind: "kommunal" },
  { blockId: "innerstad-exp1", district: "innerstad", cx: 53, cz: -311, parcelCols: 2, parcelRows: 4, parcelW: 24, parcelD: 12, kind: "kommunal" },
  { blockId: "förort-exp0", district: "förort", cx: -357.5, cz: 217.5, parcelCols: 2, parcelRows: 1, parcelW: 26, parcelD: 52, kind: "kommunal" },
  { blockId: "industri-exp1", district: "industri", cx: 370, cz: 0, parcelCols: 2, parcelRows: 1, parcelW: 19, parcelD: 38, kind: "kommunal" },
  // Planområden: privat råmark i stadens utkanter.
  // Planmark i luckan mellan Villakullen och Förorten – låg och centrerad i
  // gapet så att den inte skär in i något av distrikten.
  { blockId: "kulle-plan0", district: "kulle", cx: -420, cz: -79, parcelCols: 2, parcelRows: 4, parcelW: 22, parcelD: 8, kind: "plan" },
  { blockId: "förort-plan0", district: "förort", cx: -462, cz: 90, parcelCols: 2, parcelRows: 1, parcelW: 26, parcelD: 52, kind: "plan" },
  { blockId: "innerstad-plan0", district: "innerstad", cx: -10, cz: -365, parcelCols: 2, parcelRows: 4, parcelW: 24, parcelD: 12, kind: "plan" },
  { blockId: "finans-plan0", district: "finans", cx: 445, cz: 120, parcelCols: 2, parcelRows: 4, parcelW: 26, parcelD: 13, kind: "plan" },
  { blockId: "industri-plan0", district: "industri", cx: 510, cz: -40, parcelCols: 2, parcelRows: 1, parcelW: 19, parcelD: 38, kind: "plan" },
  { blockId: "industri-plan1", district: "industri", cx: 510, cz: -220, parcelCols: 2, parcelRows: 1, parcelW: 19, parcelD: 38, kind: "plan" },
  { blockId: "hamnen-plan0", district: "hamnen", cx: 300, cz: 265, parcelCols: 2, parcelRows: 2, parcelW: 24, parcelD: 12, kind: "plan", waterfront: true },
];

/** Auktionsordningen för de KOMMUNALA expansionskvarteren. */
export const EXPANSION_BLOCKS = EXPANSIONS.filter((e) => e.kind === "kommunal").map((e) => ({
  blockId: e.blockId,
  district: e.district,
  parcels: e.parcelCols * e.parcelRows,
}));

/** Planområdena – råmark för spelarens egen detaljplansprocess. */
export const PLAN_AREAS: ExpansionDef[] = EXPANSIONS.filter((e) => e.kind === "plan");

/** Slår upp expansionskvarterets definition (kommunal eller plan). */
export const expansionByBlock = (blockId: string): ExpansionDef | undefined =>
  EXPANSIONS.find((e) => e.blockId === blockId);

function blockSize(z: ZoneDef): { w: number; d: number } {
  return {
    w: z.parcelCols * z.parcelW + (z.parcelCols - 1) * z.innerGap,
    d: z.parcelRows * z.parcelD + (z.parcelRows - 1) * z.innerGap,
  };
}

function zoneSize(z: ZoneDef): { w: number; d: number } {
  const b = blockSize(z);
  return {
    w: z.blockCols * b.w + (z.blockCols - 1) * z.street,
    d: z.blockRows * b.d + (z.blockRows - 1) * z.street,
  };
}

export const DISTRICT_ZONES: DistrictZone[] = ZONES.map((z) => {
  const s = zoneSize(z);
  return { district: z.district, x: z.cx, z: z.cz, w: s.w, d: s.d };
});

function buildParcels(): Parcel[] {
  const out: Parcel[] = [];
  for (const zn of ZONES) {
    const b = blockSize(zn);
    const s = zoneSize(zn);
    let i = 0;
    for (let br = 0; br < zn.blockRows; br++) {
      for (let bc = 0; bc < zn.blockCols; bc++) {
        const blockX = zn.cx - s.w / 2 + bc * (b.w + zn.street) + b.w / 2;
        const blockZ = zn.cz - s.d / 2 + br * (b.d + zn.street) + b.d / 2;
        const blockId = `${zn.district}-kv${br * zn.blockCols + bc}`;
        for (let pr = 0; pr < zn.parcelRows; pr++) {
          for (let pc = 0; pc < zn.parcelCols; pc++) {
            out.push({
              id: `${zn.district}-${i++}`,
              district: zn.district,
              x: blockX - b.w / 2 + pc * (zn.parcelW + zn.innerGap) + zn.parcelW / 2,
              z: blockZ - b.d / 2 + pr * (zn.parcelD + zn.innerGap) + zn.parcelD / 2,
              w: zn.parcelW,
              d: zn.parcelD,
              blockId,
              edges: {
                n: pr === 0,
                s: pr === zn.parcelRows - 1,
                w: pc === 0,
                e: pc === zn.parcelCols - 1,
              },
            });
          }
        }
      }
    }
  }
  // Expansionskvarteren – låsta tomter som öppnas via auktion.
  for (const ex of EXPANSIONS) {
    let i = 0;
    const bw = ex.parcelCols * ex.parcelW;
    const bd = ex.parcelRows * ex.parcelD;
    for (let pr = 0; pr < ex.parcelRows; pr++) {
      for (let pc = 0; pc < ex.parcelCols; pc++) {
        out.push({
          id: `${ex.blockId}-${i++}`,
          district: ex.district,
          x: ex.cx - bw / 2 + pc * ex.parcelW + ex.parcelW / 2,
          z: ex.cz - bd / 2 + pr * ex.parcelD + ex.parcelD / 2,
          w: ex.parcelW,
          d: ex.parcelD,
          blockId: ex.blockId,
          edges: {
            n: pr === 0,
            s: pr === ex.parcelRows - 1,
            w: pc === 0,
            e: pc === ex.parcelCols - 1,
          },
          expansion: true,
        });
      }
    }
  }
  return out;
}

/** Alla tomtrutor i staden. Deterministiskt – samma karta varje session. */
export const PARCELS: Parcel[] = buildParcels();

const BY_ID = new Map(PARCELS.map((p) => [p.id, p]));

/** Slår upp en tomtruta via id, eller undefined om id:t är okänt. */
export const parcelById = (id: string): Parcel | undefined => BY_ID.get(id);

/** Alla tomtrutor i ett distrikt. */
export const parcelsIn = (district: string): Parcel[] =>
  PARCELS.filter((p) => p.district === district);

/** Kvartersgator inne i zonerna – gatorna MELLAN kvarteren. */
export function zoneStreets(): StreetSeg[] {
  const out: StreetSeg[] = [];
  for (const zn of ZONES) {
    const b = blockSize(zn);
    const s = zoneSize(zn);
    const margin = 6; // gatorna sticker ut lite förbi kvarteren
    // Vertikala gator mellan kvarterskolumner
    for (let bc = 0; bc < zn.blockCols - 1; bc++) {
      const x = zn.cx - s.w / 2 + (bc + 1) * b.w + bc * zn.street + zn.street / 2;
      out.push({ x, z: zn.cz, w: zn.street * 0.62, d: s.d + margin, district: zn.district });
    }
    // Horisontella gator mellan kvartersrader
    for (let br = 0; br < zn.blockRows - 1; br++) {
      const z = zn.cz - s.d / 2 + (br + 1) * b.d + br * zn.street + zn.street / 2;
      out.push({ x: zn.cx, z, w: s.w + margin, d: zn.street * 0.62, district: zn.district });
    }
  }
  return out;
}

/** Beräknas en gång – gatunätet är statiskt. */
export const ZONE_STREETS: StreetSeg[] = zoneStreets();

const ZONE_BY_DISTRICT = new Map(DISTRICT_ZONES.map((z) => [z.district, z] as const));

/**
 * Grundtäthet (i %) i distriktets KÄRNA för dekorativ bebyggelse. Sänkt så att
 * staden startar med rejält med tom mark att växa in i (tillväxtfronten, Fas 1).
 * Delas av 3D-vyn (StaticCity) och tillväxtlogiken så att kartan och motorn
 * alltid är överens om vad som är bebyggt.
 */
export function ambientChanceFor(district: string): number {
  if (district === "centrum" || district === "innerstad") return 60;
  if (district === "finans" || district === "hamnen") return 50;
  return 38;
}

/** Riktning (i zonens normerade koordinater) mot vilken varje distrikt är
 *  TÄTAST bebyggt vid start: mot stadskärnan och de grannar/vägar distriktet
 *  ansluter till. Motsatt ytterkant lämnas glesare så staden har mark att
 *  växa UTÅT i – staden ser ut att ha vuxit inifrån kärnan och utåt.
 *    Villakullen  → mot Innerstaden & Förorten (sydöst)
 *    Förorten     → mot Centrum & Villakullen (nordöst)
 *    Hamnen       → mot Centrum & Finans (norr/nordöst)
 *    Industri     → mot Finans & Innerstaden (sydväst)
 *    Finans       → mot Centrum/Innerstaden (nordväst)
 *    Innerstaden  → mot Centrum (söder) */
const CORE_BIAS: Record<string, [number, number]> = {
  centrum:   [0, 0],
  finans:    [-0.9, -0.4],
  innerstad: [0.1, 1.0],
  hamnen:    [0.35, -1.0],
  industri:  [-0.85, 0.55],
  förort:    [0.64, -0.77],
  kulle:     [0.80, 0.60], // mot Innerstaden/Centrum (sydost), bort från vattentornet (norr)
};

/** Bär tomten ett dekorhus? Deterministiskt ur tomt-hashen, plus de hus som
 *  vuxit fram organiskt under spelets gång (ambientGrown). Tätheten är högst i
 *  kärnan och på den sida som vetter mot stadens mitt/grannar, och avtar mot
 *  ytterkanten – så staden lutar inåt och har mark att breda ut sig UTÅT i. */
export function hasAmbientBuilding(p: Parcel, grown?: ReadonlySet<string>): boolean {
  if (p.expansion) return false;
  if (grown?.has(p.id)) return true;
  const zone = ZONE_BY_DISTRICT.get(p.district);
  let chance = ambientChanceFor(p.district);
  if (zone) {
    const nx = (p.x - zone.x) / Math.max(1, zone.w / 2);
    const nz = (p.z - zone.z) / Math.max(1, zone.d / 2);
    const [bx, bz] = CORE_BIAS[p.district] ?? [0, 0];
    const dir = nx * bx + nz * bz;                 // + mot kärnan, − mot ytterkanten
    const edge = Math.max(Math.abs(nx), Math.abs(nz));
    // Starkare riktningsvikt → tydligare lutning inåt, glesare ytterkant.
    chance *= Math.max(0.08, Math.min(1.05, 1 - 0.5 * edge + 0.7 * dir));
  }
  return parcelHash(p.id) % 100 < chance;
}

/** Tomt-id:n som upptas av spelobjekt (ägda/annonser/tomter/rivaler).
 *  Stadsdelsprojekt (pågående och invigda) tar HELA sitt kvarter i anspråk –
 *  signaturfastigheten bär bara en tomtruta men arkitekturen fyller kvarteret. */
export function occupiedParcelIds(state: GameState): Set<string> {
  const used = new Set<string>();
  for (const p of state.portfolio) if (p.parcelId) used.add(p.parcelId);
  for (const p of state.listings) if (p.parcelId) used.add(p.parcelId);
  for (const l of state.lots) if (l.parcelId) used.add(l.parcelId);
  for (const c of state.competitors)
    for (const p of c.portfolio ?? []) if (p.parcelId) used.add(p.parcelId);
  // Energiparker står på fasta lägen utanför rutnätet – bara stadsindustrier
  // (hotell/logistik) upptar tomtrutor.
  for (const a of state.industryPortfolio ?? [])
    if (a.parcelId && a.sector !== "energi") used.add(a.parcelId);
  for (const a of state.industryListings ?? [])
    if (a.parcelId && a.sector !== "energi") used.add(a.parcelId);
  const projectBlocks = new Set([
    ...(state.cityProjects ?? []).map((x) => x.blockId),
    ...(state.signatureBlocks ?? []).map((x) => x.blockId),
  ]);
  if (projectBlocks.size > 0)
    for (const p of PARCELS) if (projectBlocks.has(p.blockId)) used.add(p.id);
  return used;
}

/** Helt obebyggda, upplåsta tomtrutor (varken spelobjekt eller dekorhus).
 *  Parktomter (avstådda i planprocesser) räknas aldrig som byggbara. */
export function emptyParcels(state: GameState): Parcel[] {
  const used = occupiedParcelIds(state);
  const unlocked = new Set(state.unlockedBlocks ?? []);
  const grown = new Set(state.ambientGrown ?? []);
  const park = new Set(state.parkParcels ?? []);
  return PARCELS.filter(
    (p) =>
      (!p.expansion || unlocked.has(p.blockId)) &&
      !used.has(p.id) &&
      !park.has(p.id) &&
      !hasAmbientBuilding(p, grown),
  );
}

/** Distrikt som fortfarande har obebyggd mark – nyproduktion och nya
 *  tomter styrs hit så att bebyggda tomter aldrig behöver återanvändas. */
export function districtsWithSpace(state: GameState): Set<string> {
  return new Set(emptyParcels(state).map((p) => p.district));
}

/**
 * Slumpar en ledig tomtruta i distriktet och markerar den som upptagen
 * i det medskickade settet. Staden växer naturligt: obebyggd mark
 * (parker och lediga fält) bebyggs FÖRST. Dekorhus (privatägda) tas
 * bara i anspråk om distriktet är helt fullt, och en redan upptagen
 * ruta återanvänds enbart som krasch-skydd – nygenereringen styrs
 * numera till distrikt med ledig mark (districtsWithSpace).
 */
export function claimRandomParcel(
  district: string,
  occupied: Set<string>,
  allowed?: (p: Parcel) => boolean,
  grown?: ReadonlySet<string>,
  preferAmbient = false,
): Parcel {
  const all = parcelsIn(district).filter((p) => (allowed ? allowed(p) : !p.expansion));
  const free = all.filter((p) => !occupied.has(p.id));
  const empty = free.filter((p) => !hasAmbientBuilding(p, grown));
  // Befintliga hus till salu (preferAmbient): ta helst över en tomt där ett
  // privathus redan står – skylten dyker upp på ett stående hus i stället
  // för att en byggnad materialiseras ur tomma intet på obebyggd mark.
  if (preferAmbient) {
    const decor = free.filter((p) => hasAmbientBuilding(p, grown));
    if (decor.length > 0) {
      const chosen = decor[Math.floor(Math.random() * decor.length)];
      occupied.add(chosen.id);
      return chosen;
    }
  }
  const pool = empty.length ? empty : free.length ? free : all;
  // Kontinuerlig tillväxt: nya hus reser sig helst intill redan bebyggd mark i
  // distriktet, så området växer UTÅT i ett sammanhängande stråk i stället för
  // att spridas som enstaka hus. Bland de närmaste tomterna väljs en slumpvis
  // för att undvika en stelt geometrisk front.
  const anchors = parcelsIn(district).filter((p) => occupied.has(p.id));
  let chosen: Parcel;
  if (anchors.length > 0 && pool.length > 1) {
    const ranked = pool
      .map((p) => ({ p, d: Math.min(...anchors.map((a) => Math.hypot(a.x - p.x, a.z - p.z))) }))
      .sort((x, y) => x.d - y.d);
    const near = ranked.slice(0, Math.min(3, ranked.length));
    chosen = near[Math.floor(Math.random() * near.length)].p;
  } else {
    chosen = pool[Math.floor(Math.random() * pool.length)];
  }
  occupied.add(chosen.id);
  return chosen;
}

/**
 * Placerar alla synliga objekt på tomtrutor. Idempotent: objekt med
 * giltig, ledig ruta behåller den; övriga får en ledig ruta i sitt
 * distrikt. Returnerar samma referens om inget behövde ändras, så
 * funktionen kan köras efter varje reducer-action utan React-brus.
 * Världspoolen rörs aldrig – den är abstrakt tills objekt avslöjas.
 */
export function placeCity(state: GameState): GameState {
  let anyChanged = false;
  const unlocked = new Set(state.unlockedBlocks ?? []);
  const grown = new Set(state.ambientGrown ?? []);
  const park = new Set(state.parkParcels ?? []);
  const allowed = (p: Parcel) =>
    !park.has(p.id) && (!p.expansion || unlocked.has(p.blockId));

  // Pass 1: reservera VARJE redan placerad byggnads ruta – oavsett kategori och
  // ordning – så att ett nytt objekt (t.ex. en nygenererad tomt) aldrig kan
  // knuffa undan ett befintligt hus. Det var den gamla ordningsberoende
  // omplaceringen som fick hus att "hoppa" eller ersättas av tomter.
  const reserved = new Set<string>();
  const reserve = (o: { parcelId?: string }) => {
    if (o.parcelId && BY_ID.has(o.parcelId)) reserved.add(o.parcelId);
  };
  state.portfolio.forEach(reserve);
  state.lots.forEach(reserve);
  state.listings.forEach(reserve);
  for (const c of state.competitors) (c.portfolio ?? []).forEach(reserve);
  (state.industryPortfolio ?? []).forEach(reserve);
  (state.industryListings ?? []).forEach(reserve);
  // Stadsdelsprojektens kvarter är byggarbetsplats/signaturarkitektur –
  // inga nya objekt får placeras där.
  const projectBlocks = new Set([
    ...(state.cityProjects ?? []).map((x) => x.blockId),
    ...(state.signatureBlocks ?? []).map((x) => x.blockId),
  ]);
  if (projectBlocks.size > 0)
    for (const p of PARCELS) if (projectBlocks.has(p.blockId)) reserved.add(p.id);

  // Pass 2: behåll giltiga rutor, dela bara ut nya till objekt som saknar en –
  // och styr aldrig en nykomling till en ruta som redan är reserverad.
  const used = new Set<string>();
  function claimFor<T extends { district: string; parcelId?: string }>(o: T, preferAmbient: boolean): T {
    if (o.parcelId && BY_ID.has(o.parcelId) && !used.has(o.parcelId)) {
      used.add(o.parcelId);
      return o;
    }
    const occ = new Set<string>([...used, ...reserved]);
    const parcel = claimRandomParcel(o.district, occ, allowed, grown, preferAmbient);
    used.add(parcel.id);
    anyChanged = true;
    return { ...o, parcelId: parcel.id };
  }
  function placeArr<T extends { district: string; parcelId?: string }>(arr: T[], preferAmbient = false): T[] {
    let changed = false;
    const out = arr.map((o) => {
      const n = claimFor(o, preferAmbient);
      if (n !== o) changed = true;
      return n;
    });
    return changed ? out : arr;
  }

  // Ordningen ger stabilitet: spelarens objekt behåller sina rutor först.
  // Annonser är BEFINTLIGA hus som byter ägare – de tar över dekorhus när
  // sådana finns, så kartan inte får nybyggen som blinkar in och ut.
  const portfolio = placeArr(state.portfolio);
  const lots = placeArr(state.lots);
  const listings = placeArr(state.listings, true);
  // Industrier: hotell och terminaler är stadsbyggnader och får tomtrutor;
  // energiparker står på fasta lägen utanför rutnätet (ENERGY_SITES) –
  // en vindpark hör hemma på åsen, inte i ett stadskvarter.
  const siteTaken = new Set<string>(); // delas av båda listorna – ett läge per park
  function placeIndustryArr(arr: IndustryAsset[]): IndustryAsset[] {
    let changed = false;
    const out = arr.map((a) => {
      if (a.sector !== "energi") {
        const n = claimFor(a, false);
        if (n !== a) changed = true;
        return n;
      }
      if (a.siteId && ENERGY_SITES.some((s) => s.id === a.siteId) && !siteTaken.has(a.siteId)) {
        siteTaken.add(a.siteId);
        if (!a.parcelId) return a;
        changed = true;
        anyChanged = true;
        return { ...a, parcelId: undefined }; // äldre placering på tomt släpps
      }
      const site =
        ENERGY_SITES.find((s) => !siteTaken.has(s.id) && s.district === a.district) ??
        ENERGY_SITES.find((s) => !siteTaken.has(s.id));
      if (!site) return a;
      siteTaken.add(site.id);
      changed = true;
      anyChanged = true;
      return { ...a, siteId: site.id, parcelId: undefined };
    });
    return changed ? out : arr;
  }
  const industryPortfolio = placeIndustryArr(state.industryPortfolio ?? []);
  const industryListings = placeIndustryArr(state.industryListings ?? []);
  let competitorsChanged = false;
  const competitors = state.competitors.map((c) => {
    const np = placeArr(c.portfolio);
    if (np === c.portfolio) return c;
    competitorsChanged = true;
    return { ...c, portfolio: np };
  });

  if (!anyChanged) return state;
  return {
    ...state,
    portfolio,
    lots,
    listings,
    industryPortfolio,
    industryListings,
    competitors: competitorsChanged ? competitors : state.competitors,
  };
}

/* ── Tillväxtfront (Fas 1) ──────────────────────────────────────────────────
   Bakgrundsstaden (privata byggherrar) breder ut sig UTÅT från kärnor längs en
   front i stället för att poppa upp på slumpvisa rutor. Varje tom ruta får ett
   tillväxttryck: högt intill redan byggd mark (infill vid fronten), nära
   stadskärnan och i heta distrikt. Månadens nybygge lottas viktat mot trycket. */

const FRONTIER_RADIUS = 62; // världsenheter – fångar angränsande kvarter

function scoreParcelFrontier(
  p: Parcel,
  occupied: Set<string>,
  grown: ReadonlySet<string>,
  state: GameState,
): number {
  let adj = 0;
  for (const b of parcelsIn(p.district)) {
    if (b.id === p.id) continue;
    if (!(occupied.has(b.id) || hasAmbientBuilding(b, grown))) continue;
    if (Math.hypot(b.x - p.x, b.z - p.z) <= FRONTIER_RADIUS) adj++;
  }
  const coreBias = locationFactor(p.id);
  const devBias = state.districtDev?.[p.district] ?? 1;
  return (0.25 + adj) * coreBias * devBias;
}

/** Tillväxttryck för en enskild tom ruta (för test och felsökning). */
export function frontierScore(state: GameState, p: Parcel): number {
  return scoreParcelFrontier(
    p,
    occupiedParcelIds(state),
    new Set(state.ambientGrown ?? []),
    state,
  );
}

/** Väljer nästa ruta som bakgrundsstaden bebygger – viktat mot fronten så att
 *  staden växer sammanhängande utåt. `null` när det inte finns ledig mark. */
export function pickFrontierParcel(
  state: GameState,
  rand: () => number = Math.random,
): Parcel | null {
  const candidates = emptyParcels(state);
  if (candidates.length === 0) return null;
  const occupied = occupiedParcelIds(state);
  const grown = new Set(state.ambientGrown ?? []);
  const scored = candidates.map((p) => ({ p, s: scoreParcelFrontier(p, occupied, grown, state) }));
  const total = scored.reduce((a, x) => a + x.s, 0);
  if (total <= 0) return candidates[Math.floor(rand() * candidates.length)];
  let r = rand() * total;
  for (const x of scored) {
    r -= x.s;
    if (r <= 0) return x.p;
  }
  return scored[scored.length - 1].p;
}

/**
 * Lägesfaktor: närmare stadskärnan (0,0) är mer attraktivt.
 * ~1,12 mitt i Centrum, ner mot ~0,94 i kartans utkanter.
 */
export function locationFactor(parcelId: string | undefined): number {
  const p = parcelId ? BY_ID.get(parcelId) : undefined;
  if (!p) return 1;
  const dist = Math.hypot(p.x, p.z);
  const MAX_DIST = 470; // ungefärlig kartradie
  const centrality = Math.max(0, 1 - dist / MAX_DIST);
  return +(0.94 + centrality * 0.18).toFixed(3);
}

/** Tomtruta under en världspunkt (x,z) – för klick på sammanslagen dekor. */
export function parcelAt(x: number, z: number): Parcel | undefined {
  return PARCELS.find(
    (p) => Math.abs(x - p.x) <= p.w / 2 && Math.abs(z - p.z) <= p.d / 2,
  );
}

/** Deterministisk hash (FNV-1a) – används för variation i 3D-vyn. */
export function parcelHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
