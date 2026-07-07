/* ============================================================
   Inkorgen – väntande beslut med val. Mekaniker (kontrakts-
   förnyelse, uppköpsbud, markanvisning, dilemman, börsnotering)
   skapar InboxItems; spelaren (eller tidsfristen) löser dem via
   resolveChoice. Ren spellogik utan React-beroenden.
   ============================================================ */

import { claimRandomParcel, parcelsIn, usedParcelIds } from "./city";
import { DISTRICTS } from "./data";
import { kr, msek } from "./format";
import { propPotentialRent } from "./property";
import { newId, rnd } from "./random";
import type { GameState, InboxItem, LogKind, Property } from "./types";

/** Max antal samtidiga beslut – skyddar mot inkorgsflod. */
export const INBOX_LIMIT = 4;

function log(state: GameState, t: string, kind: LogKind, parcelId?: string): GameState {
  return { ...state, log: [{ t, kind, parcelId }, ...state.log] };
}

function replaceProp(state: GameState, p: Property): GameState {
  return { ...state, portfolio: state.portfolio.map((x) => (x.id === p.id ? p : x)) };
}

/** Lägger ett beslut i inkorgen (om det får plats). */
export function pushInbox(state: GameState, item: Omit<InboxItem, "id">): GameState {
  if (state.inbox.length >= INBOX_LIMIT) return state;
  return { ...state, inbox: [...state.inbox, { ...item, id: newId() }] };
}

/** Finns redan ett beslut för denna fastighet av given sort? */
export function hasPendingFor(state: GameState, kind: string, propertyId: number): boolean {
  return state.inbox.some(
    (i) =>
      i.payload.kind === kind && "propertyId" in i.payload && i.payload.propertyId === propertyId,
  );
}

/**
 * Löser ett beslut: tar bort det ur inkorgen och applicerar vald option.
 * Anropas av reducerns DECIDE och av simulationen när tidsfristen går ut.
 */
export function resolveChoice(state: GameState, item: InboxItem, option: string): GameState {
  let s: GameState = { ...state, inbox: state.inbox.filter((i) => i.id !== item.id) };
  const pl = item.payload;

  switch (pl.kind) {
    case "lease_renewal": {
      const p = s.portfolio.find((x) => x.id === pl.propertyId);
      if (!p || !p.tenant) return s;
      if (option === "index") {
        const t = {
          ...p.tenant,
          monthsLeft: p.tenant.termTotal,
          rent: Math.round(p.tenant.rent * 1.02),
        };
        s = replaceProp(s, { ...p, tenant: t });
        return log(s, `Förnyade kontraktet med ${t.name} (+2 % hyra).`, "buy", p.parcelId);
      }
      if (option === "market") {
        const marketRent = Math.round(propPotentialRent(p, s) / 12);
        const accepts = Math.random() < 0.55 + (p.condition - 60) / 200;
        if (accepts) {
          const t = { ...p.tenant, monthsLeft: p.tenant.termTotal, rent: marketRent };
          s = replaceProp(s, { ...p, tenant: t });
          return log(
            s,
            `${t.name} accepterade marknadshyra ${kr(marketRent)}/mån.`,
            "buy",
            p.parcelId,
          );
        }
        const name = p.tenant.name;
        s = replaceProp(s, { ...p, tenant: null });
        return log(
          s,
          `${name} tackade nej till marknadshyran och flyttade ut.`,
          "warn",
          p.parcelId,
        );
      }
      const name = p.tenant.name;
      s = replaceProp(s, { ...p, tenant: null });
      return log(s, `Sa upp ${name} – lokalen är nu vakant.`, "info", p.parcelId);
    }

    case "buyout_offer": {
      const p = s.portfolio.find((x) => x.id === pl.propertyId);
      if (!p) return s;
      if (option !== "sell")
        return log(
          s,
          `Nekade ${pl.rival}s bud på ${p.typeLabel} i ${p.districtName}.`,
          "info",
          p.parcelId,
        );
      const payoff = Math.min(s.debt, (p.purchasePrice || pl.amount) * 0.6);
      s = {
        ...s,
        cash: s.cash + pl.amount - payoff,
        debt: Math.max(0, s.debt - payoff),
        portfolio: s.portfolio.filter((x) => x.id !== p.id),
        competitors: s.competitors.map((c) => {
          if (c.name !== pl.rival) return c;
          const holdings = [
            ...c.holdings,
            {
              id: p.id,
              parcelId: p.parcelId,
              district: p.district,
              districtName: p.districtName,
              type: p.type,
              typeLabel: p.typeLabel,
              area: p.area,
            },
          ];
          return { ...c, holdings, units: holdings.length };
        }),
      };
      return log(
        s,
        `Sålde ${p.typeLabel} i ${p.districtName} till ${pl.rival} för ${msek(pl.amount)}.`,
        "sell",
        p.parcelId,
      );
    }

    case "markanvisning": {
      if (option !== "buy") return log(s, "Avböjde kommunens markanvisning.", "info");
      if (s.cash < pl.price) return log(s, "Markanvisningen förföll – kassan räckte inte.", "warn");
      const occupied = usedParcelIds(s);
      const free = parcelsIn(pl.district).filter((pc) => !occupied.has(pc.id));
      if (!free.length) return log(s, "Markanvisningen förföll – ingen ledig mark.", "warn");
      const parcel = claimRandomParcel(pl.district, occupied);
      const dName = DISTRICTS.find((d) => d.id === pl.district)?.name ?? pl.district;
      const lot = {
        id: newId(),
        district: pl.district,
        districtName: dName,
        parcelId: parcel.id,
        area: Math.round(rnd(800, 2200)),
        price: pl.price,
        owned: true,
      };
      return log(
        { ...s, cash: s.cash - pl.price, lots: [...s.lots, lot] },
        `Köpte markanvisning i ${dName} för ${msek(pl.price)}.`,
        "buy",
        parcel.id,
      );
    }

    case "hyresrabatt": {
      const p = s.portfolio.find((x) => x.id === pl.propertyId);
      if (!p || !p.tenant) return s;
      if (option === "grant") {
        s = replaceProp(s, {
          ...p,
          tenant: { ...p.tenant, rent: Math.round(p.tenant.rent * 0.9) },
        });
        return log(s, `Gav ${p.tenant.name} 10 % hyresrabatt.`, "expense", p.parcelId);
      }
      s = replaceProp(s, {
        ...p,
        tenant: { ...p.tenant, defaultRisk: p.tenant.defaultRisk * 2 },
      });
      return log(s, `Nekade ${p.tenant.name} rabatt – konkursrisken ökar.`, "warn", p.parcelId);
    }

    case "ipo": {
      if (option === "ipo")
        return log(
          { ...s, gameWon: true },
          "🎉 BÖRSNOTERING! Fastighetsimperium AB är nu ett publikt bolag – du har vunnit.",
          "event",
        );
      return log(s, "Avböjde börsnotering – bolaget förblir privat.", "info");
    }
  }
  return s;
}
