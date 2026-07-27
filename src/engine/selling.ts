/* ============================================================
   Försäljningsmekanik – fastigheter säljs inte med ett klick.
   De annonseras med utgångspris och köpare hittas i takt med
   attraktiviteten: skick, uthyrningsgrad och direktavkastning.
   Bra objekt till rätt pris säljer snabbt; slitna vakanser till
   överpris blir liggare. Paket av flera fastigheter lockar
   institutionella köpare (volympremie).
   Ren logik utan React-beroenden.
   ============================================================ */

import { acquisitionLtv } from "./finance";
import { propMarketValue, propNOI } from "./property";
import { random01 } from "./random";
import type { Competitor, GameState, Property, SalePackage } from "./types";

/* Köparna är stadens rivalbolag (AI_NAMES) – då stannar sålda hus
   kvar på kartan i köparens färg och kan köpas tillbaka via
   direktbud. Abstrakta institutioner gav försvinnande hus. */

/** Köparens intresse 0–1: skick, uthyrningsgrad och direktavkastning. */
export function attractiveness(p: Property, s: GameState): number {
  const cond = p.condition / 100;
  const occ = p.capacity > 0 ? p.tenants.length / p.capacity : 0;
  const value = propMarketValue(p, s);
  // 6,5 % direktavkastning på marknadsvärdet räknas som fullgott.
  const yieldScore = Math.max(0, Math.min(1, propNOI(p, s) / Math.max(1, value) / 0.065));
  return Math.max(0, Math.min(1, 0.34 * cond + 0.3 * occ + 0.36 * yieldScore));
}

/**
 * Chans per månad att ett bud kommer in. Priset styr brant:
 * rabatt mot värdet ger rusning, mer än ~15 % över blir liggare.
 */
export function interestChance(A: number, ask: number, value: number, sentiment: number): number {
  const pf = value > 0 ? ask / value : 2;
  const priceMult =
    pf <= 0.92 ? 1.5 : pf <= 1.0 ? 1.2 : pf <= 1.06 ? 0.85 : pf <= 1.15 ? 0.45 : 0.15;
  const base = 0.1 + 0.55 * A;
  return Math.max(0.03, Math.min(0.9, base * priceMult * (0.7 + 0.3 * sentiment)));
}

/** Budbelopp: attraktiva objekt bjuds nära utgångspriset, svaga lågt. */
export function offerAmount(A: number, ask: number, value: number): number {
  const anchor = Math.min(ask, value * (0.86 + 0.17 * A));
  const wiggle = 0.97 + random01() * 0.06;
  return Math.max(10_000, Math.round((anchor * wiggle) / 10_000) * 10_000);
}

/** Grov intressenivå för UI:t. */
export function interestLabel(chance: number): { label: string; color: string } {
  if (chance >= 0.5) return { label: `High (~${Math.round(chance * 100)}%/mo)`, color: "#27660a" };
  if (chance >= 0.25) return { label: `Medium (~${Math.round(chance * 100)}%/mo)`, color: "#b07010" };
  return { label: `Low (~${Math.round(chance * 100)}%/mo)`, color: "#c0392b" };
}

/** Rabatten vid snabbförsäljning till uppköpare (utan att invänta köpare). */
export const QUICK_SALE_FACTOR = 0.85;

export interface PackageStats {
  value: number;
  attractiveness: number;
  /** Paketpremie på budnivån (1.0–1.06): volym + sammanhållet innehåll. */
  premium: number;
  chance: number;
}

/** Samlade siffror för ett säljpaket. */
export function packageStats(pkg: SalePackage, s: GameState): PackageStats {
  const props = s.portfolio.filter((p) => pkg.propertyIds.includes(p.id));
  const value = props.reduce((a, p) => a + propMarketValue(p, s), 0);
  const A =
    value > 0
      ? props.reduce((a, p) => a + attractiveness(p, s) * propMarketValue(p, s), 0) / value
      : 0;
  // Sammanhållning: majoritet i samma distrikt eller av samma typ.
  const most = (key: (p: Property) => string) => {
    const counts = new Map<string, number>();
    for (const p of props) counts.set(key(p), (counts.get(key(p)) ?? 0) + 1);
    return Math.max(0, ...counts.values()) / Math.max(1, props.length);
  };
  const coherent = Math.max(most((p) => p.district), most((p) => p.type)) >= 0.67;
  const premium = 1 + Math.min(0.06, 0.015 * props.length + (coherent ? 0.015 : 0));
  // Volym lockar institutioner: +20 % intressechans för ≥3 fastigheter.
  const chance =
    interestChance(A, pkg.ask, value * premium, s.marketSentiment ?? 1) *
    (props.length >= 3 ? 1.2 : 1);
  return { value, attractiveness: A, premium, chance: Math.min(0.9, chance) };
}

/** Budbelopp för ett paket: per-fastighetsbud plus paketpremie. */
export function packageOfferAmount(pkg: SalePackage, s: GameState): number {
  const st = packageStats(pkg, s);
  const anchor = Math.min(pkg.ask, st.value * (0.86 + 0.17 * st.attractiveness) * st.premium);
  const wiggle = 0.97 + random01() * 0.06;
  return Math.max(10_000, Math.round((anchor * wiggle) / 10_000) * 10_000);
}

/* ── Rivalernas strategiska försäljningar ──────────────────────────
   Rivalerna säljer med MOTIV, inte bara på slump: distriktsbolag
   renodlar mot sitt distrikt, slitna hus säljs som renoverings-
   objekt med rabatt, och i högkonjunktur realiseras vinster i
   toppen. Det som säljs annonseras öppet – spelaren och andra
   rivaler konkurrerar om samma objekt. */

