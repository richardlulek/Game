/* ============================================================
   Berättelseläget "Arvet efter morfar" – en humoristisk kampanj
   som lär ut spelets alla system, kapitel för kapitel:

   0. Begravningen   – arvet, breven, Rogges lowball-bud
   1. Renoveringen   – skick, underhåll, energiklass
   2. Hyresgästen    – Gösta-dilemmat, ansökningar, kontrakt
   3. Förhandlingen  – höj/sänk hyra, nöjdhet, omförhandling
   4. Banken         – lån, LTV, handpenning, köp av hus #2
   5. Konjunkturen   – räntehöjning, cykler, fryspåse-bailout
   6. Bolaget        – bolagsnivå 2, kontor, Bolagsverket-skämtet
   7. Revanschen     – budkrig mot Rogge Flyt om grannhuset
   8. Dynastin       – nivå 3 + 20 MSEK → epilog och morfars klocka

   Allt story-tillstånd är ren, sparbar data (StoryState i types.ts).
   Breven levereras som PendingDecision (pausar klockan gratis) och
   kedjas via DecisionEffect.nextDecisionId. Ren logik, ingen React.
   ============================================================ */

import { DISTRICT_ZONES, emptyParcels } from "./city";
import { equityOf, loanTerms } from "./finance";
import { kr, msek } from "./format";
import { absMonth, builtYearFor, energyClassFor, genListing } from "./generators";
import { newId } from "./random";
import type {
  Application,
  GameState,
  PendingDecision,
  Property,
  StoryState,
  Tenant,
} from "./types";

export const STORY_COMPANY_NAME = "Grandpa's Properties";
export const GOSTA_NAME = "Gösta (Grandpa's buddy)";
export const ROGGE = "Roger ”Rogge” Flyt";

/** Fryspåse-säkerhetsnätet: under denna kassa rycker morfar ut (en gång). */
const BAILOUT_BELOW = 150_000;
const BAILOUT_AMOUNT = 400_000;

/* ── Beat-definitioner ─────────────────────────────────────────────── */

export interface StoryObjective {
  text: string;
  check: (s: GameState) => boolean;
}

export interface StoryBeat {
  id: string;
  chapter: number;
  title: string;
  /** Brev/scen som visas när kapitlet börjar (id i STORY_DECISIONS). */
  letterId?: string;
  objectives: StoryObjective[];
  /** Ledtråd om var i UI:t spelaren ska titta. */
  hint?: string;
}

export const hasFlag = (s: GameState, f: string) => (s.story?.flags ?? []).includes(f);

/** Morfars hus – fastigheten med storyTag "arvet". */
export const heirloomOf = (s: GameState): Property | undefined =>
  s.portfolio.find((p) => p.storyTag === "arvet");

const kap5Start = (s: GameState): number => {
  const f = (s.story?.flags ?? []).find((x) => x.startsWith("kap5start:"));
  return f ? parseInt(f.split(":")[1], 10) : Number.MAX_SAFE_INTEGER;
};

export const STORY_BEATS: StoryBeat[] = [
  {
    id: "prolog",
    chapter: 0,
    title: "The Funeral",
    letterId: "brev_ekelof",
    objectives: [
      { text: "Read the letters from the lawyer and Grandpa", check: (s) => hasFlag(s, "prolog_läst") },
    ],
    hint: "The house is in Villa Hill – look for the 🔵 marker on the map.",
  },
  {
    id: "renoveringen",
    chapter: 1,
    title: "The Renovation",
    letterId: "brev_kap1",
    objectives: [
      {
        text: "Renovate Grandpa's house to condition 60",
        check: (s) => (heirloomOf(s)?.condition ?? 0) >= 60,
      },
    ],
    hint: "Click the house → Maintain. The workers need a month per round – three rounds is enough. Let time pass in between.",
  },
  {
    id: "hyresgasten",
    chapter: 2,
    title: "The Tenant",
    letterId: "gosta_dilemma",
    objectives: [
      {
        text: "Sign leases so at least 2 units are rented",
        check: (s) => (heirloomOf(s)?.tenants.length ?? 0) >= 2,
      },
    ],
    hint: "The applications are in the property card under Tenants.",
  },
  {
    id: "forhandlingen",
    chapter: 3,
    title: "The Negotiation",
    letterId: "brev_kap3",
    objectives: [
      {
        text: "Negotiate a rent (raise, lower or extend a contract)",
        check: (s) => hasFlag(s, "förhandlat"),
      },
    ],
    hint: "Open a tenant in the property card → Raise/Lower the rent or Extend.",
  },
  {
    id: "banken",
    chapter: 4,
    title: "The Bank",
    letterId: "brev_kap4",
    objectives: [
      {
        text: "Buy your second property",
        check: (s) => s.portfolio.filter((p) => p.status === "klar").length >= 2,
      },
    ],
    hint: "The Market window – the estate sale is at the top. The bank arranges the loan automatically.",
  },
  {
    id: "konjunkturen",
    chapter: 5,
    title: "The Economy",
    letterId: "brev_kap5",
    objectives: [
      {
        text: "Survive 6 months with cash above zero",
        check: (s) => absMonth(s) >= kap5Start(s) + 6 && s.cash > 0,
      },
    ],
    hint: "Keep it rented, avoid panic sales. Cash flow is shown in the status bar.",
  },
  {
    id: "bolaget",
    chapter: 6,
    title: "The Company",
    letterId: "brev_kap6",
    objectives: [
      { text: "Expand the company to level 2", check: (s) => (s.companyLevel ?? 1) >= 2 },
    ],
    hint: "The Company window → Expand the company (requires equity + 2 properties).",
  },
  {
    id: "revanschen",
    chapter: 7,
    title: "The Rematch",
    letterId: "brev_kap7",
    objectives: [
      {
        text: "Win the bidding war against Rogge over the neighboring house",
        check: (s) => s.portfolio.some((p) => p.storyTag === "revansch"),
      },
    ],
    hint: "The neighboring house is in the Market window. Rogge bids against you – outbid him.",
  },
  {
    id: "dynastin",
    chapter: 8,
    title: "The Dynasty",
    letterId: "rogge_surbrev",
    objectives: [
      { text: "Reach company level 3", check: (s) => (s.companyLevel ?? 1) >= 3 },
      { text: "Reach 20 MSEK in equity", check: (s) => equityOf(s) >= 20_000_000 },
    ],
    hint: "More properties, kept rented, and reasonable leverage. Grandpa had patience – so should you.",
  },
];

