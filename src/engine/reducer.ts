/* ============================================================
   Reducer – alla spelhändelser (bud, köp, sälj, uppgradera,
   bygg, lån, beslut ...). Zustand-storen wrappar denna rena
   funktion (se src/store/gameStore.ts).
   ============================================================ */

import { usedParcelIds } from "./city";
import { resolveChoice } from "./choices";
import { allowedTypesFor, DISTRICTS, PROP_TYPES, UPGRADES } from "./data";
import { loanTerms } from "./finance";
import { kr, msek, pct } from "./format";
import { genListing, genLot } from "./generators";
import { initState } from "./initState";
import {
  buyNowPrice,
  holdingBidPrice,
  holdingValue,
  nextBidAmount,
  propertyFromHolding,
  purchaseListing,
} from "./market";
import { propMarketValue } from "./property";
import { newId } from "./random";
import { advanceMonth } from "./simulation";
import type { GameAction, GameState, LogKind, Property } from "./types";

/** Lägger till en rad i loggen utan att ändra övrigt tillstånd. */
function log(state: GameState, t: string, kind: LogKind, parcelId?: string): GameState {
  return { ...state, log: [{ t, kind, parcelId }, ...state.log] };
}

export function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "BUY": {
      // Köp direkt: avbryter auktionen mot en premie.
      const p = state.listings.find((x) => x.id === action.id);
      if (!p) return state;
      const price = buyNowPrice(p);
      const bought = purchaseListing(state, p, price);
      if (!bought) {
        const down = price * (1 - loanTerms(state).maxLtv);
        return log(
          state,
          `För lite kontanter. Handpenning ${msek(down)} krävs (LTV ${pct(loanTerms(state).maxLtv)}).`,
          "warn",
        );
      }
      return bought;
    }
    case "BID": {
      const p = state.listings.find((x) => x.id === action.id);
      if (!p || p.bestBid?.isPlayer) return state;
      const amount = nextBidAmount(p);
      const down = amount * (1 - loanTerms(state).maxLtv);
      if (state.cash < down)
        return log(state, `Budet kräver ${msek(down)} i handpenning – kassan räcker inte.`, "warn");
      return {
        ...state,
        listings: state.listings.map((x) =>
          x.id === p.id ? { ...x, bestBid: { bidder: "Du", isPlayer: true, amount } } : x,
        ),
        log: [
          {
            t: `La bud ${msek(amount)} på ${p.typeLabel} i ${p.districtName}.`,
            kind: "buy" as const,
            parcelId: p.parcelId,
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
            kind: "sell" as const,
            parcelId: p.parcelId,
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
          {
            t: `${u.name} på ${p.typeLabel} i ${p.districtName} (${msek(cost)}).`,
            kind: "upg" as const,
            parcelId: p.parcelId,
          },
          ...state.log,
        ],
      };
    }
    case "LEASE": {
      // Teckna avtal med en av intressenterna i kön.
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.tenant || p.status === "bygger") return state;
      const tenant = p.prospects.find((t) => t.id === action.tenantId);
      if (!tenant) return state;
      return {
        ...state,
        portfolio: state.portfolio.map((x) =>
          x.id === p.id ? { ...x, tenant, prospects: [] } : x,
        ),
        log: [
          {
            t: `Tecknade hyresavtal: ${tenant.name} i ${p.districtName}, ${tenant.termTotal} mån, ${kr(tenant.rent)}/mån.`,
            kind: "buy" as const,
            parcelId: p.parcelId,
          },
          ...state.log,
        ],
      };
    }
    case "SET_MAINTENANCE": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.maintenance === action.level) return state;
      return {
        ...state,
        portfolio: state.portfolio.map((x) =>
          x.id === p.id ? { ...x, maintenance: action.level } : x,
        ),
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
            kind: "buy" as const,
            parcelId: lot.parcelId,
          },
          ...state.log,
        ],
      };
    }
    case "BUILD": {
      const lot = state.lots.find((x) => x.id === action.id);
      const t = PROP_TYPES[action.propType];
      if (!lot || !lot.owned || !t) return state;
      if (!allowedTypesFor(lot).includes(action.propType))
        return log(
          state,
          `Detaljplanen i ${lot.districtName} tillåter inte ${t.label.toLowerCase()}. Ansök om planändring.`,
          "warn",
        );
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
        parcelId: lot.parcelId,
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
        maintenance: "normal",
        prospects: [],
        auctionMonthsLeft: 0,
        bestBid: null,
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
            kind: "upg" as const,
            parcelId: lot.parcelId,
          },
          ...state.log,
        ],
      };
    }
    case "REZONE": {
      const lot = state.lots.find((x) => x.id === action.id);
      const t = PROP_TYPES[action.propType];
      if (!lot || !lot.owned || !t || lot.rezoning) return state;
      if (allowedTypesFor(lot).includes(action.propType)) return state;
      const COST = 2_000_000;
      if (state.reputation < 40)
        return log(state, "Kommunen kräver reputation minst 40 för planändring.", "warn");
      if (state.cash < COST) return log(state, "Planändringen kostar 2.0 MSEK.", "warn");
      return {
        ...state,
        cash: state.cash - COST,
        lots: state.lots.map((x) =>
          x.id === lot.id ? { ...x, rezoning: { type: action.propType, monthsLeft: 6 } } : x,
        ),
        log: [
          {
            t: `Ansökte om planändring till ${t.label.toLowerCase()} i ${lot.districtName} (6 mån handläggning).`,
            kind: "upg" as const,
            parcelId: lot.parcelId,
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
        log: [{ t: `Amorterade ${msek(amt)}.`, kind: "info" as const }, ...state.log],
      };
    }
    case "BIND_LOAN": {
      const amount = Math.min(action.amount, state.debt);
      if (amount < 100_000) return state;
      const premium = action.months === 60 ? 0.5 : 0.3;
      const rate = +(loanTerms(state).rate + premium).toFixed(2);
      return {
        ...state,
        debt: state.debt - amount,
        fixedLoans: [...state.fixedLoans, { id: newId(), amount, rate, monthsLeft: action.months }],
        log: [
          {
            t: `Band ${msek(amount)} i ${action.months / 12} år till ${rate} % fast ränta.`,
            kind: "info" as const,
          },
          ...state.log,
        ],
      };
    }
    case "DECIDE": {
      const item = state.inbox.find((i) => i.id === action.inboxId);
      if (!item) return state;
      return resolveChoice(state, item, action.option);
    }
    case "BID_HOLDING": {
      const rival = state.competitors.find((c) => c.name === action.rival);
      const h = rival?.holdings.find((x) => x.id === action.holdingId);
      if (!rival || !h || (h.refusedCooldown ?? 0) > 0) return state;
      const price = holdingBidPrice(h, state);
      const { maxLtv } = loanTerms(state);
      const down = price * (1 - maxLtv);
      if (state.cash < down)
        return log(state, `Budet kräver ${msek(down)} i handpenning – kassan räcker inte.`, "warn");
      if (Math.random() < 0.5) {
        // Accepterat – fastigheten blir din.
        const prop = propertyFromHolding(h, state, price);
        return {
          ...state,
          cash: state.cash - down,
          debt: state.debt + (price - down),
          portfolio: [...state.portfolio, prop],
          competitors: state.competitors.map((c) => {
            if (c.name !== rival.name) return c;
            const holdings = c.holdings.filter((x) => x.id !== h.id);
            return { ...c, holdings, units: holdings.length, cash: c.cash + price };
          }),
          log: [
            {
              t: `${rival.name} accepterade ditt bud – köpte ${h.typeLabel} i ${h.districtName} för ${msek(price)}.`,
              kind: "buy" as const,
              parcelId: h.parcelId,
            },
            ...state.log,
          ],
        };
      }
      return {
        ...state,
        competitors: state.competitors.map((c) =>
          c.name !== rival.name
            ? c
            : {
                ...c,
                holdings: c.holdings.map((x) => (x.id === h.id ? { ...x, refusedCooldown: 6 } : x)),
              },
        ),
        log: [
          {
            t: `${rival.name} tackade nej till budet på ${h.typeLabel} i ${h.districtName}.`,
            kind: "info" as const,
            parcelId: h.parcelId,
          },
          ...state.log,
        ],
      };
    }
    case "ACQUIRE_RIVAL": {
      const rival = state.competitors.find((c) => c.name === action.name);
      if (!rival) return state;
      const price = Math.round(rival.equity * 1.35);
      const { maxLtv } = loanTerms(state);
      const down = price * (1 - maxLtv);
      if (state.cash < down)
        return log(
          state,
          `Uppköpet kräver ${msek(down)} i eget kapital (pris ${msek(price)}).`,
          "warn",
        );
      let s: GameState = {
        ...state,
        cash: state.cash - down,
        debt: state.debt + (price - down),
        reputation: Math.min(100, state.reputation + 5),
        competitors: state.competitors.filter((c) => c.name !== rival.name),
      };
      const acquired = rival.holdings.map((h) =>
        propertyFromHolding(h, s, Math.round(holdingValue(h, s))),
      );
      s = { ...s, portfolio: [...s.portfolio, ...acquired] };
      s = log(
        s,
        `🏆 Köpte upp ${rival.name} för ${msek(price)} – ${rival.holdings.length} fastigheter övertas.`,
        "event",
      );
      if (s.competitors.length === 0) {
        s = { ...s, gameWon: true };
        s = log(s, "🎉 MONOPOL! Alla konkurrenter är uppköpta – du har vunnit.", "event");
      }
      return s;
    }
    case "REFRESH_LISTINGS": {
      // Ägda tomter och auktioner du bjudit i behålls – resten byts ut.
      const keptListings = state.listings.filter((l) => l.bestBid?.isPlayer);
      const keptLots = state.lots.filter((l) => l.owned);
      const occupied = usedParcelIds({ ...state, listings: keptListings, lots: keptLots });
      const listings: Property[] = [...keptListings];
      while (listings.length < 6) listings.push(genListing(state, occupied));
      const lots = [...keptLots];
      for (let i = 0; i < 3; i++) lots.push(genLot(state, occupied));
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
