/* ============================================================
   Stadslayouter – klassiska kartan som data + seedad generator.

   "Samma områden, olika ställen och storlekar": generatorn behåller
   de sju distriktens identiteter och väderstreck (kompassband kring
   klassiska läget) men varierar position, kvartersrutnätets form och
   gatubredd per seed. Tomtstorlekarna och antalet tomter per distrikt
   hålls (nära) konstanta så att scenariernas svårighetsgrad inte
   beror på seed.

   Seed CLASSIC_SEED (0) ger EXAKT dagens karta – den kör kampanjen
   och alla fasta dekorkoordinater (vägar, landmärken, hamn) tills
   de genereras i senare etapper. cityLayout.test.ts kör invarianterna
   (inga överlapp, inom kartan, fritt från vatten/HK, kajläge, band)
   över hundratals seeds – det är generatorns kravspec.

   Ren TypeScript utan beroenden på city.ts (city.ts importerar
   HÄRIFRÅN), React eller Three.
   ============================================================ */

/** Ett distrikts kvartersstruktur och läge (samma form som förr i city.ts). */
export interface ZoneDef {
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

/** Expansionskvarter (kommunal detaljplansauktion eller privat planmark). */
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

/** En komplett stadslayout. Etapp 1 omfattar zoner + expansionskvarter;
 *  vägar, landmärken och kajens läge genereras i senare etapper. */
export interface CityLayout {
  seed: number;
  zones: ZoneDef[];
  expansions: ExpansionDef[];
}

/* ── Fasta ramar som delas av generator och geometrivakter ──────────── */

/** Kartans ytterkant (samma låda som geometry.test.ts vaktar). */
export const MAP_BOUNDS = { x0: -490, x1: 530, z0: -405, z1: 350 } as const;
/** Vattnet börjar här (söderut). */
export const COAST_Z = 300;
/** HK-gårdens skyddscirkel – inget får byggas här. */
export const HQ_RESERVE = { x: -225, z: 215, r: 30 } as const;
/** Minsta korridor mellan två distrikt (vägarna behöver plats). */
export const ZONE_GAP = 12;

/* ── Klassiska kartan (flyttad oförändrad från city.ts) ─────────────── */

export const CLASSIC_ZONES: ZoneDef[] = [
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

// Dubbelt så många tomter i varje expansionskvarter (kommunal + planmark):
// finare uppdelning med OFÖRÄNDRAT fotavtryck, så geometrivakten håller.
export const CLASSIC_EXPANSIONS: ExpansionDef[] = [
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

/** Seeden som ger exakt dagens karta (kampanjen är pinnad hit). */
export const CLASSIC_SEED = 0;

/* ── Fotavtrycksgeometri (delas med city.ts) ────────────────────────── */

/** Ett kvarters yttermått. */
export function blockFootprint(z: ZoneDef): { w: number; d: number } {
  return {
    w: z.parcelCols * z.parcelW + (z.parcelCols - 1) * z.innerGap,
    d: z.parcelRows * z.parcelD + (z.parcelRows - 1) * z.innerGap,
  };
}

/** Hela zonens yttermått. */
export function zoneFootprint(z: ZoneDef): { w: number; d: number } {
  const b = blockFootprint(z);
  return {
    w: z.blockCols * b.w + (z.blockCols - 1) * z.street,
    d: z.blockRows * b.d + (z.blockRows - 1) * z.street,
  };
}

/* ── Seedad generator ───────────────────────────────────────────────── */

interface Rect { x0: number; x1: number; z0: number; z1: number }

function rectOf(cx: number, cz: number, w: number, d: number): Rect {
  return { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 };
}

function zoneRect(z: ZoneDef): Rect {
  const s = zoneFootprint(z);
  return rectOf(z.cx, z.cz, s.w, s.d);
}

function expansionRect(e: ExpansionDef): Rect {
  return rectOf(e.cx, e.cz, e.parcelCols * e.parcelW, e.parcelRows * e.parcelD);
}

/** Överlappar rektanglarna när båda blåsts upp med gap/2 åt alla håll? */
function tooClose(a: Rect, b: Rect, gap: number): boolean {
  return a.x0 < b.x1 + gap && a.x1 > b.x0 - gap && a.z0 < b.z1 + gap && a.z1 > b.z0 - gap;
}

/** Kortaste avstånd från rektangeln till en punkt. */
function rectPointDist(r: Rect, x: number, z: number): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

/** Lokal, ren mulberry32 – layouten är en ren funktion av seeden. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tillåtna kvartersrutnät per distrikt (klassiska formen först). Produkterna
 *  ligger inom ~±8 % av klassiska antalet kvarter så tomtutbudet per distrikt
 *  – och därmed scenariobalansen – hålls nära konstant oavsett seed. */
const SHAPES: Record<string, ReadonlyArray<readonly [number, number]>> = {
  centrum:   [[4, 4], [3, 5], [5, 3]],
  finans:    [[8, 6], [7, 7], [6, 8], [9, 5]],
  innerstad: [[7, 4], [6, 5], [5, 6]],
  hamnen:    [[19, 3], [14, 4], [28, 2]],
  industri:  [[9, 5], [8, 6], [7, 6]],
  förort:    [[9, 7], [8, 8], [10, 6], [7, 9]],
  kulle:     [[16, 12], [12, 16], [14, 14], [19, 10]],
};

/** Kompassband: hur långt distriktets centrum får driva från klassiska läget.
 *  Banden bevarar väderstrecksidentiteten (Villakullen förblir nordväst osv). */
const DRIFT: Record<string, { dx: number; dz: number }> = {
  centrum:   { dx: 40, dz: 30 },
  finans:    { dx: 40, dz: 30 },
  innerstad: { dx: 40, dz: 30 },
  industri:  { dx: 40, dz: 30 },
  förort:    { dx: 35, dz: 25 },
  kulle:     { dx: 40, dz: 35 },
  hamnen:    { dx: 60, dz: 0 }, // z styrs av kajläget, inte av bandet
};

/** Placeringsordning: ankaret Centrum först, kustremsan Hamnen sist
 *  (den är mest villkorad – kajläge + fritt från HK och grannarnas södra
 *  kanter – och har mest att vinna på att de andra redan ligger fast). */
const PLACE_ORDER = ["centrum", "innerstad", "finans", "industri", "förort", "kulle", "hamnen"];

function isZoneOk(r: Rect, district: string, placed: Rect[]): boolean {
  if (r.x0 < MAP_BOUNDS.x0 + 6 || r.x1 > MAP_BOUNDS.x1 - 6) return false;
  if (r.z0 < MAP_BOUNDS.z0 + 6 || r.z1 > MAP_BOUNDS.z1 - 6) return false;
  if (r.z1 > COAST_Z - 4) return false;
  if (rectPointDist(r, HQ_RESERVE.x, HQ_RESERVE.z) <= HQ_RESERVE.r + 2) return false;
  for (const o of placed) if (tooClose(r, o, ZONE_GAP)) return false;
  return true;
}

/**
 * Genererar en stadslayout ur en seed. CLASSIC_SEED ger exakt dagens karta.
 * Övriga seeds: samma sju distrikt med samma tomtstorlekar, men varierade
 * lägen (inom kompassbanden), kvartersrutnät och gatubredder. Varje distrikt
 * provar upp till 60 kandidater mot villkoren; går inget igenom faller det
 * tillbaka på sitt klassiska läge (invarianttesterna vaktar slutresultatet).
 */
export function generateCityLayout(seed: number): CityLayout {
  if (seed === CLASSIC_SEED) {
    return {
      seed,
      zones: CLASSIC_ZONES.map((z) => ({ ...z })),
      expansions: CLASSIC_EXPANSIONS.map((e) => ({ ...e })),
    };
  }
  const rng = mulberry32(Math.trunc(seed) ^ 0x51ab7e);
  const byDistrict = new Map(CLASSIC_ZONES.map((z) => [z.district, z] as const));
  const zones: ZoneDef[] = [];
  const placedRects: Rect[] = [];

  for (const district of PLACE_ORDER) {
    const classic = byDistrict.get(district)!;
    const shapes = SHAPES[district];
    const drift = DRIFT[district];
    let chosen: ZoneDef | null = null;
    for (let attempt = 0; attempt < 60 && !chosen; attempt++) {
      // Klassisk form vartannat tidigt försök så variationen inte alltid
      // pressar mot de mest extrema rutnäten; sena försök krymper driften.
      const shape = shapes[attempt % 2 === 0 && attempt < 8 ? Math.floor(rng() * shapes.length) : attempt % shapes.length];
      const streetJitter = Math.round((rng() - 0.5) * 4); // ±2
      const shrink = attempt < 30 ? 1 : 0.4;
      const cand: ZoneDef = {
        ...classic,
        blockCols: shape[0],
        blockRows: shape[1],
        street: Math.max(5, classic.street + streetJitter),
        cx: Math.round(classic.cx + (rng() * 2 - 1) * drift.dx * shrink),
        cz: Math.round(classic.cz + (rng() * 2 - 1) * drift.dz * shrink),
      };
      if (district === "hamnen") {
        // Kajremsan: södra kanten läggs strax innanför kustlinjen.
        const coastMargin = 4 + rng() * 6;
        const d = zoneFootprint(cand).d;
        cand.cz = Math.round(COAST_Z - coastMargin - d / 2);
      } else if (district === "innerstad") {
        // Innerstaden kedjas mot Centrums norra kant (esplanaden emellan).
        // Oberoende band räcker inte här: väljer Centrum sin djupaste form
        // och driver norrut finns inget giltigt bandläge kvar, och båda är
        // för breda för att kunna undvika varandra i sidled.
        const centrumRect = placedRects[0];
        const gap = 14 + rng() * 36;
        const d = zoneFootprint(cand).d;
        cand.cz = Math.round(centrumRect.z0 - gap - d / 2);
      }
      const r = zoneRect(cand);
      if (isZoneOk(r, district, placedRects)) chosen = cand;
    }
    // Garanterat svep när slumpförsöken inte hittar något (t.ex. när en
    // bred granne ätit upp hela bandet): minsta rutnätsform först, och
    // lägen i växande avstånd från klassiska centrumpunkten – något
    // utanför bandet tillåts hellre än en krock eller ett oprövat
    // klassiskt läge.
    if (!chosen) {
      const sortedShapes = [...shapes].sort((a, b) => {
        const fa = zoneFootprint({ ...classic, blockCols: a[0], blockRows: a[1] });
        const fb = zoneFootprint({ ...classic, blockCols: b[0], blockRows: b[1] });
        return fa.w * fa.d - fb.w * fb.d;
      });
      const offsets: Array<{ ox: number; oz: number }> = [];
      for (let ox = -Math.ceil(drift.dx * 1.8); ox <= drift.dx * 1.8; ox += 10)
        for (let oz = -Math.ceil(Math.max(20, drift.dz) * 1.8); oz <= Math.max(20, drift.dz) * 1.8; oz += 10)
          offsets.push({ ox, oz });
      offsets.sort((a, b) => Math.hypot(a.ox, a.oz) - Math.hypot(b.ox, b.oz));
      sweep: for (const shape of sortedShapes) {
        for (const { ox, oz } of offsets) {
          const cand: ZoneDef = {
            ...classic,
            blockCols: shape[0],
            blockRows: shape[1],
            cx: classic.cx + ox,
            cz: classic.cz + oz,
          };
          const d = zoneFootprint(cand).d;
          if (district === "hamnen") cand.cz = Math.round(COAST_Z - 6 - d / 2);
          else if (district === "innerstad") cand.cz = Math.round(placedRects[0].z0 - 20 - d / 2);
          if (isZoneOk(zoneRect(cand), district, placedRects)) {
            chosen = cand;
            break sweep;
          }
        }
      }
    }
    if (!chosen) chosen = { ...classic }; // sista utväg – invarianttesterna vaktar
    zones.push(chosen);
    placedRects.push(zoneRect(chosen));
  }
  // Behåll klassiska arrayordningen (konsumenter som räknar upp zoner
  // ska se samma distriktsordning oavsett placeringsordning).
  zones.sort(
    (a, b) =>
      CLASSIC_ZONES.findIndex((z) => z.district === a.district) -
      CLASSIC_ZONES.findIndex((z) => z.district === b.district),
  );

  const zoneRects = zones.map(zoneRect);
  const zoneByDistrict = new Map(zones.map((z) => [z.district, z] as const));
  const expansions = placeExpansions(zoneByDistrict, zoneRects);
  return { seed, zones, expansions };
}

/** Förankrar varje klassiskt expansionskvarter mot samma kant av sitt
 *  (numera flyttade) moderdistrikt: samma kant, samma relativa läge längs
 *  kanten, samma utåtavstånd – och skjuter utåt/i sidled tills det ligger
 *  fritt från zoner och andra expansioner. */
function placeExpansions(
  zoneByDistrict: Map<string, ZoneDef>,
  zoneRects: Rect[],
): ExpansionDef[] {
  const out: ExpansionDef[] = [];
  const placed: Rect[] = [];

  const okFor = (e: ExpansionDef, r: Rect): boolean => {
    if (r.x0 < MAP_BOUNDS.x0 + 4 || r.x1 > MAP_BOUNDS.x1 - 4) return false;
    if (r.z0 < MAP_BOUNDS.z0 + 4 || r.z1 > MAP_BOUNDS.z1 - 4) return false;
    if (r.z1 > COAST_Z - (e.waterfront ? 2 : 4)) return false;
    if (rectPointDist(r, HQ_RESERVE.x, HQ_RESERVE.z) <= HQ_RESERVE.r + 2) return false;
    for (const zr of zoneRects) if (tooClose(r, zr, 8)) return false;
    for (const o of placed) if (tooClose(r, o, 8)) return false;
    return true;
  };

  for (const classicExp of CLASSIC_EXPANSIONS) {
    const classicZone = CLASSIC_ZONES.find((z) => z.district === classicExp.district)!;
    const r0 = zoneRect(classicZone);
    const zone = zoneByDistrict.get(classicExp.district)!;
    const r1 = zoneRect(zone);
    // Vilken kant av moderzonen låg kvarteret utanför i klassiska kartan?
    const overshoot = {
      e: classicExp.cx - r0.x1,
      w: r0.x0 - classicExp.cx,
      s: classicExp.cz - r0.z1,
      n: r0.z0 - classicExp.cz,
    };
    const edge = (Object.keys(overshoot) as Array<keyof typeof overshoot>).reduce((a, b) =>
      overshoot[a] >= overshoot[b] ? a : b,
    );
    const m = overshoot[edge];
    const t =
      edge === "n" || edge === "s"
        ? (classicExp.cx - r0.x0) / (r0.x1 - r0.x0)
        : (classicExp.cz - r0.z0) / (r0.z1 - r0.z0);

    const mkCand = (ed: keyof typeof overshoot, tt: number, mm: number): ExpansionDef => {
      const cand: ExpansionDef = { ...classicExp };
      if (ed === "n" || ed === "s") {
        cand.cx = Math.round(r1.x0 + tt * (r1.x1 - r1.x0));
        cand.cz = Math.round(ed === "s" ? r1.z1 + mm : r1.z0 - mm);
      } else {
        cand.cz = Math.round(r1.z0 + tt * (r1.z1 - r1.z0));
        cand.cx = Math.round(ed === "e" ? r1.x1 + mm : r1.x0 - mm);
      }
      return cand;
    };
    let result: ExpansionDef | null = null;
    // Deterministisk sökning: minsta utåtavstånd först, klassisk kant och
    // klassiskt kantläge före alternativen – och om HELA klassiska kanten är
    // blockerad (en granne kan ha drivit dit) prövas zonens övriga kanter
    // innan något accepteras. Ordningen gör att kvarteret oftast hamnar
    // nästan där det brukar, och alltid hamnar fritt.
    const edgeOrder: Array<keyof typeof overshoot> = [
      edge,
      ...(["s", "e", "n", "w"] as const).filter((ed) => ed !== edge),
    ];
    for (let push = 0; push < 14 && !result; push++) {
      for (const ed of edgeOrder) {
        for (const tt of [t, t - 0.12, t + 0.12, t - 0.25, t + 0.25, 0.05, 0.2, 0.5, 0.8, 0.95]) {
          const cand = mkCand(ed, tt, m + push * 7);
          if (okFor(cand, expansionRect(cand))) {
            result = cand;
            break;
          }
        }
        if (result) break;
      }
    }
    // Garanterad sista utväg: skanna ett glest rutnät över hela kartan,
    // närmast moderzonen först – kartan är mestadels tom mark så en fri
    // ruta finns alltid. (Klassiska läget duger inte som fallback: en
    // granne kan ha drivit just dit.)
    if (!result) {
      const ax = (r1.x0 + r1.x1) / 2;
      const az = (r1.z0 + r1.z1) / 2;
      const spots: Array<{ cx: number; cz: number; d: number }> = [];
      for (let gx = MAP_BOUNDS.x0 + 30; gx <= MAP_BOUNDS.x1 - 30; gx += 25)
        for (let gz = MAP_BOUNDS.z0 + 30; gz <= MAP_BOUNDS.z1 - 30; gz += 25)
          spots.push({ cx: gx, cz: gz, d: Math.hypot(gx - ax, gz - az) });
      spots.sort((a, b) => a.d - b.d);
      for (const s of spots) {
        const cand: ExpansionDef = { ...classicExp, cx: s.cx, cz: s.cz };
        if (okFor(cand, expansionRect(cand))) {
          result = cand;
          break;
        }
      }
    }
    const chosen = result ?? { ...classicExp };
    out.push(chosen);
    placed.push(expansionRect(chosen));
  }
  return out;
}
