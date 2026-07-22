/* ============================================================
   Förvärvsvärdering (M&A) – vad är ett rivalbolag värt FÖR DIG?

   Ersätter panelens gamla schablon (askPrice × 1.05) med en riktig
   kalkyl som går att fatta beslut på:

   · SUBSTANSVÄRDE (NAV): portföljen till marknadsvärde + industri-
     tillgångar + kassan − skulden som följer med köpet. Sedan fas 3
     bär rivalerna riktig skuld – den ska synas i kalkylen (och tas
     över på riktigt i ACQUIRE_RIVAL).
   · SYNERGIER – det spelet redan modellerar, kapitaliserat:
     – Distriktsöverlapp: rivalens hus i distrikt där du redan är
       etablerad (≥ 2 färdiga hus) är värda mer i dina händer
       (samordnad förvaltning, kvartersmix, prissättningsmakt).
     – Energisynergi: dina ägda MW sänker driftkostnaden även för de
       förvärvade husen – besparingen kapitaliseras över ~8 år.
     – Stordrift: overhead per hus faller med portföljstorleken.

   Ren logik, inga React-beroenden.
   ============================================================ */

import { energySynergyMult, industryAssetValue } from "./industries";
import { propAnnualOpex, propMarketValue } from "./property";
import type { Competitor, GameState } from "./types";

/** Värdelyft per rivalfastighet i distrikt där du redan är etablerad. */
export const DISTRICT_OVERLAP_LIFT = 0.05;
/** Så många färdiga egna hus i distriktet krävs för överlappssynergi. */
export const OVERLAP_MIN_HOLDINGS = 2;
/** Kapitaliseringsmultipel på årliga driftbesparingar (~8 års nuvärde). */
export const SYNERGY_CAP_MULTIPLE = 8;
/** Stordrift: värdelyft per 5 egna färdiga hus, med tak. */
export const SCALE_STEP = 0.004;
export const SCALE_CAP = 0.03;

export interface AcquisitionValuation {
  /** Rivalens fastigheter till marknadsvärde (propMarketValue). */
  propertyValue: number;
  /** Industritillgångar (hotell, energi, logistik) till värde. */
  industryValue: number;
  /** Kassan som följer med köpet. */
  cash: number;
  /** Skulden som följer med köpet (dras av – och tas över på riktigt). */
  debt: number;
  /** Substansvärde: tillgångar + kassa − skuld. */
  nav: number;
  synergies: {
    district: number;
    energy: number;
    scale: number;
    total: number;
  };
  /** NAV + synergier: vad bolaget är värt i DINA händer. */
  totalValue: number;
}

export function acquisitionValuation(s: GameState, comp: Competitor): AcquisitionValuation {
  const props = comp.portfolio ?? [];
  const propertyValue = Math.round(props.reduce((a, p) => a + propMarketValue(p, s), 0));
  const industryValue = Math.round(
    (comp.industries ?? []).reduce((a, x) => a + industryAssetValue(x, s), 0),
  );
  const cash = Math.round(comp.cash ?? 0);
  const debt = Math.round(comp.debt ?? 0);
  const nav = propertyValue + industryValue + cash - debt;

  // Distriktsöverlapp: räkna dina färdiga hus per distrikt en gång.
  const mine = new Map<string, number>();
  for (const p of s.portfolio) {
    if (p.status === "klar") mine.set(p.district, (mine.get(p.district) ?? 0) + 1);
  }
  const district = Math.round(
    props.reduce(
      (a, p) =>
        (mine.get(p.district) ?? 0) >= OVERLAP_MIN_HOLDINGS
          ? a + propMarketValue(p, s) * DISTRICT_OVERLAP_LIFT
          : a,
      0,
    ),
  );

  // Energisynergi: propAnnualOpex för DIG inkluderar redan rabatten från
  // dina MW – besparingen mot rivalens drift är skillnaden upp till basen.
  const eMult = energySynergyMult(s);
  const energy =
    eMult < 1
      ? Math.round(
          props.reduce((a, p) => a + propAnnualOpex(p, s) * (1 / eMult - 1), 0) *
            SYNERGY_CAP_MULTIPLE,
        )
      : 0;

  // Stordrift: förvaltningsoverhead per hus faller med portföljstorleken.
  const myKlar = s.portfolio.filter((p) => p.status === "klar").length;
  const scale = Math.round(propertyValue * Math.min(SCALE_CAP, SCALE_STEP * Math.floor(myKlar / 5)));

  const total = district + energy + scale;
  return {
    propertyValue,
    industryValue,
    cash,
    debt,
    nav,
    synergies: { district, energy, scale, total },
    totalValue: nav + total,
  };
}
