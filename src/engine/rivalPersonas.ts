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
    company: "Nordhem Fastigheter",
    person: "Margit Nordhem",
    look: { hat: false, glasses: true, mustache: false, hair: "#d8d3c8", suit: "#3a4a5a", skin: "#e8c39e" },
    quotes: {
      budkrig: ["”Jag har köpt hus sedan innan ni föddes.”", "”Nordhem viker sig inte.”"],
      vinst: ["”Som väntat.”"],
      förlust: ["”Njut av det. Det händer inte igen.”"],
      fusion: ["”Storlek är det enda banken respekterar.”"],
      industri: ["”Diversifiering, unge vän. Slå upp ordet.”"],
      uppköpt: ["”Sköt om husen. De är äldre än du.”"],
    },
  },
  {
    company: "Brunnsparken Invest",
    person: "Casper Brunn",
    look: { hat: false, glasses: false, mustache: false, hair: "#3a2c20", suit: "#20242c", skin: "#e3b58c" },
    quotes: {
      budkrig: ["”Kalkylen säger att du förlorar på det här.”", "”Jag bjuder tills din bank ringer.”"],
      vinst: ["”Excel vinner alltid.”"],
      förlust: ["”Överbetalt. Grattis, antar jag.”"],
      fusion: ["”Synergier. Främst för mig.”"],
      industri: ["”Kassaflöde är kassaflöde.”"],
      uppköpt: ["”Siffrorna var rätt. Tajmingen var fel.”"],
    },
  },
  {
    company: "Kustlinjen AB",
    person: "Maja Sjöberg",
    look: { hat: true, glasses: false, mustache: false, hair: "#8a5a30", suit: "#2c4a56", skin: "#eec9a4" },
    quotes: {
      budkrig: ["”Allt vid vattnet är mitt. Det vet ju alla.”"],
      vinst: ["”Hör du måsarna? De skrattar åt dig.”"],
      förlust: ["”Inlandet kan du få. Kusten tar jag tillbaka.”"],
      fusion: ["”Nu äger vi hela horisonten.”"],
      industri: ["”Hamnen glömmer aldrig vem som byggde den.”"],
      uppköpt: ["”Lova att inte bygga för fönstren mot havet.”"],
    },
  },
  {
    company: "Stadskärnan Gruppen",
    person: "Henrik Stadig",
    look: { hat: false, glasses: true, mustache: true, hair: "#4a4a4a", suit: "#40342a", skin: "#e0b795" },
    quotes: {
      budkrig: ["”Centrum utan Stadskärnan? Otänkbart.”"],
      vinst: ["”Rätt kvarter, rätt ägare.”"],
      förlust: ["”En parvenyaffär. Staden märker skillnaden.”"],
      fusion: ["”Tradition förvärvar tradition.”"],
      industri: ["”Även ett anrikt bolag måste förnya sig.”"],
      uppköpt: ["”Hundra år av historia. Förvalta den väl.”"],
    },
  },
  {
    company: "Hamnvikens Kapital",
    person: "Rio Hamnvik",
    look: { hat: false, glasses: false, mustache: false, hair: "#1c1c1c", suit: "#5a2c3a", skin: "#c98d5f" },
    quotes: {
      budkrig: ["”Jag höjer. Jag höjer alltid.”", "”Ditt tak är mitt golv.”"],
      vinst: ["”Snabba pengar slår gamla pengar.”"],
      förlust: ["”Behåll skräpet. Jag jagar större byten.”"],
      fusion: ["”Vi äter en konkurrent till frukost.”"],
      industri: ["”Fastigheter är förrätten.”"],
      uppköpt: ["”Bra affär. Jag hade gjort samma sak.”"],
    },
  },
  {
    company: "Silverberg & Partners",
    person: "Beatrice Silverberg",
    look: { hat: true, glasses: true, mustache: false, hair: "#c9c9c9", suit: "#2a2a34", skin: "#ecd2b8" },
    quotes: {
      budkrig: ["”Mina partners betalar vad som krävs.”"],
      vinst: ["”Diskret och effektivt. Som alltid.”"],
      förlust: ["”Noterat. Vi ses vid nästa affär.”"],
      fusion: ["”Ett handslag på klubben räckte.”"],
      industri: ["”Portföljteori, kära du.”"],
      uppköpt: ["”Villkoren var … acceptabla.”"],
    },
  },
  {
    company: "Lundqvist Fastigheter",
    person: "Sune Lundqvist",
    look: { hat: false, glasses: false, mustache: true, hair: "#7a5a3a", suit: "#3a4a3a", skin: "#e8bd96" },
    quotes: {
      budkrig: ["”Jag snickrade om hela Förorten med de här händerna.”"],
      vinst: ["”Hårt arbete slår fint kontor.”"],
      förlust: ["”Du vann budet. Jag vann erfarenheten.”"],
      fusion: ["”Fler hus, samma kavaj.”"],
      industri: ["”Man ska ha flera ben att stå på, sa farsan.”"],
      uppköpt: ["”Ta hand om hyresgästerna. De är hederligt folk.”"],
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