export const beatById = (id: string): StoryBeat | undefined =>
  STORY_BEATS.find((b) => b.id === id);

export const beatIndex = (id: string): number => STORY_BEATS.findIndex((b) => b.id === id);

/* ── Breven och scenerna (skriptade beslut) ────────────────────────── */

type StoryDecisionFactory = (s: GameState) => PendingDecision;

const STORY_DECISIONS: Record<string, StoryDecisionFactory> = {
  /* Kapitel 0 – Begravningen */
  brev_ekelof: () => ({
    id: "story:brev_ekelof",
    portrait: "ekelof",
    title: "The Ekelöf & Sons Law Firm (no sons)",
    text:
      "”Dear heir. Your grandfather Gunnar has, as you may have noted at the funeral, passed away. " +
      "You hereby inherit: one (1) property in Villa Hill, referred to as 'the house', plus cash of 850,000 kr " +
      "found in the freezer in bags labeled 'ground beef 1994'. Forensic technicians have confirmed it is not ground beef.” " +
      "— Invoice enclosed: Drafting of this letter, 900 kr. Postage, 12 kr. Emotional support, 0 kr (not ordered).",
    options: [
      {
        label: "Accept the inheritance",
        detail: "The house + 850,000 kr",
        effect: { nextDecisionId: "brev_morfar_1", log: "Accepted the inheritance from Grandpa Gunnar.", logKind: "event" },
      },
      {
        label: "Ask if there is more money",
        detail: "There isn't",
        effect: { nextDecisionId: "brev_morfar_1", log: "Ekelöf: ”No. Billing for the question: 300 kr.” (included in the inheritance)", logKind: "info" },
      },
    ],
  }),

  brev_morfar_1: () => ({
    id: "story:brev_morfar_1",
    portrait: "morfar",
    title: "📜 Letter from Grandpa (1 of countless)",
    text:
      "”If you're reading this, I'm dead. Or Ekelöf sent the letter too early again – in which case, see you Sunday as usual. " +
      "The house is yours now. It was built in 1962, extended in 1971, 1978 and 1983. The building permit has been 'under review' since 1987 – don't bother the municipality unnecessarily. " +
      "Gösta lives on the ground floor. He doesn't pay rent, but he guards the house. Against what has never become clear. " +
      "Take care of the house, my boy. It has a roof, walls and POTENTIAL – two of three are in good shape.” — Grandpa",
    options: [
      {
        label: "Rest in peace, Grandpa",
        detail: "Continue",
        effect: { nextDecisionId: "rogge_lowball", log: "Read Grandpa's first letter.", logKind: "event" },
      },
    ],
  }),

  rogge_lowball: () => ({
    id: "story:rogge_lowball",
    portrait: "rogge",
    title: "🕶️ Visit: Roger ”Rogge” Flyt, Flyt Properties",
    text:
      "A man in white loafers clomps into the funeral reception and hands out business cards between the canapés. " +
      "”Rogge Flyt, Flyt Properties. Sorry for your loss and so on. I'll give you 1.2 million for the shack – cash, tomorrow. " +
      "That's over market, trust me, I have a driver's license and a pool.” " +
      "The house is worth more than four times that. Also: clause 7b of the will forbids a sale for the first 24 months.",
    options: [
      {
        label: "”The house is not for sale.”",
        detail: "Reputation +1 · Rogge won't forget you",
        effect: { reputation: 1, storyFlag: "prolog_läst", log: "Rejected Rogge's lowball bid. He smiled like a man who has seen pictures of smiles.", logKind: "event" },
      },
      {
        label: "Consider the offer... no. NO.",
        detail: "Clause 7b forbids it anyway",
        effect: { storyFlag: "prolog_läst", log: "Considered Rogge's offer until Ekelöf cleared his throat and pointed at clause 7b. Invoice: 900 kr. (included)", logKind: "info" },
      },
    ],
  }),

  /* Kapitel 1 – Renoveringen */
  brev_kap1: () => ({
    id: "story:brev_kap1",
    portrait: "morfar",
    title: "📜 Letter from Grandpa: About the house",
    text:
      "”You've seen the condition by now. Yes. I KNOW. The roof only leaks when it rains, and the wiring is original – " +
      "it crackles a bit when you turn on the kitchen light, which means it works. " +
      "Take the money from the bag and FIX UP the house. Condition below 40 scares off every tenant except Gösta, and Gösta doesn't count, he's Gösta. " +
      "Click the house on the map and choose Maintain. Do it a few times. Better condition = higher rent, fewer vacancies and an energy class that doesn't start with F as in 'Foul'.”",
    options: [
      {
        label: "Roll up your sleeves",
        detail: "Goal: condition 60",
        effect: { log: "Chapter 1: The Renovation. Grandpa's house must be renovated to condition 60.", logKind: "event" },
      },
    ],
  }),

  /* Kapitel 2 – Hyresgästen */
  gosta_dilemma: () => ({
    id: "story:gosta_dilemma",
    portrait: "gosta",
    title: "🚪 Gösta is at the door",
    text:
      "”I hear there's renovating going on,” Gösta says suspiciously, holding up a thermos as a shield. " +
      "”Ran water to the upper floor? A dishwasher? I'm no count.” " +
      "Gösta has lived here since 2009. Rent: 500 kr/mo (Grandpa's buddy price, last adjusted never). " +
      "He always pays on time, never complains, and guards the house. But the unit he lives in is worth 15 times more on the open market.",
    options: [
      {
        label: "”You stay, Gösta. The buddy price holds.”",
        detail: "Keep Gösta · 500 kr/mo · loyal forever · Reputation +2",
        effect: {
          reputation: 2, storyFlag: "gosta_kvar", nextDecisionId: "brev_kap2",
          log: "Gösta stays. He nodded slowly and offered coffee from the thermos. It was strong enough to light up the basement.", logKind: "event",
        },
      },
      {
        label: "”I need the unit, Gösta.”",
        detail: "Gösta moves out · the unit is freed · Reputation −2",
        effect: {
          reputation: -2, storyFlag: "gosta_ut", nextDecisionId: "brev_kap2",
          log: "Gösta packed the thermos and moved to his sister in The Suburbs. The house feels strangely quiet. And unguarded.", logKind: "warn",
        },
      },
    ],
  }),

  brev_kap2: () => ({
    id: "story:brev_kap2",
    portrait: "morfar",
    title: "📜 Letter from Grandpa: About tenants",
    text:
      "”Tenants are like weather – you don't get to choose, but you can dress for it. " +
      "Now that the house looks habitable, APPLICATIONS will come. Open the property card: there you see what they want to pay, how reliable they are (quality) " +
      "and the risk they suddenly 'forget' the rent (risk). Lease length is a trade-off: short leases give freedom, long ones give a good night's sleep. " +
      "And don't listen to people who want to pay in 'exposure'. I'd rather die. Literally, as you know.”",
    options: [
      {
        label: "Open the applications",
        detail: "Goal: 2 units rented",
        effect: { log: "Chapter 2: The Tenant. Applications have begun arriving for Grandpa's house.", logKind: "event" },
      },
    ],
  }),

  /* Kapitel 3 – Förhandlingen */
  brev_kap3: () => ({
    id: "story:brev_kap3",
    portrait: "morfar",
    title: "📜 Letter from Grandpa: About negotiation",
    text:
      "”Sooner or later you have to talk rent, and then everyone suddenly becomes an expert. " +
      "Raise it too much and they move out. Raise it moderately and they grumble but stay – the grumbling is included, it's how we socialize in this country. " +
      "Lower it if you want someone to stay a long time, and extend leases that are expiring before they get to think freely. " +
      "Warning: one of your tenants will mention their brother-in-law Kent-Ove 'at the rent tribunal'. Kent-Ove works in the kiosk NEXT TO the rent tribunal. Stand firm.”",
    options: [
      {
        label: "Time to negotiate",
        detail: "Goal: raise, lower or extend a rent",
        effect: { log: "Chapter 3: The Negotiation. Time to move a rent – up, down or forward in time.", logKind: "event" },
      },
    ],
  }),

  /* Kapitel 4 – Banken */
  brev_kap4: () => ({
    id: "story:brev_kap4",
    portrait: "ulla",
    title: "🏦 Meeting: Ulla at Oak Savings Bank",
    text:
      "Ulla has worked at the bank since punch cards. She studies you over her glasses: " +
      "”Well. Gunnar's grandchild. He kept his money in the freezer, did you know that? We TALKED about it.” " +
      "She slides a calculation forward: ”Here's how it works: you pay a DOWN PAYMENT in cash, the bank lends the rest up to a certain share of the price – that's called LTV. " +
      "Then you AMORTIZE. There's an estate in the area that wants to sell fast – the heirs live in Spain and get nervous about weather below 25 degrees. The price is... decent.”",
    options: [
      {
        label: "Take the loan pledge and go to the Market",
        detail: "Goal: buy property number two",
        effect: { log: "Chapter 4: The Bank. Ulla has arranged a loan pledge – the estate is on the Market.", logKind: "event" },
      },
    ],
  }),

  /* Kapitel 5 – Konjunkturen */
  brev_kap5: () => ({
    id: "story:brev_kap5",
    portrait: "morfar",
    title: "📜 Letter from Grandpa: About the economy",
    text:
      "”If you're reading this letter, the central bank just raised rates, because it always does sooner or later. Breathe. " +
      "I owned property in 1992. The rate was 500 percent. FIVE HUNDRED. We grilled sausages on the rate announcement, because it was the only thing that was free. " +
      "You'll survive a few percentage points. The rule is simple: keep it rented, sell nothing in panic, and buy when everyone else is crying. " +
      "The market moves in cycles – whoever has cash at the bottom of the cycle gets rich at the top. Whoever has white loafers rarely does for long.”",
    options: [
      {
        label: "Breathe. Hold on.",
        detail: "Goal: survive 6 months",
        effect: { log: "Chapter 5: The Economy. Rates have risen – keep cash above zero for six months.", logKind: "event" },
      },
    ],
  }),

  bailout_frys: () => ({
    id: "story:bailout_frys",
    portrait: "morfar",
    title: "🧊 A find in the freezer",
    text:
      "You're looking for something edible in Grandpa's old freezer and find, at the very bottom under an icy bag of herring, " +
      "another bag. Labeled 'CHRISTMAS HAM 1997'. It contains 400,000 kr and a post-it: " +
      "”I knew you'd look here sooner or later. Either you're hungry or broke. Both pass. — Grandpa”",
    options: [
      {
        label: "Thanks, Grandpa.",
        detail: `+${kr(BAILOUT_AMOUNT)} · happens only once`,
        effect: { cash: BAILOUT_AMOUNT, log: "Found Grandpa's last freezer bag: +400,000 kr. The herring stayed put.", logKind: "income" },
      },
    ],
  }),

  /* Kapitel 6 – Bolaget */
  brev_kap6: () => ({
    id: "story:brev_kap6",
    portrait: "morfar",
    title: "📜 Letter from Grandpa: About companies",
    text:
      "”Two houses and a working economy – you're now officially no longer a 'private person with problems' but an 'actor in the sector'. Congratulations. " +
      "Time to register a real company: an office, costs, and the right to say 'we' about yourself. " +
      "I tried to register a company once. 'House Ltd' – taken. 'House 2 Ltd' – taken. 'Gunnar's Houses & Revenge Ltd' – approved, but Grandma said no. " +
      "Go to the Company window and expand when you meet the requirements. And rename the firm if you like – it's your company now, not mine.”",
    options: [
      {
        label: "Register the company",
        detail: "Goal: company level 2",
        effect: { log: "Chapter 6: The Company. Expand to level 2 in the Company window.", logKind: "event" },
      },
    ],
  }),

  /* Kapitel 7 – Revanschen */
  brev_kap7: () => ({
    id: "story:brev_kap7",
    portrait: "rogge",
    title: "🕶️ Rogge Flyt buys up your street",
    text:
      "Rogge Flyt stands outside the neighboring house photographing it with a thumbs-up. " +
      "”What's up, heir! Flyt Properties is expanding. I'm buying the shack next door, ripping out everything with SOUL in it and renting per square millimeter. " +
      "Then I take the next house. And the next. Soon the hill will be called Flyt Hills. It's in focus groups right now.” " +
      "The neighboring house has just been listed for sale – and Rogge has already placed a bid. Grandpa would have expected you to do something about it.",
    options: [
      {
        label: "Not my street, Rogge.",
        detail: "Goal: win the bidding war over the neighboring house",
        effect: { log: "Chapter 7: The Rematch. Rogge Flyt is bidding on the neighboring house – outbid him on the Market.", logKind: "event" },
      },
    ],
  }),

  rogge_surbrev: () => ({
    id: "story:rogge_surbrev",
    portrait: "rogge",
    title: "📬 A sour letter on blank paper",
    text:
      "”Congrats or whatever. Bidding is really mostly a thing for people who like owning houses. " +
      "Flyt Properties is now PIVOTING to more exciting verticals. Padel. Padel is the future. " +
      "See you at the top – I'll take the elevator, you get the stairs. /R Flyt, CEO, founder, visionary, driver's license” " +
      "PS. Ekelöf sends word that Grandpa foresaw this letter and asked him to attach: ”Ha. — Gunnar”",
    options: [
      {
        label: "Frame the letter",
        detail: "Final goal: level 3 + 20 MSEK equity",
        effect: { reputation: 2, log: "Chapter 8: The Dynasty. Rogge pivoted to padel. Your street remains – and your growing empire.", logKind: "event" },
      },
    ],
  }),

  /* Epilog */
  brev_epilog: () => ({
    id: "story:brev_epilog",
    portrait: "morfar",
    title: "📜 Grandpa's last letter",
    text:
      "”If Ekelöf has done his job, you get this letter when you no longer need it – when the house has become many, " +
      "and 'Gunnar's boy' has become someone people call BEFORE the bank. I'm not surprised. I'm something else that starts with proud. " +
      "In the envelope is my watch. It's run wrong since 1979, but it runs – and that's the whole secret of this trade: " +
      "the important thing isn't to keep the right time, the important thing is not to stop. Keep building. The city is yours now.” — Grandpa. " +
      "(Ekelöf's final invoice enclosed: ”Storage of a watch, 26 years: 0 kr. For Gunnar: everything was 0 kr.”)",
    options: [
      {
        label: "⌚ Accept Grandpa's watch",
        detail: "+25 dynasty points · the campaign complete – the game continues freely",
        effect: { log: "🏆 THE INHERITANCE COMPLETE: Grandpa's watch now hangs on the office wall. The campaign is done – the city is yours.", logKind: "event" },
      },
    ],
  }),
};

