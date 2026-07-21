/* ============================================================
   Bokslut – resultaträkning (löpande månadstakt ur nuläget) och
   balansräkning. Ren logik utan React; speglar EXAKT samma
   formler som simulationen använder så att siffrorna stämmer
   med vad som faktiskt dras varje månad.
   ============================================================ */

import { OVERLOAD_COST_PER_PROP, orgLoadOf, tierForLevel } from "./company";
import { HOLDING_TAX_DELTA, TAX_DEP_AGGRESSIVE, TAX_DEP_NORMAL, industryPortfolioValue, loanTerms, portfolioValue } from "./finance";
import { OWN_INSURER_PREMIUM_MULT, bankRunRate, finInstitutionsValue, insurerMonthlyNet } from "./finInstitutions";
import { SPINOFF_DIVIDEND_PAYOUT, spinoffOwnedPct } from "./spinoffs";
import { stockHoldingsValue, subsidiaryValue } from "./stocks";
import { propAnnualOpex, propMarketValue } from "./property";
import { salariesTotal } from "./progression";
import type { GameState } from "./types";

/* ── Resultaträkning (kr/månad, löpande takt) ─────────────────────── */

export interface Resultatrakning {
  hyresintakter: number;
  industrinetto: number;
  utdelningar: number;
  /** Ägd bank: förväntat netto inkl. normala kreditförluster. */
  bankrorelse: number;
  /** Ägt försäkringsbolag: förväntat netto (premier − skador − drift). */
  forsakringsrorelse: number;
  /** Dotterbolagens månadsvinst. */
  dotterbolagsvinst: number;
  /** Avknoppningarnas utdelningar, utslaget per månad (uppskattning). */
  avknoppningsutdelning: number;
  summaIntakter: number;

  driftkostnader: number;
  forvaltning: number; // fastighetsförvaltare + portföljdirektör
  personal: number;
  kontor: number; // kontorskostnad + ev. överbelastning
  forsakringar: number;
  summaKostnader: number;

  rorelseresultat: number;
  rantekostnad: number; // banklån + obligationer + revolverkredit
  resultatForeSkatt: number;
  avskrivningsavdrag: number;
  skattesats: number;
  skatt: number;
  resultat: number;
}

