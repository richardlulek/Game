/* ============================================================
   Månadssimulering – kärnan i spelloopen.
   Logiken är oförändrad från prototypen.
   ============================================================ */

import { DISTRICTS, EVENTS, RARE_EVENTS } from "./data";
import { equityOf, loanTerms } from "./finance";
import { kr } from "./format";
import { propAnnualOpex, propMarketValue, propPotentialRent } from "./property";
import { pick, rnd } from "./random";
import type { GameState, LogEntry } from "./types";

/** Stegar fram spelet en månad och returnerar det nya tillståndet. */
export function advanceMonth(state: GameState): GameState {
  let s: GameState = { ...state };
  let monthlyNOI = 0;
  const events: LogEntry[] = [];

  s.portfolio = s.portfolio.map((p) => {
    const np = { ...p };
    // Bygge fortskrider
    if (np.status === "bygger") {
      np.buildLeft -= 1;
      if (np.buildLeft <= 0) {
        np.status = "klar";
        np.vacancyMult = Math.max(0.6, np.vacancyMult * 0.80); // nyproducerat: 20 % lägre vakans
        s.reputation = Math.min(100, s.reputation + 5);
        events.push({
          t: `🏗️ Nyproduktion klar: ${np.typeLabel} i ${np.districtName}. Reputation +5.`,
          kind: "income",
        });
      }
      return np;
    }
    // Förvaltare: avanstalt månadskostnad + auto-underhåll
    if (np.managed) {
      const managerCost = Math.max(2000, Math.round(np.tenants.reduce((a, t) => a + t.rent, 0) * 0.03));
      s.cash -= managerCost;
      monthlyNOI -= managerCost;
      if (np.condition < 45) {
        const maintainCost = Math.round(propMarketValue(np, s) * 0.02);
        if (s.cash >= maintainCost) {
          s.cash -= maintainCost;
          monthlyNOI -= maintainCost;
          np.condition = Math.min(100, np.condition + 15);
          events.push({ t: `🔧 Förvaltare underhöll ${np.typeLabel} i ${np.districtName}.`, kind: "upg" });
        }
      }
    }
    // Slitage
    np.condition = Math.max(10, np.condition - rnd(0.2, 0.7));
    // Hyresgästlogik
    const nextTenants: typeof np.tenants = [];
    for (const t of np.tenants) {
      if (Math.random() < t.defaultRisk) {
        events.push({ t: `⚠️ ${t.name} i ${np.districtName} gick i konkurs. Plats ledig.`, kind: "expense" });
        continue;
      }
      if (t.monthsLeft <= 1) {
        if (np.managed) {
          // Auto-förnya till marknadshyra (ej lägre än befintlig)
          const marketMo = propPotentialRent(np, s) / np.capacity / 12;
          const newRent = Math.max(t.rent, Math.round(marketMo * t.quality));
          monthlyNOI += t.rent;
          np.totalEarnedRent = (np.totalEarnedRent ?? 0) + t.rent;
          nextTenants.push({ ...t, monthsLeft: t.termTotal, rent: newRent });
          events.push({ t: `📄 Förvaltare förnyade avtal med ${t.name} i ${np.districtName}: ${kr(newRent)}/mån.`, kind: "info" });
        } else {
          events.push({ t: `📄 Kontrakt med ${t.name} i ${np.districtName} löpte ut.`, kind: "info" });
        }
        continue;
      }
      monthlyNOI += t.rent;
      np.totalEarnedRent = (np.totalEarnedRent ?? 0) + t.rent;
      nextTenants.push({ ...t, monthsLeft: t.monthsLeft - 1 });
    }
    np.tenants = nextTenants;
    // Opex dras alltid
    monthlyNOI -= propAnnualOpex(np, s) / 12;
    return np;
  });

  const interest = (s.debt * (loanTerms(s).rate / 100)) / 12;
  s.cash += monthlyNOI - interest;

  // Makrohändelse
  if (Math.random() < 0.35) {
    const ev = pick(EVENTS);
    s = ev.apply(s);
    events.push({ t: `📰 ${ev.text}`, kind: "event" });
  }
  // Sällsynt chockhändelse (~3 % per månad)
  if (Math.random() < 0.03) {
    const ev = pick(RARE_EVENTS);
    s = ev.apply(s);
    events.push({ t: `🚨 ${ev.text}`, kind: "warn" });
  }

  // AI-konkurrenter agerar
  s.competitors = s.competitors.map((c) => {
    const nc = { ...c };
    const noi = nc.units * rnd(60000, 140000);
    nc.monthlyNOI = Math.round(noi / 12);
    nc.cash += noi;
    if (nc.cash > 4e6 && Math.random() < 0.4) {
      nc.units += 1;
      nc.cash -= rnd(3, 5) * 1e6;
      const d = pick(DISTRICTS);
      nc.lastBuy = d.name;
      events.push({ t: `🏢 ${c.name} förvärvade en fastighet i ${d.name}.`, kind: "event" });
    }
    nc.equity = nc.cash + nc.units * rnd(4, 7) * 1e6;
    return nc;
  });
  // Konkurrenter kan sno ett marknadsobjekt
  if (s.listings.length > 2 && Math.random() < 0.3) {
    const taken = pick(s.listings);
    s.listings = s.listings.filter((x) => x.id !== taken.id);
    events.push({
      t: `🏷️ En konkurrent köpte ${taken.typeLabel} i ${taken.districtName} före dig.`,
      kind: "event",
    });
  }

  // Tid
  s.month += 1;
  if (s.month > 12) {
    s.month = 1;
    s.year += 1;
    s.marketMod = +(s.marketMod * rnd(0.99, 1.04)).toFixed(3);
  }

  const net = monthlyNOI - interest;
  const summary: LogEntry = {
    t: `Månad ${s.month}/${s.year}: driftnetto ${kr(monthlyNOI)} − ränta ${kr(interest)} = ${kr(net)}.`,
    kind: net >= 0 ? "income" : "expense",
  };
  s.log = [...events, summary, ...s.log].slice(0, 70);

  const equity = equityOf(s);
  s.history = [...s.history, { month: s.history.length, equity }].slice(-120);

  if (s.cash < -2_000_000) {
    s.gameOver = true;
    s.log = [{ t: "💥 KONKURS! Spelet är slut.", kind: "warn" }, ...s.log];
  }
  return s;
}
