/* ============================================================
   Stadsdelsprojekt – slutspelets byggmästardröm. Äg ett HELT
   kvarter i stenstaden (Centrum/Innerstaden), riv allt och bygg
   ett signaturkvarter efter en arkitektprofil:

   · Kontorskluster   glastorn, högst hyra, näringslivet flyttar in
   · Bostadskvarter   kringbyggd gård, stabilt, staden tackar dig
   · Kulturstråk      saluhallar och scener, lägst yield men störst
                      avtryck: distriktet lyfter mest och eftervärlden
                      minns dig (dynastipoäng)

   Projektet kostar miljarder, tar år, och kvarterets hyresintäkter
   försvinner under bygget – kapitalsänkan och utmaningen i sen
   spelfas. Färdigt kvarter blir EN fastighet (wholeBlock) med egen
   arkitektur på 3D-kartan och en PERMANENT distriktseffekt.

   Ren logik utan React-beroenden.
   ============================================================ */

import { PARCELS, type Parcel } from "./city";
import { DISTRICTS } from "./data";
import { buildCostMult } from "./progression";
import type { GameState, PropTypeKey } from "./types";

export interface CityProjectProfile {
  id: string;
  name: string;
  icon: string;
  desc: string;
  type: PropTypeKey;
  /** Våningar (styr uthyrbar yta och 3D-silhuetten). */
  floors: number;
  /** Byggkostnad per m² uthyrbar yta (signaturarkitektur är dyr). */
  costM2: number;
  /** Fast grundkostnad: rivning, torg, infrastruktur, arkitekttävling. */
  baseCost: number;
  /** Byggtid i månader. */
  months: number;
  /** Årshyra som andel av totalkostnaden när kvarteret är fullt uthyrt. */
  yieldOnCost: number;
  /** Permanent lyft av distriktets utvecklingsfaktor vid invigning. */
  devBoost: number;
  reputation: number;
  dynasty: number;
}

export const CITY_PROJECT_PROFILES: CityProjectProfile[] = [
  {
    id: "kontorskluster",
    name: "Office cluster",
    icon: "🏙️",
    desc: "Three glass towers around a raised plaza. Highest rent – the city's new power address.",
    type: "kontor",
    floors: 20,
    costM2: 48_000,
    baseCost: 400_000_000,
    months: 42,
    yieldOnCost: 0.055,
    devBoost: 0.12,
    reputation: 8,
    dynasty: 300,
  },
  {
    id: "bostadskvarter",
    name: "Residential block",
    icon: "🏘️",
    desc: "An enclosed courtyard with a garden. Stable leasing and a city that thanks you.",
    type: "bostad",
    floors: 8,
    costM2: 42_000,
    baseCost: 250_000_000,
    months: 36,
    yieldOnCost: 0.045,
    devBoost: 0.10,
    reputation: 10,
    dynasty: 350,
  },
  {
    id: "kulturstråk",
    name: "Cultural quarter",
    icon: "🎭",
    desc: "A market hall, stages and galleries under a sawtooth roof. Lowest yield – biggest mark.",
    type: "butik",
    floors: 5,
    costM2: 52_000,
    baseCost: 350_000_000,
    months: 48,
    yieldOnCost: 0.03,
    devBoost: 0.18,
    reputation: 14,
    dynasty: 500,
  },
];

export const cityProfileById = (id: string): CityProjectProfile | undefined =>
  CITY_PROJECT_PROFILES.find((p) => p.id === id);

/** Lägsta bolagsnivå för att staden ska släppa fram ett kvartersbygge. */
export const CITY_PROJECT_MIN_LEVEL = 5;

/** Kvarterets tomter, fotavtryck (m²) och distrikt. */
export function blockInfo(blockId: string): {
  parcels: Parcel[];
  footprint: number;
  district: string;
} | null {
  const parcels = PARCELS.filter((p) => p.blockId === blockId);
  if (parcels.length < 2) return null; // bara slutna flerlotskvarter
  const footprint = parcels.reduce((a, p) => a + p.w * p.d, 0);
  return { parcels, footprint, district: parcels[0].district };
}

/** Uthyrbar yta för ett färdigt signaturkvarter. */
export function signatureArea(blockId: string, profile: CityProjectProfile): number {
  const info = blockInfo(blockId);
  if (!info) return 0;
  return Math.round(info.footprint * profile.floors * 0.85);
}

/** Totalkostnad för profilen på kvarteret (följer byggkonjunkturen). */
export function cityProjectCost(
  blockId: string,
  profile: CityProjectProfile,
  state: GameState,
): number {
  const area = signatureArea(blockId, profile);
  if (area <= 0) return 0;
  return Math.round((profile.baseCost + area * profile.costM2) * buildCostMult(state));
}

/** Kvarter som är upptagna av stadsdelsprojekt (pågående eller invigda). */
export function cityProjectBlocks(state: GameState): Set<string> {
  return new Set([
    ...(state.cityProjects ?? []).map((x) => x.blockId),
    ...(state.signatureBlocks ?? []).map((x) => x.blockId),
  ]);
}

/** Helägda kvarter där ett stadsdelsprojekt kan starta just nu. */
export function eligibleCityBlocks(state: GameState, fullyOwned: string[]): string[] {
  const taken = cityProjectBlocks(state);
  return fullyOwned.filter(
    (b) =>
      !taken.has(b) &&
      !(state.megaActive ?? []).some((m) => m.blockId === b) &&
      blockInfo(b) !== null,
  );
}

/** Distriktsnamnet för ett kvarter (för loggtexter). */
export function blockDistrictName(blockId: string): string {
  const info = blockInfo(blockId);
  return DISTRICTS.find((d) => d.id === info?.district)?.name ?? info?.district ?? blockId;
}
