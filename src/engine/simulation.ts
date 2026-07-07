/* ============================================================
   Månadssimulering – kärnan i spelloopen.
   Utöver grundekonomin hanteras här: intressentkö till vakanta
   lokaler, kontraktsförnyelser (via inkorgen), auktioner på
   marknadsobjekt, bundna lån, planändringar, distriktsutveckling,
   konkurrentdrag, valhändelser och börsnoteringserbjudandet.
   Händelser som gäller en fastighet bär parcelId för kartan.
   ============================================================ */

import { parcelsIn, usedParcelIds } from "./city";
import { hasPendingFor, pushInbox, resolveChoice } from "./choices";
import {
  DISTRICTS,
  EVENTS,
  EXPANSION_DISTRICT,
  IPO_EQUITY,
  MAINTENANCE_LEVELS,
  PROP_TYPES,
} from "./data";
import { equityOf, monthlyInterestOf } from "./finance";
import { kr, msek } from "./format";
import { genListing, genLot, genRivalHolding, makeTenant } from "./generators";
import { nextBidAmount, purchaseListing, transferListingToRival } from "./market";
import {
  devRentFactor,
  districtDev,
  propAnnualOpex,
  propMarketValue,
  propPotentialRent,
} from "./property";
import { pick, rnd } from "./random";
import type { GameState, LogEntry, Property } from "./types";