/** Slår upp ett skriptat beslut via id ("story:xyz" eller "xyz"). */
export function storyDecisionById(id: string, s: GameState): PendingDecision | null {
  const key = id.startsWith("story:") ? id.slice(6) : id;
  const f = STORY_DECISIONS[key];
  return f ? f(s) : null;
}

/* ── Startläget: morfars hus ───────────────────────────────────────── */

function makeGosta(): Tenant {
  return {
    id: newId(),
    profile: "privat",
    name: GOSTA_NAME,
    profileName: "Private individual",
    quality: 0.4,
    defaultRisk: 0.001,
    monthsLeft: 999,
    termTotal: 999,
    rent: 500,
    satisfaction: 95,
  };
}

/** Bygger morfars hus på en ledig tomt i Villakullens utkant. */
export function makeInheritedHouse(fresh: GameState): Property {
  const candidates = emptyParcels(fresh).filter((p) => p.district === "kulle");
  // Utkanten av kullen: längst från stadskärnan – där morfar byggde i lugn och ro.
  const parcel = [...candidates].sort(
    (a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z),
  )[0];
  const area = 260;
  const condition = 25;
  const value = 5_200_000; // ungefär vad en sliten kullevilla är värd i modellen
  return {
    id: newId(),
    district: "kulle",
    districtName: "Villa Hill",
    type: "bostad",
    typeLabel: "Residential",
    area,
    condition,
    askPrice: value,
    purchasePrice: value, // arv: ingen skuld, "inköpspriset" = värdet vid arvskiftet
    baseRent: 260_000,
    upgrades: [],
    owned: true,
    rentMult: 1,
    opexMult: 1,
    vacancyMult: 1,
    valueMult: 1,
    // Morfar byggde om vinden och källaren till lägenheter (bygglov "pågående" sedan 1987).
    tenants: [makeGosta()],
    capacity: 3,
    status: "klar",
    buildLeft: 0,
    parcelId: parcel?.id,
    energyClass: energyClassFor(condition),
    builtYear: builtYearFor(condition, fresh.year),
    storyTag: "arvet",
    txHistory: [{ type: "bought", price: 0, month: fresh.month, year: fresh.year, party: "Inheritance from Grandpa Gunnar" }],
  };
}

