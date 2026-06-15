/* ============================================================
   Månadssimulering – kärnan i spelloopen.
   Logiken är oförändrad från prototypen.
   ============================================================ */

import { AI_NAMES, DISTRICTS, EVENTS, RARE_EVENTS } from "./data";
import { makeDecision } from "./decisions";
import { equityOf, loanTerms } from "./finance";
import { kr, msek } from "./format";
import { propAnnualOpex, propMarketValue, propPotentialRent } from "./property";
import { genListing, genLot } from "./generators";
import { RESEARCH, monthlyReputation, salariesTotal, wearMult } from "./progression";
import { newId, pick, rnd } from "./random";
import { applyStockNews, executeLimitOrders, priceStocks, stepSentiment, stockHoldingsValue } from "./stocks";
import type { GameState, LogEntry, Offer } from "./types";

/** Stegar fram spelet en månad och returnerar det nya tillståndet. */
export function advanceMonth(state: GameState): GameState {
  // Ett pågående beslut måste lösas innan spelet kan gå vidare.
  if (state.pendingDecision) return state;

  let s: GameState = { ...state };
  let monthlyNOI = 0;
  const events: LogEntry[] = [];
  const prevSent = state.marketSentiment ?? 1; // sentiment innan månadens händelser

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
    // Förvaltare: månadskostnad + auto-underhåll med konfigurerbar tröskel
    if (np.managed) {
      const managerCost = Math.max(2000, Math.round(np.tenants.reduce((a, t) => a + t.rent, 0) * 0.03));
      s.cash -= managerCost;
      monthlyNOI -= managerCost;
      const maintainThreshold = np.managerSettings?.maintainThreshold ?? 45;
      if (np.condition < maintainThreshold) {
        const maintainCost = Math.round(propMarketValue(np, s) * 0.02);
        if (s.cash >= maintainCost) {
          s.cash -= maintainCost;
          monthlyNOI -= maintainCost;
          np.condition = Math.min(100, np.condition + 15);
          events.push({ t: `🔧 Förvaltare underhöll ${np.typeLabel} i ${np.districtName} (tröskel ${maintainThreshold}).`, kind: "upg" });
        }
      }
    }
    // Slitage (långsammare med smart förvaltning)
    np.condition = Math.max(10, np.condition - rnd(0.2, 0.7) * wearMult(s));
    // Hyresgästlogik
    const nextTenants: typeof np.tenants = [];
    for (const t of np.tenants) {
      if (Math.random() < t.defaultRisk) {
        events.push({ t: `⚠️ ${t.name} i ${np.districtName} gick i konkurs. Plats ledig.`, kind: "expense" });
        continue;
      }
      if (t.monthsLeft <= 1) {
        if (np.managed) {
          const rentTargetPct = np.managerSettings?.rentTargetPct ?? 1.0;
          const marketMo = propPotentialRent(np, s) / np.capacity / 12;
          const baseRent = Math.round(marketMo * t.quality);
          const targetRent = Math.round(baseRent * rentTargetPct);
          // Risk att hyresgäst lämnar ökar vid mål >10 % över marknad
          const premiumRatio = targetRent / Math.max(1, baseRent);
          const willStay = premiumRatio <= 1.10 || Math.random() < 0.40;
          if (willStay) {
            const newRent = rentTargetPct < 1.0
              ? Math.min(t.rent, targetRent)
              : Math.max(t.rent, targetRent);
            monthlyNOI += t.rent;
            np.totalEarnedRent = (np.totalEarnedRent ?? 0) + t.rent;
            nextTenants.push({ ...t, monthsLeft: t.termTotal, rent: newRent });
            events.push({ t: `📄 Förvaltare förnyade avtal med ${t.name} i ${np.districtName}: ${kr(newRent)}/mån.`, kind: "info" });
          } else {
            events.push({ t: `📄 ${t.name} lämnade ${np.districtName} – för hög hyra vid förlängning.`, kind: "info" });
          }
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

  // ── AI-konkurrenter agerar (riktiga portföljer + personligheter) ─
  s.competitors = s.competitors.map((c) => {
    const nc = { ...c, portfolio: [...(c.portfolio ?? [])] };
    const portVal = nc.portfolio.reduce((a, p) => a + p.askPrice, 0);
    nc.monthlyNOI = Math.round((portVal * 0.06) / 12);
    nc.cash += nc.monthlyNOI;
    // Säljchans per strategi
    const sellProb = nc.strategy === "tillväxt" ? 0.01 : nc.strategy === "värde" ? 0.08 : 0.05;
    if (nc.portfolio.length > 2 && Math.random() < sellProb) {
      // värde-strategi säljer helst sin dyraste fastighet (realiserar vinst)
      const idx = nc.strategy === "värde"
        ? nc.portfolio.reduce((best, p, i) => p.askPrice > nc.portfolio[best].askPrice ? i : best, 0)
        : Math.floor(Math.random() * nc.portfolio.length);
      const selling = nc.portfolio.splice(idx, 1)[0];
      const sellPrice = Math.round(selling.askPrice * rnd(0.95, 1.10));
      nc.cash += sellPrice;
      const born = s.year * 12 + s.month;
      s.listings = [
        ...s.listings,
        {
          ...selling,
          owned: false,
          askPrice: sellPrice,
          listedMonth: born,
          expiresMonth: born + 3 + Math.floor(Math.random() * 2),
        },
      ];
      events.push({ t: `🏷️ ${c.name} säljer ${selling.typeLabel} i ${selling.districtName} (${msek(sellPrice)}).`, kind: "event" });
    }
    nc.units = nc.portfolio.length;
    nc.equity = nc.cash + nc.portfolio.reduce((a, p) => a + p.askPrice, 0);
    return nc;
  });
  // Konkurrent köper från marknaden med strategi-filtrering
  if (s.listings.length > 3 && Math.random() < 0.25) {
    const buyer = pick(s.competitors);
    const avgPrice = s.listings.reduce((a, p) => a + p.askPrice, 0) / s.listings.length;
    const buyable = s.listings.filter((p) => {
      if (p.status !== "klar") return false;
      switch (buyer.strategy) {
        case "distrikt": return p.district === buyer.preferredDistrict;
        case "värde": return p.askPrice < avgPrice * 0.95;
        case "utdelning": return (p.askPrice * 0.06 / 12) / p.askPrice >= 0.004;
        case "tillväxt": default: return true;
      }
    });
    if (buyable.length > 0) {
      const taken = pick(buyable);
      const price = Math.round(taken.askPrice * rnd(0.97, 1.05));
      s.listings = s.listings.filter((x) => x.id !== taken.id);
      s.competitors = s.competitors.map((c) =>
        c.name === buyer.name
          ? {
              ...c,
              cash: Math.max(0, c.cash - price),
              portfolio: [...(c.portfolio ?? []), { ...taken, owned: false, askPrice: price }],
              units: (c.portfolio ?? []).length + 1,
              lastBuy: taken.districtName,
            }
          : c,
      );
      events.push({
        t: `🏢 ${buyer.name} köpte ${taken.typeLabel} i ${taken.districtName} för ${msek(price)}.`,
        kind: "event",
      });
    }
  }

  // ── Inkommande bud på dina fastigheter ──────────────────────────
  // Räkna ner befintliga bud, släng utgångna.
  let offers: Offer[] = (s.offers ?? [])
    .map((o) => ({ ...o, expiresIn: o.expiresIn - 1 }))
    .filter((o) => {
      if (o.expiresIn <= 0) {
        events.push({ t: `⌛ Budet på ${o.propLabel} i ${o.districtName} drogs tillbaka.`, kind: "info" });
        return false;
      }
      // Behåll bara bud på fastigheter du fortfarande äger.
      return s.portfolio.some((p) => p.id === o.propId);
    });
  // Nytt bud (~9 %): en rival vill köpa en av dina färdiga fastigheter över marknadsvärde.
  const buyoutCandidates = s.portfolio.filter(
    (p) => p.status === "klar" && !offers.some((o) => o.propId === p.id),
  );
  if (buyoutCandidates.length > 0 && Math.random() < 0.09) {
    const target = pick(buyoutCandidates);
    const premium = rnd(1.1, 1.4);
    const amount = Math.round(propMarketValue(target, s) * premium);
    offers = [
      ...offers,
      {
        id: newId(),
        kind: "buyout",
        propId: target.id,
        propLabel: target.typeLabel,
        districtName: target.districtName,
        from: pick(AI_NAMES),
        amount,
        expiresIn: 3,
      },
    ];
    events.push({
      t: `📨 ${offers[offers.length - 1].from} bjuder ${msek(amount)} för din ${target.typeLabel} i ${target.districtName}.`,
      kind: "event",
    });
  }
  s.offers = offers;

  // ── Börsen ──────────────────────────────────────────────────────
  // Sentiment rör sig (påverkat av månadens makrohändelser), aktier
  // prissätts och utdelning betalas ut.
  const sent = stepSentiment(s.marketSentiment ?? 1);
  const sentReturn = (prevSent > 0 ? sent / prevSent : 1) - 1;
  s.marketSentiment = sent;
  s.sentimentHistory = [...(s.sentimentHistory ?? [prevSent]), sent].slice(-32);
  const market = priceStocks(s.stocks ?? [], sentReturn, s.competitors);
  s.stocks = market.stocks;
  if (market.dividends > 0) {
    s.cash += market.dividends;
    s.dividendsReceived = (s.dividendsReceived ?? 0) + market.dividends;
    if (s.month % 3 === 0)
      events.push({ t: `📈 Aktieutdelning inkom: ${kr(market.dividends)}.`, kind: "income" });
  }
  // Bolagsspecifika nyhetshändelser
  const stockNewsResult = applyStockNews(s.stocks);
  s.stocks = stockNewsResult.stocks;
  if (stockNewsResult.newsEntry)
    events.push({ t: stockNewsResult.newsEntry, kind: "event" });
  // Exekvera limitorder mot nya kurser
  const orderResult = executeLimitOrders(s);
  s = orderResult.state;
  for (const fill of orderResult.fills)
    events.push({ t: fill, kind: fill.startsWith("✅") ? "income" : "warn" });
  // Uppdatera aktieportföljens värdehistorik
  s.portfolioValueHistory = [
    ...(s.portfolioValueHistory ?? []),
    Math.round(stockHoldingsValue(s)),
  ].slice(-48);

  // ── Dotterbolag (förvärvade konkurrenter) ───────────────────────
  const subIncome = (s.subsidiaries ?? []).reduce((a, x) => a + x.monthlyIncome, 0);
  if (subIncome > 0) {
    s.cash += subIncome;
    if (s.month % 3 === 0)
      events.push({ t: `🏛️ Dotterbolagen bidrog med ${kr(subIncome * 3)} i kvartalet.`, kind: "income" });
  }

  // ── Löner (anställda) ───────────────────────────────────────────
  const salaries = salariesTotal(s);
  if (salaries > 0) {
    s.cash -= salaries;
    if (s.month % 3 === 0)
      events.push({ t: `👔 Löner betalades: ${kr(salaries)}/mån.`, kind: "expense" });
  }
  // Marknadschef stärker varumärket
  const repGain = monthlyReputation(s);
  if (repGain > 0) s.reputation = Math.min(100, s.reputation + repGain);

  // ── Forskning fortskrider ───────────────────────────────────────
  if (s.activeResearch) {
    const left = s.activeResearch.monthsLeft - 1;
    if (left <= 0) {
      const def = RESEARCH.find((r) => r.id === s.activeResearch!.id);
      s.researchDone = [...(s.researchDone ?? []), s.activeResearch.id];
      s.activeResearch = null;
      events.push({ t: `🔬 Forskning klar: ${def?.name ?? ""} — ${def?.effect ?? ""}.`, kind: "income" });
    } else {
      s.activeResearch = { ...s.activeResearch, monthsLeft: left };
    }
  }

  // ── Områdesutveckling: distrikt med fler ägda objekt apprecierar ─
  const dev: Record<string, number> = { ...(s.districtDev ?? {}) };
  for (const d of DISTRICTS) {
    const ownedHere = s.portfolio.filter((p) => p.district === d.id && p.status === "klar").length;
    const cur = dev[d.id] ?? 1;
    const growth = 0.0015 * ownedHere + rnd(-0.0025, 0.004);
    dev[d.id] = Math.max(0.85, Math.min(1.6, +(cur * (1 + growth)).toFixed(4)));
  }
  s.districtDev = dev;

  // Råvarupris/byggkostnad mjukt tillbaka mot normalt
  s.buildCostMod = +(((s.buildCostMod ?? 1) * 0.85 + 0.15)).toFixed(3);

  // ── Beslutshändelse (~6 %) ──────────────────────────────────────
  if (Math.random() < 0.06) {
    const decision = makeDecision(s);
    s.pendingDecision = decision;
    events.push({ t: `🤔 Beslut krävs: ${decision.title}`, kind: "event" });
  }

  // ── Utgångna listings återgår till världspoolen ─────────────────
  const nowAbs = s.year * 12 + s.month;
  const expiredListings: typeof s.listings = [];
  s.listings = s.listings.filter((p) => {
    if ((p.expiresMonth ?? Infinity) <= nowAbs) {
      expiredListings.push({ ...p, listedMonth: undefined, expiresMonth: undefined });
      return false;
    }
    return true;
  });
  s.worldPool = [...(s.worldPool ?? []), ...expiredListings];
  s.lots = s.lots.filter((l) => {
    if (!l.owned && (l.expiresMonth ?? Infinity) <= nowAbs) {
      events.push({ t: `📋 Tomt i ${l.districtName} drogs tillbaka.`, kind: "info" });
      return false;
    }
    return true;
  });

  // ── Marknadstillflöde: avslöja ur världspoolen (ej generera nytt) ─
  const MAX_LISTINGS = 12;
  const MAX_FREE_LOTS = 6;
  const pool = s.worldPool ?? [];
  if (s.listings.length < MAX_LISTINGS && pool.length > 0) {
    const reveal = 1 + Math.floor(Math.random() * Math.min(3, pool.length));
    const toReveal = pool.slice(0, reveal);
    const born = nowAbs;
    s.listings = [
      ...s.listings,
      ...toReveal.map((p) => ({
        ...p,
        listedMonth: born,
        expiresMonth: born + 3 + Math.floor(Math.random() * 2),
      })),
    ].slice(0, MAX_LISTINGS);
    s.worldPool = pool.slice(reveal);
  }
  // Om världspoolen tar slut: generera nybyggnation (expansionen av världen)
  if ((s.worldPool ?? []).length === 0 && s.listings.length < MAX_LISTINGS) {
    const newProp = genListing(s);
    s.listings = [...s.listings, newProp];
    s.worldTotal = (s.worldTotal ?? 0) + 1;
    events.push({ t: `🏗️ Nyproduktion utökar marknaden: ${newProp.typeLabel} i ${newProp.districtName}.`, kind: "info" });
  }
  if (Math.random() < 0.4 && s.lots.filter((l) => !l.owned).length < MAX_FREE_LOTS) {
    s.lots = [...s.lots, genLot(s)];
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
