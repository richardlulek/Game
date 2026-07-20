/* ============================================================
   Befolkningsloopen (Capitalism Labs stadsekonomi, nischanpassad):
   ARBETSTILLFÄLLEN driver INFLYTTNING som driver BOSTADSEFTERFRÅGAN.

   Jobben skapas av stadens kommersiella stock – spelarens OCH
   rivalernas kontor/butiker/industrilokaler, industriernas hotell,
   terminaler och energiparker, plus stadens basnäring. Befolkningen
   söker sig mot jobben men RYMS bara om det finns bostäder: varje
   bostadshus (oavsett ägare) höjer taket. Kvoten befolkning/bostäder
   är trycket som styr ansökningsflödet till bostadsfastigheter.

   Därmed sluts kedjan kausalt: bygg en logistikterminal → jobb →
   inflyttning → dina (och rivalernas) bostäder fylls snabbare →
   bygg fler bostäder → mer utrymme för nästa våg. Ren logik utan
   React-beroenden; simulationen anropar tickPopulation månadsvis.
   ============================================================ */

import { rnd } from "./random";
import type { GameState, LogEntry, Property } from "./types";

/** Startbefolkning per distrikt (~21 200 totalt) – kalibrerad så staden
 *  startar i jämvikt med basnäringen och dekorstadens bostadsstock. */
export const BASE_POPULATION: Record<string, number> = {
  centrum: 4_800,
  innerstad: 4_400,
  förort: 5_200,
  kulle: 2_600,
  hamnen: 1_900,
  finans: 1_400,
  industri: 900,
};

/** Basnäringens jobb (kommunen, dekorstadens butiker, hamnen …). */
const BASE_JOBS = 8_600;
/** Dekorstadens egen bostadsstock (boendeplatser utanför spelobjekten). */
const BASE_HOUSING: Record<string, number> = {
  centrum: 5_100,
  innerstad: 4_700,
  förort: 5_600,
  kulle: 2_900,
  hamnen: 2_000,
  finans: 1_500,
  industri: 1_000,
};

/** Boende per kapacitetsenhet i ett bostadshus. */
const RESIDENTS_PER_UNIT = 60;
/** Jobb per kapacitetsenhet per lokaltyp. */
const JOBS_PER_UNIT: Record<string, number> = { kontor: 40, butik: 25, industri: 30 };
/** Varje jobb bär ~2,2 invånare (försörjda inräknade). */
const RESIDENTS_PER_JOB = 2.2;
/** Icke-arbetsknuten basbefolkning (pensionärer, studenter …). */
const NON_WORKING_BASE = 4_000;

function allProps(s: GameState): Property[] {
  return [
    ...s.portfolio,
    ...s.competitors.flatMap((c) => c.portfolio ?? []),
  ].filter((p) => p.status === "klar");
}

/** Stadens totala arbetstillfällen just nu. */
export function cityJobs(s: GameState): number {
  let jobs = BASE_JOBS;
  for (const p of allProps(s)) jobs += (JOBS_PER_UNIT[p.type] ?? 0) * p.capacity;
  const industries = [
    ...(s.industryPortfolio ?? []),
    ...s.competitors.flatMap((c) => c.industries ?? []),
  ].filter((a) => a.status === "klar");
  for (const a of industries) {
    if (a.hotelMeta) jobs += Math.round(a.hotelMeta.totalRooms * 0.35);
    if (a.logisticsMeta) jobs += a.logisticsMeta.totalBays * 3;
    if (a.energyMeta) jobs += Math.round(a.energyMeta.installedMW * 1.5);
  }
  // Megaprojekt och infrastruktur är arbetsplatser i sig.
  jobs += (s.megaCompleted ?? []).length * 350;
  return Math.round(jobs);
}

/** Bostadskapacitet (boendeplatser) i ett distrikt. */
export function housingCapacity(s: GameState, district: string): number {
  let cap = BASE_HOUSING[district] ?? 1_000;
  for (const p of allProps(s))
    if (p.district === district && p.type === "bostad") cap += p.capacity * RESIDENTS_PER_UNIT;
  return cap;
}

