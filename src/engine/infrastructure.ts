/* ============================================================
   Infrastruktur 2.0 (Masterplan fas 2, batch 1).

   Den gamla stubben lät kommunen slumpa fram ett projekt som vid
   invigningen löstes upp i ett engångslyft av districtDev. Nu:

   · FÄRDIG INFRASTRUKTUR BESTÅR: varje invigt projekt lämnar ett
     permanent accessibility-bidrag i distriktet (s.infraBuilt).
     Tillgängligheten multiplicerar hyrespotential, marknadsvärde
     och befolkningens flyttvikter – ett distrikt med tunnelbana
     ÄR ett bättre läge för alltid.
   · FLER PROJEKTTYPER med distriktskrav: tunnelbana (dyr, störst
     lyft), bro, hamnutbyggnad (bara hamnen), campus, spårväg,
     pendeltågsstation, skola, stadspark.
   · SPELAREN KAN AGERA: medfinansiera ett pågående bygge (20 % av
     kostnaden → 25 % kortare byggtid + anseende) eller – med
     politisk välvilja – LOBBA fram ett valfritt projekt i ett
     valfritt distrikt mot 25 % av notan (välviljan förbrukas).

   Ren logik, inga React-beroenden.
   ============================================================ */

import type { GameState, LogEntry } from "./types";

export interface InfraKindDef {
  id: string;
  name: string;
  icon: string;
  /** Permanent tillgänglighetsbidrag i distriktet (multiplikativt, t.ex. 0.10). */
  access: number;
  /** Engångslyft av områdesutvecklingen vid invigningen. */
  devBoost: [number, number];
  months: [number, number];
  /** Kommunens nota (spelarens medfinansiering/lobbying räknas på denna). */
  cost: number;
  /** Tillåtna distrikt (tom = alla). */
  districts?: string[];
}

export const INFRA_KINDS_2: InfraKindDef[] = [
  { id: "tunnelbana", name: "Metro line", icon: "🚇", access: 0.14, devBoost: [0.1, 0.14], months: [36, 48], cost: 220_000_000 },
  { id: "sparvag", name: "Tram line", icon: "🚋", access: 0.08, devBoost: [0.08, 0.12], months: [22, 30], cost: 90_000_000 },
  { id: "pendeltag", name: "Commuter rail station", icon: "🚉", access: 0.07, devBoost: [0.07, 0.1], months: [18, 26], cost: 70_000_000 },
  { id: "bro", name: "New bridge", icon: "🌉", access: 0.06, devBoost: [0.05, 0.09], months: [20, 28], cost: 110_000_000, districts: ["hamnen", "innerstad", "centrum"] },
  { id: "hamnutbyggnad", name: "Harbor expansion", icon: "⚓", access: 0.09, devBoost: [0.06, 0.1], months: [24, 36], cost: 150_000_000, districts: ["hamnen"] },
  { id: "campus", name: "University campus", icon: "🎓", access: 0.1, devBoost: [0.08, 0.12], months: [28, 40], cost: 130_000_000, districts: ["innerstad", "förort", "kulle", "centrum"] },
  { id: "skola", name: "School and sports hall", icon: "🏫", access: 0.04, devBoost: [0.04, 0.07], months: [14, 20], cost: 45_000_000 },
  { id: "stadspark", name: "Waterfront city park", icon: "🌳", access: 0.04, devBoost: [0.04, 0.06], months: [12, 18], cost: 35_000_000, districts: ["hamnen", "centrum", "innerstad"] },
];

export function infraKindById(id: string): InfraKindDef | undefined {
  return INFRA_KINDS_2.find((k) => k.id === id);
}

/** Distriktets tillgänglighet: 1.0 + summan av invigd infrastrukturs
 *  bidrag (avtagande – andra projektet i samma distrikt ger 70 %). */
export function accessibilityOf(s: GameState, district: string): number {
  const built = (s.infraBuilt ?? []).filter((b) => b.district === district);
  let total = 0;
  built
    .slice()
    .sort((a, b) => b.access - a.access)
    .forEach((b, i) => { total += b.access * Math.pow(0.7, i); });
  return +(1 + total).toFixed(3);
}

/** Hyres-/värdemultiplikator ur tillgängligheten (halv effekt på hyran,
 *  40 % på värdet – läget kapitaliseras försiktigt). */
export function accessRentMult(s: GameState, district: string): number {
  return 1 + (accessibilityOf(s, district) - 1) * 0.5;
}
export function accessValueMult(s: GameState, district: string): number {
  return 1 + (accessibilityOf(s, district) - 1) * 0.4;
}

/** Medfinansiering: 20 % av notan → 25 % kortare byggtid + anseende. */
export const COFINANCE_SHARE = 0.2;
export const COFINANCE_SPEEDUP = 0.75;
/** Lobbying (kräver politisk välvilja): 25 % av notan, förbrukar välviljan. */
export const LOBBY_SHARE = 0.25;

export function cofinanceCost(kindId: string): number {
  const k = infraKindById(kindId);
  return k ? Math.round(k.cost * COFINANCE_SHARE) : 0;
}
export function lobbyCost(kindId: string): number {
  const k = infraKindById(kindId);
  return k ? Math.round(k.cost * LOBBY_SHARE) : 0;
}

/** Invigning: registrera bestående tillgänglighet + händelse. */
export function openInfra(
  s: GameState,
  pr: { name: string; district: string; districtName: string; boost: number; kindId?: string },
): LogEntry {
  const kind = pr.kindId ? infraKindById(pr.kindId) : undefined;
  const access = kind?.access ?? 0.06;
  s.infraBuilt = [
    ...(s.infraBuilt ?? []),
    { kind: pr.kindId ?? "okänd", district: pr.district, access, openedAbs: s.year * 12 + s.month },
  ];
  s.districtDev = {
    ...(s.districtDev ?? {}),
    [pr.district]: +(((s.districtDev?.[pr.district] ?? 1) + pr.boost).toFixed(3)),
  };
  return {
    t: `🎉 OPENED: ${pr.name} in ${pr.districtName} is complete — the area lifts (+${Math.round(pr.boost * 100)}% development) and stays better connected (accessibility ${accessibilityOf(s, pr.district).toFixed(2)}×).`,
    kind: "event",
  };
}
