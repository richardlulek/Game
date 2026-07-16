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
  /** Stildrag som styr porträttgeneratorn (hatt/monokel/mustasch …). */
  look: { hat: boolean; glasses: boolean; mustache: boolean; hair: string; skin: string; suit: string };
  quotes: Record<QuoteKind, string[]>;
}

export const RIVAL_PERSONAS: RivalPersona[] = [
  {
    company: "Nordhem Properties",
    person: "Margit Nordhem",
    look: { hat: false, glasses: true, mustache: false, hair: "#d8d3c8", suit: "#3a4a5a", skin: "#e8c39e" },
    quotes: {
      budkrig: ["”I’ve been buying buildings since before you were born.”", "”Nordhem doesn’t back down.”"],
      vinst: ["”As expected.”"],
      förlust: ["”Enjoy it. It won’t happen again.”"],
      fusion: ["”Size is the only thing the bank respects.”"],
      industri: ["”Diversification, young friend. Look it up.”"],
      uppköpt: ["”Take care of the buildings. They’re older than you.”"],
    },
  },
  {
    company: "Brunnspark Invest",
    person: "Casper Brunn",
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
    person: "Maja Sjöberg",
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
    person: "Henrik Stadig",
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
    person: "Rio Hamnvik",
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
    company: "Silverberg & Partners",
    person: "Beatrice Silverberg",
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
    company: "Lundqvist Properties",
    person: "Sune Lundqvist",
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
];

export function personaFor(company: string): RivalPersona | undefined {
  return RIVAL_PERSONAS.find((p) => p.company === company);
}

/** Replik för en händelse – deterministisk variation via seed. */
export function rivalQuote(company: string, kind: QuoteKind, seed = 0): string | null {
  const p = personaFor(company);
  if (!p) return null;
  const list = p.quotes[kind];
  if (!list || list.length === 0) return null;
  return list[Math.abs(seed) % list.length];
}
