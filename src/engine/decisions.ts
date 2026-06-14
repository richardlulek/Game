/* ============================================================
   Beslutshändelser – val som spelaren måste ta ställning till.
   Effekterna är ren data (serialiserbar) så att ett pågående
   beslut kan sparas/laddas utan funktioner.
   ============================================================ */

import { msek } from "./format";
import { pick, rnd } from "./random";
import type { GameState, PendingDecision } from "./types";

type Template = (s: GameState) => PendingDecision;

const TEMPLATES: Template[] = [
  // 1. Ankarhyresgäst
  (s) => ({
    id: "ankar",
    title: "Ankarhyresgäst söker lokal",
    text: "En etablerad koncern vill teckna ett långt avtal i staden – men kräver 10 % rabatt på marknadshyran mot att de fyller flera lokaler.",
    options: [
      {
        label: "Erbjud rabatten",
        detail: "Reputation +4 · efterfrågan +3 %",
        effect: {
          reputation: 4,
          demandMod: 1.03,
          log: "Tecknade ramavtal med ankarhyresgäst – marknaden märker av det.",
          logKind: "income",
        },
      },
      {
        label: "Håll fast vid marknadshyran",
        detail: "Inget händer",
        effect: { log: "Tackade nej till ankarhyresgästens rabattkrav.", logKind: "info" },
      },
    ],
  }),

  // 2. Medial uppmärksamhet
  (s) => ({
    id: "press",
    title: "Journalist vill göra reportage",
    text: "En affärsjournalist vill porträttera ditt växande fastighetsbolag. En PR-byrå kan vinkla storyn positivt – mot betalning.",
    options: [
      {
        label: `Anlita PR-byrå (${msek(150_000)})`,
        detail: "−150 000 kr · Reputation +6",
        effect: { cash: -150_000, reputation: 6, log: "Positivt reportage publicerat – ryktet stärks.", logKind: "income" },
      },
      {
        label: "Avböj intervjun",
        detail: "Reputation −1",
        effect: { reputation: -1, log: "Avböjde reportaget – journalisten skrev en sval text.", logKind: "warn" },
      },
    ],
  }),

  // 3. Energipriskris
  (s) => ({
    id: "energi",
    title: "Energipriserna rusar",
    text: "Vinterns elpriser slår nya rekord. Du kan investera i egen energiproduktion eller vältra över kostnaden på hyresgästerna.",
    options: [
      {
        label: `Investera i solceller (${msek(400_000)})`,
        detail: "−400 000 kr · lägre skattetryck",
        effect: { cash: -400_000, taxMod: 0.97, log: "Investerade i solceller – driftnettot stabiliseras.", logKind: "upg" },
      },
      {
        label: "Höj avgifterna",
        detail: "Reputation −3 · efterfrågan −2 %",
        effect: { reputation: -3, demandMod: 0.98, log: "Vältrade energikostnaden på hyresgästerna – missnöje uppstår.", logKind: "warn" },
      },
    ],
  }),

  // 4. Kommunal markanvisning
  (s) => {
    const cost = Math.round(rnd(0.6, 1.4) * 1e6);
    return {
      id: "markanvisning",
      title: "Kommunen erbjuder markanvisning",
      text: `Kommunen erbjuder en byggbar tomt till rabatterat pris (${msek(cost)}) om du förbinder dig att utveckla den.`,
      options: [
        {
          label: `Acceptera (${msek(cost)})`,
          detail: "−kontant · +1 tomt att bygga på",
          effect: { cash: -cost, addLot: true, reputation: 1, log: "Tog emot kommunens markanvisning – en ny tomt väntar.", logKind: "buy" },
        },
        {
          label: "Tacka nej",
          detail: "Inget händer",
          effect: { log: "Avstod kommunens markanvisning.", logKind: "info" },
        },
      ],
    };
  },

  // 5. Vattenskada-tvist
  (s) => ({
    id: "tvist",
    title: "Hyresgäst hotar med tvist",
    text: "En hyresgäst kräver ersättning för en vattenskada och hotar med rättslig process. Du kan förlika i godo eller bestrida kravet.",
    options: [
      {
        label: `Förlik (${msek(200_000)})`,
        detail: "−200 000 kr · Reputation +2",
        effect: { cash: -200_000, reputation: 2, log: "Förlikning nådd i vattenskadeärendet – goodwill bevarad.", logKind: "expense" },
      },
      {
        label: "Bestrid kravet",
        detail: "Reputation −4 (men ingen utbetalning)",
        effect: { reputation: -4, log: "Bestred hyresgästens krav – ärendet drar ut och skadar ryktet.", logKind: "warn" },
      },
    ],
  }),
];

/** Genererar ett slumpmässigt beslut givet nuvarande tillstånd. */
export function makeDecision(state: GameState): PendingDecision {
  return pick(TEMPLATES)(state);
}