/** Seedar ett nystartat spel till story-läget (anropas från RESET). */
export function seedStory(fresh: GameState): GameState {
  const house = makeInheritedHouse(fresh);
  const story: StoryState = { beat: "prolog", flags: ["inject:prolog"] };
  // Bara Villakullen är öppet i kapitel 0: marknadsobjekt och tomter i låsta
  // distrikt flyttar tillbaka till världspoolen tills områdena låses upp.
  const lockedListings = fresh.listings.filter((p) => p.district !== "kulle");
  return {
    ...fresh,
    cash: 850_000,
    scenarioId: "arvet",
    companyName: STORY_COMPANY_NAME,
    portfolio: [house],
    listings: fresh.listings.filter((p) => p.district === "kulle"),
    worldPool: [
      ...fresh.worldPool,
      ...lockedListings.map((p) => ({ ...p, listedMonth: undefined, expiresMonth: undefined })),
    ],
    lots: fresh.lots.filter((l) => l.district === "kulle"),
    story,
    tutorialDismissed: true,
    pendingDecision: STORY_DECISIONS.brev_ekelof(fresh),
    log: [
      { t: "📜 THE INHERITANCE: Grandpa Gunnar's house in Villa Hill is yours – along with 850,000 kr from the freezer.", kind: "event" },
      ...fresh.log,
    ],
  };
}

