/* ============================================================
   Uthyrning 2.0 – pris möter efterfrågan.

   U1 Ansökningsflöde: vakanser fylls inte längre direkt. Varje
      månad kommer ansökningar beroende på utgångshyra, skick,
      läge, distriktets öde och efterfrågan. Låg hyra ⇒ kö att
      välja ur; hög hyra ⇒ glest och sämre mix.
   U2 Kontraktspaket vid signering: kort/standard/långt/ankare.
   U3 Nöjdhet: driver förnyelser, förtida flytt och referenser.
   U4 Kvartersmix: grannarna i kvarteret påverkar hyra och trivsel.
   U5 Ankaravtal: kedjor/myndigheter lyfter hela kvarteret.

   Ren logik, inga React-beroenden.
   ============================================================ */

import { parcelById, PARCELS } from "./city";
import { districtTier } from "./districtTiers";
import { makeTenant } from "./generators";
import { newId } from "./random";
import type {
  Application,
  ContractKind,
  GameState,
  Property,
  Tenant,
} from "./types";

/** Reglerad hyra (bostadskön, U6): andel av marknadshyran. */
export const REGULATED_RENT = 0.8;
/** Mäklaruppdragets månadsarvode vid vakans (U8). */
export const BROKER_FEE = 15_000;
/** Single-tenant-premie: en stor lokal ger högre hyra per m². */
export const SINGLE_TENANT_RENT_BONUS = 1.10;
/** ...och lägre administrativ driftkostnad. */
export const SINGLE_TENANT_OPEX_CUT = 0.95;

/** Max antal lokaler en fastighet kan byggas om till. */
export function maxCapacityFor(p: Property): number {
  if (p.wholeBlock) return 9;
  return Math.max(1, Math.min(6, Math.floor(p.area / 500)));
}

/** Effektiv utgångshyra: fastighetens egen inställning går före policyn. */
export function effectiveAskRent(p: Property, state: GameState): number {
  return p.askRentPct ?? state.policy?.askRentPct ?? 1;
}

/** Kontraktspaketens villkor (U2). */
export const CONTRACTS: Record<
  ContractKind,
  { label: string; rentMult: number; term: (base: number) => number; desc: string }
> = {
  kort: { label: "Short", rentMult: 1.08, term: () => 12, desc: "12 mo · +8% rent · flexible ahead of projects" },
  standard: { label: "Standard", rentMult: 1.0, term: (b) => b, desc: "The profile's normal term" },
  långt: { label: "Long", rentMult: 0.95, term: (b) => Math.max(60, b), desc: "60+ mo · −5% rent · secure cash flow" },
  ankare: { label: "Anchor ⭐", rentMult: 0.85, term: () => 120, desc: "10 yr · −15% rent · lifts the whole block" },
};

/** Kvarter → tomt-id:n (byggs en gång, kartan är statisk). */
const BLOCK_SIBLINGS = (() => {
  const m = new Map<string, string[]>();
  for (const p of PARCELS) {
    if (!m.has(p.blockId)) m.set(p.blockId, []);
    m.get(p.blockId)!.push(p.id);
  }
  return m;
})();

/** Kvartersmix (U4): vilka fastighetstyper som finns i samma kvarter. */
export function blockMixFor(
  p: Property,
  state: GameState,
): { rentMult: number; satBonus: number; label: string | null } {
  if (!p.parcelId) return { rentMult: 1, satBonus: 0, label: null };
  const parcel = parcelById(p.parcelId);
  if (!parcel) return { rentMult: 1, satBonus: 0, label: null };
  const all = BLOCK_SIBLINGS.get(parcel.blockId) ?? [];
  if (all.length <= 1) return { rentMult: 1, satBonus: 0, label: null };
  const sibIds = new Set(all.filter((id) => id !== parcel.id));

  const types = new Set<string>();
  let anchorInBlock = false;
  const scan = (props: Property[]) => {
    for (const x of props) {
      if (x.parcelId && sibIds.has(x.parcelId)) {
        types.add(x.type);
        if (x.tenants.some((t) => t.anchorDeal)) anchorInBlock = true;
      }
    }
  };
  scan(state.portfolio);
  scan(state.listings);
  for (const c of state.competitors) scan(c.portfolio);
  if (p.tenants.some((t) => t.anchorDeal)) anchorInBlock = true;

  let rentMult = 1;
  let satBonus = 0;
  const parts: string[] = [];
  if (p.type === "bostad") {
    if (types.has("butik")) { satBonus += 5; rentMult *= 1.03; parts.push("butik i kvarteret"); }
    if (types.has("industri")) { satBonus -= 7; rentMult *= 0.97; parts.push("industri intill"); }
  } else if (p.type === "butik") {
    if (types.has("bostad")) { rentMult *= 1.05; parts.push("residential drives foot traffic"); }
    if (types.has("kontor")) { rentMult *= 1.04; parts.push("kontor ger lunchkunder"); }
  } else if (p.type === "kontor") {
    if (types.has("butik")) { satBonus += 3; rentMult *= 1.03; parts.push("service i bottenplan"); }
  }
  if (anchorInBlock) { satBonus += 5; rentMult *= 1.02; parts.push("anchor tenant ⭐"); }
  return {
    rentMult,
    satBonus,
    label: parts.length ? parts.join(" · ") : null,
  };
}

