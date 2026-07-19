/* ============================================================
   Reducer – alla spelhändelser (köp, sälj, uppgradera, bygg, ...).
   Logiken är oförändrad från prototypen. Zustand-storen wrappar
   denna rena funktion (se src/store/gameStore.ts).
   ============================================================ */

import { PARCELS, expansionByBlock, hasAmbientBuilding, occupiedParcelIds, parcelById } from "./city";
import { newPlanProcess, planFee, rawLandPrice } from "./cityPlan";
import { nextTier, qualifiesFor } from "./company";
import { DISTRICTS, PROP_TYPES, UPGRADES } from "./data";
import { fullyOwnedBlocks } from "./blocks";
import {
  CITY_PROJECT_MIN_LEVEL,
  blockDistrictName,
  blockInfo,
  cityProfileById,
  cityProjectCost,
  eligibleCityBlocks,
} from "./cityProjects";
import { equityOf, loanTerms } from "./finance";
import { ambientAsk, ambientProfile, ambientValue } from "./landDeals";
import { LUXURIES, MEGA_PROJECTS, REVIEW_FEE_PCT, DOMINANCE_REVIEW_SHARE, districtShareOf, dividendRelief } from "./lateGame";
import { kr, msek, pct } from "./format";
import {
  BANKRUPTCY_FLOOR,
  BRIDGE_EQUITY_COVER,
  RECEIVER_CHOICE_FACTOR,
  RESTRUCTURING_MONTHS,
  applyDistressSale,
  bridgeLoanQuote,
  canSellInReceivership,
  distressQuote,
  imposeRestructuringTerms,
  receiverAutoLiquidate,
} from "./receivership";
import { adjustStanding } from "./standing";
import { builtYearFor, calcCapacity, energyClassFor, genListing, genLot, makeTenant } from "./generators";
import { initState } from "./initState";
import {
  BROKER_FEE,
  CONTRACTS,
  bestApplication,
  maxCapacityFor,
  signContract,
} from "./leasing";
import { INDUSTRY_UPGRADES } from "./industryData";
import { industryAssetValue } from "./industries";
import { bondRateFor, creditRatingOf } from "./rating";
import { rivalQuote } from "./rivalPersonas";
import { nextBidRound } from "./lifecycle";
import { pendingWork, propMarketValue, propPotentialRent } from "./property";
import {
  RESEARCH,
  STAFF_ROLES,
  bidBonus,
  buildCostMult,
  buildMonthsDelta,
  hireFee,
} from "./progression";
import { newId, random01 } from "./random";
import { QUICK_SALE_FACTOR, attractiveness } from "./selling";
import { advanceDay, advanceMonth } from "./simulation";
import { MEMORY_NOTES, applyStoryFlag, districtLocked, foundNotes, hasFlag, markNegotiated, noteFlag, seedStory, storyDecisionById, suppressOrganicApplications } from "./story";
import { COURTAGE, STOCK_CAP_RATE, fbabSharesOf, rivalFbabShares } from "./stocks";
import type { Auction, GameAction, GameState, IndustryAsset, LogKind, Lot, Property, Stock } from "./types";

/** Lägger till en rad i loggen utan att ändra övrigt tillstånd. */
function log(state: GameState, t: string, kind: LogKind): GameState {
  return { ...state, log: [{ t, kind }, ...state.log] };
}

/** Klubbslag i detaljplaneauktionen: vinnaren betalar och kvarteret öppnas.
 *  Spelaren får byggklara tomter; en rival flyttar in fastigheter direkt. */
function resolveAuction(state: GameState, a: Auction): GameState {
  const parcels = PARCELS.filter((pc) => pc.blockId === a.blockId);
  if (!a.leader) {
    return {
      ...state,
      auction: null,
      log: [
        { t: `🔨 The plan auction in ${a.districtName} ended without bids – the land stays unzoned.`, kind: "info" },
        ...state.log,
      ],
    };
  }
  if (a.leader === "player") {
    const perLot = Math.round(a.currentBid / Math.max(1, parcels.length));
    const born = state.year * 12 + state.month;
    const newLots: Lot[] = parcels.map((pc) => ({
      id: newId(),
      district: a.district,
      districtName: a.districtName,
      parcelId: pc.id,
      area: Math.round(pc.w * pc.d * 2),
      price: perLot,
      owned: true,
      listedMonth: born,
    }));
    return {
      ...state,
      cash: state.cash - a.currentBid,
      auction: null,
      unlockedBlocks: [...(state.unlockedBlocks ?? []), a.blockId],
      lots: [...state.lots, ...newLots],
      reputation: Math.min(100, state.reputation + 3),
      log: [
        {
          t: `🏛️ PLAN WON! You bought ${parcels.length} build-ready lots in ${a.districtName} for ${msek(a.currentBid)} (rep +3). The city grows – open Build!`,
          kind: "buy",
        },
        ...state.log,
      ],
    };
  }
  // Rival vann: betalar och flyttar in fastigheter ur världspoolen på kvarteret.
  const winner = a.leader;
  const pool = state.worldPool ?? [];
  const moving = pool.filter((p) => p.district === a.district).slice(0, parcels.length);
  const movingIds = new Set(moving.map((p) => p.id));
  return {
    ...state,
    auction: null,
    unlockedBlocks: [...(state.unlockedBlocks ?? []), a.blockId],
    worldPool: pool.filter((p) => !movingIds.has(p.id)),
    competitors: state.competitors.map((c) =>
      c.name === winner
        ? {
            ...c,
            cash: c.cash - a.currentBid,
            portfolio: [
              ...c.portfolio,
              ...moving.map((p, i) => ({ ...p, parcelId: parcels[i]?.id })),
            ],
            units: c.portfolio.length + moving.length,
            lastBuy: a.districtName,
          }
        : c,
    ),
    log: [
      {
        t: `🏛️ ${winner} won the plan auction in ${a.districtName} for ${msek(a.currentBid)} and develops the block right away.`,
        kind: "event",
      },
      ...state.log,
    ],
  };
}

/** Rensar sålda fastigheter ur säljpaketen; paket med färre än två
 *  kvarvarande medlemmar upplöses (medlemmarnas notering hävs). */
function removeFromPackages(state: GameState, soldIds: number[]): GameState {
  const pkgs = state.salePackages ?? [];
  if (pkgs.length === 0) return state;
  const kept: typeof pkgs = [];
  const releaseIds = new Set<number>();
  const changed = new Set<number>();
  for (const pkg of pkgs) {
    const remaining = pkg.propertyIds.filter((id) => !soldIds.includes(id));
    if (remaining.length === pkg.propertyIds.length) {
      kept.push(pkg);
    } else if (remaining.length >= 2) {
      kept.push({ ...pkg, propertyIds: remaining });
      changed.add(pkg.id);
    } else {
      for (const id of remaining) releaseIds.add(id);
      changed.add(pkg.id);
    }
  }
  if (changed.size === 0) return state;
  return {
    ...state,
    salePackages: kept,
    portfolio: releaseIds.size
      ? state.portfolio.map((p) => (releaseIds.has(p.id) ? { ...p, forSale: undefined } : p))
      : state.portfolio,
    // Utestående bud på förändrade paket är inaktuella.
    offers: (state.offers ?? []).filter((o) => o.packageId == null || !changed.has(o.packageId)),
  };
}

/** Tar bort väntande avtalsförhandlingar som blivit inaktuella
 *  (hyresgästen förnyad/uppsagd eller fastigheten såld). */
function dropRenewals(
  state: GameState,
  match: (r: { propertyId: number; tenantId: number }) => boolean,
): GameState["pendingRenewals"] {
  const cur = state.pendingRenewals ?? [];
  const next = cur.filter((r) => !match(r));
  return next.length === cur.length ? state.pendingRenewals : next;
}