export function resultatrakning(s: GameState): Resultatrakning {
  const klara = s.portfolio.filter((p) => p.status === "klar");

  const hyresintakter = klara.reduce(
    (a, p) => a + p.tenants.reduce((b, t) => b + t.rent, 0),
    0,
  );
  // Avknoppade tillgångar tillhör det noterade bolaget – deras netto
  // syns hos spelaren som utdelningar, inte som industrinetto.
  const industrinetto = (s.industryPortfolio ?? []).reduce(
    (a, x) => a + (x.spinOffId ? 0 : (x.monthlyRevenue ?? 0) - (x.monthlyOpex ?? 0)),
    0,
  );
  const utdelningar = Math.round(
    s.stocks.reduce((a, st) => a + st.owned * st.price * st.dividendYield, 0) / 12,
  );
  // Institut och koncernbolag: samma flöden som simulationen bokför via
  // cashflow ("bankrörelsen", "försäkringsrörelsen", "dotterbolagsvinst",
  // "utdelning från avknoppning") – tidigare osynliga i bokslutet.
  const bankrorelse = s.ownedBank ? bankRunRate(s.ownedBank, s) : 0;
  const forsakringsrorelse = s.ownedInsurer ? insurerMonthlyNet(s.ownedInsurer, s) : 0;
  const dotterbolagsvinst = (s.subsidiaries ?? []).reduce((a, x) => a + x.monthlyIncome, 0);
  const avknoppningsutdelning = Math.round(
    (s.spinOffs ?? []).reduce(
      (a, spin) => a + Math.max(0, spin.lastMonthNet) * SPINOFF_DIVIDEND_PAYOUT * spinoffOwnedPct(s, spin),
      0,
    ),
  );

  const driftkostnader = Math.round(klara.reduce((a, p) => a + propAnnualOpex(p, s) / 12, 0));
  const forvaltare = klara
    .filter((p) => p.managed)
    .reduce((a, p) => a + Math.max(2000, Math.round(p.tenants.reduce((b, t) => b + t.rent, 0) * 0.03)), 0);
  const direktor = s.globalManager?.active ? 15_000 + s.portfolio.length * 1_500 : 0;
  const personal = salariesTotal(s);
  const tier = tierForLevel(s.companyLevel ?? 1);
  const overload = orgLoadOf(s).over * OVERLOAD_COST_PER_PROP;
  const kontor = tier.monthlyOverhead + overload;
  // Premie: 0,40 % av marknadsvärdet per år (min 2 000 kr/mån) – som i
  // simulationen, inkl. 40 %-rabatten när koncernen äger försäkringsbolaget.
  const premieMult = s.ownedInsurer ? OWN_INSURER_PREMIUM_MULT : 1;
  const forsakringar = Math.round(klara
    .filter((p) => p.insurance)
    .reduce((a, p) => a + Math.max(2_000, Math.round((propMarketValue(p, s) * 0.004) / 12)), 0) * premieMult);

  const summaIntakter = hyresintakter + industrinetto + utdelningar +
    bankrorelse + forsakringsrorelse + dotterbolagsvinst + avknoppningsutdelning;
  const summaKostnader = driftkostnader + forvaltare + direktor + personal + kontor + forsakringar;
  const rorelseresultat = summaIntakter - summaKostnader;

  const effectiveRate = s.rateMode === "fixed" && s.fixedRate != null ? s.fixedRate : loanTerms(s).rate;
  const bankranta = Math.round((s.debt * (effectiveRate / 100)) / 12);
  const obligationsranta = (s.bonds ?? []).reduce(
    (a, b) => a + Math.round((b.amount * b.rate) / 100 / 12),
    0,
  );
  const revolverranta = s.revolving?.used ? Math.round((s.revolving.used * 0.015) / 12) : 0;
  const certifikatranta = s.commercialPaper
    ? Math.round((s.commercialPaper.amount * s.commercialPaper.rate) / 100 / 12) : 0;
  const rantekostnad = bankranta + obligationsranta + revolverranta + certifikatranta;

  const resultatForeSkatt = rorelseresultat - rantekostnad;

  // Samma skatteformel som simulationen: 22 % på positivt resultat efter
  // avskrivningsavdrag enligt vald policy (normal 1,3 %/år, aggressiv 2 %),
  // −3 %-enheter med minst en fastighet i energiklass A (golv 10 %),
  // och sparade förlustavdrag kvittas först.
  const depRate = s.taxDepreciationPolicy === "aggressiv" ? TAX_DEP_AGGRESSIVE : TAX_DEP_NORMAL;
  const avskrivningsavdrag = Math.round(
    klara.reduce((a, p) => a + ((p.purchasePrice ?? p.askPrice) * depRate) / 12, 0),
  );
  const harEnergiA = klara.some((p) => p.energyClass === "A");
  const skattesats = Math.max(0.1, 0.22 - (harEnergiA ? 0.03 : 0) - (s.holdingStructure ? HOLDING_TAX_DELTA : 0));
  const bruttoSkattepliktigt = Math.max(0, resultatForeSkatt - avskrivningsavdrag);
  const forlustavdrag = Math.min(s.taxLossCarry ?? 0, bruttoSkattepliktigt);
  const skatt =
    resultatForeSkatt > 0
      ? Math.round((bruttoSkattepliktigt - forlustavdrag) * skattesats)
      : 0;

  return {
    hyresintakter,
    industrinetto,
    utdelningar,
    bankrorelse,
    forsakringsrorelse,
    dotterbolagsvinst,
    avknoppningsutdelning,
    summaIntakter,
    driftkostnader,
    forvaltning: forvaltare + direktor,
    personal,
    kontor,
    forsakringar,
    summaKostnader,
    rorelseresultat,
    rantekostnad,
    resultatForeSkatt,
    avskrivningsavdrag,
    skattesats,
    skatt,
    resultat: resultatForeSkatt - skatt,
  };
}

/* ── Balansräkning (kr) ───────────────────────────────────────────── */

export interface Balansrakning {
  kassa: number;
  fastigheter: number;
  mark: number;
  industri: number;
  aktier: number;
  dotterbolag: number;
  /** Värdet på ägd bank + försäkringsbolag (finInstitutions.ts). */
  institut: number;
  summaTillgangar: number;

  banklan: number;
  obligationer: number;
  revolver: number;
  /** Utestående företagscertifikat. */
  certifikat: number;
  summaSkulder: number;

  egetKapital: number;
  soliditet: number; // EK / tillgångar
}

export function balansrakning(s: GameState): Balansrakning {
  const kassa = s.cash;
  const fastigheter = Math.round(portfolioValue(s));
  const mark = s.lots.filter((l) => l.owned).reduce((a, l) => a + l.price, 0);
  const industri = Math.round(industryPortfolioValue(s));
  const aktier = Math.round(stockHoldingsValue(s));
  const dotterbolag = Math.round(subsidiaryValue(s));
  // Banken och försäkringsbolaget värderas som i equityOf – utan raden
  // stämde balansräkningens eget kapital inte med HUD:ens siffra.
  const institut = Math.round(finInstitutionsValue(s));
  const summaTillgangar = kassa + fastigheter + mark + industri + aktier + dotterbolag + institut;

  const banklan = s.debt;
  const obligationer = (s.bonds ?? []).reduce((a, b) => a + b.amount, 0);
  const revolver = s.revolving?.used ?? 0;
  const certifikat = s.commercialPaper?.amount ?? 0;
  const summaSkulder = banklan + obligationer + revolver + certifikat;

  const egetKapital = summaTillgangar - summaSkulder;
  return {
    kassa,
    fastigheter,
    mark,
    industri,
    aktier,
    dotterbolag,
    institut,
    summaTillgangar,
    banklan,
    obligationer,
    revolver,
    certifikat,
    summaSkulder,
    egetKapital,
    soliditet: summaTillgangar > 0 ? egetKapital / summaTillgangar : 0,
  };
}
