/* ============================================================
   Politik light (Capitalism Lab-luckan "politics"):

   Kommunalvalet vart 4:e år fanns redan (slumpat parti med
   skatte-/byggeffekter). Nu kan spelaren PÅVERKA det: tre månader
   före valet erbjuds en kampanjdonation – öppen eller diskret via
   en stiftelse. Vinner det stödda partiet får bolaget politisk
   välvilja i 24 månader:

   · Detaljplaneprocesser går snabbare (en extra månad avverkas
     varannan månad).
   · Kommunala planauktioner öppnar 8 % lägre (utgångsbudet).

   Diskreta donationer ger bättre odds men riskerar en mut-
   skandal så länge välviljan varar. Ren logik, inga React-
   beroenden.
   ============================================================ */

import { POLITICAL_PARTIES } from "./data";
import { msek } from "./format";
import type { GameState, PendingDecision } from "./types";

/** Valperiod i månader (matchar valblocket i simulation.ts). */
export const ELECTION_PERIOD = 48;
/** Kampanjbeslutet kommer så här många månader före valet. */
export const CAMPAIGN_LEAD = 3;

/** Sannolikhet att det stödda partiet vinner (basen är 1/3). */
export const CAMPAIGN_WIN_OPEN = 0.62;
export const CAMPAIGN_WIN_SECRET = 0.72;
/** Välviljans längd och styrka. */
export const FAVOR_MONTHS = 24;
export const FAVOR_AUCTION_MULT = 0.92;
/** Skandalrisk per månad för diskret finansierad välvilja. */
export const SECRET_SCANDAL_CHANCE = 0.02;

/* ── Politiskt kapital (tunna delar 6/7) ───────────────────────────
   En bestående relation med stadshuset i stället för en engångsloop:
   donationer bygger kapital, impopularitet (presshetta) eroderar det,
   och det kan spenderas på en interimtjänst mellan valen. */
/** Kapital en öppen respektive diskret donation ger. */
export const CAPITAL_OPEN = 30;
export const CAPITAL_SECRET = 20;
/** Kapital en valseger med backat parti ger ovanpå donationen. */
export const CAPITAL_WIN_BONUS = 25;
/** Månatlig avklingning mot 0 (relationer svalnar utan underhåll). */
export const CAPITAL_DECAY = 1;
/** Presshetta över denna nivå eroderar kapital (impopulär hyresvärd). */
export const CAPITAL_HEAT_THRESHOLD = 4;
/** Kostnad i kapital för en interimtjänst mellan valen. */
export const FAVOR_REQUEST_COST = 40;
/** Interimtjänsten ger så här många månaders välvilja. */
export const FAVOR_REQUEST_MONTHS = 12;

export function politicalCapital(s: GameState): number {
  return Math.max(0, Math.min(100, s.politics?.capital ?? 0));
}

/** Donationen bygger kapital, en vunnen relation gör kommande kampanjer
 *  lättare (kapital > 50 ger +8 procentenheter vinstchans). */
export function campaignWinBoost(s: GameState): number {
  return politicalCapital(s) >= 50 ? 0.08 : 0;
}

/** Månatlig drift: avklingning + erosion av impopularitet. */
export function nextPoliticalCapital(s: GameState): number {
  let cap = politicalCapital(s) - CAPITAL_DECAY;
  const heat = s.pressHeat ?? 0;
  if (heat > CAPITAL_HEAT_THRESHOLD) cap -= (heat - CAPITAL_HEAT_THRESHOLD) * 1.5;
  return Math.max(0, Math.min(100, +cap.toFixed(1)));
}

/** Donationens storlek skalar med bolagets storlek. */
export function campaignDonationSize(equity: number): number {
  return Math.round(Math.min(25_000_000, Math.max(2_000_000, equity * 0.005)) / 100_000) * 100_000;
}

/** Är den politiska välviljan aktiv? */
export function politicalFavorActive(s: GameState): boolean {
  return (s.politics?.favorMonthsLeft ?? 0) > 0;
}

/** Multiplikator på kommunala planauktioners utgångsbud. */
export function favorAuctionMult(s: GameState): number {
  return politicalFavorActive(s) ? FAVOR_AUCTION_MULT : 1;
}

/** Kampanjbeslutet tre månader före valet. Partiet som uppvaktas är det
 *  byggvänliga borgerliga blocket – det enda vars politik gynnar ett
 *  fastighetsbolag direkt. */
export function campaignDecision(s: GameState, equity: number): PendingDecision {
  const party = POLITICAL_PARTIES.find((p) => p.id === "borgerlig")!;
  const amount = campaignDonationSize(equity);
  const secretAmount = Math.round(amount * 0.6);
  return {
    id: "election_campaign",
    title: "The election campaign is asking for money",
    text: `The municipal election is three months away. ${party.name}'s campaign office hints that a contribution would be remembered at city hall — faster zoning reviews and friendlier land auctions for four years. A discreet route via a foundation is cheaper and more effective, but bribery scandals have sunk bigger firms than yours.`,
    options: [
      {
        label: "Donate openly",
        detail: `${msek(amount)} · ~${Math.round(CAMPAIGN_WIN_OPEN * 100)}% win odds · no scandal risk`,
        effect: {
          cash: -amount,
          campaign: { party: party.id, amount, secret: false },
          log: `🗳️ You donate ${msek(amount)} openly to ${party.name}'s campaign.`,
          logKind: "expense",
        },
      },
      {
        label: "Discreetly, via a foundation",
        detail: `${msek(secretAmount)} · ~${Math.round(CAMPAIGN_WIN_SECRET * 100)}% win odds · scandal risk while the favor lasts`,
        effect: {
          cash: -secretAmount,
          campaign: { party: party.id, amount: secretAmount, secret: true },
          log: `🕯️ A foundation with a forgettable name donates ${msek(secretAmount)} to ${party.name}.`,
          logKind: "expense",
        },
      },
      {
        label: "Stay out of politics",
        detail: "$0 · the election runs its course",
        effect: {
          log: "You keep the company out of the election campaign.",
          logKind: "info",
        },
      },
    ],
  };
}
