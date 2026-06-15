/* ============================================================
   Reducer – alla spelhändelser (köp, sälj, uppgradera, bygg, ...).
   Logiken är oförändrad från prototypen. Zustand-storen wrappar
   denna rena funktion (se src/store/gameStore.ts).
   ============================================================ */

import { DISTRICTS, PROP_TYPES, UPGRADES } from "./data";
import { loanTerms } from "./finance";
import { kr, msek, pct } from "./format";
import { genListing, genLot, makeTenant } from "./generators";
import { initState } from "./initState";
import { propMarketValue, propPotentialRent } from "./property";
import {
  RESEARCH,
  STAFF_ROLES,
  bidBonus,
  buildCostMult,
  buildMonthsDelta,
  hireFee,
} from "./progression";
import { newId } from "./random";
import { advanceMonth } from "./simulation";
import { COURTAGE, STOCK_CAP_RATE } from "./stocks";
import type { GameAction, GameState, LogKind, Property } from "./types";

/** Lägger till en rad i loggen utan att ändra övrigt tillstånd. */
function log(state: GameState, t: string, kind: LogKind): GameState {
  return { ...state, log: [{ t, kind }, ...state.log] };
}

export function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "BUY": {
      const p = state.listings.find((x) => x.id === action.id);
      if (!p) return state;
      const { maxLtv } = loanTerms(state);
      const down = p.askPrice * (1 - maxLtv);
      if (state.cash < down)
        return log(
          state,
          `För lite kontanter. Handpenning ${msek(down)} krävs (LTV ${pct(maxLtv)}).`,
          "warn",
        );
      const loan = p.askPrice - down;
      const txEntry = { type: "köp" as const, price: p.askPrice, month: state.month, year: state.year, party: "Spelaren" };
      return {
        ...state,
        cash: state.cash - down,
        debt: state.debt + loan,
        reputation: Math.min(100, +(state.reputation + 0.4).toFixed(1)),
        portfolio: [...state.portfolio, { ...p, owned: true, purchasePrice: p.askPrice, txHistory: [...(p.txHistory ?? []), txEntry] }],
        listings: state.listings.filter((x) => x.id !== p.id),
        log: [
          {
            t: `Köpte ${p.typeLabel} i ${p.districtName} för ${msek(p.askPrice)} (lån ${msek(loan)}).`,
            kind: "buy",
          },
          ...state.log,
        ],
      };
    }
    case "PLACE_BID": {
      const p = state.listings.find((x) => x.id === action.id);
      if (!p) return state;
      const { maxLtv } = loanTerms(state);
      const bid = Math.max(0, Math.round(action.amount));
      const down = bid * (1 - maxLtv);
      if (state.cash < down)
        return log(state, `För lite kontanter. Handpenning ${msek(down)} krävs för budet.`, "warn");
      const ratio = bid / p.askPrice;
      const baseProb =
        ratio >= 0.97 ? 0.92 : ratio >= 0.92 ? 0.62 : ratio >= 0.85 ? 0.34 : ratio >= 0.78 ? 0.13 : 0.03;
      const acceptProb = Math.min(0.98, baseProb + bidBonus(state));
      if (Math.random() < acceptProb) {
        const loan = bid - down;
        const txEntry = { type: "köp" as const, price: bid, month: state.month, year: state.year, party: "Spelaren" };
        return {
          ...state,
          cash: state.cash - down,
          debt: state.debt + loan,
          reputation: Math.min(100, +(state.reputation + 0.4).toFixed(1)),
          portfolio: [...state.portfolio, { ...p, owned: true, purchasePrice: bid, txHistory: [...(p.txHistory ?? []), txEntry] }],
          listings: state.listings.filter((x) => x.id !== p.id),
          log: [
            {
              t: `✓ Bud accepterat! Köpte ${p.typeLabel} i ${p.districtName} för ${msek(bid)} (under utpris ${msek(p.askPrice)}).`,
              kind: "buy",
            },
            ...state.log,
          ],
        };
      }
      const withdrawn = Math.random() < 0.25;
      return {
        ...state,
        listings: withdrawn ? state.listings.filter((x) => x.id !== p.id) : state.listings,
        log: [
          {
            t: withdrawn
              ? `Ditt bud på ${p.typeLabel} i ${p.districtName} avvisades – säljaren tog ett annat bud.`
              : `Ditt bud på ${p.typeLabel} i ${p.districtName} (${msek(bid)}) avvisades. Försök igen eller höj budet.`,
            kind: "warn",
          },
          ...state.log,
        ],
      };
    }
    case "SELL": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p) return state;
      const value = propMarketValue(p, state);
      const payoff = Math.min(state.debt, (p.purchasePrice || value) * 0.6);
      const born = state.year * 12 + state.month;
      const sellTx = { type: "sälj" as const, price: value, month: state.month, year: state.year, party: "Spelaren" };
      const relisted = {
        ...p,
        owned: false,
        askPrice: value,
        listedMonth: born,
        expiresMonth: born + 3 + Math.floor(Math.random() * 2),
        txHistory: [...(p.txHistory ?? []), sellTx],
      };
      return {
        ...state,
        cash: state.cash + (value - payoff),
        debt: Math.max(0, state.debt - payoff),
        portfolio: state.portfolio.filter((x) => x.id !== p.id),
        listings: [...state.listings, relisted],
        log: [
          {
            t: `Sålde ${p.typeLabel} i ${p.districtName} för ${msek(value)} (netto ${msek(value - payoff)}) – läggs ut till salu.`,
            kind: "sell",
          },
          ...state.log,
        ],
      };
    }
    case "UPGRADE": {
      const p = state.portfolio.find((x) => x.id === action.id);
      const u = UPGRADES.find((x) => x.id === action.upg);
      if (!p || !u || p.status === "bygger") return state;
      const cost = propMarketValue(p, state) * u.cost;
      if (state.cash < cost) return log(state, "För lite kontanter för åtgärden.", "warn");
      const np: Property = { ...p, upgrades: [...p.upgrades, u.id] };
      if (u.rentBoost) np.rentMult *= 1 + u.rentBoost;
      if (u.opexCut) np.opexMult *= 1 - u.opexCut;
      if (u.vacancyCut) np.vacancyMult *= 1 - u.vacancyCut;
      if (u.valueBoost) np.valueMult *= 1 + u.valueBoost;
      if (u.condBoost) np.condition = Math.min(100, np.condition + u.condBoost);
      return {
        ...state,
        cash: state.cash - cost,
        portfolio: state.portfolio.map((x) => (x.id === p.id ? np : x)),
        log: [
          { t: `${u.name} på ${p.typeLabel} i ${p.districtName} (${msek(cost)}).`, kind: "upg" },
          ...state.log,
        ],
      };
    }
    case "LEASE": {
      // Hyr ut en ledig plats till ny hyresgäst
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.tenants.length >= p.capacity || p.status === "bygger") return state;
      const tenant = makeTenant(propPotentialRent(p, state) / p.capacity, state.demandMod, p.condition);
      return {
        ...state,
        portfolio: state.portfolio.map((x) =>
          x.id === p.id ? { ...x, tenants: [...x.tenants, tenant] } : x,
        ),
        log: [
          {
            t: `Tecknade hyresavtal: ${tenant.name} i ${p.districtName}, ${tenant.termTotal} mån, ${kr(tenant.rent)}/mån.`,
            kind: "buy",
          },
          ...state.log,
        ],
      };
    }
    case "EVICT": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status === "bygger") return state;
      const tenant = p.tenants.find((t) => t.id === action.tenantId);
      if (!tenant) return state;
      return {
        ...state,
        reputation: Math.max(0, state.reputation - 3),
        portfolio: state.portfolio.map((x) =>
          x.id === p.id ? { ...x, tenants: x.tenants.filter((t) => t.id !== action.tenantId) } : x,
        ),
        log: [
          { t: `Sade upp ${tenant.name} i ${p.districtName} (reputation −3).`, kind: "warn" },
          ...state.log,
        ],
      };
    }
    case "RENEW_LEASE": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status === "bygger") return state;
      const tenant = p.tenants.find((t) => t.id === action.tenantId);
      if (!tenant) return state;
      const marketRent = Math.round((propPotentialRent(p, state) / p.capacity / 12) * tenant.quality);
      const newRent = Math.max(tenant.rent, marketRent);
      const renewed = { ...tenant, rent: newRent, monthsLeft: tenant.termTotal };
      return {
        ...state,
        reputation: Math.min(100, state.reputation + 1),
        portfolio: state.portfolio.map((x) =>
          x.id === p.id
            ? { ...x, tenants: x.tenants.map((t) => (t.id === action.tenantId ? renewed : t)) }
            : x,
        ),
        log: [
          {
            t: `Förnyade avtal med ${tenant.name} i ${p.districtName}: ${kr(newRent)}/mån, ${renewed.monthsLeft} mån.`,
            kind: "buy",
          },
          ...state.log,
        ],
      };
    }
    case "MAINTAIN": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status === "bygger") return state;
      const cost = Math.round(propMarketValue(p, state) * 0.02);
      if (state.cash < cost) return log(state, "För lite kontanter för underhåll.", "warn");
      return {
        ...state,
        cash: state.cash - cost,
        portfolio: state.portfolio.map((x) =>
          x.id === p.id ? { ...x, condition: Math.min(100, x.condition + 15) } : x,
        ),
        log: [
          {
            t: `Underhåll på ${p.typeLabel} i ${p.districtName}: +15 skick (${msek(cost)}).`,
            kind: "upg",
          },
          ...state.log,
        ],
      };
    }
    case "BUY_LOT": {
      const lot = state.lots.find((x) => x.id === action.id);
      if (!lot) return state;
      if (state.cash < lot.price) return log(state, "För lite kontanter för tomten.", "warn");
      return {
        ...state,
        cash: state.cash - lot.price,
        lots: state.lots.map((x) => (x.id === lot.id ? { ...x, owned: true } : x)),
        log: [
          {
            t: `Köpte tomt i ${lot.districtName} (${lot.area} m²) för ${msek(lot.price)}.`,
            kind: "buy",
          },
          ...state.log,
        ],
      };
    }
    case "BUILD": {
      const lot = state.lots.find((x) => x.id === action.id);
      const t = PROP_TYPES[action.propType];
      if (!lot || !lot.owned || !t) return state;
      const cost = Math.round(lot.area * t.buildCostM2 * buildCostMult(state));
      const buildLeft = Math.max(4, t.buildMonths + buildMonthsDelta(state));
      const { maxLtv } = loanTerms(state);
      const down = cost * (1 - maxLtv);
      if (state.cash < down)
        return log(state, `Bygget kräver ${msek(down)} kontant (resten lån).`, "warn");
      const d = DISTRICTS.find((x) => x.id === lot.district)!;
      const value = lot.area * d.base * 1.1 * state.marketMod;
      const newProp: Property = {
        id: newId(),
        district: lot.district,
        districtName: lot.districtName,
        type: action.propType,
        typeLabel: t.label,
        area: lot.area,
        condition: 100,
        askPrice: Math.round(value),
        purchasePrice: Math.round(cost),
        baseRent: Math.round(value * t.rentFactor * 12),
        upgrades: [],
        owned: true,
        rentMult: 1,
        opexMult: 1,
        vacancyMult: 1,
        valueMult: 1,
        tenants: [],
        capacity: 1,
        status: "bygger",
        buildLeft,
        txHistory: [{ type: "nybygg", price: Math.round(cost), month: state.month, year: state.year, party: "Spelaren" }],
      };
      return {
        ...state,
        cash: state.cash - down,
        debt: state.debt + (cost - down),
        reputation: Math.min(100, +(state.reputation + 0.4).toFixed(1)),
        portfolio: [...state.portfolio, newProp],
        lots: state.lots.filter((x) => x.id !== lot.id),
        worldTotal: (state.worldTotal ?? 0) + 1,
        log: [
          {
            t: `Påbörjade nyproduktion (${t.label}) i ${lot.districtName}. Klart om ${buildLeft} mån. Världen utökas till ${(state.worldTotal ?? 0) + 1} fastigheter.`,
            kind: "upg",
          },
          ...state.log,
        ],
      };
    }
    case "AMORT": {
      const amt = Math.min(state.cash, action.amount, state.debt);
      if (amt <= 0) return state;
      return {
        ...state,
        cash: state.cash - amt,
        debt: state.debt - amt,
        reputation: Math.min(100, state.reputation + 0.5),
        log: [{ t: `Amorterade ${msek(amt)}.`, kind: "info" }, ...state.log],
      };
    }
    case "REFINANCE": {
      const { maxLtv } = loanTerms(state);
      const portVal = state.portfolio.reduce((a, p) => a + propMarketValue(p, state), 0);
      const maxDebt = Math.floor(portVal * maxLtv);
      const draw = Math.min(action.amount, Math.max(0, maxDebt - state.debt));
      if (draw <= 0) return log(state, "Inga ytterligare låneutrymme inom nuvarande LTV.", "warn");
      return {
        ...state,
        cash: state.cash + draw,
        debt: state.debt + draw,
        reputation: Math.max(0, state.reputation - 1),
        log: [
          { t: `Belånade portföljen: +${msek(draw)} (reputation −1).`, kind: "income" },
          ...state.log,
        ],
      };
    }
    case "LEASE_TENANT": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.tenants.length >= p.capacity || p.status === "bygger") return state;
      return {
        ...state,
        portfolio: state.portfolio.map((x) =>
          x.id === p.id ? { ...x, tenants: [...x.tenants, action.tenant] } : x,
        ),
        log: [
          {
            t: `Tecknade hyresavtal: ${action.tenant.name} i ${p.districtName}, ${action.tenant.termTotal} mån, ${kr(action.tenant.rent)}/mån.`,
            kind: "buy",
          },
          ...state.log,
        ],
      };
    }
    case "RAISE_RENT": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status === "bygger") return state;
      const tenant = p.tenants.find((t) => t.id === action.tenantId);
      if (!tenant) return state;
      const newRent    = Math.round(tenant.rent * (1 + action.increasePercent / 100));
      const marketMo   = propPotentialRent(p, state) / p.capacity / 12;
      const ratio      = newRent / marketMo;
      const acceptProb = ratio < 1.0 ? 0.97 : ratio < 1.1 ? 0.80 : ratio < 1.2 ? 0.55 : ratio < 1.35 ? 0.28 : 0.10;
      if (Math.random() < acceptProb) {
        return {
          ...state,
          portfolio: state.portfolio.map((x) =>
            x.id === p.id
              ? { ...x, tenants: x.tenants.map((t) => (t.id === action.tenantId ? { ...t, rent: newRent } : t)) }
              : x,
          ),
          log: [
            {
              t: `${tenant.name} i ${p.districtName} accepterade hyreshöjning +${action.increasePercent}% → ${kr(newRent)}/mån.`,
              kind: "income",
            },
            ...state.log,
          ],
        };
      }
      return {
        ...state,
        reputation: Math.max(0, state.reputation - 1),
        portfolio: state.portfolio.map((x) =>
          x.id === p.id ? { ...x, tenants: x.tenants.filter((t) => t.id !== action.tenantId) } : x,
        ),
        log: [
          {
            t: `${tenant.name} i ${p.districtName} avvisade hyreshöjningen och lämnade (reputation −1).`,
            kind: "warn",
          },
          ...state.log,
        ],
      };
    }
    case "LOWER_RENT": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status === "bygger") return state;
      const tenant = p.tenants.find((t) => t.id === action.tenantId);
      if (!tenant) return state;
      const newRent = Math.round(tenant.rent * (1 - action.decreasePercent / 100));
      return {
        ...state,
        reputation: Math.min(100, state.reputation + 0.5),
        portfolio: state.portfolio.map((x) =>
          x.id === p.id
            ? { ...x, tenants: x.tenants.map((t) => (t.id === action.tenantId ? { ...t, rent: newRent } : t)) }
            : x,
        ),
        log: [
          {
            t: `${tenant.name} i ${p.districtName}: hyra sänkt −${action.decreasePercent}% → ${kr(newRent)}/mån (reputation +0,5).`,
            kind: "info",
          },
          ...state.log,
        ],
      };
    }
    case "TOGGLE_MANAGER": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p) return state;
      const managed = !p.managed;
      return {
        ...state,
        portfolio: state.portfolio.map((x) => (x.id === p.id ? { ...x, managed } : x)),
        log: [
          {
            t: managed
              ? `Anställde förvaltare för ${p.typeLabel} i ${p.districtName}.`
              : `Avslutade förvaltning av ${p.typeLabel} i ${p.districtName}.`,
            kind: managed ? "buy" : "info",
          },
          ...state.log,
        ],
      };
    }
    case "MARKET_BOOST": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p) return state;
      if (state.cash < 25000) return log(state, "För lite kontanter för marknadsföringskampanj.", "warn");
      return {
        ...state,
        cash: state.cash - 25000,
        log: [
          {
            t: `Marknadsföringskampanj för ${p.typeLabel} i ${p.districtName} (25 000 kr) – 5 kvalificerade kandidater tillgängliga.`,
            kind: "upg",
          },
          ...state.log,
        ],
      };
    }
    case "HIRE_BROKER": {
      const BROKER_FEE = 75_000;
      if (state.cash < BROKER_FEE)
        return log(state, "Mäklararvodet är 75 000 kr – för lite kontanter.", "warn");
      const extra = genListing(state);
      return {
        ...state,
        cash: state.cash - BROKER_FEE,
        listings: [...state.listings, extra],
        log: [
          { t: `Anlitade mäklare (75 000 kr). Nytt off-market objekt: ${extra.typeLabel} i ${extra.districtName}.`, kind: "buy" },
          ...state.log,
        ],
      };
    }
    case "HIRE_BROKER_LOTS": {
      const BROKER_FEE = 75_000;
      if (state.cash < BROKER_FEE)
        return log(state, "Mäklararvodet är 75 000 kr – för lite kontanter.", "warn");
      const extra = genLot(state);
      return {
        ...state,
        cash: state.cash - BROKER_FEE,
        lots: [...state.lots, extra],
        log: [
          { t: `Anlitade markmäklare (75 000 kr). Ny off-market tomt i ${extra.districtName} hittades.`, kind: "buy" },
          ...state.log,
        ],
      };
    }
    case "RESOLVE_DECISION": {
      const d = state.pendingDecision;
      if (!d) return state;
      const opt = d.options[action.optionIndex];
      if (!opt) return state;
      const e = opt.effect;
      let s: GameState = { ...state, pendingDecision: null };
      if (e.cash) s.cash += e.cash;
      if (e.reputation) s.reputation = Math.max(0, Math.min(100, s.reputation + e.reputation));
      if (e.demandMod) s.demandMod = +(s.demandMod * e.demandMod).toFixed(3);
      if (e.marketMod) s.marketMod = +(s.marketMod * e.marketMod).toFixed(3);
      if (e.taxMod) s.taxMod = +(s.taxMod * e.taxMod).toFixed(3);
      if (e.addLot) s = { ...s, lots: [...s.lots, genLot(s)] };
      return { ...s, log: [{ t: e.log, kind: e.logKind }, ...s.log] };
    }
    case "ACCEPT_OFFER": {
      const offer = (state.offers ?? []).find((o) => o.id === action.offerId);
      if (!offer) return state;
      const p = state.portfolio.find((x) => x.id === offer.propId);
      if (!p) return { ...state, offers: state.offers.filter((o) => o.id !== offer.id) };
      const payoff = Math.min(state.debt, (p.purchasePrice || offer.amount) * 0.6);
      return {
        ...state,
        cash: state.cash + (offer.amount - payoff),
        debt: Math.max(0, state.debt - payoff),
        reputation: Math.min(100, state.reputation + 1),
        portfolio: state.portfolio.filter((x) => x.id !== p.id),
        offers: state.offers.filter((o) => o.id !== offer.id),
        log: [
          {
            t: `Accepterade bud: sålde ${p.typeLabel} i ${p.districtName} till ${offer.from} för ${msek(offer.amount)}.`,
            kind: "sell",
          },
          ...state.log,
        ],
      };
    }
    case "DECLINE_OFFER": {
      const offer = (state.offers ?? []).find((o) => o.id === action.offerId);
      if (!offer) return state;
      return {
        ...state,
        offers: state.offers.filter((o) => o.id !== offer.id),
        log: [
          { t: `Avböjde ${offer.from}s bud på ${offer.propLabel} i ${offer.districtName}.`, kind: "info" },
          ...state.log,
        ],
      };
    }
    case "BUY_SHARES": {
      const st = state.stocks.find((x) => x.id === action.stockId);
      if (!st) return state;
      const want = Math.max(0, Math.floor(action.qty));
      const available = st.sharesOutstanding - st.owned;
      const qty = Math.min(want, available);
      if (qty <= 0) return state;
      const cost = qty * st.price * (1 + COURTAGE);
      if (state.cash < cost)
        return log(state, `För lite kontanter. ${qty} aktier i ${st.name} kostar ${msek(cost)}.`, "warn");
      const newOwned = st.owned + qty;
      const newAvg = (st.owned * st.avgCost + qty * st.price) / newOwned;
      return {
        ...state,
        cash: state.cash - cost,
        stocks: state.stocks.map((x) =>
          x.id === st.id ? { ...x, owned: newOwned, avgCost: +newAvg.toFixed(2) } : x,
        ),
        log: [
          { t: `Köpte ${qty.toLocaleString("sv-SE")} aktier i ${st.name} för ${msek(cost)}.`, kind: "buy" },
          ...state.log,
        ],
      };
    }
    case "SELL_SHARES": {
      const st = state.stocks.find((x) => x.id === action.stockId);
      if (!st) return state;
      const qty = Math.min(Math.max(0, Math.floor(action.qty)), st.owned);
      if (qty <= 0) return state;
      const proceeds = qty * st.price * (1 - COURTAGE);
      const newOwned = st.owned - qty;
      return {
        ...state,
        cash: state.cash + proceeds,
        stocks: state.stocks.map((x) =>
          x.id === st.id ? { ...x, owned: newOwned, avgCost: newOwned === 0 ? 0 : x.avgCost } : x,
        ),
        log: [
          { t: `Sålde ${qty.toLocaleString("sv-SE")} aktier i ${st.name} för ${msek(proceeds)}.`, kind: "sell" },
          ...state.log,
        ],
      };
    }
    case "ACQUIRE_COMPANY": {
      const st = state.stocks.find((x) => x.id === action.stockId);
      if (!st || !st.competitorName) return state;
      const ownPct = st.owned / st.sharesOutstanding;
      if (ownPct <= 0.5)
        return log(state, `Du behöver majoritet (>50 %) i ${st.name} för att förvärva bolaget.`, "warn");
      const remaining = st.sharesOutstanding - st.owned;
      const cost = remaining * st.price * 1.2; // budpremie 20 %
      if (state.cash < cost)
        return log(state, `Förvärvet kräver ${msek(cost)} för resterande aktier i ${st.name}.`, "warn");
      const comp = state.competitors.find((c) => c.name === st.competitorName);
      const monthlyIncome = Math.max(
        20_000,
        Math.round(comp?.monthlyNOI ?? ((comp?.equity ?? 0) * 0.06) / 12),
      );
      return {
        ...state,
        cash: state.cash - cost,
        reputation: Math.min(100, state.reputation + 4),
        competitors: state.competitors.filter((c) => c.name !== st.competitorName),
        stocks: state.stocks.filter((x) => x.id !== st.id),
        subsidiaries: [...(state.subsidiaries ?? []), { name: st.name, monthlyIncome }],
        log: [
          {
            t: `🏛️ FÖRVÄRV: Du köpte upp ${st.name} för ${msek(cost)}. Bolaget blir ett dotterbolag (${kr(monthlyIncome)}/mån).`,
            kind: "buy",
          },
          ...state.log,
        ],
      };
    }
    case "CHANGE_USE": {
      const p = state.portfolio.find((x) => x.id === action.id);
      const t = PROP_TYPES[action.propType];
      if (!p || !t || p.status === "bygger") return state;
      if (p.type === action.propType) return state;
      if (p.tenants.length > 0)
        return log(state, "Fastigheten måste vara vakant för att ändra användning.", "warn");
      const value = propMarketValue(p, state);
      const cost = Math.round(value * 0.15);
      if (state.cash < cost)
        return log(state, `Ändrad användning kostar ${msek(cost)} (ombyggnad).`, "warn");
      const newBaseRent = Math.round(value * t.rentFactor * 12);
      return {
        ...state,
        cash: state.cash - cost,
        portfolio: state.portfolio.map((x) =>
          x.id === p.id
            ? { ...x, type: action.propType, typeLabel: t.label, baseRent: newBaseRent, condition: Math.max(60, x.condition - 10) }
            : x,
        ),
        log: [
          { t: `Ändrade användning i ${p.districtName}: ${p.typeLabel} → ${t.label} (${msek(cost)}).`, kind: "upg" },
          ...state.log,
        ],
      };
    }
    case "START_RESEARCH": {
      if (state.activeResearch) return log(state, "Ett forskningsprojekt pågår redan.", "warn");
      if ((state.researchDone ?? []).includes(action.id)) return state;
      const def = RESEARCH.find((r) => r.id === action.id);
      if (!def) return state;
      if (state.cash < def.cost)
        return log(state, `${def.name} kräver ${msek(def.cost)} i forskningsbudget.`, "warn");
      return {
        ...state,
        cash: state.cash - def.cost,
        activeResearch: { id: def.id, monthsLeft: def.months, monthsTotal: def.months },
        log: [
          { t: `🔬 Startade forskning: ${def.name} (klar om ${def.months} mån).`, kind: "upg" },
          ...state.log,
        ],
      };
    }
    case "HIRE_STAFF": {
      const role = STAFF_ROLES.find((r) => r.id === action.role);
      if (!role) return state;
      const cur = state.staff?.[action.role] ?? 0;
      if (cur >= role.maxLevel) return log(state, `${role.name} är redan på högsta nivå.`, "warn");
      const nextLevel = cur + 1;
      const fee = hireFee(action.role, nextLevel);
      if (state.cash < fee)
        return log(state, `Rekrytering av ${role.name} kostar ${msek(fee)} i ingångsarvode.`, "warn");
      return {
        ...state,
        cash: state.cash - fee,
        staff: { ...(state.staff ?? {}), [action.role]: nextLevel },
        log: [
          {
            t: cur === 0
              ? `Anställde ${role.name} (lön ${kr(role.baseSalary)}/mån).`
              : `Befordrade ${role.name} till nivå ${nextLevel}.`,
            kind: "buy",
          },
          ...state.log,
        ],
      };
    }
    case "FIRE_STAFF": {
      const role = STAFF_ROLES.find((r) => r.id === action.role);
      if (!role || !(state.staff?.[action.role] ?? 0)) return state;
      const staff = { ...(state.staff ?? {}) };
      delete staff[action.role];
      return {
        ...state,
        staff,
        log: [{ t: `Avslutade anställningen av ${role.name}.`, kind: "info" }, ...state.log],
      };
    }
    case "SELL_SUBSIDIARY": {
      const sub = (state.subsidiaries ?? []).find((s) => s.name === action.name);
      if (!sub) return state;
      // Försäljningspris = kapitaliserat värde med 20 % realiseringsrabatt
      const salePrice = Math.round((sub.monthlyIncome * 12 / STOCK_CAP_RATE) * 0.80);
      return {
        ...state,
        cash: state.cash + salePrice,
        subsidiaries: state.subsidiaries.filter((s) => s.name !== action.name),
        log: [
          {
            t: `Sålde dotterbolaget ${sub.name} för ${msek(salePrice)} (${kr(sub.monthlyIncome)}/mån × 12 / 6 % × 80 %).`,
            kind: "sell",
          },
          ...state.log,
        ],
      };
    }
    case "PLACE_LIMIT_ORDER": {
      const st = state.stocks.find((x) => x.id === action.stockId);
      if (!st) return state;
      const qty = Math.max(1, Math.floor(action.qty));
      const limitPrice = Math.max(0.01, +action.limitPrice.toFixed(2));
      const newOrder = {
        id: String(Date.now()) + String(Math.random()),
        stockId: action.stockId,
        stockName: st.name,
        side: action.side,
        qty,
        limitPrice,
        createdMonth: state.month,
      };
      return {
        ...state,
        stockOrders: [...(state.stockOrders ?? []), newOrder],
        log: [
          {
            t: `Limitorder lagd: ${action.side === "buy" ? "Köp" : "Sälj"} ${qty.toLocaleString("sv-SE")} aktier i ${st.name} @ ${kr(limitPrice)}.`,
            kind: "info",
          },
          ...state.log,
        ],
      };
    }
    case "CANCEL_LIMIT_ORDER": {
      return {
        ...state,
        stockOrders: (state.stockOrders ?? []).filter((o) => o.id !== action.orderId),
        log: [{ t: "Limitorder avbröts.", kind: "info" }, ...state.log],
      };
    }
    case "OFFER_TO_RIVAL": {
      const comp = state.competitors.find((c) => c.name === action.competitorName);
      if (!comp) return state;
      const propIdx = comp.portfolio.findIndex((p) => p.id === action.propertyId);
      if (propIdx === -1) return state;
      const prop = comp.portfolio[propIdx];
      const ref = prop.askPrice;
      const ratio = action.amount / ref;
      const { maxLtv } = loanTerms(state);
      const down = action.amount * (1 - maxLtv);
      if (state.cash < down)
        return log(state, `Du behöver ${msek(down)} i handpenning för att köpa av ${action.competitorName}.`, "warn");
      const accepted = ratio >= 1.25 || (ratio >= 1.1 && Math.random() < 0.70);
      if (!accepted) {
        return log(
          state,
          `${action.competitorName} avböjde ditt bud på ${msek(action.amount)} för ${prop.typeLabel} i ${prop.districtName}. Lägg ett högre bud.`,
          "warn",
        );
      }
      const loan = action.amount - down;
      const txEntry = { type: "köp" as const, price: action.amount, month: state.month, year: state.year, party: `${action.competitorName} (direktköp)` };
      const boughtProp: Property = { ...prop, owned: true, purchasePrice: action.amount, txHistory: [...(prop.txHistory ?? []), txEntry] };
      const newCompPortfolio = comp.portfolio.filter((_, i) => i !== propIdx);
      return {
        ...state,
        cash: state.cash - down,
        debt: state.debt + loan,
        reputation: Math.min(100, state.reputation + 2),
        portfolio: [...state.portfolio, boughtProp],
        competitors: state.competitors.map((c) =>
          c.name === action.competitorName
            ? { ...c, portfolio: newCompPortfolio, units: newCompPortfolio.length, cash: c.cash + action.amount, equity: c.equity + action.amount }
            : c,
        ),
        log: [
          {
            t: `✅ ${action.competitorName} accepterade ditt bud! Du köpte ${prop.typeLabel} i ${prop.districtName} för ${msek(action.amount)} (lån ${msek(loan)}).`,
            kind: "buy",
          },
          ...state.log,
        ],
      };
    }
    case "SELECT_LENDER": {
      return {
        ...state,
        selectedLender: action.lenderId === state.selectedLender ? undefined : action.lenderId,
        log: [{ t: `Bytte långivare.`, kind: "info" }, ...state.log],
      };
    }
    case "BID_OFFMARKET": {
      const prop = (state.worldPool ?? []).find((p) => p.id === action.propertyId);
      if (!prop) return state;
      const ref = prop.askPrice;
      const { maxLtv } = loanTerms(state);
      const down = action.amount * (1 - maxLtv);
      if (state.cash < down)
        return log(state, `Du behöver ${msek(down)} i handpenning för off-market köpet.`, "warn");
      // Accepteras garanterat vid ≥110 %, 50 % chans vid 105–110 %
      const accepted =
        action.amount >= ref * 1.10 ||
        (action.amount >= ref * 1.05 && Math.random() < 0.5);
      if (!accepted) {
        return log(
          state,
          `Fastighetsägaren avböjde budet ${msek(action.amount)}. Höj till minst ${msek(Math.round(ref * 1.10))} (+10 %) för garanterat svar.`,
          "warn",
        );
      }
      const loan = action.amount - down;
      const txEntry = { type: "köp" as const, price: action.amount, month: state.month, year: state.year, party: "Spelaren (off-market)" };
      const boughtProp: Property = { ...prop, owned: true, purchasePrice: action.amount, txHistory: [...(prop.txHistory ?? []), txEntry] };
      return {
        ...state,
        cash: state.cash - down,
        debt: state.debt + loan,
        reputation: Math.min(100, state.reputation + 1),
        portfolio: [...state.portfolio, boughtProp],
        worldPool: (state.worldPool ?? []).filter((p) => p.id !== action.propertyId),
        log: [
          {
            t: `🤝 Off-market köp: ${prop.typeLabel} i ${prop.districtName} för ${msek(action.amount)} (premie +${pct(action.amount / ref - 1)}, lån ${msek(loan)}).`,
            kind: "buy",
          },
          ...state.log,
        ],
      };
    }
    case "SET_MANAGER_SETTINGS": {
      return {
        ...state,
        portfolio: state.portfolio.map((p) =>
          p.id === action.id ? { ...p, managerSettings: action.settings } : p,
        ),
      };
    }
    case "SET_GLOBAL_MANAGER": {
      return { ...state, globalManager: action.settings };
    }
    case "ACQUIRE_RIVAL": {
      const rival = state.competitors.find((c) => c.name === action.competitorName);
      if (!rival) return state;
      if ((rival.portfolio ?? []).length === 0)
        return log(state, `${rival.name} äger inga fastigheter att förvärva.`, "warn");
      const minPrice = Math.round((rival.equity ?? 0) * 1.3);
      if (action.amount < minPrice)
        return log(state, `Minimipris för förvärv är ${msek(minPrice)} (130 % av eget kapital).`, "warn");
      const down = Math.round(action.amount * 0.25);
      if (state.cash < down)
        return log(state, `Otillräcklig kassa – behöver minst ${msek(down)} (25 % handpenning).`, "warn");
      const loan = action.amount - down;
      const acquired = (rival.portfolio ?? []).map((p) => ({
        ...p,
        owned: true,
        purchasePrice: p.askPrice,
        txHistory: [
          ...(p.txHistory ?? []),
          { type: "köp" as const, price: p.askPrice, month: state.month, year: state.year, party: `Förvärv av ${rival.name}` },
        ],
      }));
      const subIncome = Math.round(((rival.monthlyNOI ?? 0) || Math.round((rival.equity * 0.04) / 12)));
      return {
        ...state,
        cash: state.cash - down,
        debt: state.debt + loan,
        portfolio: [...state.portfolio, ...acquired],
        competitors: state.competitors.filter((c) => c.name !== action.competitorName),
        subsidiaries: [...(state.subsidiaries ?? []), { name: rival.name, monthlyIncome: subIncome }],
        reputation: Math.min(100, state.reputation + 8),
        log: [
          {
            t: `🏢 FÖRVÄRV: ${rival.name} förvärvat för ${msek(action.amount)} – ${acquired.length} fastigheter tillföll portföljen!`,
            kind: "buy",
          },
          ...state.log,
        ],
      };
    }
    case "SNOOZE_DECISION": {
      if (!state.pendingDecision) return state;
      return {
        ...state,
        pendingDecision: null,
        reputation: Math.max(0, +(state.reputation - 2).toFixed(1)),
        log: [{ t: `⏸ Sköt upp beslutet "${state.pendingDecision.title}". Reputation −2.`, kind: "warn" }, ...state.log],
      };
    }
    case "SET_SCENARIO": {
      return { ...state, scenarioId: action.scenarioId, gameWon: false };
    }
    case "BUY_INSURANCE": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p) return state;
      if (p.insurance) return log(state, "Fastigheten är redan försäkrad.", "warn");
      return {
        ...state,
        portfolio: state.portfolio.map((x) => x.id === action.id ? { ...x, insurance: true } : x),
        log: [{ t: `🛡️ Försäkring tecknad för ${p.typeLabel} i ${p.districtName} (2 000 kr/mån).`, kind: "info" }, ...state.log],
      };
    }
    case "CANCEL_INSURANCE": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p) return state;
      return {
        ...state,
        portfolio: state.portfolio.map((x) => x.id === action.id ? { ...x, insurance: false } : x),
        log: [{ t: `Försäkring avslutad för ${p.typeLabel} i ${p.districtName}.`, kind: "info" }, ...state.log],
      };
    }
    case "ISSUE_BOND": {
      if (state.reputation < 70) return log(state, "Obligationsemission kräver reputation ≥ 70.", "warn");
      const amount = Math.min(action.amount, 50_000_000);
      if (amount < 1_000_000) return log(state, "Minsta obligation är 1 MSEK.", "warn");
      const rate = Math.max(3.5, state.interestRate + 1.2);
      const matureAbs = state.year * 12 + state.month + action.years * 12;
      const newBond = { id: String(Date.now()), amount, rate, matureAbs };
      return {
        ...state,
        cash: state.cash + amount,
        bonds: [...(state.bonds ?? []), newBond],
        log: [{ t: `📜 Obligationsemission: ${msek(amount)} insamlat till ${rate.toFixed(2)} % ränta, ${action.years} år löptid.`, kind: "income" }, ...state.log],
      };
    }
    case "REPAY_BOND": {
      const bond = (state.bonds ?? []).find((b) => b.id === action.bondId);
      if (!bond) return state;
      if (state.cash < bond.amount) return log(state, `Otillräcklig kassa. Behöver ${msek(bond.amount)}.`, "warn");
      return {
        ...state,
        cash: state.cash - bond.amount,
        bonds: (state.bonds ?? []).filter((b) => b.id !== action.bondId),
        log: [{ t: `🏦 Obligation på ${msek(bond.amount)} återbetalad i förtid.`, kind: "info" }, ...state.log],
      };
    }
    case "SALE_LEASEBACK": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status === "bygger") return log(state, "Kan inte sale-leaseback under byggnation.", "warn");
      const salePrice = Math.round(propMarketValue(p, state) * 1.0);
      const monthlyLease = Math.round(salePrice * 0.065 / 12);
      const payoff = Math.min(state.debt, (p.purchasePrice ?? salePrice) * 0.6);
      const lbTenant = { id: newId(), profile: "stat", name: "Originalägaren (SLB)", profileName: "Sale-Leaseback", quality: 1.1, defaultRisk: 0.001, monthsLeft: 120, termTotal: 120, rent: monthlyLease };
      return {
        ...state,
        cash: state.cash + salePrice - payoff,
        debt: Math.max(0, state.debt - payoff),
        portfolio: state.portfolio.map((x) =>
          x.id === action.id ? { ...x, owned: false, tenants: [lbTenant] } : x,
        ).filter((x) => x.id !== action.id),
        listings: [...state.listings, { ...p, owned: false, askPrice: salePrice, tenants: [lbTenant], listedMonth: state.year * 12 + state.month, expiresMonth: state.year * 12 + state.month + 3 }],
        log: [{ t: `🔄 Sale-Leaseback: ${p.typeLabel} i ${p.districtName} såld för ${msek(salePrice)}, hyrt tillbaka till ${kr(monthlyLease)}/mån i 10 år.`, kind: "income" }, ...state.log],
      };
    }
    case "ACCEPT_COMPETING_BID": {
      const cb = state.competingBid;
      if (!cb) return state;
      const listing = state.listings.find((p) => p.id === cb.listingId);
      if (!listing) return { ...state, competingBid: undefined };
      const { maxLtv } = loanTerms(state);
      const down = cb.amount * (1 - maxLtv);
      if (state.cash < down)
        return log(state, `Behöver ${msek(down)} i handpenning för att vinna budgivningen.`, "warn");
      const loan = cb.amount - down;
      return {
        ...state,
        cash: state.cash - down,
        debt: state.debt + loan,
        reputation: Math.min(100, +(state.reputation + 0.4).toFixed(1)),
        portfolio: [...state.portfolio, { ...listing, owned: true, purchasePrice: cb.amount }],
        listings: state.listings.filter((p) => p.id !== listing.id),
        competingBid: undefined,
        log: [{ t: `✅ Du vann budgivningen! ${listing.typeLabel} i ${listing.districtName} köpt för ${msek(cb.amount)}.`, kind: "buy" }, ...state.log],
      };
    }
    case "PASS_COMPETING_BID": {
      return { ...state, competingBid: undefined,
        log: [{ t: "Du valde att inte delta i budgivningen.", kind: "info" }, ...state.log] };
    }
    case "SET_RATE_MODE": {
      if (action.mode === "fixed") {
        const { rate } = loanTerms(state);
        const months = Math.max(12, Math.min(60, action.months ?? 36));
        const nowAbs = state.year * 12 + state.month;
        const fee = Math.round(state.debt * 0.005);
        if (state.cash < fee)
          return log(state, `Fast ränta kräver ${kr(fee)} i uppläggningsavgift.`, "warn");
        return {
          ...state,
          cash: state.cash - fee,
          rateMode: "fixed",
          fixedRate: rate,
          fixedUntilAbs: nowAbs + months,
          log: [{ t: `🔒 Fast ränta ${rate} % låst i ${months} månader (avgift ${kr(fee)}).`, kind: "info" }, ...state.log],
        };
      }
      return { ...state, rateMode: "variable", fixedRate: undefined, fixedUntilAbs: undefined,
        log: [{ t: "Bytt till rörlig ränta.", kind: "info" }, ...state.log] };
    }
    case "DRAW_REVOLVING": {
      const rev = state.revolving;
      if (!rev) return log(state, "Ingen revolverande kredit aktiv.", "warn");
      const avail = rev.limit - rev.used;
      const amt = Math.min(action.amount, avail);
      if (amt <= 0) return log(state, "Kreditgränsen är uppnådd.", "warn");
      return {
        ...state,
        cash: state.cash + amt,
        revolving: { ...rev, used: rev.used + amt },
        log: [{ t: `Utnyttjat ${kr(amt)} ur revolverande kredit.`, kind: "info" }, ...state.log],
      };
    }
    case "REPAY_REVOLVING": {
      const rev = state.revolving;
      if (!rev || rev.used <= 0) return log(state, "Inget att återbetala.", "warn");
      const amt = Math.min(action.amount, rev.used, state.cash);
      if (amt <= 0) return log(state, "För lite kassa för återbetalning.", "warn");
      return {
        ...state,
        cash: state.cash - amt,
        revolving: { ...rev, used: Math.max(0, rev.used - amt) },
        log: [{ t: `Återbetalat ${kr(amt)} på revolverande kredit.`, kind: "info" }, ...state.log],
      };
    }
    case "PAY_DIVIDEND": {
      const amt = Math.min(action.amount, state.cash);
      if (amt <= 100000) return log(state, "Minsta utdelning är 100 000 kr.", "warn");
      return {
        ...state,
        cash: state.cash - amt,
        dividendsPaid: (state.dividendsPaid ?? 0) + amt,
        log: [{ t: `💰 Utdelning: ${msek(amt)} utbetald till aktieägarna.`, kind: "income" }, ...state.log],
      };
    }
    case "TOGGLE_SHORT_TERM": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.type !== "bostad") return log(state, "Korttidsuthyrning är bara möjlig för bostadsfastigheter.", "warn");
      const nowShort = !p.shortTerm;
      return {
        ...state,
        portfolio: state.portfolio.map((x) =>
          x.id === action.id
            ? { ...x, shortTerm: nowShort, tenants: nowShort ? [] : x.tenants }
            : x,
        ),
        log: [{
          t: nowShort
            ? `🏖️ ${p.typeLabel} i ${p.districtName} ställd om till korttidsuthyrning (+30 % hyra, +60 % vakans).`
            : `🏠 ${p.typeLabel} i ${p.districtName} tillbaka till ordinarie uthyrning.`,
          kind: "info",
        }, ...state.log],
      };
    }
    case "APPLY_ZONE_CHANGE": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status === "bygger") return log(state, "Kan ej omklassa fastighet under byggnation.", "warn");
      if (p.pendingZoneChange) return log(state, "Omklassning pågår redan.", "warn");
      const cost = 500_000;
      if (state.cash < cost) return log(state, `Omklassning kostar ${kr(cost)}.`, "warn");
      const months = state.staff?.["jurist"] ? 2 : 5;
      return {
        ...state,
        cash: state.cash - cost,
        portfolio: state.portfolio.map((x) =>
          x.id === action.id ? { ...x, pendingZoneChange: { targetType: action.targetType, monthsLeft: months } } : x,
        ),
        log: [{
          t: `📋 Omklassning av ${p.typeLabel} i ${p.districtName} → ${action.targetType} startad (${months} månader, ${kr(cost)}).`,
          kind: "upg",
        }, ...state.log],
      };
    }
    case "INVEST_DISTRICT": {
      const amount = Math.max(500_000, Math.min(action.amount, state.cash));
      if (state.cash < amount) return log(state, "För lite kassa.", "warn");
      const boost = amount / 10_000_000;
      const dev = { ...(state.districtDev ?? {}) };
      dev[action.districtId] = Math.min(1.6, +(((dev[action.districtId] ?? 1) + boost)).toFixed(4));
      return {
        ...state,
        cash: state.cash - amount,
        districtDev: dev,
        log: [{
          t: `🏗 Investerade ${msek(amount)} i distriktet – områdesutveckling +${(boost * 100).toFixed(1)} %.`,
          kind: "upg",
        }, ...state.log],
      };
    }
    case "DO_IPO": {
      if (state.ipoActive) return log(state, "Bolaget är redan börsnoterat.", "warn");
      const portVal = state.portfolio.reduce((a, p) => {
        const d = { centrum: 32000, hamnen: 21000, industri: 11000, förort: 16000, kulle: 28000 } as Record<string,number>;
        return a + p.askPrice;
      }, 0);
      const raised = Math.round(portVal * 0.20);
      if (raised < 1_000_000) return log(state, "Portföljvärdet är för lågt för en börsnotering.", "warn");
      return {
        ...state,
        cash: state.cash + raised,
        ipoActive: true,
        reputation: Math.min(100, state.reputation + 10),
        log: [{
          t: `🎉 IPO genomförd! Bolaget börsnoterat – ${msek(raised)} insamlat (20 % av portföljvärdet). Reputation +10.`,
          kind: "income",
        }, ...state.log],
      };
    }
    case "NEXT_MONTH":
      return advanceMonth(state);
    case "FAST_FORWARD": {
      let s = state;
      const n = Math.min(action.months, 24);
      for (let i = 0; i < n; i++) {
        if (s.gameOver || s.pendingDecision) break;
        s = advanceMonth(s);
      }
      return s;
    }
    case "LOAD":
      return action.state;
    case "RESET": {
      const fresh = initState();
      return action.scenarioId ? { ...fresh, scenarioId: action.scenarioId } : fresh;
    }
    default:
      return state;
  }
}
