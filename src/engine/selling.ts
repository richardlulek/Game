/* ============================================================
   Försäljningsmekanik – fastigheter säljs inte med ett klick.
   De annonseras med utgångspris och köpare hittas i takt med
   attraktiviteten: skick, uthyrningsgrad och direktavkastning.
   Bra objekt till rätt pris säljer snabbt; slitna vakanser till
   överpris blir liggare. Paket av flera fastigheter lockar
   institutionella köpare (volympremie).
   Ren logik utan React-beroenden.
   ============================================================ */

import { propMarketValue, propNOI } from "./property";
import type { GameState, Property, SalePackage } from "./types";

/** Institutionella och privata köpare som lägger bud. */
export const BUYERS = [
  "Pensionskassan Trygg",
  "Fastighets AB Norden",
  "Stiftelsen Stadsbo",
  "Familjen Wallenmark",
  "Kommunala Bostäder AB",
  "Nordic Property Partners",
  "Försäkringsbolaget Eken",
];

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
  const wiggle = 0.97 + Math.random() * 0.06;
  return Math.max(10_000, Math.round((anchor * wiggle) / 10_000) * 10_000);
}

/** Grov intressenivå för UI:t. */
export function interestLabel(chance: number): { label: string; color: string } {
  if (chance >= 0.5) return { label: `Hög (~${Math.round(chance * 100)} %/mån)`, color: "#27660a" };
  if (chance >= 0.25) return { label: `Medel (~${Math.round(chance * 100)} %/mån)`, color: "#b07010" };
  return { label: `Låg (~${Math.round(chance * 100)} %/mån)`, color: "#c0392b" };
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
  const wiggle = 0.97 + Math.random() * 0.06;
  return Math.max(10_000, Math.round((anchor * wiggle) / 10_000) * 10_000);
}
