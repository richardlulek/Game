/* ============================================================
   Rivalpersonligheter – varje konkurrentbolag har en frontfigur
   med ansikte (procedurellt SVG-porträtt via RivalPortrait) och
   eget tonfall. Repliker vävs in i loggens händelser: budkrig,
   fusioner, förvärv och nederlag – rivalerna är NÅGON, inte bara
   namn i en logg. Ren data + logik utan React-beroenden.
   ============================================================ */

export type QuoteKind = "budkrig" | "vinst" | "förlust" | "fusion" | "industri" | "uppköpt";

export interface RivalPersona {
  company: string;
  /** Frontfiguren – visas under porträttet. */
  person: string;
  /** En rad om personligheten – visas i rivalhubben utan att en händelse behövs. */
  tagline: string;
  /** Signaturrepliken – karaktärens definierande ton. */
  signature: string;
  /** Aggression 0–1 (fas 3): styr hur ofta nemesisen slår mot spelaren,
   *  hur sent hen viker i budkrig och hur gärna hen lägger motbud. */
  aggression: number;
  /** Stildrag som styr porträttgeneratorn (hatt/monokel/mustasch …). */
  look: { hat: boolean; glasses: boolean; mustache: boolean; hair: string; skin: string; suit: string };
  quotes: Record<QuoteKind, string[]>;
}