/** Befolkningen per distrikt (initieras vid första ticket). */
export function populationOf(s: GameState, district: string): number {
  return s.population?.[district] ?? BASE_POPULATION[district] ?? 1_000;
}

export function cityPopulation(s: GameState): number {
  return Object.keys(BASE_POPULATION).reduce((a, d) => a + populationOf(s, d), 0);
}

/** Bostadstryck: befolkning / kapacitet i distriktet (≈1,0 i jämvikt).
 *  >1 = bostadsbrist (fler sökande, snabbare uthyrning), <1 = överskott. */
export function housingPressure(s: GameState, district: string): number {
  const cap = housingCapacity(s, district);
  return cap > 0 ? populationOf(s, district) / cap : 1;
}

/** Ansökningsmultiplikator för bostadsfastigheter av trycket. */
export function pressureAppMult(s: GameState, district: string): number {
  const pr = housingPressure(s, district);
  return Math.max(0.65, Math.min(1.6, Math.pow(pr, 1.3)));
}

/**
 * Månadens befolkningssteg. Muterar s.population och returnerar händelser.
 * Inflyttningen söker sig mot jobbmålet men bromsas av bostadstaket;
 * lågkonjunktur vänder flytten utåt.
 */
export function tickPopulation(s: GameState): LogEntry[] {
  const events: LogEntry[] = [];
  if (!s.population) s.population = { ...BASE_POPULATION };

  const jobs = cityJobs(s);
  const phase = s.marketCycle?.phase ?? "stable";
  const cycleMult = phase === "boom" ? 1.05 : phase === "bust" ? 0.93 : 1;
  const target = Math.round((jobs * RESIDENTS_PER_JOB + NON_WORKING_BASE) * cycleMult);

  const districts = Object.keys(BASE_POPULATION);
  const totalHousing = districts.reduce((a, d) => a + housingCapacity(s, d), 0);
  const current = cityPopulation(s);
  // Nettoflytt: 3,5 % av gapet per månad, aldrig över bostadstaket (×1,06 –
  // viss trångboddhet tolereras innan flyttlassen vänder).
  const cappedTarget = Math.min(target, Math.round(totalHousing * 1.06));
  const delta = Math.round((cappedTarget - current) * 0.035 * rnd(0.7, 1.3));

  if (delta !== 0) {
    // Fördela flytten: inflyttare söker distrikt med ledigt boende OCH jobb;
    // utflyttning sker där trycket är lägst.
    const weights = districts.map((d) => {
      const cap = housingCapacity(s, d);
      const pop = populationOf(s, d);
      const room = Math.max(0, cap * 1.08 - pop);
      return delta > 0 ? room + 1 : pop * 0.01 + 1;
    });
    const wSum = weights.reduce((a, b) => a + b, 0) || 1;
    districts.forEach((d, i) => {
      const part = Math.round((delta * weights[i]) / wSum);
      s.population![d] = Math.max(200, populationOf(s, d) + part);
    });
  }

  // Milstolpar var 5 000:e invånare + årssummering.
  const after = cityPopulation(s);
  const mile = 5_000;
  if (Math.floor(after / mile) > Math.floor(current / mile))
    events.push({
      t: `🏙️ The city passes ${(Math.floor(after / mile) * mile).toLocaleString("en-US")} residents — ${jobs.toLocaleString("en-US")} jobs are drawing people in.`,
      kind: "event",
    });
  else if (Math.floor(after / mile) < Math.floor(current / mile))
    events.push({
      t: `🏙️ The city shrinks below ${(Math.floor(current / mile) * mile).toLocaleString("en-US")} residents — jobs are too few to keep people here.`,
      kind: "warn",
    });
  if (s.month === 12) {
    const growth = after - (s.populationLastYear ?? after);
    s.populationLastYear = after;
    events.push({
      t: `🏙️ Population report: ${after.toLocaleString("en-US")} residents (${growth >= 0 ? "+" : ""}${growth.toLocaleString("en-US")} this year), ${jobs.toLocaleString("en-US")} jobs.`,
      kind: "info",
    });
  }
  return events;
}
