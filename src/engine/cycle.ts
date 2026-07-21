/* ============================================================
   Den emergenta konjunkturcykeln (Masterplan fas 1, batch 3).

   Tidigare bytte cykeln fas på en slumptimer. Nu härleds boom och
   bust ur stadens faktiska obalanser:

   · KREDIT: stadens skuldsättning (spelarens hela skuldstack mot
     fastighetsvärdena) – billig kredit föder boom, överskuldsättning
     föder bust.
   · BYGGTAKT: pågående byggen i förhållande till stocken eldar på
     boomen NU och lagras som utbudsöverhäng som slår tillbaka som
     bust-tryck när husen står klara.
   · VAKANS: tight marknad (<4 %) är boombränsle, glut (>10 %)
     är bust-tryck (economyLife.cityVacancyRate).
   · RÄNTEGAP: åtstramande styrränta (över neutral + 1) kyler,
     lätt penningpolitik eldar (centralBank.NEUTRAL_RATE).
   · SENTIMENT: börshumöret ger momentum åt båda håll.

   Fasmaskinen har hysteres (minst 6 månader per fas) så cykeln
   inte fladdrar, och en boom kan krascha direkt till bust om
   obalanserna är stora nog. Ren logik, inga React-beroenden.
   ============================================================ */

import { NEUTRAL_RATE } from "./centralBank";
import { cityVacancyRate } from "./economyLife";
import { rnd } from "./random";
import { totalDebtOf } from "./rating";
import { propMarketValue } from "./property";
import type { GameState } from "./types";

/** Minsta faslängd innan ett byte tillåts (hysteres). */
export const MIN_PHASE_MONTHS = 6;
/** Trycktröskeln för ett fasbyte. */
export const PHASE_THRESHOLD = 2.5;
/** Värmens tröghet och brus: obalanser integreras månad för månad, och
 *  stokastiska stämningsvågor gör att cykler uppstår även i jämvikt –
 *  utan dem stabiliserar Taylor-regeln ekonomin till evig stiltje. */
export const HEAT_INERTIA = 0.95;
export const HEAT_GAIN = 0.35;
export const HEAT_NOISE = 0.45;
/** Överhängets avklingning per månad (färdigbyggt absorberas långsamt). */
export const OVERHANG_DECAY = 0.94;

export interface CyclePressures {
  boom: number;
  bust: number;
  drivers: string[];
}

/** Stadens kreditkvot: spelarens hela skuldstack mot stadens husvärden.
 *  (totalDebtOf täcker banklån + obligationer + revolver; certifikaten
 *  läggs till separat.) */
export function cityCreditRatio(s: GameState): number {
  const debt = totalDebtOf(s) + (s.commercialPaper?.amount ?? 0);
  const values =
    s.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0) +
    s.competitors.reduce((a, c) => a + (c.portfolio ?? []).reduce((x, p) => x + propMarketValue(p, s), 0), 0);
  return values > 0 ? debt / values : 0;
}

/** Byggtakten: andel av stadens hus som är under uppförande just nu. */
export function constructionShare(s: GameState): number {
  const building =
    s.portfolio.filter((p) => p.status === "bygger").length +
    s.competitors.reduce((a, c) => a + (c.portfolio ?? []).filter((p) => p.status === "bygger").length, 0);
  const stock =
    s.portfolio.length + s.listings.length +
    s.competitors.reduce((a, c) => a + (c.portfolio ?? []).length, 0);
  return stock > 0 ? building / stock : 0;
}

