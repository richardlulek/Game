/* ============================================================
   Dev-seed: fyller ett sandbox-parti med innehåll för UI/UX-
   granskning – UTAN berättelseläget och dess modaler. Aktiveras
   bara via ?dev i URL:en (FastighetsImperium), aldrig i ett
   riktigt parti. Syftet är att varje panel och kartan ska ha
   något att visa: egen portfölj spridd över distrikt, rivaler
   att köpa/aktivistpressa, samt pågående åtaganden (integration,
   earn-out, säljpaket).

   Ren logik. placeCity() (i store-dispatchen) delar ut tomter
   efter att portföljen ändrats, så överförda hus hamnar på kartan.
   ============================================================ */

import { INTEGRATION_MONTHS } from "./mna";
import { propMarketValue, propNOI } from "./property";
import type { EarnOut, GameState, Integration, Property, SalePackage } from "./types";

/** Så många färdiga rivalhus som förs över till spelaren. */
const GRAB = 8;

export function devSeed(s: GameState): GameState {
  // Ta färdiga hus från rivalerna (behåller deras data) och ge spelaren dem.
  const grabbed: Property[] = [];
  const competitors = s.competitors.map((c) => {
    const keep: Property[] = [];
    for (const p of c.portfolio ?? []) {
      if (grabbed.length < GRAB && p.status === "klar") {
        grabbed.push({ ...p, owned: true, purchasePrice: Math.round(propMarketValue(p, s)) });
      } else {
        keep.push(p);
      }
    }
    return { ...c, portfolio: keep, units: keep.length };
  });

  const abs = s.year * 12 + s.month;
  const base: GameState = {
    ...s,
    cash: 800_000_000,
    companyLevel: 5, // låser upp spin-off/aktivism i granskningen
    competitors,
    // Ge spelaren en ägarpost i första rival-aktien (för aktivism-granskning).
    stocks: s.stocks.map((st, i) =>
      i === 0 && st.competitorName && st.competitorName !== "__player__" && st.owned === 0
        ? { ...st, owned: Math.round(st.sharesOutstanding * 0.15), avgCost: st.price }
        : st,
    ),
    log: [{ t: "🛠️ DEV SEED: sandbox populated for UI review (portfolio, rivals, commitments).", kind: "info" as const }, ...s.log],
  };

  if (grabbed.length === 0) return base; // inga rivalhus att ta – iaf kassa/level

  const portfolio = [...s.portfolio, ...grabbed];

  // Ett säljpaket ur två hus i samma distrikt (om något distrikt har ≥ 2).
  const byDistrict = new Map<string, Property[]>();
  for (const p of grabbed) {
    const a = byDistrict.get(p.district) ?? [];
    a.push(p);
    byDistrict.set(p.district, a);
  }
  const packDist = [...byDistrict.values()].find((a) => a.length >= 2);
  const salePackages: SalePackage[] = packDist
    ? [
        {
          id: 1,
          name: `${packDist[0].districtName} Portfolio`,
          propertyIds: packDist.slice(0, 2).map((p) => p.id),
          ask: Math.round(packDist.slice(0, 2).reduce((x, p) => x + propMarketValue(p, s), 0)),
          listedAbs: abs,
        },
      ]
    : (s.salePackages ?? []);

  // En pågående integration och en earn-out så åtagande-panelen har innehåll.
  const integration: Integration = {
    target: "Meridian Estates",
    startAbs: abs,
    months: INTEGRATION_MONTHS,
    synergyGoal: 12_000_000,
    hostile: false,
    propertyIds: grabbed.slice(0, 3).map((p) => p.id),
  };
  const eoProps = grabbed.slice(3, 5);
  const earnOut: EarnOut = {
    target: "Coastline Group",
    amount: 20_000_000,
    dueAbs: abs + 24,
    noiTarget: Math.round((eoProps.reduce((x, p) => x + propNOI(p, s), 0) / 12) * 0.85),
    propertyIds: eoProps.map((p) => p.id),
  };

  return {
    ...base,
    portfolio,
    salePackages,
    integrations: [...(s.integrations ?? []), integration],
    earnOuts: [...(s.earnOuts ?? []), earnOut],
  };
}
