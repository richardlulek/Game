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

import { emptyParcels } from "./city";
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

export const STORY_COMPANY_NAME = "Morfars Fastigheter";
export const GOSTA_NAME = "Gösta (morfars kompis)";
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
    title: "Begravningen",
    letterId: "brev_ekelof",
    objectives: [
      { text: "Läs breven från advokaten och morfar", check: (s) => hasFlag(s, "prolog_läst") },
    ],
    hint: "Huset ligger i Villakullen – leta efter 🔵-markören på kartan.",
  },
  {
    id: "renoveringen",
    chapter: 1,
    title: "Renoveringen",
    letterId: "brev_kap1",
    objectives: [
      {
        text: "Rusta upp morfars hus till skick 60",
        check: (s) => (heirloomOf(s)?.condition ?? 0) >= 60,
      },
    ],
    hint: "Klicka på huset på kartan → Underhåll (eller Investeringar → Renovering).",
  },
  {
    id: "hyresgasten",
    chapter: 2,
    title: "Hyresgästen",
    letterId: "gosta_dilemma",
    objectives: [
      {
        text: "Teckna kontrakt så minst 2 lokaler är uthyrda",
        check: (s) => (heirloomOf(s)?.tenants.length ?? 0) >= 2,
      },
    ],
    hint: "Ansökningarna ligger i fastighetskortet under Hyresgäster.",
  },
  {
    id: "forhandlingen",
    chapter: 3,
    title: "Förhandlingen",
    letterId: "brev_kap3",
    objectives: [
      {
        text: "Förhandla om en hyra (höj, sänk eller förläng ett kontrakt)",
        check: (s) => hasFlag(s, "förhandlat"),
      },
    ],
    hint: "Öppna en hyresgäst i fastighetskortet → Höj/Sänk hyran eller Förläng.",
  },
  {
    id: "banken",
    chapter: 4,
    title: "Banken",
    letterId: "brev_kap4",
    objectives: [
      {
        text: "Köp din andra fastighet",
        check: (s) => s.portfolio.filter((p) => p.status === "klar").length >= 2,
      },
    ],
    hint: "Marknad-fönstret – dödsboet ligger överst. Banken ordnar lånet automatiskt.",
  },
  {
    id: "konjunkturen",
    chapter: 5,
    title: "Konjunkturen",
    letterId: "brev_kap5",
    objectives: [
      {
        text: "Överlev 6 månader med kassan över noll",
        check: (s) => absMonth(s) >= kap5Start(s) + 6 && s.cash > 0,
      },
    ],
    hint: "Håll uthyrt, undvik panikförsäljningar. Kassaflödet syns i statusraden.",
  },
  {
    id: "bolaget",
    chapter: 6,
    title: "Bolaget",
    letterId: "brev_kap6",
    objectives: [
      { text: "Expandera bolaget till nivå 2", check: (s) => (s.companyLevel ?? 1) >= 2 },
    ],
    hint: "Bolag-fönstret → Expandera bolaget (kräver eget kapital + 2 fastigheter).",
  },
  {
    id: "revanschen",
    chapter: 7,
    title: "Revanschen",
    letterId: "brev_kap7",
    objectives: [
      {
        text: "Vinn budkriget mot Rogge om grannhuset",
        check: (s) => s.portfolio.some((p) => p.storyTag === "revansch"),
      },
    ],
    hint: "Grannhuset ligger i Marknad-fönstret. Rogge bjuder emot – bjud över honom.",
  },
  {
    id: "dynastin",
    chapter: 8,
    title: "Dynastin",
    letterId: "rogge_surbrev",
    objectives: [
      { text: "Nå bolagsnivå 3", check: (s) => (s.companyLevel ?? 1) >= 3 },
      { text: "Nå 20 MSEK i eget kapital", check: (s) => equityOf(s) >= 20_000_000 },
    ],
    hint: "Fler fastigheter, uthyrt och rimlig belåning. Morfar hade tålamod – ha det du med.",
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
    title: "Advokatbyrån Ekelöf & Söner (inga söner)",
    text:
      "”Bästa arvtagare. Er morfader Gunnar har, som Ni möjligen noterat på begravningen, avlidit. " +
      "Ni ärver härmed: en (1) fastighet i Villakullen, benämnd 'huset', samt kontanter om 850 000 kr " +
      "vilka påträffades i frysen i påsar märkta 'köttfärs 1994'. Kriminaltekniker har bekräftat att det inte är köttfärs.” " +
      "— Faktura bifogas: Upprättande av detta brev, 900 kr. Porto, 12 kr. Emotionellt stöd, 0 kr (ej beställt).",
    options: [
      {
        label: "Ta emot arvet",
        detail: "Huset + 850 000 kr",
        effect: { nextDecisionId: "brev_morfar_1", log: "Tog emot arvet efter morfar Gunnar.", logKind: "event" },
      },
      {
        label: "Fråga om det finns mer pengar",
        detail: "Det gör det inte",
        effect: { nextDecisionId: "brev_morfar_1", log: "Ekelöf: ”Nej. Fakturerar för frågan: 300 kr.” (ingick i arvet)", logKind: "info" },
      },
    ],
  }),

  brev_morfar_1: () => ({
    id: "story:brev_morfar_1",
    title: "📜 Brev från morfar (1 av oräkneliga)",
    text:
      "”Om du läser det här är jag död. Eller så har Ekelöf skickat brevet för tidigt igen – då ses vi på söndag som vanligt. " +
      "Huset är ditt nu. Det är byggt 1962, tillbyggt 1971, 1978 och 1983. Bygglovet är 'under handläggning' sedan 1987 – stör inte kommunen i onödan. " +
      "Gösta bor på nedervåningen. Han betalar inte hyra, men han vaktar huset. Mot vad har aldrig framgått. " +
      "Ta hand om huset, pojk. Det har tak, väggar och POTENTIAL – två av tre är i bra skick.” — Morfar",
    options: [
      {
        label: "Vila i frid, morfar",
        detail: "Fortsätt",
        effect: { nextDecisionId: "rogge_lowball", log: "Läste morfars första brev.", logKind: "event" },
      },
    ],
  }),

  rogge_lowball: () => ({
    id: "story:rogge_lowball",
    title: "🕶️ Besök: Roger ”Rogge” Flyt, Flyt Fastigheter",
    text:
      "En man i vita loafers klampar in på begravningskaffet och delar ut visitkort mellan kanapéerna. " +
      "”Rogge Flyt, Flyt Fastigheter. Beklagar sorgen och så vidare. Jag ger dig 1,2 miljoner för kåken – kontant, i morgon. " +
      "Det är över marknadspris, lita på mig, jag har B-körkort och en pool.” " +
      "Huset är värt över det fyrdubbla. Dessutom: testamentets villkor 7b förbjuder försäljning de första 24 månaderna.",
    options: [
      {
        label: "”Huset är inte till salu.”",
        detail: "Reputation +1 · Rogge glömmer dig inte",
        effect: { reputation: 1, storyFlag: "prolog_läst", log: "Avvisade Rogges lowball-bud. Han log som en människa som sett bilder på leenden.", logKind: "event" },
      },
      {
        label: "Överväg budet... nej. NEJ.",
        detail: "Villkor 7b förbjuder det ändå",
        effect: { storyFlag: "prolog_läst", log: "Övervägde Rogges bud tills Ekelöf harklade sig och pekade på villkor 7b. Faktura: 900 kr. (ingick)", logKind: "info" },
      },
    ],
  }),

  /* Kapitel 1 – Renoveringen */
  brev_kap1: () => ({
    id: "story:brev_kap1",
    title: "📜 Brev från morfar: Om huset",
    text:
      "”Nu har du väl sett skicket. Ja. Jag VET. Taket läcker bara när det regnar, och elen är original – " +
      "det knastrar lite när man tänder i köket, det betyder att den fungerar. " +
      "Ta pengarna i påsen och RUSTA UPP huset. Skick under 40 skrämmer bort alla hyresgäster utom Gösta, och Gösta räknas inte, han är ju Gösta. " +
      "Klicka på huset på kartan och välj Underhåll. Gör det några gånger. Bättre skick = högre hyra, färre vakanser och en energiklass som inte börjar på F som i 'Fy'.”",
    options: [
      {
        label: "Kavla upp ärmarna",
        detail: "Mål: skick 60",
        effect: { log: "Kapitel 1: Renoveringen. Morfars hus ska rustas upp till skick 60.", logKind: "event" },
      },
    ],
  }),

  /* Kapitel 2 – Hyresgästen */
  gosta_dilemma: () => ({
    id: "story:gosta_dilemma",
    title: "🚪 Gösta står i dörren",
    text:
      "”Jag hör att det renoveras”, säger Gösta misstänksamt och håller upp en termos som försvar. " +
      "”Dragit in vatten på övervåningen? Diskmaskin? Jag är ingen greve.” " +
      "Gösta har bott här sedan 2009. Hyra: 500 kr/mån (morfars kompispris, senast justerat aldrig). " +
      "Han betalar alltid i tid, klagar aldrig, och vaktar huset. Men lokalen han bor i är värd 15 gånger mer på öppna marknaden.",
    options: [
      {
        label: "”Du bor kvar, Gösta. Kompispriset gäller.”",
        detail: "Behåll Gösta · 500 kr/mån · lojal för evigt · Reputation +2",
        effect: {
          reputation: 2, storyFlag: "gosta_kvar", nextDecisionId: "brev_kap2",
          log: "Gösta bor kvar. Han nickade långsamt och erbjöd kaffe ur termosen. Det var starkt nog att belysa källaren.", logKind: "event",
        },
      },
      {
        label: "”Jag behöver lokalen, Gösta.”",
        detail: "Gösta flyttar · lokalen frigörs · Reputation −2",
        effect: {
          reputation: -2, storyFlag: "gosta_ut", nextDecisionId: "brev_kap2",
          log: "Gösta packade termosen och flyttade till sin syster i Förorten. Huset känns konstigt tyst. Och ovaktat.", logKind: "warn",
        },
      },
    ],
  }),

  brev_kap2: () => ({
    id: "story:brev_kap2",
    title: "📜 Brev från morfar: Om hyresgäster",
    text:
      "”Hyresgäster är som väder – man väljer inte, men man kan klä sig rätt. " +
      "Nu när huset ser beboeligt ut kommer ANSÖKNINGAR. Öppna fastighetskortet: där ser du vad de vill betala, hur pålitliga de är (kvalitet) " +
      "och risken att de plötsligt 'glömmer' hyran (risk). Kontraktslängd är en avvägning: korta kontrakt ger frihet, långa ger nattsömn. " +
      "Och lyssna inte på folk som vill betala i 'exposure'. Jag dog hellre. Bokstavligen, som du vet.”",
    options: [
      {
        label: "Öppna ansökningarna",
        detail: "Mål: 2 lokaler uthyrda",
        effect: { log: "Kapitel 2: Hyresgästen. Ansökningar har börjat komma till morfars hus.", logKind: "event" },
      },
    ],
  }),

  /* Kapitel 3 – Förhandlingen */
  brev_kap3: () => ({
    id: "story:brev_kap3",
    title: "📜 Brev från morfar: Om förhandling",
    text:
      "”Förr eller senare måste man prata hyra, och då blir alla plötsligt experter. " +
      "Höj för mycket och de flyttar. Höj lagom och de muttrar men stannar – muttrandet ingår, det är så vi umgås i det här landet. " +
      "Sänk om du vill att någon ska stanna länge, och förläng kontrakt som löper ut innan de hinner tänka fritt. " +
      "Varning: en av dina hyresgäster kommer att nämna sin svåger Kent-Ove 'i hyresnämnden'. Kent-Ove jobbar i kiosken BREDVID hyresnämnden. Stå på dig.”",
    options: [
      {
        label: "Dags att förhandla",
        detail: "Mål: höj, sänk eller förläng en hyra",
        effect: { log: "Kapitel 3: Förhandlingen. Dags att röra en hyra – uppåt, nedåt eller framåt i tiden.", logKind: "event" },
      },
    ],
  }),

  /* Kapitel 4 – Banken */
  brev_kap4: () => ({
    id: "story:brev_kap4",
    title: "🏦 Möte: Ulla på Sparbanken Eken",
    text:
      "Ulla har jobbat på banken sedan hålkort. Hon granskar dig över glasögonen: " +
      "”Jaha. Gunnars barnbarn. Han hade sina pengar i frysen, visste du det? Vi PRATADE om det.” " +
      "Hon skjuter fram en kalkyl: ”Så här fungerar det: du betalar en HANDPENNING kontant, banken lånar ut resten upp till en viss andel av priset – det kallas LTV. " +
      "Sedan AMORTERAR du. Det finns ett dödsbo i området som vill sälja snabbt – arvingarna bor i Spanien och blir nervösa av väder under 25 grader. Priset är... anständigt.”",
    options: [
      {
        label: "Ta lånelöftet och gå till Marknaden",
        detail: "Mål: köp fastighet nummer två",
        effect: { log: "Kapitel 4: Banken. Ulla har ordnat lånelöfte – dödsboet ligger ute på Marknaden.", logKind: "event" },
      },
    ],
  }),

  /* Kapitel 5 – Konjunkturen */
  brev_kap5: () => ({
    id: "story:brev_kap5",
    title: "📜 Brev från morfar: Om konjunkturen",
    text:
      "”Om du läser det här brevet har Riksbanken just höjt räntan, för det gör den alltid förr eller senare. Andas. " +
      "Jag ägde hus 1992. Räntan var 500 procent. FEMHUNDRA. Vi grillade korv på räntebeskedet, för det var det enda som var gratis. " +
      "Du överlever några procentenheter. Regeln är enkel: håll uthyrt, sälj ingenting i panik, och köp när alla andra gråter. " +
      "Marknaden går i cykler – den som har kassa i botten av cykeln blir rik på toppen. Den som har vita loafers blir det sällan länge.”",
    options: [
      {
        label: "Andas. Håll ut.",
        detail: "Mål: överlev 6 månader",
        effect: { log: "Kapitel 5: Konjunkturen. Räntan har höjts – håll kassan över noll i sex månader.", logKind: "event" },
      },
    ],
  }),

  bailout_frys: () => ({
    id: "story:bailout_frys",
    title: "🧊 Ett fynd i frysen",
    text:
      "Du letar efter något ätbart i morfars gamla frys och hittar, längst ner under en isig påse strömming, " +
      "ytterligare en påse. Märkt 'JULSKINKA 1997'. Den innehåller 400 000 kr och en post-it: " +
      "”Jag visste att du skulle leta här förr eller senare. Antingen är du hungrig eller pank. Båda går över. — Morfar”",
    options: [
      {
        label: "Tack, morfar.",
        detail: `+${kr(BAILOUT_AMOUNT)} · händer bara en gång`,
        effect: { cash: BAILOUT_AMOUNT, log: "Hittade morfars sista fryspåse: +400 000 kr. Strömmingen fick ligga kvar.", logKind: "income" },
      },
    ],
  }),

  /* Kapitel 6 – Bolaget */
  brev_kap6: () => ({
    id: "story:brev_kap6",
    title: "📜 Brev från morfar: Om bolag",
    text:
      "”Två hus och en fungerande ekonomi – nu är du officiellt inte längre en 'privatperson med problem' utan en 'aktör i sektorn'. Grattis. " +
      "Dags att registrera ett riktigt bolag: kontor, kostnader och rätten att säga 'vi' om dig själv. " +
      "Jag försökte registrera bolag en gång. 'Hus AB' – upptaget. 'Hus 2 AB' – upptaget. 'Gunnars Hus & Hämnd AB' – godkänt, men mormor sa nej. " +
      "Gå till Bolag-fönstret och expandera när du uppfyller kraven. Och byt namn på firman om du vill – det är ditt bolag nu, inte mitt.”",
    options: [
      {
        label: "Registrera bolaget",
        detail: "Mål: bolagsnivå 2",
        effect: { log: "Kapitel 6: Bolaget. Expandera till nivå 2 i Bolag-fönstret.", logKind: "event" },
      },
    ],
  }),

  /* Kapitel 7 – Revanschen */
  brev_kap7: () => ({
    id: "story:brev_kap7",
    title: "🕶️ Rogge Flyt köper upp din gata",
    text:
      "Rogge Flyt står utanför grannhuset och fotograferar det med tummen upp. " +
      "”Läget, arvtagaren! Flyt Fastigheter expanderar. Jag köper grannkåken, river ut allt med SJÄL i och hyr ut per kvadratmillimeter. " +
      "Sen tar jag nästa hus. Och nästa. Snart heter kullen Flyt Hills. Det fokusgruppas just nu.” " +
      "Grannhuset har precis lagts ut till försäljning – och Rogge har redan lagt ett bud. Morfar hade väntat sig att du gör något åt saken.",
    options: [
      {
        label: "Inte min gata, Rogge.",
        detail: "Mål: vinn budkriget om grannhuset",
        effect: { log: "Kapitel 7: Revanschen. Rogge Flyt bjuder på grannhuset – bjud över honom på Marknaden.", logKind: "event" },
      },
    ],
  }),

  rogge_surbrev: () => ({
    id: "story:rogge_surbrev",
    title: "📬 Ett surt brev på blankt papper",
    text:
      "”Grattis eller vad man säger. Budgivning är ändå mest en grej för folk som gillar att äga hus. " +
      "Flyt Fastigheter PIVOTERAR nu till mer spännande vertikaler. Padel. Padel är framtiden. " +
      "Vi ses på toppen – jag tar hissen, du får trappan. /R Flyt, CEO, grundare, visionär, B-körkort” " +
      "PS. Ekelöf hälsar att morfar förutsåg detta brev och bad honom bifoga: ”Ha. — Gunnar”",
    options: [
      {
        label: "Rama in brevet",
        detail: "Sista målet: nivå 3 + 20 MSEK eget kapital",
        effect: { reputation: 2, log: "Kapitel 8: Dynastin. Rogge pivoterade till padel. Kvar står din gata – och ditt växande imperium.", logKind: "event" },
      },
    ],
  }),

  /* Epilog */
  brev_epilog: () => ({
    id: "story:brev_epilog",
    title: "📜 Morfars sista brev",
    text:
      "”Om Ekelöf har skött sig får du det här brevet när du inte längre behöver det – när huset blivit flera, " +
      "och 'Gunnars pojk' blivit någon som folk ringer FÖRE banken. Jag är inte förvånad. Jag är någonting annat som börjar på stolt. " +
      "I kuvertet ligger min klocka. Den har gått fel sedan 1979, men den går – och det är hela hemligheten med det här yrket: " +
      "det viktiga är inte att gå rätt, det viktiga är att inte stanna. Bygg vidare. Staden är din nu.” — Morfar. " +
      "(Ekelöfs slutfaktura bifogas: ”Förvaring av klocka, 26 år: 0 kr. För Gunnar: allt var 0 kr.”)",
    options: [
      {
        label: "⌚ Ta emot morfars klocka",
        detail: "+25 dynastipoäng · kampanjen fullbordad – spelet fortsätter fritt",
        effect: { log: "🏆 ARVET FULLBORDAT: Morfars klocka hänger nu på kontorsväggen. Kampanjen är klar – staden är din.", logKind: "event" },
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
    profileName: "Privatperson",
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
    districtName: "Villakullen",
    type: "bostad",
    typeLabel: "Bostadshus",
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
    txHistory: [{ type: "köp", price: 0, month: fresh.month, year: fresh.year, party: "Arv efter morfar Gunnar" }],
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
      { t: "📜 ARVET: Morfar Gunnars hus i Villakullen är ditt – liksom 850 000 kr ur frysen.", kind: "event" },
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
    mk("Dödsmetallbandet Likbål", "Kulturverksamhet", 1.1, 0.04, 1.25, 24),
    // Betalar lite under marknad men flyttar ALDRIG. Katterna behöver stabilitet.
    mk("Margit + 14 katter", "Privatperson", 0.9, 0.005, 0.9, 120),
    // Vill egentligen betala i exposure. Erbjuder ändå några kronor.
    mk("Influencerparet @UrbanNesting", "Innehållsskapare", 0.3, 0.2, 0.45, 6),
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
        log: [{ t: "📬 Tre ansökningar har kommit till morfars hus – en av dem luktar rökmaskin.", kind: "event" as const }, ...s.log],
      };
    }
    case "banken": {
      const listing = makeAffordableListing(s);
      return {
        ...s,
        listings: [listing, ...s.listings],
        log: [{ t: `🏦 Dödsboet i ${listing.districtName} har lagts ut för ${msek(listing.askPrice)} – arvingarna i Spanien vill sälja i förrgår.`, kind: "event" as const }, ...s.log],
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
        log: [{ t: `🏦 RIKSBANKEN höjer styrräntan med ${hike.toFixed(2).replace(".", ",")} procentenheter. Ulla på banken ringde bara för att säga ”vad var det jag sa”.`, kind: "warn" as const }, ...s.log],
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
        log: [{ t: `🕶️ ${ROGGE} har lagt ett bud på grannhuset i ${listing.districtName}. Han kallar det ”Flyt Hills fas 1”.`, kind: "warn" as const }, ...s.log],
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
          log: [{ t: "🕶️ Rogge flippar grannhuset – ute till försäljning igen, nu med ”stylad tambur” och högre pris.", kind: "warn" as const }, ...s.log],
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
    headline: "KÅKEN PÅ KULLEN HAR FÅTT NYTT TAK",
    sub: "Grannarna: ”Äntligen.” Gösta: ”Det knastrar mindre i köket nu. Misstänkt.”",
    body:
      "Villakullens mest omtalade fastighet – i folkmun 'Gunnars kåk' – har rustats upp av arvtagaren. " +
      "Hantverkare bekräftar att taket numera läcker 'åt rätt håll, alltså inte alls'. " +
      "Kommunens bygglovskontor uppger att man 'ser över ärendet från 1987 med förnyad energi'.",
    icon: "🔨",
    caption: "Huset på kullen, nu med tak.",
  },
  hyresgasten: {
    headline: "NYA HYRESGÄSTER PÅ KULLEN",
    sub: "Grannsämjan beskrivs som ”förvånansvärt god, med vissa förbehåll kring ljudnivån torsdagar”.",
    body:
      "Det nyrenoverade huset på Villakullen har fått hyresgäster. Grannskapet rapporterar om " +
      "omväxlande orgelmusik, kattspring och enstaka rökmaskinstest. Hyresvärden kommenterar: " +
      "'Alla betalar i pengar. Det var det viktigaste kravet.' Stadsbladet har sökt bandet Likbål, " +
      "som svarar med en riffsignatur.",
    icon: "🎸",
    caption: "Inflyttning pågår.",
  },
  banken: {
    headline: "ARVTAGAREN EXPANDERAR",
    sub: "Sparbanken Eken: ”Kalkylen håller. Vi har räknat två gånger. Ulla tre.”",
    body:
      "Med lånelöfte från Sparbanken Eken har arvtagaren förvärvat sin andra fastighet – dödsboet " +
      "vars arvingar enligt uppgift redan hunnit tillbaka till Marbella. Banken beskriver kunden som " +
      "'påfallande lik sin morfar, fast med pengarna på banken i stället för i frysen'.",
    icon: "🏦",
    caption: "Fastighet nummer två.",
  },
  revanschen: {
    headline: "FLYT FASTIGHETER PIVOTERAR TILL PADEL",
    sub: "Roger Flyt: ”Helt frivilligt. Fastigheter var ändå mest en grej för folk som gillar hus.”",
    body:
      "Budkriget om grannhuset på Villakullen är över: arvtagaren vann. Flyt Fastigheter meddelar " +
      "samma dag en 'strategisk pivot till racketsport-vertikalen'. Branschanalytiker noterar att " +
      "bolagets vita BMW setts lämna kullen 'i god fart, dock privatleasad'. Morfars kommentar, " +
      "förmedlad via advokat: ”Ha.”",
    icon: "🎾",
    caption: "R. Flyt lämnar kullen.",
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
    x: -310, z: -290,
    title: "Vattentornet",
    text:
      "”Här friade jag till mormor, juni 1961. Hon sa ja för att det blåste och hon ville gå ner. " +
      "Vi var gifta i 52 år. Ibland räcker det med bra timing.” — Morfar",
  },
  {
    id: "klocktornet",
    x: 168, z: -80,
    title: "Klocktornet vid bygglovskontoret",
    text:
      "”Bygglovskontoret. Mitt tillbyggnadsärende är 'under handläggning' sedan 1987. " +
      "Jag vattnar deras pelargoner varje fredag i väntan. Man ska vårda sina relationer.” — Morfar",
  },
  {
    id: "skorstenarna",
    x: 465, z: -134,
    title: "Fabriksskorstenarna",
    text:
      "”Min första lön, 1953. Förmannen sa att jag var för klen för tegelbärning. " +
      "Huset hans barnbarn hyr idag råkar jag känna ägaren till. Bär du tegel, pojk – men äg huset.” — Morfar",
  },
  {
    id: "hamnkajen",
    x: 70, z: 312,
    title: "Hamnkajen",
    text:
      "”Härifrån skulle jag emigrera till Amerika, våren 1958. Båten gick utan mig – " +
      "jag hade hittat en tomt på vägen till kajen. Amerika klarade sig. Det gjorde jag med.” — Morfar",
  },
  {
    id: "angen",
    x: -225, z: 215,
    title: "Ängen",
    text:
      "”På den här ängen lärde jag din mamma cykla, sommaren 1974. Hon körde rakt in i en ko. " +
      "Kon klarade sig. Bygg något fint här en dag – marken är bättre än den ser ut.” — Morfar",
  },
  {
    id: "appeltradet",
    x: null, z: null,
    title: "Grannens äppelträd",
    text:
      "”Grannens äppelträd. Grenarna som hänger över staketet är juridiskt sett dina – " +
      "jag har kollat med Ekelöf (faktura 900 kr, värt det). Skörda med gott samvete.” — Morfar",
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
  kulle: "Villakullen", förort: "Förorten", innerstad: "Innerstaden",
  centrum: "Centrum", hamnen: "Hamnen", industri: "Industriområdet", finans: "Finansdistriktet",
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

/** Loggrad när ett beat öppnar nya områden. */
export function unlockLogFor(beatId: string): string | null {
  const opened = DISTRICT_UNLOCK_AT[beatId] ?? [];
  if (opened.length === 0 || beatId === "prolog") return null;
  const names = opened.map((d) => DISTRICT_NAMES[d] ?? d).join(", ");
  return `🔓 NYTT OMRÅDE: ${names} är nu öppet för affärer – staden växer med dig.`;
}