/** Stegar fram spelet en månad och returnerar det nya tillståndet. */
export function advanceMonth(state: GameState): GameState {
  let s: GameState = { ...state };
  let monthlyNOI = 0;
  const events: LogEntry[] = [];

  // ---- Fastigheter: byggen, slitage, hyresgäster, intressenter ----
  s.portfolio = s.portfolio.map((p) => {
    const np = { ...p };
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
    const decay = MAINTENANCE_LEVELS[np.maintenance ?? "normal"].decayMult;
    np.condition = Math.max(10, np.condition - rnd(0.2, 0.7) * decay);
    if (np.tenant) {
      np.prospects = [];
      monthlyNOI += np.tenant.rent;
      if (Math.random() < np.tenant.defaultRisk) {
        events.push({
          t: `⚠️ ${np.tenant.name} i ${np.districtName} gick i konkurs. Lokalen är nu vakant.`,
          kind: "expense",
          parcelId: np.parcelId,
        });
        np.tenant = null;
      } else if (np.tenant.monthsLeft > 0) {
        np.tenant = { ...np.tenant, monthsLeft: np.tenant.monthsLeft - 1 };
      }
      // monthsLeft 0 ⇒ förnyelsebeslut väntar i inkorgen; hyresgästen betalar under tiden.
    } else {
      // Intressenter söker sig till vakanta lokaler.
      const d = DISTRICTS.find((x) => x.id === np.district)!;
      np.prospects = np.prospects.filter(() => Math.random() > 0.25);
      const arrive = 0.35 * d.demand * s.demandMod * devRentFactor(districtDev(s, np.district));
      if (np.prospects.length < 3 && Math.random() < arrive) {
        np.prospects = [...np.prospects, makeTenant(propPotentialRent(np, s), s.demandMod)];
        events.push({
          t: `👋 Ny intressent till ${np.typeLabel} i ${np.districtName}.`,
          kind: "info",
          parcelId: np.parcelId,
        });
      }
    }
    monthlyNOI -= propAnnualOpex(np, s) / 12;
    return np;
  });

  // ---- Kontraktsförnyelser: lägg beslut i inkorgen ----
  for (const p of s.portfolio) {
    if (p.tenant && p.tenant.monthsLeft <= 0 && !hasPendingFor(s, "lease_renewal", p.id)) {
      s = pushInbox(s, {
        title: `Kontraktet med ${p.tenant.name} löper ut`,
        desc: `${p.typeLabel} i ${p.districtName}. Nuvarande hyra ${kr(p.tenant.rent)}/mån.`,
        monthsLeft: 2,
        options: [
          { id: "index", label: "Förnya (+2 %)" },
          { id: "market", label: "Kräv marknadshyra" },
          { id: "end", label: "Säg upp" },
        ],
        defaultOption: "index",
        payload: { kind: "lease_renewal", propertyId: p.id },
      });
    }
  }

  // ---- Bundna lån: bindningstid räknas ner ----
  const ticked = s.fixedLoans.map((l) => ({ ...l, monthsLeft: l.monthsLeft - 1 }));
  const released = ticked.filter((l) => l.monthsLeft <= 0);
  if (released.length) {
    const sum = released.reduce((a, l) => a + l.amount, 0);
    s.debt += sum;
    events.push({
      t: `🏦 Bindningstid löpte ut: ${msek(sum)} är nu rörligt lån igen.`,
      kind: "info",
    });
  }
  s.fixedLoans = ticked.filter((l) => l.monthsLeft > 0);

  // ---- Kassaflöde ----
  const interest = monthlyInterestOf(s);
  s.cash += monthlyNOI - interest;

  // ---- Makrohändelse ----
  if (Math.random() < 0.35) {
    const ev = pick(EVENTS);
    s = ev.apply(s);
    events.push({ t: `📰 ${ev.text}`, kind: "event" });
  }

  // ---- Konkurrenter: kassaflöde, förvärv, budcooldowns ----
  const occupied = usedParcelIds(s);
  s.competitors = s.competitors.map((c) => {
    const nc = {
      ...c,
      holdings: c.holdings.map((h) =>
        (h.refusedCooldown ?? 0) > 0 ? { ...h, refusedCooldown: h.refusedCooldown! - 1 } : h,
      ),
    };
    nc.cash += nc.holdings.length * rnd(60000, 140000);
    if (nc.cash > 4e6 && Math.random() < 0.4) {
      const h = genRivalHolding(s.unlockedDistricts, occupied);
      nc.holdings = [...nc.holdings, h];
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

  // ---- Auktioner: konkurrentbud och avslut ----
  for (const id of s.listings.map((l) => l.id)) {
    let l = s.listings.find((x) => x.id === id)!;
    // Konkurrenter kan bjuda (upp till en smärtgräns över utropspriset).
    if (s.competitors.length && Math.random() < 0.3) {
      const amount = nextBidAmount(l);
      if (amount <= l.askPrice * 1.25) {
        const rival = pick(s.competitors).name;
        const wasPlayer = l.bestBid?.isPlayer;
        l = { ...l, bestBid: { bidder: rival, isPlayer: false, amount } };
        if (wasPlayer)
          events.push({
            t: `🔨 ${rival} bjöd över dig: ${msek(amount)} för ${l.typeLabel} i ${l.districtName}.`,
            kind: "event",
            parcelId: l.parcelId,
          });
      }
    }
    l = { ...l, auctionMonthsLeft: l.auctionMonthsLeft - 1 };
    s = { ...s, listings: s.listings.map((x) => (x.id === id ? l : x)) };
    if (l.auctionMonthsLeft > 0) continue;

    // Klubbat: högsta budet vinner.
    if (l.bestBid?.isPlayer) {
      const bought = purchaseListing(s, l, l.bestBid.amount);
      if (bought) {
        s = bought;
        events.push({
          t: `🔨 Du vann budgivningen om ${l.typeLabel} i ${l.districtName}!`,
          kind: "buy",
          parcelId: l.parcelId,
        });
      } else {
        s = { ...s, listings: s.listings.filter((x) => x.id !== id) };
        events.push({
          t: `⚠️ Du vann budgivningen om ${l.typeLabel} men handpenningen saknades – affären sprack.`,
          kind: "warn",
          parcelId: l.parcelId,
        });
      }
    } else if (l.bestBid) {
      s = transferListingToRival(s, l, l.bestBid.bidder);
      events.push({
        t: `🏷️ ${l.bestBid.bidder} vann budgivningen om ${l.typeLabel} i ${l.districtName}.`,
        kind: "event",
        parcelId: l.parcelId,
      });
    } else {
      s = { ...s, listings: s.listings.filter((x) => x.id !== id) };
    }
  }

  // ---- Marknadspåfyllning ----
  if (s.listings.length < 4) {
    const occ = usedParcelIds(s);
    const add: Property[] = [];
    while (s.listings.length + add.length < 5) add.push(genListing(s, occ));
    s.listings = [...s.listings, ...add];
  }
  if (s.lots.filter((l) => !l.owned).length < 2 && Math.random() < 0.4) {
    s.lots = [...s.lots, genLot(s, usedParcelIds(s))];
  }

  // ---- Planändringar ----
  s.lots = s.lots.map((l) => {
    if (!l.rezoning) return l;
    const monthsLeft = l.rezoning.monthsLeft - 1;
    if (monthsLeft > 0) return { ...l, rezoning: { ...l.rezoning, monthsLeft } };
    events.push({
      t: `📋 Planändring beviljad: ${PROP_TYPES[l.rezoning.type].label} tillåts nu på tomten i ${l.districtName}.`,
      kind: "upg",
      parcelId: l.parcelId,
    });
    return { ...l, rezoning: null, extraTypes: [...(l.extraTypes ?? []), l.rezoning.type] };
  });

  // ---- Distriktsutveckling (gentrifiering) ----
  const dev: Record<string, number> = {};
  for (const d of DISTRICTS) {
    const total = parcelsIn(d.id).length;
    const developed =
      s.portfolio.filter((p) => p.district === d.id).length +
      s.competitors.reduce((a, c) => a + c.holdings.filter((h) => h.district === d.id).length, 0);
    const mine = s.portfolio.filter((p) => p.district === d.id);
    const avgCond = mine.length ? mine.reduce((a, p) => a + p.condition, 0) / mine.length : 65;
    const target = 40 + (developed / total) * 45 + (avgCond - 65) * 0.4;
    const cur = districtDev(s, d.id);
    dev[d.id] = +Math.min(90, Math.max(20, cur + (target - cur) * 0.08)).toFixed(2);
  }
  s.districtDev = dev;

  // ---- Valhändelser till inkorgen ----
  s = maybePushChoiceEvents(s);

  // ---- Inkorgen: tidsfrister och automatiska beslut ----
  for (const item of [...s.inbox]) {
    const monthsLeft = item.monthsLeft - 1;
    if (monthsLeft > 0) {
      s = { ...s, inbox: s.inbox.map((i) => (i.id === item.id ? { ...i, monthsLeft } : i)) };
    } else {
      s = resolveChoice(s, item, item.defaultOption);
    }
  }

  // ---- Tid ----
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

  // Börsnotering erbjuds en gång när imperiet är stort nog.
  if (!s.gameWon && !s.ipoOffered && equityOf(s) >= IPO_EQUITY) {
    s = pushInbox(
      { ...s, ipoOffered: true },
      {
        title: "Börsnotering?",
        desc: `Investmentbanken bedömer att Fastighetsimperium AB kan noteras. Eget kapital: ${msek(equityOf(s))}.`,
        monthsLeft: 3,
        options: [
          { id: "ipo", label: "Notera bolaget 🎉" },
          { id: "stay", label: "Förbli privat" },
        ],
        defaultOption: "stay",
        payload: { kind: "ipo" },
      },
    );
    events.push({ t: "📈 Investmentbanken föreslår börsnotering – se inkorgen.", kind: "event" });
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

/** Slumpade valhändelser: markanvisning, hyresrabatt, uppköpsbud. */
function maybePushChoiceEvents(state: GameState): GameState {
  let s = state;

  // Kommunal markanvisning (billig mark mot snabbt beslut).
  if (Math.random() < 0.04) {
    const occupied = usedParcelIds(s);
    const candidates = s.unlockedDistricts.filter((d) =>
      parcelsIn(d).some((pc) => !occupied.has(pc.id)),
    );
    if (candidates.length) {
      const district = pick(candidates);
      const dName = DISTRICTS.find((d) => d.id === district)?.name ?? district;
      const price = (Math.round(rnd(2, 5) * 10) / 10) * 1e6;
      s = pushInbox(s, {
        title: "Kommunal markanvisning",
        desc: `Kommunen erbjuder en tomt i ${dName} för ${msek(price)} – under marknadspris, men beslutet brådskar.`,
        monthsLeft: 2,
        options: [
          { id: "buy", label: `Köp (${msek(price)})` },
          { id: "decline", label: "Avböj" },
        ],
        defaultOption: "decline",
        payload: { kind: "markanvisning", district, price },
      });
    }
  }

  // Hyresgäst begär rabatt.
  if (Math.random() < 0.03) {
    const withTenant = s.portfolio.filter(
      (p) => p.tenant && !hasPendingFor(s, "hyresrabatt", p.id),
    );
    if (withTenant.length) {
      const p = pick(withTenant);
      s = pushInbox(s, {
        title: `${p.tenant!.name} begär hyressänkning`,
        desc: `${p.typeLabel} i ${p.districtName}. Ge 10 % rabatt och behåll dem nöjda, eller neka och riskera konkurs/avflytt.`,
        monthsLeft: 2,
        options: [
          { id: "grant", label: "Ge 10 % rabatt" },
          { id: "refuse", label: "Neka" },
        ],
        defaultOption: "refuse",
        payload: { kind: "hyresrabatt", propertyId: p.id },
      });
    }
  }

  // Konkurrent lägger bud på en av dina fastigheter.
  if (Math.random() < 0.06 && s.competitors.length) {
    const targets = s.portfolio.filter(
      (p) => p.status === "klar" && !hasPendingFor(s, "buyout_offer", p.id),
    );
    if (targets.length) {
      const p = pick(targets);
      const rival = pick(s.competitors).name;
      const amount = Math.round(propMarketValue(p, s) * rnd(1.08, 1.3));
      s = pushInbox(s, {
        title: `${rival} vill köpa ${p.typeLabel} i ${p.districtName}`,
        desc: `Bud: ${msek(amount)} (marknadsvärde ${msek(propMarketValue(p, s))}).`,
        monthsLeft: 2,
        options: [
          { id: "sell", label: `Sälj (${msek(amount)})` },
          { id: "decline", label: "Neka" },
        ],
        defaultOption: "decline",
        payload: { kind: "buyout_offer", propertyId: p.id, rival, amount },
      });
    }
  }

  return s;
}