/* ── Skriptade hyresgäster (kapitel 2) ─────────────────────────────── */

function scriptedApplications(s: GameState, house: Property): Application[] {
  const nowAbs = absMonth(s);
  const slotRent = Math.max(4_000, Math.round(house.baseRent / house.capacity / 12));
  const mk = (
    name: string, profileName: string, quality: number, defaultRisk: number,
    rentFactor: number, term: number,
  ): Application => ({
    id: newId(),
    tenant: {
      id: newId(),
      profile: "privat",
      name,
      profileName,
      quality,
      defaultRisk,
      monthsLeft: term,
      termTotal: term,
      rent: Math.round(slotRent * rentFactor),
      satisfaction: 70,
    },
    expiresAbs: nowAbs + 5,
  });
  return [
    // Betalar förvånansvärt bra – replokal och boende i ett. Grannarna får åsikter.
    mk("The death-metal band Likbål", "Cultural venue", 1.1, 0.04, 1.25, 24),
    // Betalar lite under marknad men flyttar ALDRIG. Katterna behöver stabilitet.
    mk("Margit + 14 cats", "Private individual", 0.9, 0.005, 0.9, 120),
    // Vill egentligen betala i exposure. Erbjuder ändå några kronor.
    mk("The influencer couple @UrbanNesting", "Content creator", 0.3, 0.2, 0.45, 6),
  ];
}

/* ── Injects vid kapitelstart ──────────────────────────────────────── */

/** Skalar ett marknadsobjekt så spelaren garanterat har råd (dödsboet i kap 4). */
function makeAffordableListing(s: GameState): Property {
  const { maxLtv } = loanTerms(s);
  const afford = Math.max(900_000, (s.cash / Math.max(0.05, 1 - maxLtv)) * 0.8);
  let p = genListing(s);
  for (let i = 0; i < 30 && p.district !== "kulle" && p.district !== "förort"; i++) p = genListing(s);
  const f = Math.min(1, afford / p.askPrice);
  p.askPrice = Math.round(p.askPrice * f);
  p.baseRent = Math.round(p.baseRent * f);
  p.area = Math.max(80, Math.round(p.area * f));
  p.expiresMonth = absMonth(s) + 6; // arvingarna i Spanien har ändå is i magen
  p.storyTag = "dödsbo"; // kameran hittar objektet + StoryHud kan peka på det
  return p;
}

/** Grannhuset i kapitel 7 – Rogge bjuder direkt. */
function makeRoggeListing(s: GameState): Property {
  let p = genListing(s);
  for (let i = 0; i < 30 && p.district !== "kulle"; i++) p = genListing(s);
  p.storyTag = "revansch";
  p.expiresMonth = absMonth(s) + 6;
  return p;
}

function applyInject(s: GameState, beat: StoryBeat): GameState {
  switch (beat.id) {
    case "hyresgasten": {
      const house = heirloomOf(s);
      if (!house) return s;
      const apps = scriptedApplications(s, house);
      return {
        ...s,
        portfolio: s.portfolio.map((p) =>
          p.id === house.id ? { ...p, applications: [...(p.applications ?? []), ...apps] } : p,
        ),
        log: [{ t: "📬 Three applications have arrived for Grandpa's house – one of them smells of smoke machine.", kind: "event" as const }, ...s.log],
      };
    }
    case "banken": {
      const listing = makeAffordableListing(s);
      return {
        ...s,
        listings: [listing, ...s.listings],
        log: [{ t: `🏦 The estate in ${listing.districtName} has been listed for ${msek(listing.askPrice)} – the heirs in Spain wanted to sell the day before yesterday.`, kind: "event" as const }, ...s.log],
      };
    }
    case "konjunkturen": {
      const hike = 1.75;
      return {
        ...s,
        interestRate: +Math.min(12, s.interestRate + hike).toFixed(2),
        story: s.story
          ? { ...s.story, flags: [...s.story.flags, `kap5start:${absMonth(s)}`] }
          : s.story,
        log: [{ t: `🏦 THE CENTRAL BANK raises the policy rate by ${hike.toFixed(2)} percentage points. Ulla at the bank called just to say ”what did I tell you”.`, kind: "warn" as const }, ...s.log],
      };
    }
    case "revanschen": {
      const listing = makeRoggeListing(s);
      return {
        ...s,
        listings: [listing, ...s.listings],
        competingBid: {
          listingId: listing.id,
          rivalName: ROGGE,
          amount: Math.round(listing.askPrice * 1.02),
          expiresAbs: absMonth(s) + 2,
          round: 1,
        },
        log: [{ t: `🕶️ ${ROGGE} has placed a bid on the neighboring house in ${listing.districtName}. He calls it ”Flyt Hills phase 1”.`, kind: "warn" as const }, ...s.log],
      };
    }
    default:
      return s;
  }
}