export interface RivalSale {
  index: number;
  price: number;
  motive: string;
}

export function pickStrategicSale(
  c: Competitor,
  s: GameState,
  phase: "boom" | "bust" | "stable",
): RivalSale | null {
  const pf = c.portfolio ?? [];
  if (pf.length <= 2) return null;

  // 1) Distriktsbolag renodlar: sälj innehav utanför fokusdistriktet.
  if (c.strategy === "distrikt" && c.preferredDistrict) {
    const idx = pf.findIndex((p) => p.district !== c.preferredDistrict && p.status === "klar");
    if (idx >= 0) {
      const value = propMarketValue(pf[idx], s);
      return {
        index: idx,
        price: Math.round(value * (0.97 + random01() * 0.06)),
        motive: `renodlar mot ${c.preferredDistrict}`,
      };
    }
  }
  // 2) Slitna hus säljs som renoveringsobjekt med rabatt.
  const wornIdx = pf.findIndex((p) => p.condition < 40 && p.status === "klar");
  if (wornIdx >= 0) {
    const value = propMarketValue(pf[wornIdx], s);
    return {
      index: wornIdx,
      price: Math.round(value * (0.82 + random01() * 0.08)),
      motive: "selling a renovation opportunity",
    };
  }
  // 3) Högkonjunktur: värdebolagen realiserar vinster i toppen.
  if (c.strategy === "värde" || phase === "boom") {
    const idx = pf.reduce(
      (best, p, i) => (propMarketValue(p, s) > propMarketValue(pf[best], s) ? i : best),
      0,
    );
    const value = propMarketValue(pf[idx], s);
    const premium = phase === "boom" ? 1.02 + random01() * 0.1 : 0.97 + random01() * 0.08;
    return { index: idx, price: Math.round(value * premium), motive: phase === "boom" ? "taking profit in the boom" : "freeing up capital" };
  }
  // 4) Annars: trimma det svagaste innehavet (lägst skick).
  const idx = pf.reduce((worst, p, i) => (p.condition < pf[worst].condition ? i : worst), 0);
  const value = propMarketValue(pf[idx], s);
  return { index: idx, price: Math.round(value * (0.94 + random01() * 0.08)), motive: "trimming the portfolio" };
}

/** Säljbenägenhet per månad: strategi × konjunkturfas. */
export function rivalSellChance(c: Competitor, phase: "boom" | "bust" | "stable"): number {
  const base = c.strategy === "tillväxt" ? 0.015 : c.strategy === "värde" ? 0.08 : 0.05;
  const cycle = phase === "boom" ? 1.6 : phase === "bust" ? 0.7 : 1;
  return Math.min(0.25, base * cycle);
}

/* ── Övervärdet som köpkraft ───────────────────────────────────────
   Tidigt i spelet räcker varken kassaflödet eller refinansieringen till
   nästa kontantinsats: ett enda hus kastar av sig några hundra tusen om
   året, och en insats är flera miljoner. Det som DÄREMOT finns är vinsten
   som ligger låst i huset man redan äger – skillnaden mellan vad man
   betalade (plus nedlagd capex) och vad marknaden säger idag.

   Att sälja och lägga pengarna i flera hus är därför inte ett nederlag
   utan den normala vägen ut ur enhusfällan. Mätningen över 50 år är
   entydig: samma strategi som omsätter beståndet tidigt landar på
   elva hus i stället för ett. Funktionen räknar ut vad en försäljning
   faktiskt frigör, så att spelaren kan se vägen i stället för att
   behöva räkna ut den själv. */

/** Övervärde som andel av investerat kapital innan det är värt att sälja. */
export const RECYCLE_UPLIFT_THRESHOLD = 0.2;

export interface EquityRecycle {
  /** Övervärdet: marknadsvärde − (köpeskilling + capex). */
  uplift: number;
  /** Kontant efter att lånet på huset lösts. */
  net: number;
  /** Belåningsgraden nya köp görs på. */
  ltv: number;
  /** Ungefär så här många normalobjekt räcker det till i kontantinsats. */
  count: number;
}

/**
 * Vad en försäljning av `p` till marknadsvärde skulle frigöra, uttryckt i
 * hur många nya objekt kontantinsatsen räcker till. Null när övervärdet är
 * för litet för att vara värt att realisera, eller när det inte ens räcker
 * till ett objekt – då är det bättre att behålla och förvalta.
 */
export function equityRecycle(p: Property, state: GameState): EquityRecycle | null {
  if (p.status !== "klar") return null;
  const value = propMarketValue(p, state);
  const invested = (p.purchasePrice || value) + (p.capexTotal ?? 0);
  const uplift = value - invested;
  if (invested <= 0 || uplift <= invested * RECYCLE_UPLIFT_THRESHOLD) return null;
  // Samma skuldavräkning som vid försäljning (reducer SELL).
  const payoff = Math.min(state.debt, (p.purchasePrice || value) * 0.6);
  const net = value - payoff;
  const ltv = acquisitionLtv(state);
  const asks = state.listings
    .filter((l) => l.status === "klar" && l.askPrice > 0)
    .map((l) => l.askPrice)
    .sort((a, b) => a - b);
  const typical = asks.length ? asks[Math.floor(asks.length / 2)] : value;
  const deposit = typical * (1 - ltv);
  const count = deposit > 0 ? Math.floor(net / deposit) : 0;
  return count >= 1 ? { uplift, net, ltv, count } : null;
}