export function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "BUY": {
      const p = state.listings.find((x) => x.id === action.id);
      if (!p) return state;
      if (districtLocked(state, p.district)) return log(state, "🔒 The area is locked – the story opens the city chapter by chapter. Continue the campaign to open it.", "warn");
      const { maxLtv } = loanTerms(state);
      const down = p.askPrice * (1 - maxLtv);
      // Konkurrensverket: dominans i distriktet → förvärvsprövning med avgift.
      const share = districtShareOf(state, p.district);
      const reviewFee = share >= DOMINANCE_REVIEW_SHARE ? Math.round(p.askPrice * REVIEW_FEE_PCT) : 0;
      if (state.cash < down + reviewFee)
        return log(
          state,
          `Not enough cash. A down payment of ${msek(down)}${reviewFee > 0 ? ` + review fee ${msek(reviewFee)} (dominance in ${p.districtName})` : ""} is required (LTV ${pct(maxLtv)}).`,
          "warn",
        );
      const loan = p.askPrice - down;
      const txEntry = { type: "bought" as const, price: p.askPrice, month: state.month, year: state.year, party: "You" };
      return {
        ...state,
        cash: state.cash - down - reviewFee,
        debt: state.debt + loan,
        reputation: Math.min(100, +(state.reputation + 0.4).toFixed(1)),
        portfolio: [...state.portfolio, { ...p, owned: true, purchasePrice: p.askPrice, txHistory: [...(p.txHistory ?? []), txEntry] }],
        listings: state.listings.filter((x) => x.id !== p.id),
        // En pågående budgivning om samma objekt avgörs i och med köpet.
        competingBid: state.competingBid?.listingId === p.id ? undefined : state.competingBid,
        log: [
          {
            t: `Bought ${p.typeLabel} in ${p.districtName} for ${msek(p.askPrice)} (loan ${msek(loan)})${reviewFee > 0 ? ` · competition review fee ${msek(reviewFee)}` : ""}.`,
            kind: "buy",
          },
          ...state.log,
        ],
      };
    }
    case "PLACE_BID": {
      const p = state.listings.find((x) => x.id === action.id);
      if (!p) return state;
      if (districtLocked(state, p.district)) return log(state, "🔒 The area is locked – the story opens the city chapter by chapter. Continue the campaign to open it.", "warn");
      // Budspam-spärr: efter ett avvisat bud överväger säljaren inga nya bud
      // från dig på två månader. Utan spärren kunde man spamma lågbud tills
      // slumpen sa ja och systematiskt handla under marknadsvärdet.
      const nowAbs = state.year * 12 + state.month;
      if ((p.bidRejectedAbs ?? -99) + 2 > nowAbs)
        return log(state, `The seller of ${p.typeLabel} in ${p.districtName} won't consider new bids from you yet – wait or buy at the ask price.`, "warn");
      const { maxLtv } = loanTerms(state);
      const bid = Math.max(0, Math.round(action.amount));
      const down = bid * (1 - maxLtv);
      if (state.cash < down)
        return log(state, `Not enough cash. A down payment of ${msek(down)} is required for the bid.`, "warn");
      const ratio = bid / p.askPrice;
      const baseProb =
        ratio >= 0.97 ? 0.92 : ratio >= 0.92 ? 0.62 : ratio >= 0.85 ? 0.34 : ratio >= 0.78 ? 0.13 : 0.03;
      const acceptProb = Math.min(0.98, baseProb + bidBonus(state));
      if (random01() < acceptProb) {
        const loan = bid - down;
        const txEntry = { type: "bought" as const, price: bid, month: state.month, year: state.year, party: "You" };
        return {
          ...state,
          cash: state.cash - down,
          debt: state.debt + loan,
          reputation: Math.min(100, +(state.reputation + 0.4).toFixed(1)),
          portfolio: [...state.portfolio, { ...p, owned: true, purchasePrice: bid, txHistory: [...(p.txHistory ?? []), txEntry] }],
          listings: state.listings.filter((x) => x.id !== p.id),
          competingBid: state.competingBid?.listingId === p.id ? undefined : state.competingBid,
          log: [
            {
              t: `✓ Bid accepted! Bought ${p.typeLabel} in ${p.districtName} for ${msek(bid)} (below ask ${msek(p.askPrice)}).`,
              kind: "buy",
            },
            ...state.log,
          ],
        };
      }
      const withdrawn = random01() < 0.25;
      if (!withdrawn)
        return {
          ...state,
          listings: state.listings.map((x) =>
            x.id === p.id ? { ...x, bidRejectedAbs: nowAbs } : x,
          ),
          log: [
            { t: `Your bid on ${p.typeLabel} in ${p.districtName} (${msek(bid)}) was rejected. The seller won't consider more low bids for a couple of months.`, kind: "warn" },
            ...state.log,
          ],
        };
      // Säljaren tog ett annat bud – huset försvinner INTE från kartan:
      // köparen är ett av stadens bolag och fastigheten flyttar till dess
      // portfölj med tomtrutan kvar. Utan bolag återgår den till poolen.
      const rival =
        state.competitors.length > 0
          ? state.competitors[Math.floor(random01() * state.competitors.length)]
          : undefined;
      const paid = Math.max(bid + 1, Math.round(p.askPrice * 0.97));
      const soldAway: Property = {
        ...p,
        owned: false,
        askPrice: paid,
        listedMonth: undefined,
        expiresMonth: undefined,
        poolAskPrice: undefined,
        poolBaseRent: undefined,
        ...(rival ? {} : { parcelId: undefined }),
        txHistory: [
          ...(p.txHistory ?? []),
          { type: "bought" as const, price: paid, month: state.month, year: state.year, party: rival?.name ?? "Unknown buyer" },
        ],
      };
      return {
        ...state,
        listings: state.listings.filter((x) => x.id !== p.id),
        competitors: rival
          ? state.competitors.map((c) =>
              c.name === rival.name
                ? { ...c, portfolio: [...(c.portfolio ?? []), soldAway], cash: Math.max(0, c.cash - paid), units: (c.portfolio?.length ?? 0) + 1 }
                : c,
            )
          : state.competitors,
        worldPool: rival ? state.worldPool : [...(state.worldPool ?? []), soldAway],
        competingBid: state.competingBid?.listingId === p.id ? undefined : state.competingBid,
        log: [
          {
            t: rival
              ? `🏢 ${rival.name} won the bidding for ${p.typeLabel} in ${p.districtName} (${msek(paid)}) – your bid of ${msek(bid)} wasn't enough.`
              : `Your bid on ${p.typeLabel} in ${p.districtName} was rejected – the seller took another bid.`,
            kind: "warn",
          },
          ...state.log,
        ],
      };
    }
    case "SELL": {
      // Snabbförsäljning till uppköpare: direkt affär men med rabatt.
      // Fullt pris kräver annonsering (LIST_FOR_SALE) och en riktig köpare.
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p) return state;
      // Villkor 7b i morfars testamente: huset får inte säljas under kampanjen.
      if (p.storyTag === "arvet" && state.story && !state.story.done)
        return log(state, "Clause 7b: Grandpa's house may not be sold. Oakley bills $900 for the reminder. (included)", "warn");
      const value = propMarketValue(p, state);
      const salePrice = Math.round(value * QUICK_SALE_FACTOR);
      const payoff = Math.min(state.debt, (p.purchasePrice || salePrice) * 0.6);
      const born = state.year * 12 + state.month;
      const sellTx = { type: "sold" as const, price: salePrice, month: state.month, year: state.year, party: "You (quick sale)" };
      const relisted = {
        ...p,
        owned: false,
        askPrice: value,
        listedMonth: born,
        expiresMonth: born + 3 + Math.floor(random01() * 2),
        txHistory: [...(p.txHistory ?? []), sellTx],
        // Nytt förhandlat pris – gammal pool-snapshot gäller inte längre.
        poolAskPrice: undefined,
        poolBaseRent: undefined,
        // Spelarspecifik uthyrningsstyrning följer inte med köpet.
        applications: undefined,
        askRentPct: undefined,
        regulated: undefined,
        brokerMandate: undefined,
        capexTotal: undefined,
        forSale: undefined,
      };
      return removeFromPackages(
        {
          ...state,
          cash: state.cash + (salePrice - payoff),
          debt: Math.max(0, state.debt - payoff),
          portfolio: state.portfolio.filter((x) => x.id !== p.id),
          listings: [...state.listings, relisted],
          pendingRenewals: dropRenewals(state, (r) => r.propertyId === p.id),
          log: [
            {
              t: `⚡ Quick sale: ${p.typeLabel} in ${p.districtName} for ${msek(salePrice)} (−15% vs. value, net ${msek(salePrice - payoff)}).`,
              kind: "sell",
            },
            ...state.log,
          ],
        },
        [p.id],
      );
    }
    case "LIST_FOR_SALE": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status !== "klar" || p.forSale) return state;
      if (p.storyTag === "arvet" && state.story && !state.story.done)
        return log(state, "Clause 7b: Grandpa's house may not be listed. Grandpa foresaw this. He foresaw everything.", "warn");
      const ask = Math.max(10_000, Math.round(action.ask));
      return {
        ...state,
        portfolio: state.portfolio.map((x) =>
          x.id === p.id ? { ...x, forSale: { ask, listedAbs: state.year * 12 + state.month } } : x,
        ),
        log: [
          { t: `🏷️ ${p.typeLabel} in ${p.districtName} listed for ${msek(ask)} – awaiting a buyer.`, kind: "info" },
          ...state.log,
        ],
      };
    }
    case "UNLIST": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p?.forSale || p.forSale.packageId != null) return state;
      return {
        ...state,
        portfolio: state.portfolio.map((x) => (x.id === p.id ? { ...x, forSale: undefined } : x)),
        offers: (state.offers ?? []).filter((o) => o.kind !== "listing" || o.propId !== p.id),
        log: [{ t: `${p.typeLabel} in ${p.districtName} was removed from the market.`, kind: "info" }, ...state.log],
      };
    }
    case "LIST_PACKAGE": {
      const props = state.portfolio.filter(
        (p) => action.ids.includes(p.id) && p.status === "klar" && !p.forSale,
      );
      if (props.length < 2) return log(state, "A sale package requires at least two available properties.", "warn");
      const id = Math.max(0, ...(state.salePackages ?? []).map((x) => x.id)) + 1;
      const ask = Math.max(10_000, Math.round(action.ask));
      const listedAbs = state.year * 12 + state.month;
      const pkg = { id, name: `Portfolio ${String.fromCharCode(64 + ((id - 1) % 26) + 1)}`, propertyIds: props.map((p) => p.id), ask, listedAbs };
      return {
        ...state,
        salePackages: [...(state.salePackages ?? []), pkg],
        portfolio: state.portfolio.map((x) =>
          pkg.propertyIds.includes(x.id) ? { ...x, forSale: { ask: 0, listedAbs, packageId: id } } : x,
        ),
        log: [
          { t: `📦 The sale package ${pkg.name} (${props.length} properties) listed for ${msek(ask)}.`, kind: "info" },
          ...state.log,
        ],
      };
    }
    case "UNLIST_PACKAGE": {
      const pkg = (state.salePackages ?? []).find((x) => x.id === action.packageId);
      if (!pkg) return state;
      return {
        ...state,
        salePackages: (state.salePackages ?? []).filter((x) => x.id !== pkg.id),
        portfolio: state.portfolio.map((x) =>
          pkg.propertyIds.includes(x.id) ? { ...x, forSale: undefined } : x,
        ),
        offers: (state.offers ?? []).filter((o) => o.packageId !== pkg.id),
        log: [{ t: `The sale package ${pkg.name} was withdrawn from the market.`, kind: "info" }, ...state.log],
      };
    }
    case "UPGRADE": {
      const p = state.portfolio.find((x) => x.id === action.id);
      const u = UPGRADES.find((x) => x.id === action.upg);
      if (!p || !u || p.status === "bygger") return state;
      if (p.upgrades.includes(u.id) || pendingWork(p, "uppgradering", u.id)) return state;
      const cost = propMarketValue(p, state) * u.cost;
      if (state.cash < cost) return log(state, "Not enough cash for the action.", "warn");
      // Betala nu – hantverkarna behöver tid. Effekten landar via
      // pendingWorks vid månadsskiftet; hyresgästerna bor kvar under tiden.
      const months = u.months ?? 1;
      const np: Property = {
        ...p,
        capexTotal: (p.capexTotal ?? 0) + Math.round(cost),
        pendingWorks: [...(p.pendingWorks ?? []), { kind: "uppgradering", upgradeId: u.id, monthsLeft: months }],
      };
      return {
        ...state,
        cash: state.cash - cost,
        portfolio: state.portfolio.map((x) => (x.id === p.id ? np : x)),
        log: [
          { t: `${u.name} ordered for ${p.typeLabel} in ${p.districtName} (${msek(cost)}) – done in ${months} mo.`, kind: "upg" },
          ...state.log,
        ],
      };
    }
    case "LEASE": {
      // Acceptera bästa inkomna ansökan (standardkontrakt). Utan
      // ansökningar händer inget – vakanser fylls via ansökningsflödet.
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.tenants.length >= p.capacity || p.status === "bygger") return state;
      if (pendingWork(p, "ändrad_användning"))
        return log(state, "A conversion to a new use is in progress – no new contracts until it's done.", "warn");
      const app = bestApplication(p);
      if (!app)
        return log(state, `No applications for ${p.typeLabel} in ${p.districtName} yet – adjust the asking rent or hire a broker.`, "info");
      const tenant = signContract(app.tenant, "standard");
      return {
        ...state,
        portfolio: state.portfolio.map((x) =>
          x.id === p.id
            ? { ...x, tenants: [...x.tenants, tenant], applications: (x.applications ?? []).filter((a) => a.id !== app.id) }
            : x,
        ),
        log: [
          {
            t: `Signed lease: ${tenant.name} in ${p.districtName}, ${tenant.termTotal} mo, ${kr(tenant.rent)}/mo.`,
            kind: "buy",
          },
          ...state.log,
        ],
      };
    }
    case "ACCEPT_APPLICATION": {
      // U1/U2: acceptera en specifik sökande med valt kontraktspaket.
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status === "bygger") return state;
      if (pendingWork(p, "ändrad_användning"))
        return log(state, "A conversion to a new use is in progress – no new contracts until it's done.", "warn");
      if (p.tenants.length >= p.capacity)
        return log(state, "The property is fully occupied – convert it for more units.", "warn");
      const app = (p.applications ?? []).find((a) => a.id === action.applicationId);
      if (!app) return state;
      if (action.contract === "ankare" && !app.anchorEligible)
        return log(state, "Ankaravtal kan bara erbjudas kedjor och myndigheter.", "warn");
      const tenant = signContract(app.tenant, action.contract);
      return {
        ...state,
        portfolio: state.portfolio.map((x) =>
          x.id === p.id
            ? { ...x, tenants: [...x.tenants, tenant], applications: (x.applications ?? []).filter((a) => a.id !== app.id) }
            : x,
        ),
        log: [
          {
            t: `${action.contract === "ankare" ? "⭐ Anchor lease" : "Lease"} signed: ${tenant.name} in ${p.districtName} (${CONTRACTS[action.contract].label}, ${tenant.termTotal} mo, ${kr(tenant.rent)}/mo).`,
            kind: "buy",
          },
          ...state.log,
        ],
      };
    }
    case "REJECT_APPLICATION": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p) return state;
      return {
        ...state,
        portfolio: state.portfolio.map((x) =>
          x.id === p.id
            ? { ...x, applications: (x.applications ?? []).filter((a) => a.id !== action.applicationId) }
            : x,
        ),
      };
    }
    case "SET_ASK_RENT": {
      const pct = Math.max(0.8, Math.min(1.3, action.pct));
      return {
        ...state,
        portfolio: state.portfolio.map((x) =>
          x.id === action.id ? { ...x, askRentPct: +pct.toFixed(2) } : x,
        ),
      };
    }
    case "TOGGLE_REGULATED": {
      // U6: bostadskön – reglerad hyra, noll vakans, goodwill.
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.type !== "bostad")
        return log(state, "The housing queue only applies to residential properties.", "warn");
      const on = !p.regulated;
      return {
        ...state,
        portfolio: state.portfolio.map((x) =>
          x.id === action.id ? { ...x, regulated: on, applications: on ? [] : x.applications } : x,
        ),
        log: [
          {
            t: on
              ? `🏛️ ${p.typeLabel} in ${p.districtName} joined the housing queue: rent −20%, the queue fills vacancies directly, +goodwill.`
              : `${p.typeLabel} in ${p.districtName} leaves the housing queue – market rent and application flow apply.`,
            kind: "info",
          },
          ...state.log,
        ],
      };
    }
    case "TOGGLE_BROKER": {
      // U8: mäklaruppdrag – arvode vid vakans, garanterat kvalificerat flöde.
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p) return state;
      const on = !p.brokerMandate;
      return {
        ...state,
        portfolio: state.portfolio.map((x) =>
          x.id === action.id ? { ...x, brokerMandate: on } : x,
        ),
        log: [
          {
            t: on
              ? `🤝 Broker mandate for ${p.typeLabel} in ${p.districtName}: ${kr(BROKER_FEE)}/mo on vacancy, guaranteed qualified applicants.`
              : `The broker mandate for ${p.typeLabel} in ${p.districtName} ended.`,
            kind: "info",
          },
          ...state.log,
        ],
      };
    }
    case "EVICT": {
      // U7: besittningsskydd – bostadshyresgäster köps ut (3 månadshyror),
      // kommersiella kontrakt är friare (1 månadshyra, mildare rykte).
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status === "bygger") return state;
      const tenant = p.tenants.find((t) => t.id === action.tenantId);
      if (!tenant) return state;
      const residential = p.type === "bostad";
      const buyout = tenant.rent * (residential ? 3 : 1);
      // Att vräka en notabel karaktär blir en offentlig affär: hårdare
      // ryktesförlust och en mediestorm.
      const notable = !!tenant.notableId;
      const repHit = (residential ? 3 : 1) + (notable ? 3 : 0);
      if (state.cash < buyout)
        return log(state, `The termination requires ${kr(buyout)} in ${residential ? "relocation compensation (tenancy protection)" : "compensation"}.`, "warn");
      return {
        ...state,
        cash: state.cash - buyout,
        reputation: Math.max(0, state.reputation - repHit),
        // Vräkningar värmer pressen – bostadsvräkningar och notabla mest.
        pressHeat: Math.min(20, (state.pressHeat ?? 0) + (residential ? 2 : 1) + (notable ? 2 : 0)),
        // Kommunen ogillar vräkningar (bostäder tyngst).
        standing: adjustStanding(state.standing, { kind: "city" }, residential ? -2 : -1),
        portfolio: state.portfolio.map((x) =>
          x.id === p.id ? { ...x, tenants: x.tenants.filter((t) => t.id !== action.tenantId) } : x,
        ),
        pendingRenewals: dropRenewals(state, (r) => r.propertyId === p.id && r.tenantId === action.tenantId),
        log: [
          {
            t: notable
              ? `📰 You evicted ${tenant.name} in ${p.districtName} — a notable name goes to the press. ${kr(buyout)} paid (rep −${repHit}).`
              : `Terminated ${tenant.name} in ${p.districtName}: ${kr(buyout)} in ${residential ? "relocation compensation" : "compensation"} (rep −${repHit}).`,
            kind: "warn",
          },
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
        ...markNegotiated(state),
        reputation: Math.min(100, state.reputation + 1),
        portfolio: state.portfolio.map((x) =>
          x.id === p.id
            ? { ...x, tenants: x.tenants.map((t) => (t.id === action.tenantId ? renewed : t)) }
            : x,
        ),
        pendingRenewals: dropRenewals(state, (r) => r.propertyId === p.id && r.tenantId === action.tenantId),
        log: [
          {
            t: `Renewed the lease with ${tenant.name} in ${p.districtName}: ${kr(newRent)}/mo, ${renewed.monthsLeft} mo.`,
            kind: "buy",
          },
          ...state.log,
        ],
      };
    }
    case "MAINTAIN": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status === "bygger") return state;
      if (pendingWork(p, "underhåll"))
        return log(state, `Maintenance is already in progress on ${p.typeLabel} in ${p.districtName} – done at month-end.`, "info");
      const cost = Math.round(propMarketValue(p, state) * 0.02);
      if (state.cash < cost) return log(state, "Not enough cash for maintenance.", "warn");
      // Betalas nu, +15 skick när månaden gått – hyran flyter under tiden.
      return {
        ...state,
        cash: state.cash - cost,
        portfolio: state.portfolio.map((x) =>
          x.id === p.id
            ? {
                ...x,
                capexTotal: (x.capexTotal ?? 0) + cost,
                pendingWorks: [...(x.pendingWorks ?? []), { kind: "underhåll" as const, monthsLeft: 1 }],
              }
            : x,
        ),
        log: [
          {
            t: `🔧 Maintenance ordered for ${p.typeLabel} in ${p.districtName} (${msek(cost)}) – +15 condition at month-end.`,
            kind: "upg",
          },
          ...state.log,
        ],
      };
    }
    case "LEASE_ALL": {
      // Acceptera bästa ansökan för varje vakans i hela portföljen
      // (standardkontrakt). Vakanser utan ansökningar förblir tomma.
      let signed = 0;
      const portfolio = state.portfolio.map((p) => {
        if (p.status === "bygger" || p.shortTerm || p.tenants.length >= p.capacity) return p;
        if (pendingWork(p, "ändrad_användning")) return p;
        let np = p;
        while (np.tenants.length < np.capacity) {
          const app = bestApplication(np);
          if (!app) break;
          signed += 1;
          np = {
            ...np,
            tenants: [...np.tenants, signContract(app.tenant, "standard")],
            applications: (np.applications ?? []).filter((a) => a.id !== app.id),
          };
        }
        return np;
      });
      if (signed === 0)
        return log(state, "No applications to accept – adjust asking rents or hire a broker.", "info");
      return log(
        { ...state, portfolio },
        `🏠 Accepted ${signed} applications – the best applicants got contracts across the whole portfolio.`,
        "buy",
      );
    }
    case "MAINTAIN_ALL": {
      // Underhåll alla fastigheter under skicktröskeln, så långt kassan räcker.
      let cash = state.cash;
      let fixed = 0;
      let totalCost = 0;
      const portfolio = state.portfolio.map((p) => {
        if (p.status === "bygger" || p.condition >= action.threshold) return p;
        if (pendingWork(p, "underhåll")) return p; // rond dubbelköar inte
        const cost = Math.round(propMarketValue(p, state) * 0.02);
        if (cash < cost) return p;
        cash -= cost;
        totalCost += cost;
        fixed += 1;
        return {
          ...p,
          capexTotal: (p.capexTotal ?? 0) + cost,
          pendingWorks: [...(p.pendingWorks ?? []), { kind: "underhåll" as const, monthsLeft: 1 }],
        };
      });
      if (fixed === 0)
        return log(state, `Nothing to maintain below condition ${action.threshold} (or the cash is insufficient).`, "info");
      return log(
        { ...state, cash, portfolio },
        `🔧 Maintenance round: ${fixed} jobs ordered (${msek(totalCost)}) – +15 condition at month-end.`,
        "upg",
      );
    }
    case "RENEW_ALL": {
      // Förnya alla kontrakt som löper ut inom N månader till marknadshyra.
      let renewed = 0;
      const renewedIds = new Set<number>();
      const portfolio = state.portfolio.map((p) => {
        if (p.status === "bygger") return p;
        let changed = false;
        const tenants = p.tenants.map((t) => {
          if (t.monthsLeft > action.monthsLeft) return t;
          const marketRent = Math.round(
            (propPotentialRent(p, state) / p.capacity / 12) * t.quality,
          );
          changed = true;
          renewed += 1;
          renewedIds.add(t.id);
          return { ...t, rent: Math.max(t.rent, marketRent), monthsLeft: t.termTotal };
        });
        return changed ? { ...p, tenants } : p;
      });
      if (renewed === 0)
        return log(state, `No contracts expire within ${action.monthsLeft} months.`, "info");
      return log(
        {
          ...state,
          portfolio,
          // Förnyade kontrakt är inte längre öppna förhandlingar.
          pendingRenewals: dropRenewals(state, (r) => renewedIds.has(r.tenantId)),
          reputation: Math.min(100, state.reputation + 1),
        },
        `📄 Renewed ${renewed} leases at market rent (reputation +1).`,
        "buy",
      );
    }
    case "MANAGE_ALL": {
      // Slå på/av lokal förvaltare på hela portföljen.
      const portfolio = state.portfolio.map((p) =>
        p.status === "bygger" ? p : { ...p, managed: action.managed },
      );
      return log(
        { ...state, portfolio },
        action.managed
          ? "👔 Managers hired on all properties."
          : "👔 Managers ended on all properties.",
        "info",
      );
    }
    case "BUY_LOT": {
      const lot = state.lots.find((x) => x.id === action.id);
      if (!lot) return state;
      if (districtLocked(state, lot.district)) return log(state, "🔒 The area is locked – the story opens the city chapter by chapter. Continue the campaign to open it.", "warn");
      if (state.cash < lot.price) return log(state, "Not enough cash for the lot.", "warn");
      return {
        ...state,
        cash: state.cash - lot.price,
        lots: state.lots.map((x) => (x.id === lot.id ? { ...x, owned: true } : x)),
        log: [
          {
            t: `Bought a lot in ${lot.districtName} (${lot.area} m²) for ${msek(lot.price)}.`,
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
        return log(state, `The build requires ${msek(down)} in cash (the rest is a loan).`, "warn");
      const d = DISTRICTS.find((x) => x.id === lot.district)!;
      const value = lot.area * d.base * 1.1 * state.marketMod;
      const newProp: Property = {
        id: newId(),
        district: lot.district,
        districtName: lot.districtName,
        // Bygget står på DEN köpta tomten – utan denna hamnade kranen
        // på en slumpad ledig ruta i distriktet.
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
        tenants: [],
        capacity: calcCapacity(lot.area),
        status: "bygger",
        buildLeft,
        energyClass: "A",
        builtYear: state.year,
        txHistory: [{ type: "built", price: Math.round(cost), month: state.month, year: state.year, party: "You" }],
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
            t: `Started new construction (${t.label}) in ${lot.districtName}. Done in ${buildLeft} mo. The world expands to ${(state.worldTotal ?? 0) + 1} properties.`,
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
      // Fastighetskris: refinansieringsfönstret är stängt – bankerna
      // lånar inte ut mot fallande säkerheter.
      if ((state.crisisMonthsLeft ?? 0) > 0)
        return log(state, "🏦 The credit market is closed during the crisis — no new leverage until the market stabilizes.", "warn");
      const { maxLtv } = loanTerms(state);
      const portVal = state.portfolio.reduce((a, p) => a + propMarketValue(p, state), 0);
      const maxDebt = Math.floor(portVal * maxLtv);
      const draw = Math.min(action.amount, Math.max(0, maxDebt - state.debt));
      if (draw <= 0) return log(state, "No further borrowing capacity within the current LTV.", "warn");
      return {
        ...state,
        cash: state.cash + draw,
        debt: state.debt + draw,
        reputation: Math.max(0, state.reputation - 1),
        log: [
          { t: `Leveraged the portfolio: +${msek(draw)} (reputation −1).`, kind: "income" },
          ...state.log,
        ],
      };
    }
    case "LEASE_TENANT": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.tenants.length >= p.capacity || p.status === "bygger") return state;
      if (pendingWork(p, "ändrad_användning")) return state;
      return {
        ...state,
        portfolio: state.portfolio.map((x) =>
          x.id === p.id ? { ...x, tenants: [...x.tenants, action.tenant] } : x,
        ),
        log: [
          {
            t: `Signed lease: ${action.tenant.name} in ${p.districtName}, ${action.tenant.termTotal} mo, ${kr(action.tenant.rent)}/mo.`,
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
      const baseProb   = ratio < 1.0 ? 0.97 : ratio < 1.1 ? 0.80 : ratio < 1.2 ? 0.55 : ratio < 1.35 ? 0.28 : 0.10;
      // Nöjda hyresgäster tål höjningar bättre (U3).
      const satMult    = Math.max(0.3, Math.min(1.25, (tenant.satisfaction ?? 60) / 65));
      const acceptProb = Math.min(0.98, baseProb * satMult);
      if (random01() < acceptProb) {
        return {
          ...markNegotiated(state),
          portfolio: state.portfolio.map((x) =>
            x.id === p.id
              ? { ...x, tenants: x.tenants.map((t) => (t.id === action.tenantId ? { ...t, rent: newRent } : t)) }
              : x,
          ),
          log: [
            {
              t: `${tenant.name} in ${p.districtName} accepted a rent increase +${action.increasePercent}% → ${kr(newRent)}/mo.`,
              kind: "income",
            },
            ...state.log,
          ],
        };
      }
      return {
        ...markNegotiated(state),
        reputation: Math.max(0, state.reputation - 1),
        // En avvisad höjning som driver ut en hyresgäst göder mediestormen.
        pressHeat: Math.min(20, (state.pressHeat ?? 0) + (action.increasePercent >= 20 ? 2 : 1)),
        portfolio: state.portfolio.map((x) =>
          x.id === p.id ? { ...x, tenants: x.tenants.filter((t) => t.id !== action.tenantId) } : x,
        ),
        log: [
          {
            t: `${tenant.name} in ${p.districtName} rejected the rent increase and left (reputation −1).`,
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
        ...markNegotiated(state),
        reputation: Math.min(100, state.reputation + 0.5),
        portfolio: state.portfolio.map((x) =>
          x.id === p.id
            ? { ...x, tenants: x.tenants.map((t) => (t.id === action.tenantId ? { ...t, rent: newRent } : t)) }
            : x,
        ),
        log: [
          {
            t: `${tenant.name} in ${p.districtName}: rent cut −${action.decreasePercent}% → ${kr(newRent)}/mo (reputation +0.5).`,
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
        // Avslutad förvaltare tar sina instruktioner med sig – annars
        // fortsätter gamla trösklar att tyst överstyra portföljdirektören.
        portfolio: state.portfolio.map((x) =>
          x.id === p.id ? { ...x, managed, managerSettings: managed ? x.managerSettings : undefined } : x,
        ),
        log: [
          {
            t: managed
              ? `Hired a manager for ${p.typeLabel} in ${p.districtName}.`
              : `Ended management of ${p.typeLabel} in ${p.districtName}.`,
            kind: managed ? "buy" : "info",
          },
          ...state.log,
        ],
      };
    }
    case "MARKET_BOOST": {
      // Annonskampanj: annonserna behöver en månad att verka –
      // tre nya ansökningar kommer in vid månadsskiftet (U1).
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status !== "klar") return state;
      if (suppressOrganicApplications(state, p))
        return log(state, "🎬 Relax – the story arranges applicants for Grandpa's house. Save the ad money.", "info");
      if (pendingWork(p, "kampanj"))
        return log(state, `An ad campaign is already running for ${p.typeLabel} in ${p.districtName}.`, "info");
      if (state.cash < 25000) return log(state, "Not enough cash for an ad campaign.", "warn");
      return {
        ...state,
        cash: state.cash - 25000,
        portfolio: state.portfolio.map((x) =>
          x.id === p.id
            ? { ...x, pendingWorks: [...(x.pendingWorks ?? []), { kind: "kampanj" as const, monthsLeft: 1 }] }
            : x,
        ),
        log: [
          {
            t: `📣 Ad campaign started for ${p.typeLabel} in ${p.districtName} ($25,000) – applications expected at month-end.`,
            kind: "upg",
          },
          ...state.log,
        ],
      };
    }
    case "HIRE_BROKER": {
      const BROKER_FEE = 75_000;
      if (state.cash < BROKER_FEE)
        return log(state, "The broker fee is $75,000 – not enough cash.", "warn");
      const extra = genListing(state);
      return {
        ...state,
        cash: state.cash - BROKER_FEE,
        listings: [...state.listings, extra],
        log: [
          { t: `Hired a broker ($75,000). New off-market property: ${extra.typeLabel} in ${extra.districtName}.`, kind: "buy" },
          ...state.log,
        ],
      };
    }
    case "HIRE_BROKER_LOTS": {
      const BROKER_FEE = 75_000;
      if (state.cash < BROKER_FEE)
        return log(state, "The broker fee is $75,000 – not enough cash.", "warn");
      const extra = genLot(state);
      return {
        ...state,
        cash: state.cash - BROKER_FEE,
        lots: [...state.lots, extra],
        log: [
          { t: `Hired a land broker ($75,000). A new off-market lot was found in ${extra.districtName}.`, kind: "buy" },
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
      if (e.takeoverPressure !== undefined) {
        s.takeoverPressure = Math.max(0, (s.takeoverPressure ?? 0) + e.takeoverPressure);
      }
      if (e.planSettle) {
        // Förlikning i överklagad detaljplan: tiden kortas och
        // processen återgår till granskning.
        const { blockId, monthsDelta } = e.planSettle;
        s.planProcesses = (s.planProcesses ?? []).map((pp) =>
          pp.blockId === blockId
            ? {
                ...pp,
                stage: monthsDelta < 0 ? ("granskning" as const) : pp.stage,
                monthsLeft: Math.max(1, pp.monthsLeft + monthsDelta),
              }
            : pp,
        );
      }
      if (e.gameOver) {
        s.gameOver = true;
        // Beslutets egen logtext förklarar slutet (t.ex. "bolaget såldes...").
        s.gameOverReason = { icon: "📜", title: "The company changed hands", text: e.log };
      }
      // Berättelseläget: flaggor med sidoeffekter + kedjade brev.
      if (e.storyFlag) s = applyStoryFlag(s, e.storyFlag);
      if (e.nextDecisionId) {
        const next = storyDecisionById(e.nextDecisionId, s);
        if (next) s = { ...s, pendingDecision: next };
      }
      return { ...s, log: [{ t: e.log, kind: e.logKind }, ...s.log] };
    }
    case "ACCEPT_OFFER": {
      const offer = (state.offers ?? []).find((o) => o.id === action.offerId);
      if (!offer) return state;
      // Sålda hus försvinner INTE från kartan: köparen är ett av stadens
      // bolag och fastigheten flyttar till dess portfölj (tomtrutan behålls).
      // Har budgivaren hunnit fusioneras bort tar ett annat bolag affären;
      // världspoolen är bara sista utväg om staden saknar bolag helt.
      const buyer =
        state.competitors.find((c) => c.name === offer.from) ??
        (state.competitors.length > 0
          ? state.competitors[Math.floor(random01() * state.competitors.length)]
          : undefined);
      const soldProp = (x: Property, price: number): Property => ({
        ...x,
        owned: false,
        askPrice: price,
        parcelId: buyer ? x.parcelId : undefined,
        listedMonth: undefined,
        expiresMonth: undefined,
        poolAskPrice: undefined,
        poolBaseRent: undefined,
        applications: undefined,
        askRentPct: undefined,
        regulated: undefined,
        brokerMandate: undefined,
        capexTotal: undefined,
        forSale: undefined,
        managed: false,
        managerSettings: undefined,
        txHistory: [
          ...(x.txHistory ?? []),
          { type: "sold" as const, price, month: state.month, year: state.year, party: offer.from },
        ],
      });
      const settle = (s: GameState, sold: Property[], amount: number): GameState => {
        if (!buyer) return { ...s, worldPool: [...(s.worldPool ?? []), ...sold] };
        return {
          ...s,
          competitors: s.competitors.map((c) =>
            c.name === buyer.name
              ? { ...c, portfolio: [...c.portfolio, ...sold], cash: Math.max(0, c.cash - amount) }
              : c,
          ),
        };
      };
      // Paketbud: hela portföljen byter ägare i en affär.
      if (offer.propertyIds && offer.propertyIds.length > 0) {
        const props = state.portfolio.filter((x) => offer.propertyIds!.includes(x.id));
        if (props.length === 0) return { ...state, offers: state.offers.filter((o) => o.id !== offer.id) };
        const totalValue = props.reduce((a, x) => a + propMarketValue(x, state), 0);
        const payoff = Math.min(
          state.debt,
          props.reduce((a, x) => a + (x.purchasePrice || (offer.amount * propMarketValue(x, state)) / Math.max(1, totalValue)) * 0.6, 0),
        );
        const soldIds = props.map((x) => x.id);
        const sold = props.map((x) =>
          soldProp(x, Math.round((offer.amount * propMarketValue(x, state)) / Math.max(1, totalValue))),
        );
        return removeFromPackages(
          settle(
            {
              ...state,
              cash: state.cash + (offer.amount - payoff),
              debt: Math.max(0, state.debt - payoff),
              reputation: Math.min(100, state.reputation + 2),
              portfolio: state.portfolio.filter((x) => !soldIds.includes(x.id)),
              salePackages: (state.salePackages ?? []).filter((x) => x.id !== offer.packageId),
              offers: state.offers.filter(
                (o) => o.id !== offer.id && !soldIds.includes(o.propId) && o.packageId !== offer.packageId,
              ),
              pendingRenewals: dropRenewals(state, (r) => soldIds.includes(r.propertyId)),
              log: [
                {
                  t: `📦 Package deal! Sold ${props.length} properties to ${offer.from} for ${msek(offer.amount)} (net ${msek(offer.amount - payoff)}).`,
                  kind: "sell",
                },
                ...state.log,
              ],
            },
            sold,
            offer.amount,
          ),
          soldIds,
        );
      }
      const p = state.portfolio.find((x) => x.id === offer.propId);
      if (!p) return { ...state, offers: state.offers.filter((o) => o.id !== offer.id) };
      const payoff = Math.min(state.debt, (p.purchasePrice || offer.amount) * 0.6);
      return removeFromPackages(
        settle(
          {
            ...state,
            cash: state.cash + (offer.amount - payoff),
            debt: Math.max(0, state.debt - payoff),
            reputation: Math.min(100, state.reputation + 1),
            portfolio: state.portfolio.filter((x) => x.id !== p.id),
            offers: state.offers.filter((o) => o.id !== offer.id && o.propId !== p.id),
            pendingRenewals: dropRenewals(state, (r) => r.propertyId === p.id),
            log: [
              {
                t: `Accepted a bid: sold ${p.typeLabel} in ${p.districtName} to ${offer.from} for ${msek(offer.amount)}.`,
                kind: "sell",
              },
              ...state.log,
            ],
          },
          [soldProp(p, offer.amount)],
          offer.amount,
        ),
        [p.id],
      );
    }
    case "COUNTER_OFFER": {
      // Motbud: begär mer än budet. Köparens smärtgräns växer med
      // objektets attraktivitet – går hen med på priset genomförs
      // affären direkt, annars dras budet tillbaka. Risk mot belöning.
      const offer = (state.offers ?? []).find((o) => o.id === action.offerId);
      if (!offer) return state;
      const amount = Math.round(action.amount);
      if (amount <= offer.amount) return state;
      const ids = offer.propertyIds ?? [offer.propId];
      const props = state.portfolio.filter((p) => ids.includes(p.id));
      if (props.length === 0) return state;
      const totalValue = props.reduce((a, p) => a + propMarketValue(p, state), 0);
      const A =
        totalValue > 0
          ? props.reduce((a, p) => a + attractiveness(p, state) * propMarketValue(p, state), 0) / totalValue
          : 0;
      const ceiling = offer.amount * (1.02 + 0.1 * A);
      const stretch = offer.amount * (1.1 + 0.08 * A);
      const accepted = amount <= ceiling || (amount <= stretch && random01() < 0.35);
      if (accepted) {
        const bumped: GameState = {
          ...state,
          offers: (state.offers ?? []).map((o) => (o.id === offer.id ? { ...o, amount } : o)),
          log: [{ t: `🤝 ${offer.from} agreed to your counter-offer ${msek(amount)}.`, kind: "sell" }, ...state.log],
        };
        return reducer(bumped, { type: "ACCEPT_OFFER", offerId: offer.id });
      }
      return {
        ...state,
        offers: (state.offers ?? []).filter((o) => o.id !== offer.id),
        log: [
          { t: `🚪 ${offer.from} pulled out of the deal after your counter-offer of ${msek(amount)}.`, kind: "warn" },
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
          { t: `Declined ${offer.from}'s bid on ${offer.propLabel} in ${offer.districtName}.`, kind: "info" },
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
        return log(state, `Not enough cash. ${qty} shares in ${st.name} cost ${msek(cost)}.`, "warn");
      const newOwned = st.owned + qty;
      const newAvg = (st.owned * st.avgCost + qty * st.price) / newOwned;
      return {
        ...state,
        cash: state.cash - cost,
        stocks: state.stocks.map((x) =>
          x.id === st.id ? { ...x, owned: newOwned, avgCost: +newAvg.toFixed(2) } : x,
        ),
        log: [
          { t: `Bought ${qty.toLocaleString("en-US")} shares in ${st.name} for ${msek(cost)}.`, kind: "buy" },
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
          { t: `Sold ${qty.toLocaleString("en-US")} shares in ${st.name} for ${msek(proceeds)}.`, kind: "sell" },
          ...state.log,
        ],
      };
    }
    case "ACQUIRE_COMPANY": {
      const st = state.stocks.find((x) => x.id === action.stockId);
      if (!st || !st.competitorName) return state;
      const ownPct = st.owned / st.sharesOutstanding;
      if (ownPct <= 0.5)
        return log(state, `You need a majority (>50%) in ${st.name} to acquire the company.`, "warn");
      // Uppköpsdrama (feature 9): premien beror på om budet är vänligt eller
      // fientligt. Med en bred majoritet (>75 %) rekommenderar styrelsen budet
      // och premien är låg; ett fientligt bud (50–75 %) möter styrelsemotstånd
      // (giftpiller) och kräver en högre premie samt kostar rykte.
      const friendly = ownPct >= 0.75;
      const premium = friendly ? 0.15 : 0.30;
      const remaining = st.sharesOutstanding - st.owned;
      const cost = remaining * st.price * (1 + premium);
      if (state.cash < cost)
        return log(
          state,
          `${friendly ? "A friendly" : "A hostile"} bid on ${st.name} requires ${msek(cost)} for the remaining shares (premium ${Math.round(premium * 100)}%).`,
          "warn",
        );
      const comp = state.competitors.find((c) => c.name === st.competitorName);
      // Fusion, inte skalbolag: HELA bolaget går upp i koncernen – fastig-
      // heterna (med sina tomtrutor) och kassan tillförs. Tidigare försvann
      // husen från kartan och ersattes av en evig "dotterbolagsintäkt" utan
      // täckning – dubbelfel som gjorde förvärven omöjliga att balansera.
      const acquired = (comp?.portfolio ?? []).map((p) => ({
        ...p,
        owned: true,
        purchasePrice: p.askPrice,
        txHistory: [
          ...(p.txHistory ?? []),
          { type: "bought" as const, price: p.askPrice, month: state.month, year: state.year, party: `Acquisition of ${st.name}` },
        ],
      }));
      // Egen blankning i bolaget stängs till kurs vid avnoteringen.
      const shortSettle = (st.shortQty ?? 0) > 0
        ? Math.max(0, Math.round((st.shortAvgPrice ?? st.price) * st.shortQty! * 1.5) + Math.round(st.shortQty! * ((st.shortAvgPrice ?? st.price) - st.price)))
        : 0;
      const cashIn = Math.round(comp?.cash ?? 0) + shortSettle;
      const repDelta = friendly ? 4 : -3;
      const dramaLog = friendly
        ? `🏛️ ACQUISITION: The board of ${st.name} recommended your bid. You bought the company for ${msek(cost)} (premium 15%) – ${acquired.length} properties and ${msek(Math.round(comp?.cash ?? 0))} in cash are merged into the group.`
        : `🏛️ HOSTILE ACQUISITION: Despite the board's poison pills you won the bidding war for ${st.name} for ${msek(cost)} (premium 30%) – ${acquired.length} properties and ${msek(Math.round(comp?.cash ?? 0))} in cash are merged in. Reputation −3.`;
      return {
        ...state,
        cash: state.cash - cost + cashIn,
        reputation: Math.max(0, Math.min(100, state.reputation + repDelta)),
        portfolio: [...state.portfolio, ...acquired],
        // Rivalens industrier (hotell, parker, terminaler) följer med fusionen.
        industryPortfolio: [...(state.industryPortfolio ?? []), ...(comp?.industries ?? [])],
        competitors: state.competitors.filter((c) => c.name !== st.competitorName),
        stocks: state.stocks.filter((x) => x.id !== st.id),
        stockOrders: (state.stockOrders ?? []).filter((o) => o.stockId !== st.id),
        log: [{ t: dramaLog, kind: "buy" }, ...state.log],
      };
    }
    case "CHANGE_USE": {
      const p = state.portfolio.find((x) => x.id === action.id);
      const t = PROP_TYPES[action.propType];
      if (!p || !t || p.status === "bygger") return state;
      if (p.type === action.propType) return state;
      if (p.tenants.length > 0)
        return log(state, "The property must be vacant to change its use.", "warn");
      if (pendingWork(p, "ändrad_användning"))
        return log(state, "A conversion to a new use is already in progress.", "warn");
      const value = propMarketValue(p, state);
      const cost = Math.round(value * 0.15);
      if (state.cash < cost)
        return log(state, `Changing the use costs ${msek(cost)} (conversion).`, "warn");
      // Ombyggnaden tar tre månader; typ/hyra/skick ändras när den är klar.
      return {
        ...state,
        cash: state.cash - cost,
        portfolio: state.portfolio.map((x) =>
          x.id === p.id
            ? {
                ...x,
                capexTotal: (x.capexTotal ?? 0) + cost,
                applications: [],
                pendingWorks: [
                  ...(x.pendingWorks ?? []),
                  { kind: "ändrad_användning" as const, targetType: action.propType, monthsLeft: 3 },
                ],
              }
            : x,
        ),
        log: [
          { t: `Conversion ordered in ${p.districtName}: ${p.typeLabel} → ${t.label} (${msek(cost)}) – done in 3 mo.`, kind: "upg" },
          ...state.log,
        ],
      };
    }
    case "START_RESEARCH": {
      if (state.activeResearch) return log(state, "A research project is already in progress.", "warn");
      if ((state.researchDone ?? []).includes(action.id)) return state;
      const def = RESEARCH.find((r) => r.id === action.id);
      if (!def) return state;
      if (state.cash < def.cost)
        return log(state, `${def.name} requires ${msek(def.cost)} in research budget.`, "warn");
      return {
        ...state,
        cash: state.cash - def.cost,
        activeResearch: { id: def.id, monthsLeft: def.months, monthsTotal: def.months },
        log: [
          { t: `🔬 Started research: ${def.name} (done in ${def.months} mo).`, kind: "upg" },
          ...state.log,
        ],
      };
    }
    case "HIRE_STAFF": {
      const role = STAFF_ROLES.find((r) => r.id === action.role);
      if (!role) return state;
      const cur = state.staff?.[action.role] ?? 0;
      if (cur >= role.maxLevel) return log(state, `${role.name} is already at the top level.`, "warn");
      const nextLevel = cur + 1;
      const fee = hireFee(action.role, nextLevel);
      if (state.cash < fee)
        return log(state, `Recruiting ${role.name} costs ${msek(fee)} in an initial fee.`, "warn");
      return {
        ...state,
        cash: state.cash - fee,
        staff: { ...(state.staff ?? {}), [action.role]: nextLevel },
        log: [
          {
            t: cur === 0
              ? `Hired ${role.name} (salary ${kr(role.baseSalary)}/mo).`
              : `Promoted ${role.name} to level ${nextLevel}.`,
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
        log: [{ t: `Ended the employment of ${role.name}.`, kind: "info" }, ...state.log],
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
            t: `Sold the subsidiary ${sub.name} for ${msek(salePrice)} (${kr(sub.monthlyIncome)}/mo × 12 / 6% × 80%).`,
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
        id: String(Date.now()) + String(random01()),
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
            t: `Limit order placed: ${action.side === "buy" ? "Buy" : "Sell"} ${qty.toLocaleString("en-US")} shares in ${st.name} @ ${kr(limitPrice)}.`,
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
        log: [{ t: "Limit order cancelled.", kind: "info" }, ...state.log],
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
        return log(state, `You need ${msek(down)} as a down payment to buy from ${action.competitorName}.`, "warn");
      const accepted = ratio >= 1.25 || (ratio >= 1.1 && random01() < 0.70);
      if (!accepted) {
        return log(
          state,
          `${action.competitorName} declined your bid of ${msek(action.amount)} for ${prop.typeLabel} in ${prop.districtName}. Place a higher bid.`,
          "warn",
        );
      }
      const loan = action.amount - down;
      const txEntry = { type: "bought" as const, price: action.amount, month: state.month, year: state.year, party: `${action.competitorName} (direct buy)` };
      const boughtProp: Property = { ...prop, owned: true, purchasePrice: action.amount, txHistory: [...(prop.txHistory ?? []), txEntry] };
      const newCompPortfolio = comp.portfolio.filter((_, i) => i !== propIdx);
      return {
        ...state,
        cash: state.cash - down,
        debt: state.debt + loan,
        reputation: Math.min(100, state.reputation + 2),
        // En affär på schysta villkor bygger goodwill med rivalen.
        standing: adjustStanding(state.standing, { kind: "rival", name: action.competitorName }, 3),
        portfolio: [...state.portfolio, boughtProp],
        competitors: state.competitors.map((c) =>
          c.name === action.competitorName
            ? { ...c, portfolio: newCompPortfolio, units: newCompPortfolio.length, cash: c.cash + action.amount, equity: c.equity + action.amount }
            : c,
        ),
        log: [
          {
            t: `✅ ${action.competitorName} accepted your bid! You bought ${prop.typeLabel} in ${prop.districtName} for ${msek(action.amount)} (loan ${msek(loan)}).`,
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
        log: [{ t: `Switched lender.`, kind: "info" }, ...state.log],
      };
    }
    case "BID_OFFMARKET": {
      const prop = (state.worldPool ?? []).find((p) => p.id === action.propertyId);
      if (!prop) return state;
      if (districtLocked(state, prop.district)) return log(state, "🔒 The area is locked – the story opens the city chapter by chapter. Continue the campaign to open it.", "warn");
      const ref = prop.askPrice;
      const { maxLtv } = loanTerms(state);
      const down = action.amount * (1 - maxLtv);
      if (state.cash < down)
        return log(state, `You need ${msek(down)} as a down payment for the off-market purchase.`, "warn");
      // Accepteras garanterat vid ≥110 %, 50 % chans vid 105–110 %
      const accepted =
        action.amount >= ref * 1.10 ||
        (action.amount >= ref * 1.05 && random01() < 0.5);
      if (!accepted) {
        return log(
          state,
          `The property owner declined the bid ${msek(action.amount)}. Raise to at least ${msek(Math.round(ref * 1.10))} (+10%) for a guaranteed answer.`,
          "warn",
        );
      }
      const loan = action.amount - down;
      const txEntry = { type: "bought" as const, price: action.amount, month: state.month, year: state.year, party: "You (off-market)" };
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
            t: `🤝 Off-market purchase: ${prop.typeLabel} in ${prop.districtName} for ${msek(action.amount)} (premium +${pct(action.amount / ref - 1)}, loan ${msek(loan)}).`,
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
    case "FOUND_NOTE": {
      // Morfars minneslapp hittad (berättelseläget). Idempotent: en belöning per lapp.
      if (!state.story) return state;
      const note = MEMORY_NOTES.find((n) => n.id === action.id);
      if (!note || hasFlag(state, noteFlag(note.id))) return state;
      let s: GameState = {
        ...state,
        reputation: Math.min(100, state.reputation + 1),
        story: { ...state.story, flags: [...state.story.flags, noteFlag(note.id)] },
        log: [
          { t: `📌 Found one of Grandpa’s memory notes: ${note.title} (reputation +1).`, kind: "event" as const },
          ...state.log,
        ],
      };
      if (foundNotes(s) === MEMORY_NOTES.length) {
        s = {
          ...s,
          reputation: Math.min(100, s.reputation + 3),
          log: [
            { t: "📔 All of Grandpa's memory notes found – the photo album is complete (reputation +3). He'd have liked that you looked.", kind: "income" as const },
            ...s.log,
          ],
        };
      }
      return s;
    }
    case "SET_GLOBAL_MANAGER": {
      return { ...state, globalManager: action.settings };
    }
    case "ACQUIRE_RIVAL": {
      const rival = state.competitors.find((c) => c.name === action.competitorName);
      if (!rival) return state;
      if ((rival.portfolio ?? []).length === 0)
        return log(state, `${rival.name} owns no properties to acquire.`, "warn");
      const minPrice = Math.round((rival.equity ?? 0) * 1.3);
      if (action.amount < minPrice)
        return log(state, `The minimum acquisition price is ${msek(minPrice)} (130% of equity).`, "warn");
      // Din befintliga aktiepost i bolaget räknas av – du köper bara resten.
      const stock = state.stocks.find((x) => x.competitorName === rival.name);
      const ownFrac = stock && stock.sharesOutstanding > 0
        ? Math.min(1, stock.owned / stock.sharesOutstanding)
        : 0;
      const price = Math.round(action.amount * (1 - ownFrac));
      const down = Math.round(price * 0.25);
      if (state.cash < down)
        return log(state, `Insufficient cash – you need at least ${msek(down)} (25% down payment).`, "warn");
      const loan = price - down;
      const acquired = (rival.portfolio ?? []).map((p) => ({
        ...p,
        owned: true,
        purchasePrice: p.askPrice,
        txHistory: [
          ...(p.txHistory ?? []),
          { type: "bought" as const, price: p.askPrice, month: state.month, year: state.year, party: `Acquisition of ${rival.name}` },
        ],
      }));
      // Egen blankning i bolaget stängs till kurs vid avnoteringen. Något
      // "dotterbolag" med evig intäkt skapas INTE längre – husen ger hyra i
      // portföljen och en skalbolagsintäkt ovanpå vore dubbelräkning.
      const shortSettle = stock && (stock.shortQty ?? 0) > 0
        ? Math.max(0, Math.round((stock.shortAvgPrice ?? stock.price) * stock.shortQty! * 1.5) + Math.round(stock.shortQty! * ((stock.shortAvgPrice ?? stock.price) - stock.price)))
        : 0;
      // Ett fientligt uppköp skrämmer de överlevande rivalerna – deras
      // standing sjunker (de fruktar nästa drag).
      let acqStanding = state.standing;
      for (const c of state.competitors) {
        if (c.name !== action.competitorName) acqStanding = adjustStanding(acqStanding, { kind: "rival", name: c.name }, -6);
      }
      return {
        ...state,
        // Bolagets kassa följer med köpet – du köper hela bolaget, inte bara husen.
        cash: state.cash - down + Math.round(rival.cash ?? 0) + shortSettle,
        debt: state.debt + loan,
        standing: acqStanding,
        portfolio: [...state.portfolio, ...acquired],
        // Rivalens industrier (hotell, parker, terminaler) följer med fusionen.
        industryPortfolio: [...(state.industryPortfolio ?? []), ...(rival.industries ?? [])],
        competitors: state.competitors.filter((c) => c.name !== action.competitorName),
        // Aktien avnoteras – bolaget är helägt och fusioneras in i koncernen.
        stocks: stock ? state.stocks.filter((x) => x.id !== stock.id) : state.stocks,
        stockOrders: stock ? (state.stockOrders ?? []).filter((o) => o.stockId !== stock.id) : state.stockOrders,
        reputation: Math.min(100, state.reputation + 8),
        log: [
          {
            t: `🏢 ACQUISITION: ${rival.name} is merged into the group for ${msek(price)}${ownFrac > 0 ? ` (your ${pct(ownFrac)} stake was offset)` : ""} – ${acquired.length} properties and ${msek(Math.round(rival.cash ?? 0))} in cash added!${rivalQuote(rival.name, "uppköpt", state.month) ? " " + rivalQuote(rival.name, "uppköpt", state.month) : ""}`,
            rival: rival.name,
            kind: "buy",
          },
          ...state.log,
        ],
      };
    }
    case "SNOOZE_DECISION": {
      if (!state.pendingDecision) return state;
      // Story-brev kan inte snoozas – morfar väntar tills du läst klart.
      if (state.pendingDecision.id.startsWith("story:")) return state;
      return {
        ...state,
        pendingDecision: null,
        reputation: Math.max(0, +(state.reputation - 2).toFixed(1)),
        log: [{ t: `⏸ Postponed the decision "${state.pendingDecision.title}". Reputation −2.`, kind: "warn" }, ...state.log],
      };
    }
    case "SET_SCENARIO": {
      return { ...state, scenarioId: action.scenarioId, gameWon: false };
    }
    case "BUY_INSURANCE": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p) return state;
      if (p.insurance) return log(state, "The property is already insured.", "warn");
      return {
        ...state,
        portfolio: state.portfolio.map((x) => x.id === action.id ? { ...x, insurance: true } : x),
        log: [{ t: `🛡️ Insurance taken out for ${p.typeLabel} in ${p.districtName} ($2,000/mo).`, kind: "info" }, ...state.log],
      };
    }
    case "CANCEL_INSURANCE": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p) return state;
      return {
        ...state,
        portfolio: state.portfolio.map((x) => x.id === action.id ? { ...x, insurance: false } : x),
        log: [{ t: `Insurance ended for ${p.typeLabel} in ${p.districtName}.`, kind: "info" }, ...state.log],
      };
    }
    case "ISSUE_BOND": {
      // Obligationsprogrammet styrs av kreditbetyget: bättre betyg ger
      // lägre kupong och ett större program (andel av eget kapital).
      if ((state.crisisMonthsLeft ?? 0) > 0)
        return log(state, "📜 The bond market is frozen during the crisis — no issues.", "warn");
      const info = creditRatingOf(state);
      if (info.bondCap <= 0)
        return log(state, `📜 Rating ${info.rating} closes the bond market — strengthen the balance sheet first.`, "warn");
      const outstanding = (state.bonds ?? []).reduce((a, b) => a + b.amount, 0);
      const room = info.bondCap - outstanding;
      if (room < 1_000_000)
        return log(state, `📜 The bond program is full (${msek(outstanding)} of ${msek(info.bondCap)} at rating ${info.rating}). Redeem or improve the rating.`, "warn");
      const amount = Math.min(action.amount, room);
      if (amount < 1_000_000) return log(state, "The minimum bond is $1M.", "warn");
      const rate = bondRateFor(state, info.rating);
      const matureAbs = state.year * 12 + state.month + action.years * 12;
      const newBond = { id: String(Date.now()), amount, rate, matureAbs };
      return {
        ...state,
        cash: state.cash + amount,
        bonds: [...(state.bonds ?? []), newBond],
        log: [{ t: `📜 Bond issue (rating ${info.rating}): ${msek(amount)} at ${rate.toFixed(2)}% coupon, ${action.years} yr. Program: ${msek(outstanding + amount)} of ${msek(info.bondCap)}.`, kind: "income" }, ...state.log],
      };
    }
    case "REPAY_BOND": {
      const bond = (state.bonds ?? []).find((b) => b.id === action.bondId);
      if (!bond) return state;
      if (state.cash < bond.amount) return log(state, `Insufficient cash. You need ${msek(bond.amount)}.`, "warn");
      return {
        ...state,
        cash: state.cash - bond.amount,
        bonds: (state.bonds ?? []).filter((b) => b.id !== action.bondId),
        log: [{ t: `🏦 Bond of ${msek(bond.amount)} repaid early.`, kind: "info" }, ...state.log],
      };
    }
    case "SALE_LEASEBACK": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status === "bygger") return log(state, "Kan inte sale-leaseback under byggnation.", "warn");
      const salePrice = Math.round(propMarketValue(p, state) * 1.0);
      const monthlyLease = Math.round(salePrice * 0.065 / 12);
      const payoff = Math.min(state.debt, (p.purchasePrice ?? salePrice) * 0.6);
      const lbTenant = { id: newId(), profile: "stat", name: "Original owner (SLB)", profileName: "Sale-leaseback", quality: 1.1, defaultRisk: 0.001, monthsLeft: 120, termTotal: 120, rent: monthlyLease };
      return {
        ...state,
        cash: state.cash + salePrice - payoff,
        debt: Math.max(0, state.debt - payoff),
        portfolio: state.portfolio.filter((x) => x.id !== action.id),
        listings: [...state.listings, { ...p, owned: false, askPrice: salePrice, tenants: [lbTenant], listedMonth: state.year * 12 + state.month, expiresMonth: state.year * 12 + state.month + 3, poolAskPrice: undefined, poolBaseRent: undefined }],
        pendingRenewals: dropRenewals(state, (r) => r.propertyId === p.id),
        log: [{ t: `🔄 Sale-leaseback: ${p.typeLabel} in ${p.districtName} sold for ${msek(salePrice)}, leased back at ${kr(monthlyLease)}/mo for 10 years.`, kind: "income" }, ...state.log],
      };
    }
    case "ACCEPT_COMPETING_BID": {
      // Budkrig: spelaren höjer 2 % över rivalens bud. Rivalen kan svara med
      // ett ännu högre motbud (nextBidRound) i upp till tre rundor innan de
      // ger sig – annars vinner spelaren direkt.
      const cb = state.competingBid;
      if (!cb) return state;
      const listing = state.listings.find((p) => p.id === cb.listingId);
      if (!listing) return { ...state, competingBid: undefined };
      const myBid = Math.round(cb.amount * 1.02);
      const { maxLtv } = loanTerms(state);
      const down = myBid * (1 - maxLtv);
      if (state.cash < down)
        return log(state, `You need ${msek(down)} as a down payment to raise the bid to ${msek(myBid)}.`, "warn");
      const round = cb.round ?? 1;
      const response = nextBidRound(myBid, round);
      if (!response.fold) {
        // Rivalen kontrar – budkriget eskalerar, spelaren betalar inget ännu.
        return {
          ...state,
          competingBid: { ...cb, amount: response.amount, round: round + 1, expiresAbs: state.year * 12 + state.month + 1 },
          log: [
            { t: `🔥 BIDDING WAR (round ${round + 1}): ${cb.rivalName} counters with ${msek(response.amount)} on ${listing.typeLabel} in ${listing.districtName}. Raise again or let go.`, kind: "warn" },
            ...state.log,
          ],
        };
      }
      // Rivalen ger sig – spelaren vinner till sitt bud.
      const loan = myBid - down;
      return {
        ...state,
        cash: state.cash - down,
        debt: state.debt + loan,
        reputation: Math.min(100, +(state.reputation + 0.4).toFixed(1)),
        portfolio: [...state.portfolio, { ...listing, owned: true, purchasePrice: myBid }],
        listings: state.listings.filter((p) => p.id !== listing.id),
        competingBid: undefined,
        log: [{ t: `✅ You won the bidding war! ${listing.typeLabel} in ${listing.districtName} bought for ${msek(myBid)} after ${round} ${round === 1 ? "round" : "rounds"}.${rivalQuote(cb.rivalName, "förlust", round) ? " " + rivalQuote(cb.rivalName, "förlust", round) : ""}`, kind: "buy", rival: cb.rivalName }, ...state.log],
      };
    }
    case "PASS_COMPETING_BID": {
      return { ...state, competingBid: undefined,
        log: [{ t: "Du valde att inte delta i budgivningen.", kind: "info" }, ...state.log] };
    }
    case "IMPROVE_ENERGY": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status !== "klar") return state;
      const CLASSES = ["F", "E", "D", "C", "B", "A"] as const;
      const curClass = (p.energyClass ?? "D") as (typeof CLASSES)[number];
      const curIdx = CLASSES.indexOf(curClass);
      if (curIdx >= 5) return log(state, "The property already has energy class A — the maximum possible.", "warn");
      if (pendingWork(p, "energi")) return state;
      const COSTS: Record<string, number> = { F: 80_000, E: 120_000, D: 180_000, C: 250_000, B: 350_000 };
      const cost = COSTS[curClass] ?? 150_000;
      if (state.cash < cost)
        return log(state, `Energiuppgradering till klass ${CLASSES[curIdx + 1]} kostar ${kr(cost)}.`, "warn");
      const nextClass = CLASSES[curIdx + 1];
      return {
        ...state,
        cash: state.cash - cost,
        portfolio: state.portfolio.map((x) =>
          x.id === action.id
            ? {
                ...x,
                capexTotal: (x.capexTotal ?? 0) + cost,
                pendingWorks: [...(x.pendingWorks ?? []), { kind: "energi" as const, monthsLeft: 1 }],
              }
            : x,
        ),
        log: [{ t: `⚡ Energy upgrade ordered: ${p.typeLabel} in ${p.districtName} → class ${nextClass} (−${kr(cost)}) – done at month-end.`, kind: "upg" }, ...state.log],
      };
    }
    case "NEGOTIATE_RENEWAL": {
      const { propertyId, tenantId } = action;
      const prop = state.portfolio.find((x) => x.id === propertyId);
      const renewal = (state.pendingRenewals ?? []).find(
        (r) => r.propertyId === propertyId && r.tenantId === tenantId,
      );
      if (!prop || !renewal) return state;
      const remaining = (state.pendingRenewals ?? []).filter(
        (r) => !(r.propertyId === propertyId && r.tenantId === tenantId),
      );
      if (action.action === "evict") {
        return {
          ...state,
          pendingRenewals: remaining,
          portfolio: state.portfolio.map((p) =>
            p.id === propertyId ? { ...p, tenants: p.tenants.filter((t) => t.id !== tenantId) } : p,
          ),
          log: [{ t: `🚪 Avhyste ${renewal.tenantName} i ${renewal.districtName}.`, kind: "info" }, ...state.log],
        };
      }
      const mult = action.action === "raise" ? 1.10 : action.action === "lower" ? 0.90 : 1.0;
      const newRent = Math.round(renewal.currentRent * mult);
      const label = action.action === "raise" ? "+10%" : action.action === "lower" ? "−10%" : "unchanged";
      return {
        ...state,
        pendingRenewals: remaining,
        portfolio: state.portfolio.map((p) =>
          p.id === propertyId
            ? { ...p, tenants: p.tenants.map((t) => t.id === tenantId ? { ...t, rent: newRent, monthsLeft: renewal.termTotal } : t) }
            : p,
        ),
        log: [{ t: `📄 Lease renewed with ${renewal.tenantName} in ${renewal.districtName}: ${kr(newRent)}/mo (${label}).`, kind: "income" }, ...state.log],
      };
    }
    case "DISMISS_TUTORIAL": {
      return { ...state, tutorialDismissed: true };
    }
    case "SET_RATE_MODE": {
      if (action.mode === "fixed") {
        const { rate } = loanTerms(state);
        const months = Math.max(12, Math.min(60, action.months ?? 36));
        const nowAbs = state.year * 12 + state.month;
        const fee = Math.round(state.debt * 0.005);
        if (state.cash < fee)
          return log(state, `A fixed rate requires ${kr(fee)} in a setup fee.`, "warn");
        return {
          ...state,
          cash: state.cash - fee,
          rateMode: "fixed",
          fixedRate: rate,
          fixedUntilAbs: nowAbs + months,
          log: [{ t: `🔒 Fixed rate ${rate}% locked for ${months} months (fee ${kr(fee)}).`, kind: "info" }, ...state.log],
        };
      }
      return { ...state, rateMode: "variable", fixedRate: undefined, fixedUntilAbs: undefined,
        log: [{ t: "Switched to a variable rate.", kind: "info" }, ...state.log] };
    }
    case "DRAW_REVOLVING": {
      const rev = state.revolving;
      if (!rev) return log(state, "Ingen revolverande kredit aktiv.", "warn");
      const avail = rev.limit - rev.used;
      const amt = Math.min(action.amount, avail);
      if (amt <= 0) return log(state, "The credit limit has been reached.", "warn");
      return {
        ...state,
        cash: state.cash + amt,
        revolving: { ...rev, used: rev.used + amt },
        log: [{ t: `Utnyttjat ${kr(amt)} ur revolverande kredit.`, kind: "info" }, ...state.log],
      };
    }
    case "REPAY_REVOLVING": {
      const rev = state.revolving;
      if (!rev || rev.used <= 0) return log(state, "Nothing to repay.", "warn");
      const amt = Math.min(action.amount, rev.used, state.cash);
      if (amt <= 0) return log(state, "Not enough cash for repayment.", "warn");
      return {
        ...state,
        cash: state.cash - amt,
        revolving: { ...rev, used: Math.max(0, rev.used - amt) },
        log: [{ t: `Repaid ${kr(amt)} on revolving credit.`, kind: "info" }, ...state.log],
      };
    }
    case "PAY_DIVIDEND": {
      const amt = Math.min(action.amount, state.cash);
      if (amt <= 100000) return log(state, "The minimum dividend is $100,000.", "warn");
      // Utdelningen betalas PER AKTIE: efter noteringen får ägaren sin
      // röstandel av beloppet – resten går till marknadens aktieägare
      // (och blidkar aktivistfonden, dividendRelief). Onoterat: allt.
      const relief = dividendRelief(amt, equityOf(state));
      const ownerPct =
        state.ipoActive && state.ipoShares
          ? (state.ipoShares.total - state.ipoShares.public) / state.ipoShares.total
          : 1;
      const ownerCut = Math.round(amt * ownerPct);
      // Rivalägare (korsägandet) får sin andel av utdelningen kontant.
      const total = state.ipoShares?.total ?? 0;
      const competitors =
        state.ipoActive && total > 0
          ? state.competitors.map((c) => {
              const held = fbabSharesOf(c);
              return held > 0 ? { ...c, cash: c.cash + Math.round((amt * held) / total) } : c;
            })
          : state.competitors;
      return {
        ...state,
        cash: state.cash - amt,
        competitors,
        dividendsPaid: (state.dividendsPaid ?? 0) + amt,
        ownerWealth: (state.ownerWealth ?? 0) + ownerCut,
        takeoverPressure: Math.max(0, (state.takeoverPressure ?? 0) - relief),
        log: [{
          t: `💰 Dividend: ${msek(amt)} paid out${ownerPct < 1 ? ` — ${msek(ownerCut)} to you (${Math.round(ownerPct * 100)}% of the shares)` : " to the owner"}${relief >= 1 ? ` – the activist fund is calmed (−${Math.round(relief)} bp)` : ""}.`,
          kind: "income",
        }, ...state.log],
      };
    }
    case "BUY_OWN_SHARES": {
      // Ägaren köper aktier i sitt EGET bolag privat – med utdelade pengar
      // (ownerWealth), inte bolagets kassa. Aktierna lämnar floaten och
      // stärker röstandelen mot aktivisten. Börsens spridningskrav (≥10 %
      // float) och aktivistens innehav begränsar hur mycket som finns att köpa.
      if (!state.ipoActive || !state.ipoShares) return log(state, "The company is not listed.", "warn");
      const wealth = state.ownerWealth ?? 0;
      const { total, public: pub } = state.ipoShares;
      const fbab = state.stocks.find((st) => st.id === "FBAB");
      const price = Math.max(0.01, (fbab?.price ?? equityOf(state) / total) * 1.003); // courtage
      const activistShares = Math.round((total * (state.takeoverPressure ?? 0)) / 100);
      const rivalShares = rivalFbabShares(state);
      const maxShares = Math.min(
        Math.max(0, pub - activistShares - rivalShares), // bara fria floaten är till salu
        Math.max(0, pub - Math.ceil(total * 0.1)),       // spridningskravet
      );
      const shares = Math.min(Math.floor(Math.min(action.amount, wealth) / price), maxShares);
      if (shares <= 0)
        return log(state, "Private purchase not possible: too little owner wealth, or no free float above the exchange's 10% requirement.", "warn");
      const cost = Math.round(shares * price);
      const newPub = pub - shares;
      const ownedPct = Math.round(((total - newPub) / total) * 100);
      return {
        ...state,
        ownerWealth: wealth - cost,
        ownerShares: (state.ownerShares ?? 0) + shares,
        ipoShares: { total, public: newPub },
        log: [{
          t: `👤 Private share purchase: ${(shares / 1e6).toFixed(2)}M shares for ${msek(cost)} from your own wallet. Your voting control rises to ${ownedPct}%.`,
          kind: "income",
        }, ...state.log],
      };
    }
    case "SELL_OWN_SHARES": {
      // Ägaren säljer privata aktier tillbaka till marknaden (0,3 % courtage).
      // Pengarna landar i plånboken – men aktierna återgår till floaten och
      // ger aktivisten mer att bygga position i. Kontroll mot likviditet.
      if (!state.ipoActive || !state.ipoShares) return log(state, "The company is not listed.", "warn");
      const held = state.ownerShares ?? 0;
      if (held <= 0) return log(state, "You hold no private shares to sell.", "warn");
      const { total, public: pub } = state.ipoShares;
      const fbab = state.stocks.find((st) => st.id === "FBAB");
      const price = Math.max(0.01, (fbab?.price ?? equityOf(state) / total) * 0.997);
      // Belopp ≥ hela innehavets värde ⇒ sälj allt (flyttalssäkert).
      const shares =
        action.amount >= held * price ? held : Math.min(Math.floor(action.amount / price), held);
      if (shares <= 0) return log(state, "The amount is too small for a share sale.", "warn");
      const proceeds = Math.round(shares * price);
      const newPub = pub + shares;
      const ownedPct = Math.round(((total - newPub) / total) * 100);
      return {
        ...state,
        ownerWealth: (state.ownerWealth ?? 0) + proceeds,
        ownerShares: held - shares,
        ipoShares: { total, public: newPub },
        log: [{
          t: `👤 Private share sale: ${(shares / 1e6).toFixed(2)}M shares sold for ${msek(proceeds)}. Your voting control falls to ${ownedPct}% — the free float grows.`,
          kind: "info",
        }, ...state.log],
      };
    }
    case "OWNER_INJECTION": {
      // Ägartillskott: privata pengar in i bolaget. Noterat sker det som en
      // RIKTAD EMISSION till ägaren på marknadskurs – kassan fylls, din
      // röstandel stärks och aktivistens procent späds ut mekaniskt.
      // Onoterat: rent tillskott till kassan.
      const wealth = state.ownerWealth ?? 0;
      const amt = Math.min(action.amount, wealth);
      if (amt < 100_000) return log(state, "The minimum owner injection is $100,000.", "warn");
      if (state.ipoActive && state.ipoShares) {
        const { total, public: pub } = state.ipoShares;
        const fbab = state.stocks.find((st) => st.id === "FBAB");
        const price = Math.max(0.01, fbab?.price ?? equityOf(state) / total);
        const newShares = Math.round(amt / price);
        const newTotal = total + newShares;
        const stakeAfter = ((state.takeoverPressure ?? 0) * total) / newTotal;
        const ownedPct = Math.round(((newTotal - pub) / newTotal) * 100);
        return {
          ...state,
          cash: state.cash + amt,
          ownerWealth: wealth - amt,
          ownerShares: (state.ownerShares ?? 0) + newShares,
          ipoShares: { total: newTotal, public: pub },
          takeoverPressure: +stakeAfter.toFixed(2),
          stocks: state.stocks.map((st) =>
            st.id === "FBAB" ? { ...st, sharesOutstanding: newTotal } : st,
          ),
          log: [{
            t: `💼 Owner injection: ${msek(amt)} of private wealth becomes company capital via a directed share issue. Your voting control rises to ${ownedPct}%.`,
            kind: "income",
          }, ...state.log],
        };
      }
      return {
        ...state,
        cash: state.cash + amt,
        ownerWealth: wealth - amt,
        log: [{
          t: `💼 Owner injection: ${msek(amt)} of private wealth added to the company's cash.`,
          kind: "income",
        }, ...state.log],
      };
    }
    case "START_MEGA": {
      // Megaprojekt är LANDMÄRKEN med fasta platser i stadens omland –
      // de kräver inte längre ett helägt kvarter, utan stadens förtroende
      // (rykte) och ett etablerat bolag. Prestige – inte avkastning.
      const proj = MEGA_PROJECTS.find((m) => m.id === action.projectId);
      if (!proj) return state;
      if ((state.megaCompleted ?? []).includes(proj.id) || (state.megaActive ?? []).some((m) => m.projectId === proj.id))
        return log(state, `${proj.name} is already ${state.megaCompleted?.includes(proj.id) ? "built" : "under construction"}.`, "info");
      if ((state.companyLevel ?? 1) < 4)
        return log(state, "Megaprojects require an established company (level 4).", "warn");
      if (state.reputation < 60)
        return log(state, `The city only entrusts megaprojects to players with a good reputation (60+, you have ${Math.round(state.reputation)}).`, "warn");
      if (state.cash < proj.cost)
        return log(state, `${proj.name} costs ${msek(proj.cost)} — insufficient cash.`, "warn");
      return {
        ...state,
        cash: state.cash - proj.cost,
        megaActive: [
          ...(state.megaActive ?? []),
          { projectId: proj.id, blockId: "", district: proj.site.district, monthsLeft: proj.months, totalMonths: proj.months },
        ],
        reputation: Math.min(100, state.reputation + 2),
        log: [
          { t: `${proj.icon} MEGAPROJECT: ${proj.name} breaks ground (${msek(proj.cost)}, done in ~${proj.months} mo). The city is amazed.`, kind: "event" },
          ...state.log,
        ],
      };
    }
    case "START_CITY_PROJECT": {
      // Stadsdelsprojekt: riv ett HELÄGT kvarter och bygg ett signaturkvarter.
      // Kvarterets fastigheter försvinner ur portföljen (rivs), hyrorna tystnar
      // under byggåren och kassan töms – slutspelets kapitalsänka.
      const profile = cityProfileById(action.profile);
      if (!profile) return state;
      const info = blockInfo(action.blockId);
      if (!info) return log(state, "A district project requires a closed block with several lots (the stone city).", "warn");
      if ((state.companyLevel ?? 1) < CITY_PROJECT_MIN_LEVEL)
        return log(state, `The city only allows block builds for established companies (company level ${CITY_PROJECT_MIN_LEVEL}).`, "warn");
      if (!eligibleCityBlocks(state, fullyOwnedBlocks(state)).includes(action.blockId))
        return log(state, "The block isn't wholly owned or is already used by a project.", "warn");
      const cost = cityProjectCost(action.blockId, profile, state);
      if (state.cash < cost)
        return log(state, `${profile.name} on the block costs ${msek(cost)} — insufficient cash.`, "warn");
      const blockParcelIds = new Set(info.parcels.map((p) => p.id));
      const demolished = state.portfolio.filter((p) => p.parcelId && blockParcelIds.has(p.parcelId));
      const demolishedIds = new Set(demolished.map((p) => p.id));
      return {
        ...state,
        cash: state.cash - cost,
        portfolio: state.portfolio.filter((p) => !demolishedIds.has(p.id)),
        lots: state.lots.filter((l) => !(l.owned && l.parcelId && blockParcelIds.has(l.parcelId))),
        // Rivna hus: utestående bud, säljuppdrag och förhandlingar är inaktuella.
        offers: (state.offers ?? []).filter(
          (o) => !demolishedIds.has(o.propId) && !(o.propertyIds ?? []).some((id) => demolishedIds.has(id)),
        ),
        salePackages: (state.salePackages ?? []).filter(
          (pk) => !pk.propertyIds.some((id) => demolishedIds.has(id)),
        ),
        pendingRenewals: (state.pendingRenewals ?? []).filter((r) => !demolishedIds.has(r.propertyId)),
        cityProjects: [
          ...(state.cityProjects ?? []),
          {
            blockId: action.blockId,
            profile: profile.id,
            district: info.district,
            monthsLeft: profile.months,
            totalMonths: profile.months,
            cost,
          },
        ],
        reputation: Math.min(100, state.reputation + 2),
        log: [
          {
            t: `${profile.icon} DISTRICT PROJECT: ${profile.name} breaks ground in ${blockDistrictName(action.blockId)} — ${demolished.length} buildings demolished, ${msek(cost)} invested, done in ~${profile.months} mo. The city has never seen anything like it.`,
            kind: "event",
          },
          ...state.log,
        ],
      };
    }
    case "BUY_LUXURY": {
      // Ägarens privata pengar (utdelningar) – inte bolagets kassa.
      const lux = LUXURIES.find((l) => l.id === action.luxuryId);
      if (!lux) return state;
      if ((state.ownerLuxuries ?? []).includes(lux.id))
        return log(state, `${lux.name} is already owned.`, "info");
      if ((state.ownerWealth ?? 0) < lux.cost)
        return log(state, `${lux.name} costs ${msek(lux.cost)} — pay more profit to the owner first.`, "warn");
      return {
        ...state,
        ownerWealth: (state.ownerWealth ?? 0) - lux.cost,
        ownerLuxuries: [...(state.ownerLuxuries ?? []), lux.id],
        reputation: Math.min(100, state.reputation + (lux.reputation ?? 0)),
        log: [{ t: `${lux.icon} ${lux.name} — ${lux.desc}`, kind: "event" }, ...state.log],
      };
    }
    case "BUY_PR": {
      // Köp en välvillig artikel / annons: bolagets kassa mot ryktesvinst.
      // Kostnaden skalar med bolagets storlek (större koncern → dyrare
      // kampanj) och en cooldown hindrar att ryktet köps upp på nolltid.
      const level = state.companyLevel ?? 1;
      const cost = Math.round(250_000 * level);
      const COOLDOWN = 6;
      const abs = state.year * 12 + state.month;
      if (state.lastPrMonth != null && abs - state.lastPrMonth < COOLDOWN) {
        const wait = COOLDOWN - (abs - state.lastPrMonth);
        return log(state, `The press was courted only recently — a fresh campaign lands flat for another ${wait} month${wait === 1 ? "" : "s"}.`, "warn");
      }
      if (state.cash < cost)
        return log(state, `A press campaign costs ${msek(cost)} — the account is short.`, "warn");
      return {
        ...state,
        cash: state.cash - cost,
        reputation: Math.min(100, state.reputation + 4),
        lastPrMonth: abs,
        // En kampanj dämpar också en pågående mediestorm och bygger goodwill i stan.
        pressHeat: Math.max(0, (state.pressHeat ?? 0) - 2),
        standing: adjustStanding(state.standing, { kind: "city" }, 2),
        log: [
          { t: `📰 Commissioned a flattering feature in The Property Post — reputation +4 (${msek(cost)}).`, kind: "event" },
          ...state.log,
        ],
      };
    }
    case "BUY_AMBIENT": {
      // Off market-affär: ett privatägt hus (dekorbebyggelse) köps loss
      // och blir en riktig fastighet i portföljen – beståndet VÄXER,
      // inga hus ersätts. Ägaren säljer mot premie (se landDeals.ts).
      const parcel = parcelById(action.parcelId);
      if (!parcel) return state;
      if (districtLocked(state, parcel.district)) return log(state, "🔒 The area is locked – the story opens the city chapter by chapter. Continue the campaign to open it.", "warn");
      const grown = new Set(state.ambientGrown ?? []);
      if (!hasAmbientBuilding(parcel, grown))
        return log(state, "The lot bears no privately owned building.", "warn");
      if (occupiedParcelIds(state).has(parcel.id))
        return log(state, "The property is already owned by a company.", "warn");
      const deal = ambientAsk(parcel, state);
      const prof = ambientProfile(parcel);
      const { maxLtv } = loanTerms(state);
      const down = deal.ask * (1 - maxLtv);
      if (state.cash < down)
        return log(state, `The owner asks ${msek(deal.ask)} — down payment ${msek(down)} is missing.`, "warn");
      const loan = deal.ask - down;
      const d = DISTRICTS.find((x) => x.id === parcel.district)!;
      // Hyran räknas på substansvärdet (utan områdespremie), likt marknadsobjekt.
      const annualRent = ambientValue(parcel, state) * PROP_TYPES[prof.type].rentFactor * 12 * (0.7 + (prof.condition / 100) * 0.5);
      const capacity = calcCapacity(prof.area);
      const prop: Property = {
        id: newId(),
        district: parcel.district,
        districtName: d.name,
        type: prof.type,
        typeLabel: prof.typeLabel,
        area: prof.area,
        condition: prof.condition,
        askPrice: deal.ask,
        purchasePrice: deal.ask,
        baseRent: Math.round(annualRent),
        upgrades: [],
        owned: true,
        rentMult: 1,
        opexMult: 1,
        vacancyMult: 1,
        valueMult: 1,
        // Bebott hus: hyresgästerna följer med köpet.
        tenants: Array.from({ length: Math.max(1, Math.floor(capacity / 2)) }, () =>
          makeTenant(Math.round(annualRent) / capacity, state.demandMod, prof.condition),
        ),
        capacity,
        status: "klar",
        buildLeft: 0,
        parcelId: parcel.id,
        energyClass: energyClassFor(prof.condition),
        builtYear: builtYearFor(prof.condition, state.year),
        txHistory: [{ type: "bought", price: deal.ask, month: state.month, year: state.year, party: "Private owner" }],
      };
      return {
        ...state,
        cash: state.cash - down,
        debt: state.debt + loan,
        portfolio: [...state.portfolio, prop],
        log: [
          {
            t: `🤝 OFF MARKET: Bought ${prof.typeLabel.toLowerCase()} in ${d.name} from a private owner for ${msek(deal.ask)} (${Math.round((deal.premium - 1) * 100)}% over value${deal.holdout ? " – a real holdout" : ""}).`,
            kind: "buy",
          },
          ...state.log,
        ],
      };
    }
    case "BUY_RAW_LAND": {
      // Råmark i ett planområde – billig, men obyggbar tills en egen
      // detaljplan drivits genom planprocessen (START_PLAN).
      const def = expansionByBlock(action.blockId);
      if (!def || def.kind !== "plan") return state;
      if ((state.unlockedBlocks ?? []).includes(def.blockId))
        return log(state, "The area is already zoned.", "info");
      if ((state.ownedPlanAreas ?? []).includes(def.blockId))
        return log(state, "You already own the raw land.", "info");
      const price = rawLandPrice(def.blockId, state);
      if (state.cash < price)
        return log(state, `The raw land costs ${msek(price)} — insufficient cash (raw land can't be leveraged).`, "warn");
      return {
        ...state,
        cash: state.cash - price,
        ownedPlanAreas: [...(state.ownedPlanAreas ?? []), def.blockId],
        log: [
          { t: `🌾 Bought the raw land at ${DISTRICTS.find((x) => x.id === def.district)?.name} for ${msek(price)}. Start a zoning plan to make it buildable.`, kind: "buy" },
          ...state.log,
        ],
      };
    }
    case "START_PLAN": {
      const def = expansionByBlock(action.blockId);
      if (!def || def.kind !== "plan") return state;
      if (!(state.ownedPlanAreas ?? []).includes(def.blockId))
        return log(state, "Buy the raw land first.", "warn");
      if ((state.planProcesses ?? []).some((p) => p.blockId === def.blockId))
        return log(state, "The plan process is already in progress.", "info");
      const fee = planFee(def.blockId);
      if (state.cash < fee)
        return log(state, `The plan fee and studies cost ${msek(fee)} — insufficient cash.`, "warn");
      const proc = newPlanProcess(def.blockId, state);
      return {
        ...state,
        cash: state.cash - fee,
        planProcesses: [...(state.planProcesses ?? []), proc],
        log: [
          {
            t: `📋 ZONING PLAN STARTED: Plan application for ${proc.districtName} submitted (${msek(fee)}). Consultation begins — done in ~${proc.totalMonths} mo if all goes well.`,
            kind: "event",
          },
          ...state.log,
        ],
      };
    }
    case "TOGGLE_SHORT_TERM": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.type !== "bostad") return log(state, "Short-term rentals are only possible for residential properties.", "warn");
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
            ? `🏖️ ${p.typeLabel} in ${p.districtName} switched to short-term rental (+30% rent, +60% vacancy).`
            : `🏠 ${p.typeLabel} i ${p.districtName} tillbaka till ordinarie uthyrning.`,
          kind: "info",
        }, ...state.log],
      };
    }
    case "APPLY_ZONE_CHANGE": {
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status === "bygger") return log(state, "Kan ej omklassa fastighet under byggnation.", "warn");
      if (p.pendingZoneChange) return log(state, "Rezoning is already in progress.", "warn");
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
          t: `📋 Rezoning of ${p.typeLabel} in ${p.districtName} → ${action.targetType} started (${months} months, ${kr(cost)}).`,
          kind: "upg",
        }, ...state.log],
      };
    }
    case "INVEST_DISTRICT": {
      const amount = Math.max(500_000, Math.min(action.amount, state.cash));
      if (state.cash < amount) return log(state, "Not enough cash.", "warn");
      // Områdessatsningen får effekt när den STÅR KLAR (6–9 mån) och i rimlig
      // proportion: +1 % områdesutveckling per 25 Msek, max +5 % per satsning.
      // Tidigare gav 10 Msek +10 % OMEDELBART – den som ägde mycket i
      // distriktet köpte sig ett mångdubbelt värdelyft i ett klick.
      const boost = Math.min(0.05, +((amount / 2_500_000_000)).toFixed(4));
      const d = DISTRICTS.find((x) => x.id === action.districtId);
      const months = 6 + Math.round(boost * 60);
      return {
        ...state,
        cash: state.cash - amount,
        infraProjects: [
          ...(state.infraProjects ?? []),
          {
            id: newId(),
            name: "Private area investment",
            district: action.districtId,
            districtName: d?.name ?? action.districtId,
            monthsLeft: months,
            totalMonths: months,
            boost,
          },
        ],
        log: [{
          t: `🏗 Area investment in ${d?.name ?? action.districtId}: ${msek(amount)} invested – area development +${(boost * 100).toFixed(1)}% when it's complete in ~${months} mo.`,
          kind: "upg",
        }, ...state.log],
      };
    }
    case "DO_IPO": {
      if (state.ipoActive) return log(state, "The company is already listed.", "warn");
      const portVal = state.portfolio.reduce((a, p) => a + propMarketValue(p, state), 0);
      if (portVal < 5_000_000) return log(state, "The portfolio value is too low for a stock listing.", "warn");
      // Floaten är ETT VAL: liten spridning skyddar kontrollen men reser
      // mindre kapital; stor spridning fyller kassan men släpper in
      // aktivisten på riktigt (passerar den din andel tas bolaget över).
      const float = Math.min(0.65, Math.max(0.1, action.float ?? 0.3));
      const TOTAL_SHARES = 10_000_000;
      const publicShares = Math.round(TOTAL_SHARES * float);
      const sharePrice = Math.max(0.01, equityOf(state) / TOTAL_SHARES);
      // Emissionslikvid: sålda aktier × kurs, minus 4 % i noteringsavgifter.
      const raised = Math.round(sharePrice * publicShares * 0.96);
      if (raised < 1_000_000) return log(state, "The portfolio value is too low for a stock listing.", "warn");
      const playerStock: Stock = {
        id: "FBAB",
        name: "Property Corp (your company)",
        sector: "fastighet",
        price: sharePrice,
        prevPrice: sharePrice,
        sharesOutstanding: TOTAL_SHARES,
        owned: 0,
        avgCost: 0,
        dividendYield: 0.025,
        beta: 1.2,
        drift: 0.001,
        volatility: 0.045,
        history: [sharePrice],
        competitorName: "__player__",
      };
      const floatPct = Math.round(float * 100);
      return {
        ...state,
        cash: state.cash + raised,
        ipoActive: true,
        ipoShares: { total: TOTAL_SHARES, public: publicShares },
        ipoPrice: sharePrice,
        takeoverPressure: 0,
        reputation: Math.min(100, state.reputation + 10),
        stocks: state.stocks.some((s) => s.id === "FBAB")
          ? state.stocks
          : [...state.stocks, playerStock],
        log: [{
          t: `🎉 IPO completed! ${msek(raised)} raised at $${sharePrice.toFixed(2)}/share. Float ${floatPct}% (${(publicShares / 1e6).toFixed(1)}M of 10M shares) — you retain ${100 - floatPct}%. Reputation +10.`,
          kind: "income",
        }, ...state.log],
      };
    }
    case "SHARE_ISSUE": {
      // Nyemission: nya aktier säljs till marknaden med 5 % rabatt.
      // Kassan fylls – men din ägarandel späds ut och floaten växer,
      // vilket ger aktivisten mer att bygga position i.
      if (!state.ipoActive || !state.ipoShares) return log(state, "The company is not listed.", "warn");
      const pct = Math.min(0.25, Math.max(0.05, action.pct));
      const { total, public: pub } = state.ipoShares;
      const fbab = state.stocks.find((st) => st.id === "FBAB");
      const price = Math.max(0.01, (fbab?.price ?? equityOf(state) / total) * 0.95);
      const newShares = Math.round(total * pct);
      const proceeds = Math.round(newShares * price);
      const newTotal = total + newShares;
      const ownedBefore = Math.round(((total - pub) / total) * 100);
      const ownedAfter = Math.round(((total - pub) / newTotal) * 100);
      // Aktivistens ANDEL i % späds ut mekaniskt (samma aktier, fler totalt).
      const stakeAfter = ((state.takeoverPressure ?? 0) * total) / newTotal;
      return {
        ...state,
        cash: state.cash + proceeds,
        ipoShares: { total: newTotal, public: pub + newShares },
        takeoverPressure: +stakeAfter.toFixed(2),
        stocks: state.stocks.map((st) =>
          st.id === "FBAB" ? { ...st, sharesOutstanding: newTotal } : st,
        ),
        log: [{
          t: `📜 Share issue: ${(newShares / 1e6).toFixed(1)}M new shares at $${price.toFixed(2)} raise ${msek(proceeds)}. Your stake is diluted ${ownedBefore}% → ${ownedAfter}%.`,
          kind: "income",
        }, ...state.log],
      };
    }
    case "SHARE_BUYBACK": {
      // Återköp: aktier köps i marknaden (3 % premie) och makuleras.
      // Din andel stärks och aktivistens position pressas ut proportionellt –
      // men börsens spridningskrav stoppar återköp under 10 % float.
      if (!state.ipoActive || !state.ipoShares) return log(state, "The company is not listed.", "warn");
      const { total, public: pub } = state.ipoShares;
      const fbab = state.stocks.find((st) => st.id === "FBAB");
      const price = Math.max(0.01, (fbab?.price ?? equityOf(state) / total) * 1.03);
      const maxByFloat = Math.max(0, Math.floor((pub - 0.1 * total) / 0.9));
      const shares = Math.min(Math.floor(Math.min(action.amount, state.cash) / price), maxByFloat);
      if (shares <= 0)
        return log(state, "Buyback not possible: the exchange requires at least 10% free float (or the amount is too small).", "warn");
      const cost = Math.round(shares * price);
      const stakeShares = Math.round((total * (state.takeoverPressure ?? 0)) / 100);
      const boughtFromActivist = pub > 0 ? (shares * stakeShares) / pub : 0;
      const newTotal = total - shares;
      const stakeAfter = Math.max(0, ((stakeShares - boughtFromActivist) / newTotal) * 100);
      const ownedAfter = Math.round(((newTotal - (pub - shares)) / newTotal) * 100);
      // Rivalägare (korsägandet) säljer sin proportionella del och får betalt.
      const competitors = state.competitors.map((c) => {
        const held = fbabSharesOf(c);
        if (held <= 0 || pub <= 0) return c;
        const sold = Math.round((shares * held) / pub);
        if (sold <= 0) return c;
        return {
          ...c,
          cash: c.cash + Math.round(sold * price),
          stockHoldings: (c.stockHoldings ?? [])
            .map((h) => (h.stockId === "FBAB" ? { ...h, shares: h.shares - sold } : h))
            .filter((h) => h.shares > 0),
        };
      });
      return {
        ...state,
        cash: state.cash - cost,
        competitors,
        ipoShares: { total: newTotal, public: pub - shares },
        takeoverPressure: +stakeAfter.toFixed(2),
        stocks: state.stocks.map((st) =>
          st.id === "FBAB" ? { ...st, sharesOutstanding: newTotal } : st,
        ),
        log: [{
          t: `🔁 Buyback: ${(shares / 1e6).toFixed(2)}M shares repurchased and retired for ${msek(cost)}. Your stake rises to ${ownedAfter}%${boughtFromActivist > 0 ? " and the activist position shrinks" : ""}.`,
          kind: "income",
        }, ...state.log],
      };
    }
    case "MARKET_ORDER": {
      const st = state.stocks.find((s) => s.id === action.stockId);
      if (!st) return state;
      if (st.competitorName === "__player__")
        return log(state, "Own-company shares are bought privately with owner wealth — see Company → Group.", "warn");
      const COURTAGE = 0.003;
      if (action.side === "buy") {
        const cost = Math.round(st.price * action.qty * (1 + COURTAGE));
        if (state.cash < cost) return log(state, "Not enough capital for the purchase.", "warn");
        const newOwned = st.owned + action.qty;
        const newAvg = (st.avgCost * st.owned + st.price * action.qty) / newOwned;
        return {
          ...state,
          cash: state.cash - cost,
          stocks: state.stocks.map((s) =>
            s.id === action.stockId ? { ...s, owned: newOwned, avgCost: newAvg } : s,
          ),
          log: [{ t: `📈 Market order: bought ${action.qty} shares in ${st.name} @ $${st.price.toFixed(2)}. Total ${kr(cost)}.`, kind: "income" }, ...state.log],
        };
      } else {
        if (st.owned < action.qty) return log(state, "Not enough shares to sell.", "warn");
        const proceeds = Math.round(st.price * action.qty * (1 - COURTAGE));
        return {
          ...state,
          cash: state.cash + proceeds,
          stocks: state.stocks.map((s) =>
            s.id === action.stockId ? { ...s, owned: s.owned - action.qty } : s,
          ),
          log: [{ t: `📉 Market order: sold ${action.qty} shares in ${st.name} @ $${st.price.toFixed(2)}. Received ${kr(proceeds)}.`, kind: "expense" }, ...state.log],
        };
      }
    }
    case "SHORT_STOCK": {
      const st = state.stocks.find((s) => s.id === action.stockId);
      if (!st) return state;
      if (st.competitorName === "__player__") return log(state, "Kan inte blanka ditt eget bolag.", "warn");
      if (action.qty <= 0) return state;
      const collateral = Math.round(st.price * action.qty * 1.5); // 150% marginal
      if (state.cash < collateral) return log(state, `Insufficient capital for short selling. Requires ${kr(collateral)} (150% margin).`, "warn");
      const existingShort = st.shortQty ?? 0;
      const existingAvg = st.shortAvgPrice ?? st.price;
      const newQty = existingShort + action.qty;
      const newAvg = (existingShort * existingAvg + action.qty * st.price) / newQty;
      return {
        ...state,
        cash: state.cash - collateral,
        stocks: state.stocks.map((s) =>
          s.id === action.stockId
            ? { ...s, shortQty: newQty, shortAvgPrice: Math.round(newAvg * 100) / 100 }
            : s,
        ),
        log: [{ t: `📉 Short sale: Sold ${action.qty} shares in ${st.name} short @ ${kr(st.price)}. Margin: ${kr(collateral)}.`, kind: "warn" }, ...state.log],
      };
    }
    case "COVER_SHORT": {
      const st = state.stocks.find((s) => s.id === action.stockId);
      if (!st || !(st.shortQty ?? 0)) return log(state, "No short position to cover.", "warn");
      const qty = st.shortQty!;
      const avgShortPrice = st.shortAvgPrice ?? st.price;
      const pnl = Math.round(qty * (avgShortPrice - st.price)); // positive if price fell
      const collateral = Math.round(avgShortPrice * qty * 1.5);
      const received = collateral + pnl; // get collateral back + gain (or - loss)
      return {
        ...state,
        cash: state.cash + Math.max(0, received),
        stocks: state.stocks.map((s) =>
          s.id === action.stockId
            ? { ...s, shortQty: 0, shortAvgPrice: 0 }
            : s,
        ),
        log: [{
          t: `✅ Covered short in ${st.name}: ${qty} shares @ ${kr(st.price)} (avg ${kr(avgShortPrice)}). Result: ${pnl >= 0 ? "+" : ""}${kr(pnl)}.`,
          kind: pnl >= 0 ? "income" : "expense",
        }, ...state.log],
      };
    }
    // ── Industrisektorer ─────────────────────────────────────────────────────

    case "BUY_INDUSTRY_FROM_RIVAL": {
      // Direktköp av en rivals industri – samma logik som OFFER_TO_RIVAL:
      // rejäl premie krävs, annars tackar ägaren nej.
      const comp = state.competitors.find((c) => c.name === action.competitorName);
      const asset = (comp?.industries ?? []).find((a) => a.id === action.industryId);
      if (!comp || !asset) return state;
      const ref = industryAssetValue(asset, state);
      if (state.cash < action.amount)
        return log(state, `Industry purchases are paid in cash – you need ${msek(action.amount)}.`, "warn");
      const ratio = action.amount / Math.max(1, ref);
      const accepted = ratio >= 1.25 || (ratio >= 1.1 && random01() < 0.7);
      if (!accepted)
        return log(state, `${comp.name} declined your bid on ${asset.name} (${msek(action.amount)}). Bid at least 125% of value (${msek(Math.round(ref * 1.25))}) for a guaranteed answer.`, "warn");
      const bought: IndustryAsset = {
        ...asset,
        txHistory: [{ type: "bought", price: action.amount, month: state.month, year: state.year, party: comp.name }, ...(asset.txHistory ?? [])],
        purchasePrice: action.amount,
      };
      return {
        ...state,
        cash: state.cash - action.amount,
        industryPortfolio: [...(state.industryPortfolio ?? []), bought],
        competitors: state.competitors.map((c) =>
          c.name === comp.name
            ? { ...c, cash: c.cash + action.amount, industries: (c.industries ?? []).filter((a) => a.id !== asset.id) }
            : c,
        ),
        reputation: Math.min(100, state.reputation + 2),
        log: [
          { t: `🤝 ${comp.name} sold ${asset.name} to you for ${msek(action.amount)} (premium ${pct(ratio - 1)}).`, kind: "buy" },
          ...state.log,
        ],
      };
    }
    case "BUY_INDUSTRY": {
      const asset = (state.industryListings ?? []).find((a) => a.id === action.id);
      if (!asset) return state;
      if (districtLocked(state, asset.district)) return log(state, "🔒 The area is locked – the story opens the city chapter by chapter. Continue the campaign to open it.", "warn");
      if (state.cash < asset.purchasePrice) return log(state, "❌ Insufficient funds.", "warn");
      const bought: IndustryAsset = { ...asset, txHistory: [{ type: "bought", price: asset.purchasePrice, month: state.month, year: state.year, party: "Player" }, ...(asset.txHistory ?? [])] };
      return {
        ...state,
        cash: state.cash - asset.purchasePrice,
        industryPortfolio: [...(state.industryPortfolio ?? []), bought],
        industryListings: (state.industryListings ?? []).filter((a) => a.id !== action.id),
        reputation: Math.min(100, state.reputation + 1),
        log: [{ t: `🏢 Bought ${asset.name} for ${msek(asset.purchasePrice)}.`, kind: "buy" }, ...state.log],
      };
    }

    case "SELL_INDUSTRY": {
      const asset = (state.industryPortfolio ?? []).find((a) => a.id === action.id);
      if (!asset) return state;
      const salePrice = Math.round(industryAssetValue(asset, state) * 0.95);
      return {
        ...state,
        cash: state.cash + salePrice,
        industryPortfolio: (state.industryPortfolio ?? []).filter((a) => a.id !== action.id),
        reputation: Math.min(100, state.reputation + 0.5),
        log: [{ t: `💰 Sold ${asset.name} for ${msek(salePrice)}.`, kind: "sell" }, ...state.log],
      };
    }

    case "UPGRADE_INDUSTRY": {
      const asset = (state.industryPortfolio ?? []).find((a) => a.id === action.id);
      const upg = INDUSTRY_UPGRADES.find((u) => u.id === action.upg);
      if (!asset || !upg) return state;
      if (asset.upgrades.includes(action.upg)) return log(state, "❌ Uppgradering redan installerad.", "warn");
      const cost = Math.round(industryAssetValue(asset, state) * upg.cost);
      if (state.cash < cost) return log(state, `❌ Missing ${msek(cost)} for the upgrade.`, "warn");
      const newCond = upg.condBoost ? Math.min(100, asset.condition + upg.condBoost) : asset.condition;
      return {
        ...state,
        cash: state.cash - cost,
        industryPortfolio: (state.industryPortfolio ?? []).map((a) =>
          a.id === action.id ? { ...a, upgrades: [...a.upgrades, action.upg], condition: newCond } : a,
        ),
        log: [{ t: `⬆️ Uppgraderade ${asset.name}: ${upg.name} (${msek(cost)}).`, kind: "upg" }, ...state.log],
      };
    }

    case "MAINTAIN_INDUSTRY": {
      const asset = (state.industryPortfolio ?? []).find((a) => a.id === action.id);
      if (!asset) return state;
      const cost = Math.round(industryAssetValue(asset, state) * 0.02);
      if (state.cash < cost) return log(state, `❌ Missing ${msek(cost)} for maintenance.`, "warn");
      return {
        ...state,
        cash: state.cash - cost,
        industryPortfolio: (state.industryPortfolio ?? []).map((a) =>
          a.id === action.id ? { ...a, condition: Math.min(100, a.condition + 15) } : a,
        ),
        log: [{ t: `🔧 Maintenance on ${asset.name}: condition +15 (${msek(cost)}).`, kind: "expense" }, ...state.log],
      };
    }

    case "ADD_PPA": {
      const asset = (state.industryPortfolio ?? []).find((a) => a.id === action.assetId);
      if (!asset || asset.sector !== "energi" || !asset.energyMeta) return state;
      return {
        ...state,
        industryPortfolio: (state.industryPortfolio ?? []).map((a) =>
          a.id === action.assetId && a.energyMeta
            ? { ...a, energyMeta: { ...a.energyMeta, ppaContracts: [...a.energyMeta.ppaContracts, action.contract] } }
            : a,
        ),
        log: [{ t: `⚡ PPA contract signed with ${action.contract.clientName} for ${asset.name}.`, kind: "income" }, ...state.log],
      };
    }

    case "CANCEL_PPA": {
      const asset = (state.industryPortfolio ?? []).find((a) => a.id === action.assetId);
      if (!asset || !asset.energyMeta) return state;
      return {
        ...state,
        industryPortfolio: (state.industryPortfolio ?? []).map((a) =>
          a.id === action.assetId && a.energyMeta
            ? { ...a, energyMeta: { ...a.energyMeta, ppaContracts: a.energyMeta.ppaContracts.filter((c) => c.id !== action.contractId) } }
            : a,
        ),
        log: [{ t: `❌ PPA contract cancelled for ${asset.name}.`, kind: "info" }, ...state.log],
      };
    }

    case "ADD_THROUGHPUT_CONTRACT": {
      const asset = (state.industryPortfolio ?? []).find((a) => a.id === action.assetId);
      if (!asset || asset.sector !== "logistik" || !asset.logisticsMeta) return state;
      return {
        ...state,
        industryPortfolio: (state.industryPortfolio ?? []).map((a) =>
          a.id === action.assetId && a.logisticsMeta
            ? { ...a, logisticsMeta: { ...a.logisticsMeta, throughputContracts: [...a.logisticsMeta.throughputContracts, action.contract] } }
            : a,
        ),
        log: [{ t: `📦 Logistics contract signed with ${action.contract.clientName} for ${asset.name}.`, kind: "income" }, ...state.log],
      };
    }

    case "SET_HOTEL_CHANNEL": {
      const asset = (state.industryPortfolio ?? []).find((a) => a.id === action.assetId);
      if (!asset || asset.sector !== "hotell" || !asset.hotelMeta) return state;
      return {
        ...state,
        industryPortfolio: (state.industryPortfolio ?? []).map((a) =>
          a.id === action.assetId && a.hotelMeta
            ? { ...a, hotelMeta: { ...a.hotelMeta, bookingChannels: action.channels } }
            : a,
        ),
        log: [{ t: `🏨 Booking channels updated for ${asset.name}.`, kind: "info" }, ...state.log],
      };
    }

    case "TOGGLE_INDUSTRY_MANAGER": {
      const asset = (state.industryPortfolio ?? []).find((a) => a.id === action.id);
      if (!asset) return state;
      return {
        ...state,
        industryPortfolio: (state.industryPortfolio ?? []).map((a) =>
          a.id === action.id ? { ...a, managed: !a.managed } : a,
        ),
        log: [{ t: `${!asset.managed ? "✅ Manager activated" : "🔴 Manager deactivated"} for ${asset.name}.`, kind: "info" }, ...state.log],
      };
    }

    case "BUY_INDUSTRY_INSURANCE": {
      const asset = (state.industryPortfolio ?? []).find((a) => a.id === action.id);
      if (!asset) return state;
      return {
        ...state,
        industryPortfolio: (state.industryPortfolio ?? []).map((a) =>
          a.id === action.id ? { ...a, insurance: !a.insurance } : a,
        ),
        log: [{ t: `${!asset.insurance ? "🛡️ Insurance taken out" : "❌ Insurance ended"} for ${asset.name}.`, kind: "info" }, ...state.log],
      };
    }

    case "NEXT_DAY":
      return advanceDay(state);
    case "NEXT_MONTH":
      // Manuellt månadssteg: kör hela månadssimuleringen och landa på dag 1
      // i den nya månaden så att den rullande kalendern förblir koherent.
      return { ...advanceMonth(state), day: 1 };
    case "START_RENOVATION": {
      // Utvecklingsprojekt: totalrenovering (skick/energi/hyra), påbyggnad
      // (+yta/kapacitet/värde) eller lokalanpassning (ändrat antal lokaler –
      // single- vs multi-tenant). Lokalanpassning kräver bara att de
      // berörda lokalerna är tomma; övriga projekt kräver tom fastighet.
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status !== "klar") return state;
      const value = propMarketValue(p, state);
      let cost: number;
      let months: number;
      let renovation: Property["renovation"];
      if (action.kind === "lokalanpassning") {
        const target = Math.max(1, Math.min(maxCapacityFor(p), Math.round(action.targetCapacity ?? p.capacity)));
        if (target === p.capacity)
          return log(state, "Fastigheten har redan det antalet lokaler.", "info");
        if (p.tenants.length > target)
          return log(state, `Converting to ${target} ${target === 1 ? "unit" : "units"} requires at most ${target} to be rented – terminate or wait out contracts.`, "warn");
        cost = Math.max(150_000, Math.round(value * 0.04 * Math.abs(target - p.capacity)));
        months = 3;
        renovation = { kind: "lokalanpassning", targetCapacity: target };
      } else {
        if (p.tenants.length > 0)
          return log(state, "The property must be vacant for a development project.", "warn");
        const total = action.kind === "totalrenovering";
        cost = Math.round(value * (total ? 0.18 : 0.3));
        months = total ? 6 : 10;
        renovation = { kind: action.kind };
      }
      if (state.cash < cost)
        return log(state, `Projektet (${action.kind}) kostar ${msek(cost)}.`, "warn");
      return {
        ...state,
        cash: state.cash - cost,
        portfolio: state.portfolio.map((x) =>
          x.id === p.id
            ? {
                ...x,
                status: "bygger" as const,
                buildLeft: months,
                renovation,
                capexTotal: (x.capexTotal ?? 0) + cost,
                applications: [],
                txHistory: [
                  ...(x.txHistory ?? []),
                  { type: "built" as const, price: cost, month: state.month, year: state.year, party: `Project: ${action.kind}` },
                ],
              }
            : x,
        ),
        log: [
          {
            t: `🏗️ Development project started: ${action.kind} of ${p.typeLabel} in ${p.districtName} (${msek(cost)}, done in ${months} mo).`,
            kind: "upg",
          },
          ...state.log,
        ],
      };
    }
    case "REDEVELOP": {
      // Livscykel: riv det gamla huset och bygg nytt. Kräver vakant fastighet;
      // nollställer åldern och ger ett större, effektivare hus (klart i sim).
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status !== "klar") return state;
      if (p.tenants.length > 0)
        return log(state, "The property must be vacant for demolition & rebuild.", "warn");
      const t = PROP_TYPES[p.type];
      const cost = Math.round(p.area * t.buildCostM2 * buildCostMult(state) * 1.1);
      const months = Math.max(5, t.buildMonths + buildMonthsDelta(state));
      if (state.cash < cost)
        return log(state, `Demolition & rebuild costs ${msek(cost)} (the property must be vacant).`, "warn");
      return {
        ...state,
        cash: state.cash - cost,
        portfolio: state.portfolio.map((x) =>
          x.id === p.id
            ? {
                ...x,
                status: "bygger" as const,
                buildLeft: months,
                renovation: { kind: "nybyggnation" as const },
                capexTotal: (x.capexTotal ?? 0) + cost,
                applications: [],
                txHistory: [
                  ...(x.txHistory ?? []),
                  { type: "built" as const, price: cost, month: state.month, year: state.year, party: "Demolition & rebuild" },
                ],
              }
            : x,
        ),
        log: [
          { t: `🏗️ Demolition & rebuild started: ${p.typeLabel} in ${p.districtName} (${msek(cost)}, done in ${months} mo).`, kind: "upg" },
          ...state.log,
        ],
      };
    }
    case "AUCTION_BID": {
      // Detaljplaneauktion: spelaren höjer med 8 %. Rivalerna svarar direkt –
      // aggressivast är den vars agenda gäller distriktet.
      const a = state.auction;
      if (!a) return state;
      const myBid = Math.round((a.leader ? a.currentBid * 1.08 : a.minBid) / 10_000) * 10_000;
      if (state.cash < myBid)
        return log(state, `Insufficient cash for the bid ${msek(myBid)}.`, "warn");
      // AI-motbud: sannolikheten sjunker per runda, agenda-distrikt trippel.
      let counter: { name: string; bid: number } | null = null;
      for (const c of state.competitors) {
        const aggression =
          (c.agenda?.kind === "district" && c.agenda.district === a.district ? 0.75 : 0.3) -
          a.round * 0.12;
        const theirBid = Math.round((myBid * 1.08) / 10_000) * 10_000;
        if (c.cash + (c.equity ?? 0) * 0.3 >= theirBid && random01() < aggression) {
          if (!counter || theirBid > counter.bid) counter = { name: c.name, bid: theirBid };
        }
      }
      if (counter) {
        return {
          ...state,
          auction: { ...a, currentBid: counter.bid, leader: counter.name, round: a.round + 1 },
          log: [
            { t: `⚡ ${counter.name} outbids: ${msek(counter.bid)} for the zoning plan in ${a.districtName}.`, kind: "warn" },
            ...state.log,
          ],
        };
      }
      // Inget motbud – spelaren leder; nästa AUCTION_BID klubbar.
      return {
        ...state,
        auction: { ...a, currentBid: myBid, leader: "player", round: a.round + 1 },
        log: [
          { t: `🔨 Your bid ${msek(myBid)} is highest in the plan auction (${a.districtName}).`, kind: "info" },
          ...state.log,
        ],
      };
    }
    case "AUCTION_PASS": {
      // Spelaren släpper auktionen – klubbslag för nuvarande ledare.
      const a = state.auction;
      if (!a) return state;
      return resolveAuction(state, a);
    }
    case "RECEIVER_SELL": {
      // Rekonstruktionsmenyn: spelaren väljer själv vad som säljs (−25 %,
      // bättre villkor än förvaltarens −35 % men sämre än att sälja i tid).
      if (!state.receivership) return state;
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || !canSellInReceivership(p, state)) return state;
      const q = distressQuote(p, state, RECEIVER_CHOICE_FACTOR);
      const next = applyDistressSale(state, p, RECEIVER_CHOICE_FACTOR, "You (restructuring sale)");
      return {
        ...next,
        log: [
          { t: `🧾 Restructuring sale: ${p.typeLabel} in ${p.districtName} for ${msek(q.salePrice)} (−25% vs. value, net ${msek(q.net)}).`, kind: "sell" },
          ...next.log,
        ],
      };
    }
    case "RECEIVER_AUTO": {
      // "Låt förvaltaren välja": auto-likvidering till −35 %, sedan stängs
      // rekonstruktionen – eller konkurs om golvet ändå inte nås.
      if (!state.receivership) return state;
      const res = receiverAutoLiquidate(state);
      const s2: GameState = { ...res.state, receivership: undefined };
      if (s2.cash < BANKRUPTCY_FLOOR) {
        return {
          ...s2,
          gameOver: true,
          gameOverReason: {
            icon: "💥",
            title: "Bankruptcy",
            text: `You handed the keys to the receiver, but even a full fire-sale could not cover the shortfall — cash ended at ${kr(s2.cash)} with ${msek(s2.debt)} of debt still unbacked. The company was too leveraged for a restructuring to work. Next run: keep an equity cushion so a crisis is survivable.`,
          },
          log: [{ t: "💥 BANKRUPTCY! Even the receiver's liquidation could not cover the shortfall. The game is over.", kind: "warn" }, ...s2.log],
        };
      }
      return {
        ...imposeRestructuringTerms(s2),
        log: [
          { t: `⚖️ You handed the keys to the receiver, who sold ${res.sold} propert${res.sold === 1 ? "y" : "ies"} at fire-sale prices. The company survives — under ${RESTRUCTURING_MONTHS}-month bank covenants.`, kind: "warn" },
          ...s2.log,
        ],
      };
    }
    case "RESOLVE_RECEIVERSHIP": {
      // Kräver återställd likviditet: kassan över noll. Banken släpper inte
      // taget: rekonstruktionsvillkor (tvångsamortering + strypt nyutlåning)
      // gäller i RESTRUCTURING_MONTHS månader efteråt.
      if (!state.receivership) return state;
      if (state.cash < 0)
        return log(state, `The receiver shakes his head: cash must be back above zero (currently ${kr(state.cash)}).`, "warn");
      return {
        ...imposeRestructuringTerms({ ...state, receivership: undefined }),
        log: [{ t: `⚖️ Restructuring resolved: liquidity restored and the receiver withdraws. The bank imposes ${RESTRUCTURING_MONTHS}-month covenants — mandatory amortization and capped new lending.`, kind: "event" }, ...state.log],
      };
    }
    case "ACCEPT_BANKRUPTCY": {
      if (!state.receivership) return state;
      return {
        ...state,
        receivership: undefined,
        gameOver: true,
        gameOverReason: {
          icon: "💥",
          title: "Bankruptcy — by choice",
          text: `You chose to fold the company rather than sell it off piece by piece. Cash stood at ${kr(state.cash)} with ${msek(state.debt)} of debt when the receiver took the keys. Sometimes walking away is the honest call — next run, the crisis menu offers sales, credit and a bridge loan before it comes to this.`,
        },
        log: [{ t: "💥 BANKRUPTCY: you chose to fold the company rather than sell it off piece by piece. The game is over.", kind: "warn" }, ...state.log],
      };
    }
    case "BRIDGE_LOAN": {
      // Dyr nödfinansiering: rädda husen genom att låna sig ur krisen till
      // straffränta. En gång per rekonstruktion, och banken kräver att eget
      // kapital täcker lånet (BRIDGE_EQUITY_COVER×) – annars är det bara
      // ett sätt att skjuta upp konkursen.
      if (!state.receivership) return state;
      if (state.receivership.bridgeUsed)
        return log(state, "The bank has already extended one bridge loan — there will not be another.", "warn");
      const quote = bridgeLoanQuote(state);
      if (quote.amount <= 0) return state;
      if (equityOf(state) < quote.amount * BRIDGE_EQUITY_COVER)
        return log(state, `The bank demands ${BRIDGE_EQUITY_COVER}× equity coverage for a bridge loan of ${msek(quote.amount)} — your equity is too thin. Sell instead.`, "warn");
      const bridge = { id: `bridge-${state.year * 12 + state.month}`, amount: quote.amount, rate: quote.rate, matureAbs: state.year * 12 + state.month + quote.months };
      return {
        ...state,
        cash: state.cash + quote.amount,
        bonds: [...(state.bonds ?? []), bridge],
        receivership: { ...state.receivership, bridgeUsed: true },
        log: [
          { t: `🏦 Bridge loan: ${msek(quote.amount)} at ${quote.rate.toFixed(2)}%/yr punitive interest, due in ${quote.months} months. The buildings stay — the bill arrives monthly.`, kind: "expense" },
          ...state.log,
        ],
      };
    }
    case "UPGRADE_COMPANY": {
      // Expansion är ett aktivt val: kraven ska vara uppfyllda och det
      // kostar pengar (nytt kontor, rekrytering, jurister).
      const next = nextTier(state.companyLevel ?? 1);
      if (!next) return log(state, "The company is already at the top level.", "info");
      if (next.requiresIpo && !state.ipoActive)
        return log(state, `${next.name} requires a completed stock listing (IPO) – see Finance.`, "warn");
      if (!qualifiesFor(state, next))
        return log(
          state,
          `The requirements for ${next.name} are not met: ${msek(next.minEquity)} equity and ${next.minUnits} completed properties.`,
          "warn",
        );
      if (state.cash < next.upgradeCost)
        return log(state, `The expansion costs ${msek(next.upgradeCost)} (new office and organization).`, "warn");
      const nyheter =
        next.unlocks.length > 0 ? " New features have been unlocked!" : "";
      return {
        ...state,
        cash: state.cash - next.upgradeCost,
        companyLevel: next.level,
        reputation: Math.min(100, state.reputation + 4),
        log: [
          {
            t: `${next.icon} EXPANSION: ${state.companyName ?? "The Company"} is now ${next.name.toLowerCase()}! ${next.desc}${nyheter} (Reputation +4)`,
            kind: "income",
          },
          ...state.log,
        ],
      };
    }
    case "SET_POLICY": {
      // Bolagspolicyn: delvis uppdatering, resten behålls.
      return { ...state, policy: { ...(state.policy ?? {}), ...action.policy } };
    }
    case "SET_COMPANY_NAME": {
      const name = action.name.trim().slice(0, 32);
      if (!name) return state;
      return log({ ...state, companyName: name }, `Bolaget heter nu ${name}.`, "info");
    }
    case "LOAD":
      return action.state;
    case "RESET": {
      // Berättelseläget: morfars hus + fryspåsen – egen balans, inga options.
      if (action.mode === "story") return seedStory(initState());
      const fresh = initState(action.options);
      return {
        ...fresh,
        ...(action.scenarioId ? { scenarioId: action.scenarioId } : {}),
        ...(action.companyName?.trim()
          ? { companyName: action.companyName.trim().slice(0, 32) }
          : {}),
      };
    }
    default:
      return state;
  }
}