/* ── Story-flaggornas sidoeffekter (från RESOLVE_DECISION) ─────────── */

export function applyStoryFlag(s: GameState, flag: string): GameState {
  let next: GameState = s.story
    ? { ...s, story: { ...s.story, flags: [...s.story.flags, flag] } }
    : s;
  if (flag === "gosta_ut") {
    const house = heirloomOf(next);
    if (house) {
      next = {
        ...next,
        portfolio: next.portfolio.map((p) =>
          p.id === house.id ? { ...p, tenants: p.tenants.filter((t) => t.name !== GOSTA_NAME) } : p,
        ),
      };
    }
  }
  return next;
}

/** Krok från reducer: markera att spelaren förhandlat (kapitel 3). */
export function markNegotiated(s: GameState): GameState {
  if (!s.story || s.story.done || hasFlag(s, "förhandlat")) return s;
  return { ...s, story: { ...s.story, flags: [...s.story.flags, "förhandlat"] } };
}

/* ── Kampanjmotorn ─────────────────────────────────────────────────── */

/**
 * Driver kampanjen framåt: kör kapitel-injects, delar ut brev, kollar mål
 * och avancerar beats. Anropas efter varje reducer-steg (gameStore) och i
 * månadssimuleringen. Idempotent och billig när inget hänt.
 */
export function advanceStory(state: GameState): GameState {
  let s = state;
  if (!s.story || s.story.done) return s;

  for (let guard = 0; guard < 4; guard++) {
    if (s.pendingDecision) return s; // vänta tills brevet är läst
    const st = s.story!;
    const beat = beatById(st.beat);
    if (!beat) return s;

    // 1) Kapitelstart: inject + brev (en gång per beat).
    const injectFlag = `inject:${beat.id}`;
    if (!st.flags.includes(injectFlag)) {
      s = applyInject(s, beat);
      s = { ...s, story: { ...s.story!, flags: [...s.story!.flags, injectFlag] } };
      if (beat.letterId) {
        const d = storyDecisionById(beat.letterId, s);
        if (d) return { ...s, pendingDecision: d };
      }
      continue;
    }

    // 2) Fryspåse-säkerhetsnätet (från kapitel 2 och framåt, en gång).
    if (!st.bailoutUsed && beat.chapter >= 2 && s.cash < BAILOUT_BELOW) {
      const d = storyDecisionById("bailout_frys", s);
      if (d) return { ...s, story: { ...s.story!, bailoutUsed: true }, pendingDecision: d };
    }

    // 3) Kapitel 7: om Rogge vann huset – lägg ut det igen (han flippar det).
    if (beat.id === "revanschen") {
      const stillListed = s.listings.some((p) => p.storyTag === "revansch");
      const owned = s.portfolio.some((p) => p.storyTag === "revansch");
      if (!stillListed && !owned) {
        const listing = makeRoggeListing(s);
        listing.askPrice = Math.round(listing.askPrice * 1.06); // flipparpåslag
        s = {
          ...s,
          listings: [listing, ...s.listings],
          competingBid: {
            listingId: listing.id,
            rivalName: ROGGE,
            amount: Math.round(listing.askPrice * 1.02),
            expiresAbs: absMonth(s) + 2,
            round: 1,
          },
          log: [{ t: "🕶️ Rogge flips the neighboring house – back on the market, now with a ”styled entryway” and a higher price.", kind: "warn" as const }, ...s.log],
        };
        return s;
      }
    }

    // 4) Alla mål klara → nästa beat (eller epilog).
    if (beat.objectives.every((o) => o.check(s))) {
      const idx = beatIndex(beat.id);
      const nextBeat = STORY_BEATS[idx + 1];
      if (!nextBeat) {
        // Kampanjen fullbordad: morfars klocka + epilogbrevet.
        const luxuries = s.ownerLuxuries ?? [];
        s = {
          ...s,
          story: { ...s.story!, done: true },
          ownerLuxuries: luxuries.includes("morfarsklocka") ? luxuries : [...luxuries, "morfarsklocka"],
          pendingDecision: storyDecisionById("brev_epilog", s),
        };
        return s;
      }
      s = { ...s, story: { ...s.story!, beat: nextBeat.id } };
      const unlockMsg = unlockLogFor(nextBeat.id);
      if (unlockMsg) s = { ...s, log: [{ t: unlockMsg, kind: "event" as const }, ...s.log] };
      continue; // kör nästa beats inject/brev direkt
    }

    return s;
  }
  return s;
}

/* ── Tidnings-förstasidor vid kapitelslut (E) ──────────────────────── */

/** Innehåll till STADSBLADETs förstasida när ett kapitel klaras. */
export interface StoryFront {
  headline: string;
  sub: string;
  body: string;
  icon: string;
  caption: string;
}

/** Förstasidor för de kapitel som förtjänar en löpsedel (nivå-tidningen
 *  täcker redan Bolaget/Dynastin). Nyckel = beat-id som just KLARATS. */
