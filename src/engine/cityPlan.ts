/* ============================================================
   Egen detaljplan – spelaren växer staden själv:

   1. Köp råmarken (åker/äng i ett planområde) av markägaren.
   2. Starta planprocessen: planavgift + utredningar, 10–18 mån.
   3. Processen möter verklighetens utmaningar – samråd, över-
      klaganden, arkeologi och strandskydd – innan planen vinner
      laga kraft och tomterna blir dina, byggklara.

   Kommunens egna detaljplaneauktioner (EXPANSION_BLOCKS) finns
   kvar som parallellt spår; det här är det egna, dyrare men
   styrbara alternativet. Ren logik utan React-beroenden.
   ============================================================ */

import { PARCELS, PLAN_AREAS, expansionByBlock } from "./city";
import { DISTRICTS } from "./data";
import type { GameState, LogEntry, PendingDecision, PlanProcess } from "./types";

/** Råmarkspris: oplanerad mark är billig – värdet skapas av planen. */
export function rawLandPrice(blockId: string, state: GameState): number {
  const def = expansionByBlock(blockId);
  const d = DISTRICTS.find((x) => x.id === def?.district);
  if (!def || d === undefined) return 0;
  const area = PARCELS.filter((p) => p.blockId === blockId).reduce(
    (a, p) => a + p.w * p.d * 2,
    0,
  );
  return Math.round((area * d.base * 0.07 * state.marketMod) / 10_000) * 10_000;
}

/** Planavgift + utredningar som betalas när processen startar. */
export function planFee(blockId: string): number {
  const parcels = PARCELS.filter((p) => p.blockId === blockId).length;
  return 600_000 + parcels * 350_000;
}

/** Grundlängd på processen (innan utmaningar): fler tomter = längre. */
export function planMonths(blockId: string): number {
  const parcels = PARCELS.filter((p) => p.blockId === blockId).length;
  return 9 + parcels * 2;
}

export const SAMRAD_MONTHS = 4;

/** Startar en process (ren hjälpare – reducern äger valideringen). */
export function newPlanProcess(blockId: string, _state: GameState): PlanProcess {
  const def = expansionByBlock(blockId)!;
  const d = DISTRICTS.find((x) => x.id === def.district)!;
  return {
    blockId,
    district: def.district,
    districtName: d.name,
    stage: "samråd",
    monthsLeft: planMonths(blockId),
    totalMonths: planMonths(blockId),
    spent: planFee(blockId),
    challenges: [],
  };
}

export interface PlanTickResult {
  proc: PlanProcess;
  /** true = planen har vunnit laga kraft denna månad. */
  done: boolean;
  events: LogEntry[];
  /** Beslut som kräver spelarens svar (t.ex. förlikning vid överklagan). */
  decision?: PendingDecision;
  /** Extra kostnad som dras direkt ur kassan (utredningar m.m.). */
  cost: number;
}

/**
 * En månads planprocess. Utmaningarna slås med medskickad slump så
 * logiken är ren och testbar:
 *  · Samråd: opinionen speglar ditt anseende – bra rykte snabbar på,
 *    dåligt rykte väcker protester.
 *  · Granskning: risk för överklagande till mark- och miljödomstolen
 *    (beslut: förlikning eller avvakta) och för arkeologiska fynd.
 *  · Strandskydd (vattennära områden): en tomt avstås som strandpark.
 */
