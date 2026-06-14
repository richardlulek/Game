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
import { newId } from "./random";
import { advanceMonth } from "./simulation";
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
      return {
        ...state,
        cash: state.cash - down,
        debt: state.debt + loan,
        reputation: Math.min(100, state.reputation + 1),
        portfolio: [...state.portfolio, { ...p, owned: true, purchasePrice: p.askPrice }],
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
    case "SELL": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p) return state;
      const value = propMarketValue(p, state);
      const payoff = Math.min(state.debt, (p.purchasePrice || value) * 0.6);
      return {
        ...state,
        cash: state.cash + (value - payoff),
        debt: Math.max(0, state.debt - payoff),
        portfolio: state.portfolio.filter((x) => x.id !== p.id),
        log: [
          {
            t: `Sålde ${p.typeLabel} i ${p.districtName} för ${msek(value)} (netto ${msek(value - payoff)}).`,
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
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.tenant || p.status === "bygger") return state;
      const tenant = makeTenant(propPotentialRent(p, state), state.demandMod);
      return {
        ...state,
        portfolio: state.portfolio.map((x) => (x.id === p.id ? { ...x, tenant } : x)),
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
      if (!p || !p.tenant || p.status === "bygger") return state;
      const tenantName = p.tenant.name;
      return {
        ...state,
        reputation: Math.max(0, state.reputation - 3),
        portfolio: state.portfolio.map((x) => (x.id === p.id ? { ...x, tenant: null } : x)),
        log: [
          { t: `Sade upp ${tenantName} i ${p.districtName} (reputation −3).`, kind: "warn" },
          ...state.log,
        ],
      };
    }
    case "RENEW_LEASE": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || !p.tenant || p.status === "bygger") return state;
      const marketRent = Math.round((propPotentialRent(p, state) / 12) * p.tenant.quality);
      const newRent = Math.max(p.tenant.rent, marketRent);
      const renewed = { ...p.tenant, rent: newRent, monthsLeft: p.tenant.termTotal };
      return {
        ...state,
        reputation: Math.min(100, state.reputation + 1),
        portfolio: state.portfolio.map((x) => (x.id === p.id ? { ...x, tenant: renewed } : x)),
        log: [
          {
            t: `Förnyade avtal med ${p.tenant.name} i ${p.districtName}: ${kr(newRent)}/mån, ${renewed.monthsLeft} mån.`,
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
      const cost = lot.area * t.buildCostM2;
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
        tenant: null,
        status: "bygger",
        buildLeft: t.buildMonths,
      };
      return {
        ...state,
        cash: state.cash - down,
        debt: state.debt + (cost - down),
        portfolio: [...state.portfolio, newProp],
        lots: state.lots.filter((x) => x.id !== lot.id),
        log: [
          {
            t: `Påbörjade nyproduktion (${t.label}) i ${lot.districtName}. Klart om ${t.buildMonths} mån.`,
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
    case "REFRESH_LISTINGS": {
      const listings = [];
      for (let i = 0; i < 6; i++) listings.push(genListing(state));
      const lots = [];
      for (let i = 0; i < 3; i++) lots.push(genLot(state));
      return { ...state, listings, lots };
    }
    case "NEXT_MONTH":
      return advanceMonth(state);
    case "LOAD":
      return action.state;
    case "RESET":
      return initState();
    default:
      return state;
  }
}