export const RIVAL_PERSONAS: RivalPersona[] = [
  {
    company: "Northgate Properties",
    person: "Margaret Nordhem",
    tagline: "Old-money matriarch. Has owned buildings since before you were born.",
    signature: "Northgate doesn’t back down.",
    aggression: 0.7,
    look: { hat: false, glasses: true, mustache: false, hair: "#d8d3c8", suit: "#3a4a5a", skin: "#e8c39e" },
    quotes: {
      budkrig: ["”I’ve been buying buildings since before you were born.”", "”Northgate doesn’t back down.”"],
      vinst: ["”As expected.”"],
      förlust: ["”Enjoy it. It won’t happen again.”"],
      fusion: ["”Size is the only thing the bank respects.”"],
      industri: ["”Diversification, young friend. Look it up.”"],
      uppköpt: ["”Take care of the buildings. They’re older than you.”"],
    },
  },
  {
    company: "Wellspring Invest",
    person: "Caspar Brunn",
    tagline: "Spreadsheet shark. Bids by the numbers until your bank calls.",
    signature: "Excel always wins.",
    aggression: 0.5,
    look: { hat: false, glasses: false, mustache: false, hair: "#3a2c20", suit: "#20242c", skin: "#e3b58c" },
    quotes: {
      budkrig: ["”The math says you lose on this one.”", "”I’ll bid until your bank calls.”"],
      vinst: ["”Excel always wins.”"],
      förlust: ["”Overpaid. Congratulations, I suppose.”"],
      fusion: ["”Synergies. Mostly for me.”"],
      industri: ["”Cash flow is cash flow.”"],
      uppköpt: ["”The numbers were right. The timing was wrong.”"],
    },
  },
  {
    company: "Coastline Ltd",
    person: "Maya Seaborg",
    tagline: "Owns the waterfront and wants you to know it.",
    signature: "Everything by the water is mine. Everyone knows that.",
    aggression: 0.6,
    look: { hat: true, glasses: false, mustache: false, hair: "#8a5a30", suit: "#2c4a56", skin: "#eec9a4" },
    quotes: {
      budkrig: ["”Everything by the water is mine. Everyone knows that.”"],
      vinst: ["”Hear the gulls? They’re laughing at you.”"],
      förlust: ["”You can have the inland. I’ll take back the coast.”"],
      fusion: ["”Now we own the whole horizon.”"],
      industri: ["”The harbor never forgets who built it.”"],
      uppköpt: ["”Promise not to build in front of the windows facing the sea.”"],
    },
  },
  {
    company: "City Core Group",
    person: "Henry Stead",
    tagline: "Old-guard downtown traditionalist. Looks down on new money.",
    signature: "Downtown without City Core? Unthinkable.",
    aggression: 0.5,
    look: { hat: false, glasses: true, mustache: true, hair: "#4a4a4a", suit: "#40342a", skin: "#e0b795" },
    quotes: {
      budkrig: ["”Downtown without City Core? Unthinkable.”"],
      vinst: ["”Right block, right owner.”"],
      förlust: ["”A parvenu’s deal. The city can tell the difference.”"],
      fusion: ["”Tradition acquires tradition.”"],
      industri: ["”Even a storied company must reinvent itself.”"],
      uppköpt: ["”A hundred years of history. Steward it well.”"],
    },
  },
  {
    company: "Harborview Capital",
    person: "Rio Harborwick",
    tagline: "Aggressive fast-money operator. Always raises.",
    signature: "I raise. I always raise.",
    aggression: 0.9,
    look: { hat: false, glasses: false, mustache: false, hair: "#1c1c1c", suit: "#5a2c3a", skin: "#c98d5f" },
    quotes: {
      budkrig: ["”I raise. I always raise.”", "”Your ceiling is my floor.”"],
      vinst: ["”Fast money beats old money.”"],
      förlust: ["”Keep the junk. I’m hunting bigger prey.”"],
      fusion: ["”We eat a competitor for breakfast.”"],
      industri: ["”Real estate is the appetizer.”"],
      uppköpt: ["”Good deal. I’d have done the same.”"],
    },
  },
  {
    company: "Sterling & Partners",
    person: "Beatrice Silverberg",
    tagline: "Discreet syndicate. Deals close over a handshake at the club.",
    signature: "My partners pay whatever it takes.",
    aggression: 0.6,
    look: { hat: true, glasses: true, mustache: false, hair: "#c9c9c9", suit: "#2a2a34", skin: "#ecd2b8" },
    quotes: {
      budkrig: ["”My partners pay whatever it takes.”"],
      vinst: ["”Discreet and effective. As always.”"],
      förlust: ["”Noted. See you at the next deal.”"],
      fusion: ["”A handshake at the club was enough.”"],
      industri: ["”Portfolio theory, my dear.”"],
      uppköpt: ["”The terms were … acceptable.”"],
    },
  },
  {
    company: "Grovewood Properties",
    person: "Sonny Lund",
    tagline: "Self-made builder. Rebuilt the Suburbs with his own hands.",
    signature: "Hard work beats a fancy office.",
    aggression: 0.3,
    look: { hat: false, glasses: false, mustache: true, hair: "#7a5a3a", suit: "#3a4a3a", skin: "#e8bd96" },
    quotes: {
      budkrig: ["”I rebuilt the whole Suburbs with these hands.”"],
      vinst: ["”Hard work beats a fancy office.”"],
      förlust: ["”You won the bid. I won the experience.”"],
      fusion: ["”More buildings, same jacket.”"],
      industri: ["”You need more than one leg to stand on, my old man said.”"],
      uppköpt: ["”Take care of the tenants. They’re honest folk.”"],
    },
  },
  // ── Uppstickarna: små, onoterade lokalbolag (fas 4) ──────────────
  {
    company: "Oakvale & Sons",
    person: "Elsie Oakvale",
    tagline: "Third-generation family firm. Knows every tenant in the Suburbs by name.",
    signature: "We were here before the money came.",
    aggression: 0.4,
    look: { hat: false, glasses: true, mustache: false, hair: "#b8a288", suit: "#4a4038", skin: "#e9c6a2" },
    quotes: {
      budkrig: ["”Dad bought that block for a handshake. I’ll pay what it takes to keep the street.”"],
      vinst: ["”The neighbors will be pleased.”"],
      förlust: ["”Money wins today. Patience wins eventually.”"],
      fusion: ["”Family firms stick together.”"],
      industri: ["”We stick to houses. Houses we understand.”"],
      uppköpt: ["”Learn the tenants’ names. All of them.”"],
    },
  },
  {
    company: "Brickstone Bros.",
    person: "Ted Brickstone",
    tagline: "Two brothers, one van, a nose for underpriced wrecks.",
    signature: "We buy ugly. Ugly pays.",
    aggression: 0.6,
    look: { hat: true, glasses: false, mustache: true, hair: "#5a4632", suit: "#5a5248", skin: "#dfae82" },
    quotes: {
      budkrig: ["”My brother says stop. My brother is wrong.”"],
      vinst: ["”We buy ugly. Ugly pays.”"],
      förlust: ["”Too pretty for us anyway.”"],
      fusion: ["”Twice the vans, twice the wrecks.”"],
      industri: ["”If it leaks, we can fix it.”"],
      uppköpt: ["”The tools stay in the family.”"],
    },
  },
  {
    company: "Ladder Capital",
    person: "Nadia Swift",
    tagline: "Twenty-eight, leveraged to the eyebrows, in a hurry.",
    signature: "Rungs are for climbing.",
    aggression: 0.85,
    look: { hat: false, glasses: false, mustache: false, hair: "#2c1e2e", suit: "#3a2c4a", skin: "#d9a87e" },
    quotes: {
      budkrig: ["”I’ll refinance twice before you’ve called your board.”", "”Rungs are for climbing.”"],
      vinst: ["”Next.”"],
      förlust: ["”Keep it. I move faster than regret.”"],
      fusion: ["”Scale now, sleep later.”"],
      industri: ["”Yield is yield.”"],
      uppköpt: ["”The ladder goes on without me.”"],
    },
  },
  {
    company: "Old Town Trust",
    person: "Alvar Silver",
    tagline: "Retired banker collecting quiet rents behind Old Town facades.",
    signature: "Slow money sleeps well.",
    aggression: 0.2,
    look: { hat: true, glasses: true, mustache: true, hair: "#dcdcdc", suit: "#2e3440", skin: "#ecd6bc" },
    quotes: {
      budkrig: ["”At my age one only bids on certainties.”"],
      vinst: ["”Slow money sleeps well.”"],
      förlust: ["”A blessing in disguise, most likely.”"],
      fusion: ["”A tidy arrangement.”"],
      industri: ["”Bricks, not machines, thank you.”"],
      uppköpt: ["”Mind the facades. They’re listed, you know.”"],
    },
  },
];

export function personaFor(company: string): RivalPersona | undefined {
  return RIVAL_PERSONAS.find((p) => p.company === company);
}

/** Aggression 0–1 för ett bolag – okända aktörer (fonder m.fl.) är neutrala. */
export function aggressionOf(company: string): number {
  return personaFor(company)?.aggression ?? 0.5;
}

/** Replik för en händelse – deterministisk variation via seed. */
export function rivalQuote(company: string, kind: QuoteKind, seed = 0): string | null {
  const p = personaFor(company);
  if (!p) return null;
  const list = p.quotes[kind];
  if (!list || list.length === 0) return null;
  return list[Math.abs(seed) % list.length];
}
