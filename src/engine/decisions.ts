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
    title: "Anchor tenant seeking space",
    text: "An established group wants to sign a long lease in the city – but demands a 10% discount on market rent in exchange for filling several units.",
    options: [
      {
        label: "Offer the discount",
        detail: "Reputation +4 · demand +3%",
        effect: {
          reputation: 4,
          demandMod: 1.03,
          log: "Signed a framework deal with an anchor tenant – the market takes notice.",
          logKind: "income",
        },
      },
      {
        label: "Stick to market rent",
        detail: "Nothing happens",
        effect: { log: "Declined the anchor tenant’s discount demand.", logKind: "info" },
      },
    ],
  }),

  // 2. Medial uppmärksamhet
  (_s) => ({
    id: "press",
    title: "Journalist wants to run a feature",
    text: "A business journalist wants to profile your growing property company. A PR agency can spin the story positively – for a fee.",
    options: [
      {
        label: `Hire a PR agency (${msek(150_000)})`,
        detail: "−150,000 kr · Reputation +6",
        effect: { cash: -150_000, reputation: 6, log: "A positive feature is published – your reputation strengthens.", logKind: "income" },
      },
      {
        label: "Decline the interview",
        detail: "Reputation −1",
        effect: { reputation: -1, log: "Declined the feature – the journalist wrote a cool piece.", logKind: "warn" },
      },
    ],
  }),

  // 3. Energipriskris
  (_s) => ({
    id: "energi",
    title: "Energy prices surge",
    text: "Winter power prices hit new records. You can invest in your own energy production or pass the cost on to tenants.",
    options: [
      {
        label: `Invest in solar panels (${msek(400_000)})`,
        detail: "−400,000 kr · lower tax burden",
        effect: { cash: -400_000, taxMod: 0.97, log: "Invested in solar panels – net operating income stabilizes.", logKind: "upg" },
      },
      {
        label: "Raise the charges",
        detail: "Reputation −3 · demand −2%",
        effect: { reputation: -3, demandMod: 0.98, log: "Passed the energy cost on to tenants – discontent arises.", logKind: "warn" },
      },
    ],
  }),

  // 4. Kommunal markanvisning
  (_s) => {
    const cost = Math.round(rnd(0.6, 1.4) * 1e6);
    return {
      id: "markanvisning",
      title: "The municipality offers a land allocation",
      text: `The municipality offers a buildable lot at a discounted price (${msek(cost)}) if you commit to developing it.`,
      options: [
        {
          label: `Accept (${msek(cost)})`,
          detail: "−cash · +1 lot to build on",
          effect: { cash: -cost, addLot: true, reputation: 1, log: "Accepted the municipality’s land allocation – a new lot awaits.", logKind: "buy" },
        },
        {
          label: "Decline",
          detail: "Nothing happens",
          effect: { log: "Passed on the municipality’s land allocation.", logKind: "info" },
        },
      ],
    };
  },

  // 5. Vattenskada-tvist
  (_s) => ({
    id: "tvist",
    title: "Tenant threatens litigation",
    text: "A tenant demands compensation for water damage and threatens legal action. You can settle amicably or contest the claim.",
    options: [
      {
        label: `Settle (${msek(200_000)})`,
        detail: "−200,000 kr · Reputation +2",
        effect: { cash: -200_000, reputation: 2, log: "Settlement reached in the water-damage case – goodwill preserved.", logKind: "expense" },
      },
      {
        label: "Contest the claim",
        detail: "Reputation −4 (but no payout)",
        effect: { reputation: -4, log: "Contested the tenant’s claim – the case drags on and hurts your reputation.", logKind: "warn" },
      },
    ],
  }),
];

// ── Industribeslut (triggas bara om spelaren äger relevant sektor) ─────────

