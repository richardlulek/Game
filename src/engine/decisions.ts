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
  (_s) => ({
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
  (_s) => ({
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
  (_s) => ({
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
  (_s) => {
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
  (_s) => ({
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

// ── Industribeslut (triggas bara om spelaren äger relevant sektor) ─────────

const INDUSTRY_TEMPLATES: Template[] = [
  // Hotell 1: Stjärnuppgradering
  (_s) => ({
    id: "stjarn_upg",
    title: "Hotellguide vill uppgradera er rating",
    text: "En ledande hotellguide erbjuder er att ansöka om en högre stjärnklassning – men kräver renovering och tjänsteförbättringar.",
    options: [
      {
        label: `Investera i uppgradering (500 000 kr)`,
        detail: "−500 000 kr · Reputation +6",
        effect: { cash: -500_000, reputation: 6, log: "Hotellets stjärnklassning kan höjas – imponerande!", logKind: "upg" },
      },
      {
        label: "Tacka nej",
        detail: "Reputation −1",
        effect: { reputation: -1, log: "Tackade nej till stjärnuppgraderingen.", logKind: "info" },
      },
    ],
  }),

  // Hotell 2: Kritisk recension
  (_s) => ({
    id: "kritisk_recension",
    title: "Kritisk recension på nätet",
    text: "En influencer publicerade en negativ recension av ett av era hotell. Ryktespoäng sjunker snabbt om ni inte agerar.",
    options: [
      {
        label: "Bjud in recensenten (25 000 kr)",
        detail: "−25 000 kr · Reputation +2",
        effect: { cash: -25_000, reputation: 2, log: "Bjöd in kritikern – positiv uppföljning publicerades.", logKind: "income" },
      },
      {
        label: "Ignorera kritiken",
        detail: "Reputation −3",
        effect: { reputation: -3, log: "Ignorerade recensionen – negativ stämning kvarstår.", logKind: "warn" },
      },
    ],
  }),

  // Energi 1: Elmarknadsreform
  (_s) => ({
    id: "elreform",
    title: "Riksdagen ser över elcertifikaten",
    text: "En ny utredning föreslår sänkta elcertifikat. Ni kan lobbya för att bevara subventionen eller acceptera förändringen.",
    options: [
      {
        label: "Lobbya (150 000 kr, 60 % chans att lyckas)",
        detail: "−150 000 kr · möjlig bevarad subvention",
        effect: { cash: -150_000, reputation: 1, log: "Lobbade mot sänkta elcertifikat – resultatet avgörs i riksdagen.", logKind: "expense" },
      },
      {
        label: "Acceptera förändringen",
        detail: "Ingen kostnad, men lägre energiintäkter",
        effect: { log: "Accepterade elmarknadsreformen – intäkterna kan påverkas.", logKind: "info" },
      },
    ],
  }),

  // Energi 2: Nätanslutningsinvestering
  (_s) => ({
    id: "nätanslutning",
    title: "Kraftnätet vill ansluta ny kapacitet",
    text: "Svenska Kraftnät erbjuder nätförstärkning för er park, men kräver medfinansiering.",
    options: [
      {
        label: "Investera i nätförstärkning (800 000 kr)",
        detail: "−800 000 kr · Reputation +3 · ökad kapacitetspotential",
        effect: { cash: -800_000, reputation: 3, log: "Nätanslutning förstärkt – kapacitetsökning möjlig.", logKind: "upg" },
      },
      {
        label: "Avvakta (gratisalternativ om 6 månader)",
        detail: "Ingen kostnad nu",
        effect: { log: "Avvaktar nätanslutningserbjudandet.", logKind: "info" },
      },
    ],
  }),

  // Logistik 1: Automationsupphandling
  (_s) => ({
    id: "automationsupphandling",
    title: "Robotleverantör med subventionerat erbjudande",
    text: "En ledande robotleverantör erbjuder komplett automationssystem till 30 % rabatt – men affären måste slutas nu.",
    options: [
      {
        label: "Köp automationssystemet (600 000 kr)",
        detail: "−600 000 kr · Reputation +2 · direkt automationsboost",
        effect: { cash: -600_000, reputation: 2, log: "Investerade i automationssystem – logistikeffektiviteten ökar.", logKind: "upg" },
      },
      {
        label: "Vänta på ordinarie uppgradering",
        detail: "Ingen kostnad nu",
        effect: { log: "Tackade nej till subventionerat automationserbjudande.", logKind: "info" },
      },
    ],
  }),

  // Logistik 2: Strejkhot
  (_s) => ({
    id: "strejkhot",
    title: "Lagerarbetare hotar med strejk",
    text: "Facket kräver löneförhöjning. Vägrar ni höja löner riskerar ni att kontrakt bryts och reputation skadas allvarligt.",
    options: [
      {
        label: "Höj lönerna (300 000 kr engångskostnad)",
        detail: "−300 000 kr · undvik strejk",
        effect: { cash: -300_000, reputation: 1, log: "Kom överens med facket – strejk undviken.", logKind: "expense" },
      },
      {
        label: "Håll fast vid lönerna",
        detail: "Reputation −4 · risk att kontrakt bryts",
        effect: { reputation: -4, log: "Strejk utbryter – driftstörning och skadat rykte.", logKind: "warn" },
      },
    ],
  }),
];

/** Genererar ett slumpmässigt beslut givet nuvarande tillstånd. */
export function makeDecision(state: GameState): PendingDecision {
  const hasHotell = (state.industryPortfolio ?? []).some((a) => a.sector === "hotell" && a.status === "klar");
  const hasEnergi = (state.industryPortfolio ?? []).some((a) => a.sector === "energi" && a.status === "klar");
  const hasLogistik = (state.industryPortfolio ?? []).some((a) => a.sector === "logistik" && a.status === "klar");

  const pool: Template[] = [...TEMPLATES];
  if (hasHotell)   pool.push(INDUSTRY_TEMPLATES[0], INDUSTRY_TEMPLATES[1]);
  if (hasEnergi)   pool.push(INDUSTRY_TEMPLATES[2], INDUSTRY_TEMPLATES[3]);
  if (hasLogistik) pool.push(INDUSTRY_TEMPLATES[4], INDUSTRY_TEMPLATES[5]);

  return pick(pool)(state);
}