export function planTick(proc: PlanProcess, state: GameState, rand: () => number): PlanTickResult {
  const p: PlanProcess = { ...proc, challenges: [...proc.challenges] };
  const events: LogEntry[] = [];
  let cost = 0;
  const def = expansionByBlock(p.blockId);

  // Fasbyte: samrådet är de första månaderna.
  const elapsed = p.totalMonths - p.monthsLeft;
  if (p.stage === "samråd" && elapsed >= SAMRAD_MONTHS) {
    p.stage = "granskning";

    // Samrådets utfall avgörs av anseendet.
    if (!p.challenges.includes("samråd")) {
      p.challenges.push("samråd");
      if (state.reputation >= 70) {
        p.monthsLeft = Math.max(1, p.monthsLeft - 2);
        events.push({ t: `🗣️ The consultation in ${p.districtName} went your way – the neighbors trust ${state.companyName ?? "the company"} (−2 mo).`, kind: "income" });
      } else if (state.reputation < 45) {
        p.monthsLeft += 3;
        events.push({ t: `🗣️ Protests at the consultation: the neighbors distrust the plans in ${p.districtName} (+3 mo). A better reputation would have helped.`, kind: "warn" });
      } else {
        events.push({ t: `🗣️ The consultation in ${p.districtName} is done – the plan goes to review.`, kind: "info" });
      }
    }

    // Strandskydd prövas direkt efter samrådet i vattennära lägen.
    if (def?.waterfront && !p.challenges.includes("strandskydd")) {
      p.challenges.push("strandskydd");
      const parcels = PARCELS.filter((x) => x.blockId === p.blockId);
      const park = parcels[parcels.length - 1];
      p.parkParcels = [...(p.parkParcels ?? []), park.id];
      events.push({ t: `🌊 Shoreline protection: the county board requires free passage along the water – a lot in ${p.districtName} is ceded as a shoreline park.`, kind: "warn" });
    }
  }

  // Granskningens risker (varje utmaning högst en gång).
  if (p.stage === "granskning") {
    if (!p.challenges.includes("överklagan") && rand() < 0.30 - (state.reputation >= 70 ? 0.10 : 0)) {
      p.challenges.push("överklagan");
      p.stage = "överklagad";
      p.monthsLeft += 7;
      return {
        proc: p,
        done: false,
        events: [{ t: `⚖️ APPEALED: The neighborhood association takes the zoning plan in ${p.districtName} to the land and environment court (+7 mo).`, kind: "warn" }],
        decision: {
          id: `plan_appeal_${p.blockId}`,
          title: "Zoning plan appealed",
          text: `The neighborhood association has appealed your zoning plan in ${p.districtName} to the land and environment court. The lawyers see two paths.`,
          options: [
            {
              label: "Settle with the neighbors",
              detail: "1.5 MSEK · −5 mo · rep +2",
              effect: {
                cash: -1_500_000,
                reputation: 2,
                planSettle: { blockId: p.blockId, monthsDelta: -5 },
                log: `🤝 Settlement: the neighborhood association withdraws the appeal in ${p.districtName} in exchange for a noise barrier and a playground.`,
                logKind: "info",
              },
            },
            {
              label: "Await the court",
              detail: "0 kr · full wait",
              effect: {
                planSettle: { blockId: p.blockId, monthsDelta: 0 },
                log: `⚖️ You await the land and environment court's ruling in ${p.districtName}.`,
                logKind: "info",
              },
            },
          ],
        },
        cost,
      };
    }
    if (!p.challenges.includes("arkeologi") && rand() < 0.10) {
      p.challenges.push("arkeologi");
      p.monthsLeft += 4;
      cost += 800_000;
      events.push({ t: `🏺 Archaeological finds in ${p.districtName}! An excavation is required before the plan can be adopted (+4 mo, 0.8 MSEK).`, kind: "warn" });
    }
  }

  // Månaden går.
  p.monthsLeft -= 1;
  if (p.monthsLeft > 0) return { proc: p, done: false, events, cost };

  // Laga kraft!
  events.push({
    t: `📜 LEGALLY BINDING: Your zoning plan in ${p.districtName} is adopted! ${PARCELS.filter((x) => x.blockId === p.blockId).length - (p.parkParcels?.length ?? 0)} build-ready lots are yours – open Build.`,
    kind: "buy",
  });
  return { proc: p, done: true, events, cost };
}

/** Alla planområden med status för UI:t. */
export interface PlanAreaStatus {
  blockId: string;
  district: string;
  districtName: string;
  parcels: number;
  waterfront: boolean;
  state: "till-salu" | "ägd" | "process" | "klar";
  proc?: PlanProcess;
}

export function planAreaStatus(state: GameState): PlanAreaStatus[] {
  const unlocked = new Set(state.unlockedBlocks ?? []);
  const ownedRaw = new Set(state.ownedPlanAreas ?? []);
  return PLAN_AREAS.map((a) => {
    const proc = (state.planProcesses ?? []).find((x) => x.blockId === a.blockId);
    const d = DISTRICTS.find((x) => x.id === a.district);
    return {
      blockId: a.blockId,
      district: a.district,
      districtName: d?.name ?? a.district,
      parcels: a.parcelCols * a.parcelRows,
      waterfront: a.waterfront ?? false,
      state: unlocked.has(a.blockId) ? "klar" : proc ? "process" : ownedRaw.has(a.blockId) ? "ägd" : "till-salu",
      proc,
    };
  });
}