/** Månadens boom-/bust-tryck ur stadens obalanser. */
export function cyclePressures(s: GameState): CyclePressures {
  const drivers: string[] = [];
  let boom = 0;
  let bust = 0;

  // Vakans mäts mot sitt eget EMA-ankare: stadens strukturella nivå är
  // neutral – det är SVÄNGARNA som eldar respektive kyler cykeln.
  const vac = cityVacancyRate(s);
  const vacAnchor = s.marketCycle?.vacAnchor ?? vac;
  if (vac < vacAnchor - 0.03) { boom += 1.2; drivers.push("tightening rental market"); }
  else if (vac > vacAnchor + 0.04) { bust += 1.2; drivers.push("rising vacancies"); }

  const rateGap = s.interestRate - NEUTRAL_RATE;
  if (rateGap < -0.75) { boom += 1.0; drivers.push("cheap money"); }
  else if (rateGap > 1.0) { bust += 1.0; drivers.push("restrictive policy rate"); }

  const credit = cityCreditRatio(s);
  if (credit > 0.55) { bust += 1.0; drivers.push("over-leveraged city"); }
  else if (credit > 0 && credit < 0.30 && rateGap < 0) { boom += 0.6; drivers.push("credit expansion room"); }

  const share = constructionShare(s);
  if (share > 0.06) { boom += 0.8; drivers.push("construction frenzy"); }

  const overhang = s.marketCycle?.overhang ?? 0;
  if (overhang > 1.5) { bust += Math.min(1.5, overhang * 0.5); drivers.push("supply overhang"); }

  const sent = s.marketSentiment ?? 1;
  if (sent > 1.15) boom += 0.5;
  else if (sent < 0.85) bust += 0.5;

  return { boom, bust, drivers };
}

/** Vakansankarets EMA-uppdatering (långsam – strukturskiften absorberas). */
export function nextVacAnchor(s: GameState): number {
  const vac = cityVacancyRate(s);
  const prev = s.marketCycle?.vacAnchor ?? vac;
  return +(prev + (vac - prev) * 0.04).toFixed(4);
}

/** Uppdatera utbudsöverhänget: hög byggtakt lagras och slår tillbaka
 *  som bust-tryck när husen står klara. */
export function nextOverhang(s: GameState): number {
  const prev = s.marketCycle?.overhang ?? 0;
  const add = Math.max(0, constructionShare(s) - 0.04) * 10;
  return +(Math.min(4, prev * OVERHANG_DECAY + add)).toFixed(2);
}

export type CyclePhase = "boom" | "stable" | "bust";

/** Fas-trötthet: busts läker med tiden (låga priser och billiga pengar
 *  återväcker efterfrågan) och boomar uttöms (kostnader och utbud hinner
 *  ikapp). Utan denna kraft fastnar ekonomin i permanenta faser när ett
 *  tryck (t.ex. strukturell vakans) aldrig släpper. */
export function phaseFatigue(phase: CyclePhase, age: number): number {
  if (phase === "bust") return Math.min(2.2, age * 0.08);
  if (phase === "boom") return -Math.min(1.6, age * 0.05);
  return 0;
}

/** Värmen: integrerar månadens nettotryck med tröghet, fas-trötthet och
 *  stämningsbrus. Positiv värme = boomriktning, negativ = bustriktning. */
export function nextHeat(prevHeat: number, p: CyclePressures, phase: CyclePhase = "stable", age = 0): number {
  const noise = rnd(-HEAT_NOISE, HEAT_NOISE);
  const net = (p.boom - p.bust + phaseFatigue(phase, age)) * HEAT_GAIN;
  return +Math.max(-5, Math.min(5, prevHeat * HEAT_INERTIA + net + noise)).toFixed(2);
}

/** Fasmaskinen: värmen styr, med hysteres på faslängden. */
export function nextPhase(
  current: CyclePhase,
  age: number,
  heat: number,
): CyclePhase {
  if (age < MIN_PHASE_MONTHS) return current;
  if (current === "stable") {
    if (heat <= -PHASE_THRESHOLD) return "bust";
    if (heat >= PHASE_THRESHOLD) return "boom";
    return "stable";
  }
  if (current === "boom") {
    // En boom kan krascha direkt till bust vid stora obalanser.
    if (heat <= -(PHASE_THRESHOLD + 1)) return "bust";
    if (heat < 0.5) return "stable";
    return "boom";
  }
  // bust
  if (heat > -0.5) return "stable";
  return "bust";
}
