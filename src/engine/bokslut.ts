/* ============================================================
   Bokslut – resultaträkning (löpande månadstakt ur nuläget) och
   balansräkning. Ren logik utan React; speglar EXAKT samma
   formler som simulationen använder så att siffrorna stämmer
   med vad som faktiskt dras varje månad.
   ============================================================ */

import { OVERLOAD_COST_PER_PROP, orgLoadOf, tierForLevel } from "./company";
import { industryPortfolioValue, loanTerms, portfolioValue } from "./finance";
import { stockHoldingsValue, subsidiaryValue } from "./stocks";
import { propAnnualOpex, propMarketValue } from "./property";
import { salariesTotal } from "./progression";
import type { GameState } from "./types";

/* ── Resultaträkning (kr/månad, löpande takt) ─────────────────────── */

export interface Resultatrakning {
  hyresintakter: number;
  industrinetto: number;
  utdelningar: number;
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
  const industrinetto = (s.industryPortfolio ?? []).reduce(
    (a, x) => a + (x.monthlyRevenue ?? 0) - (x.monthlyOpex ?? 0),
    0,
  );
  const utdelningar = Math.round(
    s.stocks.reduce((a, st) => a + st.owned * st.price * st.dividendYield, 0) / 12,
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
  // Premie: 0,40 % av marknadsvärdet per år (min 2 000 kr/mån) – som i simulationen.
  const forsakringar = klara
    .filter((p) => p.insurance)
    .reduce((a, p) => a + Math.max(2_000, Math.round((propMarketValue(p, s) * 0.004) / 12)), 0);

  const summaIntakter = hyresintakter + industrinetto + utdelningar;
  const summaKostnader = driftkostnader + forvaltare + direktor + personal + kontor + forsakringar;
  const rorelseresultat = summaIntakter - summaKostnader;

  const effectiveRate = s.rateMode === "fixed" && s.fixedRate != null ? s.fixedRate : loanTerms(s).rate;
  const bankranta = Math.round((s.debt * (effectiveRate / 100)) / 12);
  const obligationsranta = (s.bonds ?? []).reduce(
    (a, b) => a + Math.round((b.amount * b.rate) / 100 / 12),
    0,
  );
  const revolverranta = s.revolving?.used ? Math.round((s.revolving.used * 0.015) / 12) : 0;
  const rantekostnad = bankranta + obligationsranta + revolverranta;

  const resultatForeSkatt = rorelseresultat - rantekostnad;

  // Samma skatteformel som simulationen: 22 % på positivt resultat efter
  // avskrivningsavdrag (2 %/år av anskaffningsvärdet), −3 %-enheter med
  // minst en fastighet i energiklass A (golv 10 %).
  const avskrivningsavdrag = Math.round(
    klara.reduce((a, p) => a + ((p.purchasePrice ?? p.askPrice) * 0.02) / 12, 0),
  );
  const harEnergiA = klara.some((p) => p.energyClass === "A");
  const skattesats = Math.max(0.1, 0.22 - (harEnergiA ? 0.03 : 0));
  const skatt =
    resultatForeSkatt > 0
      ? Math.round(Math.max(0, resultatForeSkatt - avskrivningsavdrag) * skattesats)
      : 0;

  return {
    hyresintakter,
    industrinetto,
    utdelningar,
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
  summaTillgangar: number;

  banklan: number;
  obligationer: number;
  revolver: number;
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
  const summaTillgangar = kassa + fastigheter + mark + industri + aktier + dotterbolag;

  const banklan = s.debt;
  const obligationer = (s.bonds ?? []).reduce((a, b) => a + b.amount, 0);
  const revolver = s.revolving?.used ?? 0;
  const summaSkulder = banklan + obligationer + revolver;

  const egetKapital = summaTillgangar - summaSkulder;
  return {
    kassa,
    fastigheter,
    mark,
    industri,
    aktier,
    dotterbolag,
    summaTillgangar,
    banklan,
    obligationer,
    revolver,
    summaSkulder,
    egetKapital,
    soliditet: summaTillgangar > 0 ? egetKapital / summaTillgangar : 0,
  };
}