const INDUSTRY_TEMPLATES: Template[] = [
  // Hotell 1: Stjärnuppgradering
  (_s) => ({
    id: "stjarn_upg",
    title: "Hotel guide wants to upgrade your rating",
    text: "A leading hotel guide invites you to apply for a higher star rating – but requires renovation and service improvements.",
    options: [
      {
        label: `Invest in an upgrade (500,000 kr)`,
        detail: "−500,000 kr · Reputation +6",
        effect: { cash: -500_000, reputation: 6, log: "The hotel’s star rating may be raised – impressive!", logKind: "upg" },
      },
      {
        label: "Decline",
        detail: "Reputation −1",
        effect: { reputation: -1, log: "Declined the star upgrade.", logKind: "info" },
      },
    ],
  }),

  // Hotell 2: Kritisk recension
  (_s) => ({
    id: "kritisk_recension",
    title: "Critical review online",
    text: "An influencer published a negative review of one of your hotels. Reputation drops fast if you don’t act.",
    options: [
      {
        label: "Invite the reviewer (25,000 kr)",
        detail: "−25,000 kr · Reputation +2",
        effect: { cash: -25_000, reputation: 2, log: "Invited the critic – a positive follow-up was published.", logKind: "income" },
      },
      {
        label: "Ignore the criticism",
        detail: "Reputation −3",
        effect: { reputation: -3, log: "Ignored the review – the negative mood lingers.", logKind: "warn" },
      },
    ],
  }),

  // Energi 1: Elmarknadsreform
  (_s) => ({
    id: "elreform",
    title: "Parliament reviews green certificates",
    text: "A new inquiry proposes cutting green certificates. You can lobby to preserve the subsidy or accept the change.",
    options: [
      {
        label: "Lobby (150,000 kr, 60% chance of success)",
        detail: "−150,000 kr · possible preserved subsidy",
        effect: { cash: -150_000, reputation: 1, log: "Lobbied against cutting green certificates – the outcome is decided in parliament.", logKind: "expense" },
      },
      {
        label: "Accept the change",
        detail: "No cost, but lower energy income",
        effect: { log: "Accepted the power-market reform – income may be affected.", logKind: "info" },
      },
    ],
  }),

  // Energi 2: Nätanslutningsinvestering
  (_s) => ({
    id: "nätanslutning",
    title: "The grid wants to connect new capacity",
    text: "The national grid offers a grid upgrade for your park, but requires co-financing.",
    options: [
      {
        label: "Invest in a grid upgrade (800,000 kr)",
        detail: "−800,000 kr · Reputation +3 · higher capacity potential",
        effect: { cash: -800_000, reputation: 3, log: "Grid connection strengthened – a capacity increase is possible.", logKind: "upg" },
      },
      {
        label: "Wait (free option in 6 months)",
        detail: "No cost now",
        effect: { log: "Waiting on the grid-connection offer.", logKind: "info" },
      },
    ],
  }),

  // Logistik 1: Automationsupphandling
  (_s) => ({
    id: "automationsupphandling",
    title: "Robotics vendor with a subsidized offer",
    text: "A leading robotics vendor offers a complete automation system at 30% off – but the deal must close now.",
    options: [
      {
        label: "Buy the automation system (600,000 kr)",
        detail: "−600,000 kr · Reputation +2 · immediate automation boost",
        effect: { cash: -600_000, reputation: 2, log: "Invested in an automation system – logistics efficiency rises.", logKind: "upg" },
      },
      {
        label: "Wait for the regular upgrade",
        detail: "No cost now",
        effect: { log: "Declined the subsidized automation offer.", logKind: "info" },
      },
    ],
  }),

  // Logistik 2: Strejkhot
  (_s) => ({
    id: "strejkhot",
    title: "Warehouse workers threaten to strike",
    text: "The union demands a pay raise. If you refuse, you risk broken contracts and serious reputation damage.",
    options: [
      {
        label: "Raise wages (300,000 kr one-off cost)",
        detail: "−300,000 kr · avoid the strike",
        effect: { cash: -300_000, reputation: 1, log: "Reached an agreement with the union – strike avoided.", logKind: "expense" },
      },
      {
        label: "Hold the line on wages",
        detail: "Reputation −4 · risk of broken contracts",
        effect: { reputation: -4, log: "A strike breaks out – disruption and reputation damage.", logKind: "warn" },
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