/** Referensbonus (U3): mycket nöjda hyresgäster i portföljen ger fler ansökningar. */
export function referralBonus(state: GameState): number {
  const all = state.portfolio.flatMap((p) => p.tenants);
  if (all.length === 0) return 1;
  const happy = all.filter((t) => (t.satisfaction ?? 60) >= 75).length;
  return 1 + Math.min(0.3, (happy / all.length) * 0.3);
}

/**
 * Förväntat antal ansökningar denna månad för en fastighet (U1).
 * Rätt prissatt (100 %) vakans i stabilt distrikt ⇒ ~1 ansökan/plats/mån.
 */
export function applicationRate(
  p: Property,
  state: GameState,
  seasonFactor: number,
): number {
  if (p.status !== "klar" || p.shortTerm || p.regulated) return 0;
  const free = p.capacity - p.tenants.length;
  if (free <= 0) return 0;
  const ask = effectiveAskRent(p, state);
  // Priselasticitet: 80 % av marknadshyra ≈ ×1,6 flöde, 125 % ≈ ×0,6.
  const price = Math.pow(1 / ask, 2.2);
  const cond = 0.5 + (p.condition / 100) * 0.7;
  const tier = districtTier(state, p.district);
  const tierMult =
    tier.id === "exklusivt" ? 1.25 : tier.id === "uppatgaende" ? 1.1 : tier.id === "eftersatt" ? 0.75 : 1;
  const mix = blockMixFor(p, state);
  const broker = p.brokerMandate ? 1.0 : 0.0; // garantiflöde adderas separat
  const base = free * 0.95 * price * cond * tierMult * state.demandMod * referralBonus(state) * mix.rentMult;
  return base * (p.type === "bostad" ? seasonFactor : 1) + broker * free;
}

/** Skapar en ansökan till en fastighet utifrån utgångshyran.
 *  marketSlotRent = propPotentialRent(p)/capacity/12 (skickas in för att
 *  undvika cirkulärt beroende mot property.ts). */
export function makeApplication(
  p: Property,
  state: GameState,
  nowAbs: number,
  marketSlotRent: number,
): Application {
  const ask = effectiveAskRent(p, state);
  const t = makeTenant(marketSlotRent * 12, state.demandMod, p.condition);
  // Sökande accepterar utgångshyran; överpris skrämmer bort kvalitet.
  const qualityPenalty = ask > 1.1 ? 0.94 : 1;
  const tenant: Tenant = {
    ...t,
    quality: +(t.quality * qualityPenalty).toFixed(2),
    rent: Math.round(marketSlotRent * ask * t.quality),
    satisfaction: 60,
  };
  return {
    id: newId(),
    tenant,
    expiresAbs: nowAbs + 2,
    anchorEligible: tenant.profile === "kedja" || tenant.profile === "stat",
  };
}

/** Applicerar kontraktspaketet på en sökandes villkor (U2/U5). */
export function signContract(tenant: Tenant, contract: ContractKind): Tenant {
  const c = CONTRACTS[contract];
  const term = c.term(tenant.termTotal);
  return {
    ...tenant,
    rent: Math.round(tenant.rent * c.rentMult),
    monthsLeft: term,
    termTotal: term,
    anchorDeal: contract === "ankare" ? true : tenant.anchorDeal,
    satisfaction: contract === "långt" || contract === "ankare" ? 70 : 60,
  };
}

/** Målnöjdhet för en hyresgäst (U3) – nöjdheten driftar 20 %/mån mot denna. */
export function satisfactionTarget(
  t: Tenant,
  p: Property,
  state: GameState,
  marketSlotRent: number,
): number {
  const tier = districtTier(state, p.district);
  const tierBonus =
    tier.id === "exklusivt" ? 10 : tier.id === "uppatgaende" ? 5 : tier.id === "eftersatt" ? -10 : 0;
  const rentPressure = marketSlotRent > 0 ? (marketSlotRent / Math.max(1, t.rent) - 1) * 60 : 0;
  const mix = blockMixFor(p, state);
  const target =
    50 +
    (p.condition - 60) * 0.55 +
    Math.max(-25, Math.min(25, rentPressure)) +
    tierBonus +
    mix.satBonus +
    (t.anchorDeal ? 8 : 0);
  return Math.max(5, Math.min(98, target));
}

/** Bästa ansökan (kvalitet × hyra) – används av "Hyr ut alla" och förvaltare. */
export function bestApplication(p: Property, minQuality = 0): Application | null {
  const apps = (p.applications ?? []).filter((a) => a.tenant.quality >= minQuality);
  if (apps.length === 0) return null;
  return apps.reduce((best, a) =>
    a.tenant.rent * a.tenant.quality > best.tenant.rent * best.tenant.quality ? a : best,
  );
}