export const CHAPTER_FRONTS: Record<string, StoryFront> = {
  renoveringen: {
    headline: "THE SHACK ON THE HILL HAS A NEW ROOF",
    sub: "The neighbors: ”Finally.” Gösta: ”The kitchen crackles less now. Suspicious.”",
    body:
      "Villa Hill's most talked-about property – colloquially 'Gunnar's shack' – has been renovated by the heir. " +
      "Workers confirm that the roof now leaks 'the right way, i.e. not at all'. " +
      "The municipal permit office states that it is 'reviewing the 1987 case with renewed energy'.",
    icon: "🔨",
    caption: "The house on the hill, now with a roof.",
  },
  hyresgasten: {
    headline: "NEW TENANTS ON THE HILL",
    sub: "Neighborly relations are described as ”surprisingly good, with some reservations about the noise level on Thursdays”.",
    body:
      "The newly renovated house on Villa Hill has tenants. The neighborhood reports " +
      "alternating organ music, running cats and the occasional smoke-machine test. The landlord comments: " +
      "'Everyone pays in money. That was the most important requirement.' The City Herald has reached out to the band Likbål, " +
      "which responds with a riff signature.",
    icon: "🎸",
    caption: "Move-in underway.",
  },
  banken: {
    headline: "THE HEIR EXPANDS",
    sub: "Oak Savings Bank: ”The math holds. We counted twice. Ulla three times.”",
    body:
      "With a loan pledge from Oak Savings Bank, the heir has acquired a second property – the estate " +
      "whose heirs are reportedly already back in Marbella. The bank describes the customer as " +
      "'strikingly like his grandfather, only with the money in the bank instead of the freezer'.",
    icon: "🏦",
    caption: "Property number two.",
  },
  revanschen: {
    headline: "FLYT PROPERTIES PIVOTS TO PADEL",
    sub: "Roger Flyt: ”Entirely voluntary. Real estate was really mostly a thing for people who like houses.”",
    body:
      "The bidding war over the neighboring house on Villa Hill is over: the heir won. Flyt Properties announces " +
      "the same day a 'strategic pivot to the racket-sport vertical'. Industry analysts note that " +
      "the company's white BMW was seen leaving the hill 'at good speed, though privately leased'. Grandpa's comment, " +
      "relayed via lawyer: ”Ha.”",
    icon: "🎾",
    caption: "R. Flyt leaves the hill.",
  },
};

/* ── Morfars minneslappar (F) ──────────────────────────────────────── */

export interface MemoryNote {
  id: string;
  /** Kartposition; null = placeras vid morfars hus-parcell. */
  x: number | null;
  z: number | null;
  title: string;
  text: string;
}

export const MEMORY_NOTES: MemoryNote[] = [
  {
    id: "vattentornet",
    x: -382, z: -338,
    title: "The Water Tower",
    text:
      "”Here I proposed to Grandma, June 1961. She said yes because it was windy and she wanted to go down. " +
      "We were married for 52 years. Sometimes good timing is enough.” — Grandpa",
  },
  {
    id: "klocktornet",
    x: 152, z: 30,
    title: "The Clock Tower by the permit office",
    text:
      "”The permit office. My extension case has been 'under review' since 1987. " +
      "I water their geraniums every Friday while I wait. You should tend your relationships.” — Grandpa",
  },
  {
    id: "skorstenarna",
    x: 325, z: -256,
    title: "The Factory Chimneys",
    text:
      "”My first paycheck, 1953. The foreman said I was too frail to carry bricks. " +
      "The house his grandchild rents today, I happen to know the owner of. Carry bricks, my boy – but own the house.” — Grandpa",
  },
  {
    id: "hamnkajen",
    x: 40, z: 308,
    title: "The Harbor Quay",
    text:
      "”From here I was going to emigrate to America, spring 1958. The boat left without me – " +
      "I had found a lot on the way to the quay. America managed fine. So did I.” — Grandpa",
  },
  {
    id: "angen",
    x: -242, z: 230,
    title: "The Meadow",
    text:
      "”In this meadow I taught your mother to ride a bike, summer 1974. She rode straight into a cow. " +
      "The cow was fine. Build something nice here one day – the land is better than it looks.” — Grandpa",
  },
  {
    id: "appeltradet",
    x: null, z: null,
    title: "The Neighbor's Apple Tree",
    text:
      "”The neighbor's apple tree. The branches hanging over the fence are legally yours – " +
      "I checked with Ekelöf (invoice 900 kr, worth it). Harvest with a clear conscience.” — Grandpa",
  },
];

/** Flagg-id för en hittad lapp. */
export const noteFlag = (id: string) => `lapp:${id}`;

export const foundNotes = (s: GameState): number =>
  MEMORY_NOTES.filter((n) => hasFlag(s, noteFlag(n.id))).length;

/* ── Distriktsupplåsning (A): staden öppnas kapitel för kapitel ────── */

/** Distrikt som ÖPPNAS när respektive beat börjar (kumulativt). */
const DISTRICT_UNLOCK_AT: Record<string, string[]> = {
  prolog: ["kulle"],
  forhandlingen: ["förort"],
  banken: ["innerstad"],
  konjunkturen: ["centrum"],
  bolaget: ["hamnen"],
  revanschen: ["industri"],
  dynastin: ["finans"],
};

/** Namn för upplåsningsloggen. */
const DISTRICT_NAMES: Record<string, string> = {
  kulle: "Villa Hill", förort: "The Suburbs", innerstad: "Inner City",
  centrum: "Downtown", hamnen: "The Harbor", industri: "Industrial District", finans: "Financial District",
};

/**
 * Upplåsta distrikt i berättelseläget, eller null när allt är öppet
 * (vanligt spel, eller kampanjen fullbordad).
 */
export function unlockedDistrictsFor(s: GameState): ReadonlySet<string> | null {
  if (!s.story || s.story.done) return null;
  const idx = beatIndex(s.story.beat);
  if (idx < 0) return null;
  const set = new Set<string>();
  for (let i = 0; i <= idx; i++) {
    for (const d of DISTRICT_UNLOCK_AT[STORY_BEATS[i].id] ?? []) set.add(d);
  }
  return set;
}

/** Är distriktet låst för spelaren just nu? */
export function districtLocked(s: GameState, district: string): boolean {
  const u = unlockedDistrictsFor(s);
  return u !== null && !u.has(district);
}

