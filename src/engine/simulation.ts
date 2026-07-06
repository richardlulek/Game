/* ============================================================
   Månadssimulering – kärnan i spelloopen.
   Logiken är oförändrad från prototypen; händelser som gäller en
   specifik fastighet bär parcelId så att kartan kan markera dem.
   ============================================================ */

import { usedParcelIds } from "./city";
import { DISTRICTS, EVENTS, EXPANSION_DISTRICT } from "./data";
import { equityOf, loanTerms } from "./finance";
import { kr } from "./format";
import { genRivalHolding } from "./generators";
import { propAnnualOpex } from "./property";
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
        events.push({
          t: `🏗️ Nyproduktion klar: ${np.typeLabel} i ${np.districtName}.`,
          kind: "income",
          parcelId: np.parcelId,
        });
      }
      return np;
    }
    // Slitage
    np.condition = Math.max(10, np.condition - rnd(0.2, 0.7));
    // Hyresgästlogik
    if (np.tenant) {
      monthlyNOI += np.tenant.rent;
      // Konkursrisk
      if (Math.random() < np.tenant.defaultRisk) {
        events.push({
          t: `⚠️ ${np.tenant.name} i ${np.districtName} gick i konkurs. Lokalen är nu vakant.`,
          kind: "expense",
          parcelId: np.parcelId,
        });
        np.tenant = null;
      } else {
        const t2 = { ...np.tenant, monthsLeft: np.tenant.monthsLeft - 1 };
        if (t2.monthsLeft <= 0) {
          events.push({
            t: `📄 Kontraktet med ${np.tenant.name} i ${np.districtName} löpte ut.`,
            kind: "info",
            parcelId: np.parcelId,
          });
          np.tenant = null;
        } else {
          np.tenant = t2;
        }
      }
    }
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

  // AI-konkurrenter agerar. Delat occupied-set så att månadens
  // förvärv inte krockar med varandra eller med spelarens objekt.
  const occupied = usedParcelIds(s);
  s.competitors = s.competitors.map((c) => {
    const nc = { ...c, holdings: [...c.holdings] };
    const noi = nc.holdings.length * rnd(60000, 140000);
    nc.cash += noi;
    if (nc.cash > 4e6 && Math.random() < 0.4) {
      const h = genRivalHolding(s.unlockedDistricts, occupied);
      nc.holdings.push(h);
      nc.cash -= rnd(3, 5) * 1e6;
      events.push({
        t: `🏢 ${c.name} förvärvade ${h.typeLabel.toLowerCase()} i ${h.districtName}.`,
        kind: "event",
        parcelId: h.parcelId,
      });
    }
    nc.units = nc.holdings.length;
    nc.equity = nc.cash + nc.units * rnd(4, 7) * 1e6;
    return nc;
  });
  // Konkurrenter kan sno ett marknadsobjekt – byggnaden byter ägare på kartan
  if (s.listings.length > 2 && Math.random() < 0.3) {
    const taken = pick(s.listings);
    const buyerIdx = Math.floor(Math.random() * s.competitors.length);
    s.listings = s.listings.filter((x) => x.id !== taken.id);
    s.competitors = s.competitors.map((c, i) => {
      if (i !== buyerIdx) return c;
      const holdings = [
        ...c.holdings,
        {
          id: taken.id,
          parcelId: taken.parcelId,
          district: taken.district,
          districtName: taken.districtName,
          type: taken.type,
          typeLabel: taken.typeLabel,
          area: taken.area,
        },
      ];
      return { ...c, holdings, units: holdings.length };
    });
    events.push({
      t: `🏷️ ${s.competitors[buyerIdx].name} köpte ${taken.typeLabel} i ${taken.districtName} före dig.`,
      kind: "event",
      parcelId: taken.parcelId,
    });
  }

  // Tid
  s.month += 1;
  if (s.month > 12) {
    s.month = 1;
    s.year += 1;
    s.marketMod = +(s.marketMod * rnd(0.99, 1.04)).toFixed(3);
  }

  // Stadsexpansion: nytt distrikt öppnar när imperiet vuxit (eller med tiden).
  if (
    !s.unlockedDistricts.includes(EXPANSION_DISTRICT) &&
    (equityOf(s) >= 30_000_000 || s.year >= 4)
  ) {
    s.unlockedDistricts = [...s.unlockedDistricts, EXPANSION_DISTRICT];
    const name = DISTRICTS.find((d) => d.id === EXPANSION_DISTRICT)?.name ?? EXPANSION_DISTRICT;
    events.push({
      t: `🌆 Staden växer! ${name} öppnar för exploatering – nya objekt dyker upp på marknaden.`,
      kind: "event",
    });
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