/**
 * Under kapitel 0–2 får morfars hus inga slumpansökningar – scenen ska
 * ägas av de skriptade sökandena (metalbandet, Margit och influencer-
 * paret). Från kapitel 3 öppnar det vanliga flödet igen.
 */
export function suppressOrganicApplications(s: GameState, p: Property): boolean {
  if (!s.story || s.story.done) return false;
  if (p.storyTag !== "arvet") return false;
  return beatIndex(s.story.beat) <= beatIndex("hyresgasten");
}

/** Loggrad när ett beat öppnar nya områden. */
export function unlockLogFor(beatId: string): string | null {
  const opened = DISTRICT_UNLOCK_AT[beatId] ?? [];
  if (opened.length === 0 || beatId === "prolog") return null;
  const names = opened.map((d) => DISTRICT_NAMES[d] ?? d).join(", ");
  return `🔓 NEW AREA: ${names} is now open for business – the city grows with you.`;
}

/* ── Berättelseregi: pauser mellan breven ──────────────────────────── */

/** Regi för ett brev: kameran visar scenen INNAN modalen öppnas.
 *  Antingen fokus på en story-fastighet (focusTag) eller en fast punkt
 *  på kartan (focusDistrict = svep över ett distrikt, HK, hela staden). */
export interface StoryCinematic {
  /** storyTag på fastigheten kameran ska glida till. */
  focusTag?: "arvet" | "dödsbo" | "revansch";
  /** Distrikt vars mitt kameran ska svepa till ("hk" = huvudkontoret,
   *  "staden" = utzoomad vy över hela kartan). */
  focusDistrict?: string;
  /** Kameraavstånd för närbilden. */
  zoom: number;
  /** Paus i millisekunder innan brevet öppnas (klick hoppar över). */
  holdMs: number;
  /** Rogges bil glider in under pausen. */
  car?: boolean;
  /** Text i pauschippen längst ner. */
  hint: string;
}

/**
 * Brev som föregås av en scen, nycklade på pendingDecision-id.
 * Prologen: arvet tas emot → man landar framför huset → morfars brev;
 * brevet läst → Rogges bil glider in → hans lowball-bud; budet avfärdat →
 * blicken tillbaka på allt som behöver göras → renoveringsbrevet.
 * Kap 2–8: ansökningarna vid huset, distriktspremiärerna, dödsboet,
 * huvudkontoret, Rogges bil vid grannhuset och epilogens stadsvy.
 */
export const STORY_CINEMATICS: Record<string, StoryCinematic> = {
  "story:brev_morfar_1": {
    focusTag: "arvet", zoom: 62, holdMs: 3400,
    hint: "Villa Hill. Grandpa's house. Your house.",
  },
  "story:rogge_lowball": {
    focusTag: "arvet", zoom: 62, holdMs: 4200, car: true,
    hint: "A white, freshly polished sedan glides up to the lot line …",
  },
  "story:brev_kap1": {
    focusTag: "arvet", zoom: 70, holdMs: 3200,
    hint: "The tarp. The flagpole. The list writes itself.",
  },
  // Kap 2: taket är lagat – och ryktet har gått. Folk står vid grinden.
  "story:gosta_dilemma": {
    focusTag: "arvet", zoom: 62, holdMs: 3200,
    hint: "There's a smell of fresh coffee from the basement. And … smoke machine?",
  },
  // Kap 3: staden öppnar sig – Förorten är inte längre bara en skylt.
  "story:brev_kap3": {
    focusDistrict: "förort", zoom: 240, holdMs: 3600,
    hint: "🔓 The Suburbs. Grandpa called them 'the future, but with worse bus connections'.",
  },
  // Kap 4: dödsboet har lagts ut – kameran hittar objektet före brevet.
  "story:brev_kap4": {
    focusTag: "dödsbo", zoom: 80, holdMs: 3400,
    hint: "An estate for sale. The heirs in Spain are cool-headed – but not infinitely so.",
  },
  // Kap 5: Centrum öppnar – och Riksbanken höjer tonläget.
  "story:brev_kap5": {
    focusDistrict: "centrum", zoom: 260, holdMs: 3600,
    hint: "🔓 Downtown. Here square meters are measured in prestige – and the rate in sleepless nights.",
  },
  // Kap 6: blicken hem till huvudkontoret – dags att bli ett riktigt bolag.
  "story:brev_kap6": {
    focusDistrict: "hk", zoom: 90, holdMs: 3400,
    hint: "The headquarters. Grandpa would have called it 'needlessly fancy'. He'd have meant it as praise.",
  },
  // Kap 7: den vita sedanen glider in vid grannhuset. Rogge är tillbaka.
  "story:brev_kap7": {
    focusTag: "revansch", zoom: 62, holdMs: 4200, car: true,
    hint: "A familiar white sedan parks by the neighboring house …",
  },
  // Kap 8: sista distriktet öppnar – och Rogge fattar pennan i vredesmod.
  "story:rogge_surbrev": {
    focusDistrict: "finans", zoom: 260, holdMs: 3600,
    hint: "🔓 The Financial District. Glass facades, corner offices and prices with many zeros.",
  },
  // Epilogen: staden från ovan – allt du byggt, i en enda vy.
  "story:brev_epilog": {
    focusDistrict: "staden", zoom: 620, holdMs: 4600,
    hint: "The city. Your city. Grandpa would have nodded slowly and offered thermos coffee.",
  },
};

/** Kamerans målpunkt för focusDistrict ("hk" och "staden" är specialfall). */
export function cinematicPointFor(district: string): { x: number; z: number } {
  if (district === "hk") return { x: -225, z: 215 };
  if (district === "staden") return { x: 0, z: 20 };
  const z = DISTRICT_ZONES.find((d) => d.district === district);
  return z ? { x: z.x, z: z.z } : { x: 0, z: 0 };
}
