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
import { newId } from "./random";
import { QUICK_SALE_FACTOR, attractiveness } from "./selling";
import { advanceDay, advanceMonth } from "./simulation";
import { MEMORY_NOTES, applyStoryFlag, districtLocked, foundNotes, hasFlag, markNegotiated, noteFlag, seedStory, storyDecisionById, suppressOrganicApplications } from "./story";
import { COURTAGE, STOCK_CAP_RATE } from "./stocks";
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
        { t: `🔨 Detaljplaneauktionen i ${a.districtName} avslutades utan bud – marken förblir oplanerad.`, kind: "info" },
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
          t: `🏛️ DETALJPLAN VUNNEN! Du köpte ${parcels.length} byggklara tomter i ${a.districtName} för ${msek(a.currentBid)} (rep +3). Staden växer – öppna Bygg!`,
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
        t: `🏛️ ${winner} vann detaljplaneauktionen i ${a.districtName} för ${msek(a.currentBid)} och exploaterar kvarteret direkt.`,
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
      if (districtLocked(state, p.district)) return log(state, "🔒 Området är låst – berättelsen öppnar staden kapitel för kapitel. Fortsätt kampanjen så öppnas det.", "warn");
      const { maxLtv } = loanTerms(state);
      const down = p.askPrice * (1 - maxLtv);
      // Konkurrensverket: dominans i distriktet → förvärvsprövning med avgift.
      const share = districtShareOf(state, p.district);
      const reviewFee = share >= DOMINANCE_REVIEW_SHARE ? Math.round(p.askPrice * REVIEW_FEE_PCT) : 0;
      if (state.cash < down + reviewFee)
        return log(
          state,
          `För lite kontanter. Handpenning ${msek(down)}${reviewFee > 0 ? ` + prövningsavgift ${msek(reviewFee)} (dominans i ${p.districtName})` : ""} krävs (LTV ${pct(maxLtv)}).`,
          "warn",
        );
      const loan = p.askPrice - down;
      const txEntry = { type: "köp" as const, price: p.askPrice, month: state.month, year: state.year, party: "Spelaren" };
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
            t: `Köpte ${p.typeLabel} i ${p.districtName} för ${msek(p.askPrice)} (lån ${msek(loan)})${reviewFee > 0 ? ` · Konkurrensverkets prövningsavgift ${msek(reviewFee)}` : ""}.`,
            kind: "buy",
          },
          ...state.log,
        ],
      };
    }
    case "PLACE_BID": {
      const p = state.listings.find((x) => x.id === action.id);
      if (!p) return state;
      if (districtLocked(state, p.district)) return log(state, "🔒 Området är låst – berättelsen öppnar staden kapitel för kapitel. Fortsätt kampanjen så öppnas det.", "warn");
      // Budspam-spärr: efter ett avvisat bud överväger säljaren inga nya bud
      // från dig på två månader. Utan spärren kunde man spamma lågbud tills
      // slumpen sa ja och systematiskt handla under marknadsvärdet.
      const nowAbs = state.year * 12 + state.month;
      if ((p.bidRejectedAbs ?? -99) + 2 > nowAbs)
        return log(state, `Säljaren av ${p.typeLabel} i ${p.districtName} överväger inte nya bud från dig ännu – vänta eller köp till utpris.`, "warn");
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
          competingBid: state.competingBid?.listingId === p.id ? undefined : state.competingBid,
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
      if (!withdrawn)
        return {
          ...state,
          listings: state.listings.map((x) =>
            x.id === p.id ? { ...x, bidRejectedAbs: nowAbs } : x,
          ),
          log: [
            { t: `Ditt bud på ${p.typeLabel} i ${p.districtName} (${msek(bid)}) avvisades. Säljaren vill inte se fler lågbud på ett par månader.`, kind: "warn" },
            ...state.log,
          ],
        };
      // Säljaren tog ett annat bud – huset försvinner INTE från kartan:
      // köparen är ett av stadens bolag och fastigheten flyttar till dess
      // portfölj med tomtrutan kvar. Utan bolag återgår den till poolen.
      const rival =
        state.competitors.length > 0
          ? state.competitors[Math.floor(Math.random() * state.competitors.length)]
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
          { type: "köp" as const, price: paid, month: state.month, year: state.year, party: rival?.name ?? "Okänd köpare" },
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
              ? `🏢 ${rival.name} vann budgivningen om ${p.typeLabel} i ${p.districtName} (${msek(paid)}) – ditt bud på ${msek(bid)} räckte inte.`
              : `Ditt bud på ${p.typeLabel} i ${p.districtName} avvisades – säljaren tog ett annat bud.`,
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
        return log(state, "Villkor 7b: morfars hus får inte säljas. Ekelöf fakturerar 900 kr för påminnelsen. (ingick)", "warn");
      const value = propMarketValue(p, state);
      const salePrice = Math.round(value * QUICK_SALE_FACTOR);
      const payoff = Math.min(state.debt, (p.purchasePrice || salePrice) * 0.6);
      const born = state.year * 12 + state.month;
      const sellTx = { type: "sälj" as const, price: salePrice, month: state.month, year: state.year, party: "Spelaren (snabbförsäljning)" };
      const relisted = {
        ...p,
        owned: false,
        askPrice: value,
        listedMonth: born,
        expiresMonth: born + 3 + Math.floor(Math.random() * 2),
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
              t: `⚡ Snabbförsäljning: ${p.typeLabel} i ${p.districtName} för ${msek(salePrice)} (−15 % mot värdet, netto ${msek(salePrice - payoff)}).`,
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
        return log(state, "Villkor 7b: morfars hus får inte annonseras ut. Morfar förutsåg det här. Han förutsåg allt.", "warn");
      const ask = Math.max(10_000, Math.round(action.ask));
      return {
        ...state,
        portfolio: state.portfolio.map((x) =>
          x.id === p.id ? { ...x, forSale: { ask, listedAbs: state.year * 12 + state.month } } : x,
        ),
        log: [
          { t: `🏷️ ${p.typeLabel} i ${p.districtName} utannonserad för ${msek(ask)} – inväntar köpare.`, kind: "info" },
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
        log: [{ t: `${p.typeLabel} i ${p.districtName} togs bort från marknaden.`, kind: "info" }, ...state.log],
      };
    }
    case "LIST_PACKAGE": {
      const props = state.portfolio.filter(
        (p) => action.ids.includes(p.id) && p.status === "klar" && !p.forSale,
      );
      if (props.length < 2) return log(state, "Ett säljpaket kräver minst två lediga fastigheter.", "warn");
      const id = Math.max(0, ...(state.salePackages ?? []).map((x) => x.id)) + 1;
      const ask = Math.max(10_000, Math.round(action.ask));
      const listedAbs = state.year * 12 + state.month;
      const pkg = { id, name: `Portfölj ${String.fromCharCode(64 + ((id - 1) % 26) + 1)}`, propertyIds: props.map((p) => p.id), ask, listedAbs };
      return {
        ...state,
        salePackages: [...(state.salePackages ?? []), pkg],
        portfolio: state.portfolio.map((x) =>
          pkg.propertyIds.includes(x.id) ? { ...x, forSale: { ask: 0, listedAbs, packageId: id } } : x,
        ),
        log: [
          { t: `📦 Säljpaketet ${pkg.name} (${props.length} fastigheter) utannonserat för ${msek(ask)}.`, kind: "info" },
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
        log: [{ t: `Säljpaketet ${pkg.name} återkallades från marknaden.`, kind: "info" }, ...state.log],
      };
    }
    case "UPGRADE": {
      const p = state.portfolio.find((x) => x.id === action.id);
      const u = UPGRADES.find((x) => x.id === action.upg);
      if (!p || !u || p.status === "bygger") return state;
      if (p.upgrades.includes(u.id) || pendingWork(p, "uppgradering", u.id)) return state;
      const cost = propMarketValue(p, state) * u.cost;
      if (state.cash < cost) return log(state, "För lite kontanter för åtgärden.", "warn");
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
          { t: `${u.name} beställd på ${p.typeLabel} i ${p.districtName} (${msek(cost)}) – klar om ${months} mån.`, kind: "upg" },
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
        return log(state, "Ombyggnad till ny användning pågår – inga nya kontrakt förrän den är klar.", "warn");
      const app = bestApplication(p);
      if (!app)
        return log(state, `Inga ansökningar till ${p.typeLabel} i ${p.districtName} ännu – justera utgångshyran eller anlita mäklare.`, "info");
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
            t: `Tecknade hyresavtal: ${tenant.name} i ${p.districtName}, ${tenant.termTotal} mån, ${kr(tenant.rent)}/mån.`,
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
        return log(state, "Ombyggnad till ny användning pågår – inga nya kontrakt förrän den är klar.", "warn");
      if (p.tenants.length >= p.capacity)
        return log(state, "Fastigheten är fullbelagd – bygg om för fler lokaler.", "warn");
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
            t: `${action.contract === "ankare" ? "⭐ Ankaravtal" : "Hyresavtal"} signerat: ${tenant.name} i ${p.districtName} (${CONTRACTS[action.contract].label}, ${tenant.termTotal} mån, ${kr(tenant.rent)}/mån).`,
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
        return log(state, "Bostadskön gäller bara bostadsfastigheter.", "warn");
      const on = !p.regulated;
      return {
        ...state,
        portfolio: state.portfolio.map((x) =>
          x.id === action.id ? { ...x, regulated: on, applications: on ? [] : x.applications } : x,
        ),
        log: [
          {
            t: on
              ? `🏛️ ${p.typeLabel} i ${p.districtName} ansluten till bostadskön: hyra −20 %, kön fyller vakanser direkt, +goodwill.`
              : `${p.typeLabel} i ${p.districtName} lämnar bostadskön – marknadshyra och ansökningsflöde gäller.`,
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
              ? `🤝 Mäklaruppdrag för ${p.typeLabel} i ${p.districtName}: ${kr(BROKER_FEE)}/mån vid vakans, garanterade kvalificerade sökande.`
              : `Mäklaruppdraget för ${p.typeLabel} i ${p.districtName} avslutat.`,
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
      const repHit = residential ? 3 : 1;
      if (state.cash < buyout)
        return log(state, `Uppsägningen kräver ${kr(buyout)} i ${residential ? "avflyttningsersättning (besittningsskydd)" : "kompensation"}.`, "warn");
      return {
        ...state,
        cash: state.cash - buyout,
        reputation: Math.max(0, state.reputation - repHit),
        portfolio: state.portfolio.map((x) =>
          x.id === p.id ? { ...x, tenants: x.tenants.filter((t) => t.id !== action.tenantId) } : x,
        ),
        pendingRenewals: dropRenewals(state, (r) => r.propertyId === p.id && r.tenantId === action.tenantId),
        log: [
          {
            t: `Sade upp ${tenant.name} i ${p.districtName}: ${kr(buyout)} i ${residential ? "avflyttningsersättning" : "kompensation"} (rep −${repHit}).`,
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
      if (pendingWork(p, "underhåll"))
        return log(state, `Underhåll pågår redan på ${p.typeLabel} i ${p.districtName} – klart vid månadsskiftet.`, "info");
      const cost = Math.round(propMarketValue(p, state) * 0.02);
      if (state.cash < cost) return log(state, "För lite kontanter för underhåll.", "warn");
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
            t: `🔧 Underhåll beställt på ${p.typeLabel} i ${p.districtName} (${msek(cost)}) – +15 skick vid månadsskiftet.`,
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
        return log(state, "Inga ansökningar att acceptera – justera utgångshyror eller anlita mäklare.", "info");
      return log(
        { ...state, portfolio },
        `🏠 Accepterade ${signed} ansökningar – bästa sökande fick kontrakt i hela portföljen.`,
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
        return log(state, `Inget att underhålla under skick ${action.threshold} (eller kassan räcker inte).`, "info");
      return log(
        { ...state, cash, portfolio },
        `🔧 Underhållsrond: ${fixed} jobb beställda (${msek(totalCost)}) – +15 skick vid månadsskiftet.`,
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
        return log(state, `Inga kontrakt löper ut inom ${action.monthsLeft} månader.`, "info");
      return log(
        {
          ...state,
          portfolio,
          // Förnyade kontrakt är inte längre öppna förhandlingar.
          pendingRenewals: dropRenewals(state, (r) => renewedIds.has(r.tenantId)),
          reputation: Math.min(100, state.reputation + 1),
        },
        `📄 Förnyade ${renewed} hyreskontrakt till marknadshyra (reputation +1).`,
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
          ? "👔 Förvaltare anlitade på samtliga fastigheter."
          : "👔 Förvaltare avslutade på samtliga fastigheter.",
        "info",
      );
    }
    case "BUY_LOT": {
      const lot = state.lots.find((x) => x.id === action.id);
      if (!lot) return state;
      if (districtLocked(state, lot.district)) return log(state, "🔒 Området är låst – berättelsen öppnar staden kapitel för kapitel. Fortsätt kampanjen så öppnas det.", "warn");
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
      // Fastighetskris: refinansieringsfönstret är stängt – bankerna
      // lånar inte ut mot fallande säkerheter.
      if ((state.crisisMonthsLeft ?? 0) > 0)
        return log(state, "🏦 Kreditmarknaden är stängd under krisen — ingen ny belåning förrän marknaden stabiliserats.", "warn");
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
      if (pendingWork(p, "ändrad_användning")) return state;
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
      const baseProb   = ratio < 1.0 ? 0.97 : ratio < 1.1 ? 0.80 : ratio < 1.2 ? 0.55 : ratio < 1.35 ? 0.28 : 0.10;
      // Nöjda hyresgäster tål höjningar bättre (U3).
      const satMult    = Math.max(0.3, Math.min(1.25, (tenant.satisfaction ?? 60) / 65));
      const acceptProb = Math.min(0.98, baseProb * satMult);
      if (Math.random() < acceptProb) {
        return {
          ...markNegotiated(state),
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
        ...markNegotiated(state),
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
        ...markNegotiated(state),
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
        // Avslutad förvaltare tar sina instruktioner med sig – annars
        // fortsätter gamla trösklar att tyst överstyra portföljdirektören.
        portfolio: state.portfolio.map((x) =>
          x.id === p.id ? { ...x, managed, managerSettings: managed ? x.managerSettings : undefined } : x,
        ),
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
      // Annonskampanj: annonserna behöver en månad att verka –
      // tre nya ansökningar kommer in vid månadsskiftet (U1).
      const p = state.portfolio.find((x) => x.id === action.id);
      if (!p || p.status !== "klar") return state;
      if (suppressOrganicApplications(state, p))
        return log(state, "🎬 Lugn – berättelsen ordnar sökande till morfars hus. Spara annonspengarna.", "info");
      if (pendingWork(p, "kampanj"))
        return log(state, `En annonskampanj pågår redan för ${p.typeLabel} i ${p.districtName}.`, "info");
      if (state.cash < 25000) return log(state, "För lite kontanter för annonskampanj.", "warn");
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
            t: `📣 Annonskampanj startad för ${p.typeLabel} i ${p.districtName} (25 000 kr) – ansökningar väntas vid månadsskiftet.`,
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
      if (e.gameOver) s.gameOver = true;
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
          ? state.competitors[Math.floor(Math.random() * state.competitors.length)]
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
          { type: "sälj" as const, price, month: state.month, year: state.year, party: offer.from },
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
                  t: `📦 Paketaffär! Sålde ${props.length} fastigheter till ${offer.from} för ${msek(offer.amount)} (netto ${msek(offer.amount - payoff)}).`,
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
                t: `Accepterade bud: sålde ${p.typeLabel} i ${p.districtName} till ${offer.from} för ${msek(offer.amount)}.`,
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
      const accepted = amount <= ceiling || (amount <= stretch && Math.random() < 0.35);
      if (accepted) {
        const bumped: GameState = {
          ...state,
          offers: (state.offers ?? []).map((o) => (o.id === offer.id ? { ...o, amount } : o)),
          log: [{ t: `🤝 ${offer.from} gick med på ditt motbud ${msek(amount)}.`, kind: "sell" }, ...state.log],
        };
        return reducer(bumped, { type: "ACCEPT_OFFER", offerId: offer.id });
      }
      return {
        ...state,
        offers: (state.offers ?? []).filter((o) => o.id !== offer.id),
        log: [
          { t: `🚪 ${offer.from} drog sig ur affären efter ditt motbud på ${msek(amount)}.`, kind: "warn" },
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
          `${friendly ? "Vänligt" : "Fientligt"} bud på ${st.name} kräver ${msek(cost)} för resterande aktier (premie ${Math.round(premium * 100)} %).`,
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
          { type: "köp" as const, price: p.askPrice, month: state.month, year: state.year, party: `Förvärv av ${st.name}` },
        ],
      }));
      // Egen blankning i bolaget stängs till kurs vid avnoteringen.
      const shortSettle = (st.shortQty ?? 0) > 0
        ? Math.max(0, Math.round((st.shortAvgPrice ?? st.price) * st.shortQty! * 1.5) + Math.round(st.shortQty! * ((st.shortAvgPrice ?? st.price) - st.price)))
        : 0;
      const cashIn = Math.round(comp?.cash ?? 0) + shortSettle;
      const repDelta = friendly ? 4 : -3;
      const dramaLog = friendly
        ? `🏛️ FÖRVÄRV: Styrelsen i ${st.name} rekommenderade ditt bud. Du köpte upp bolaget för ${msek(cost)} (premie 15 %) – ${acquired.length} fastigheter och ${msek(Math.round(comp?.cash ?? 0))} i kassa fusioneras in i koncernen.`
        : `🏛️ FIENTLIGT FÖRVÄRV: Trots styrelsens giftpiller vann du budstriden om ${st.name} för ${msek(cost)} (premie 30 %) – ${acquired.length} fastigheter och ${msek(Math.round(comp?.cash ?? 0))} i kassa fusioneras in. Rykte −3.`;
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
        return log(state, "Fastigheten måste vara vakant för att ändra användning.", "warn");
      if (pendingWork(p, "ändrad_användning"))
        return log(state, "En ombyggnad till ny användning pågår redan.", "warn");
      const value = propMarketValue(p, state);
      const cost = Math.round(value * 0.15);
      if (state.cash < cost)
        return log(state, `Ändrad användning kostar ${msek(cost)} (ombyggnad).`, "warn");
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
          { t: `Ombyggnad beställd i ${p.districtName}: ${p.typeLabel} → ${t.label} (${msek(cost)}) – klar om 3 mån.`, kind: "upg" },
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
      if (districtLocked(state, prop.district)) return log(state, "🔒 Området är låst – berättelsen öppnar staden kapitel för kapitel. Fortsätt kampanjen så öppnas det.", "warn");
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
          { t: `📌 Hittade morfars minneslapp: ${note.title} (reputation +1).`, kind: "event" as const },
          ...state.log,
        ],
      };
      if (foundNotes(s) === MEMORY_NOTES.length) {
        s = {
          ...s,
          reputation: Math.min(100, s.reputation + 3),
          log: [
            { t: "📔 Alla morfars minneslappar hittade – fotoalbumet är komplett (reputation +3). Han hade gillat att du letade.", kind: "income" as const },
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
        return log(state, `${rival.name} äger inga fastigheter att förvärva.`, "warn");
      const minPrice = Math.round((rival.equity ?? 0) * 1.3);
      if (action.amount < minPrice)
        return log(state, `Minimipris för förvärv är ${msek(minPrice)} (130 % av eget kapital).`, "warn");
      // Din befintliga aktiepost i bolaget räknas av – du köper bara resten.
      const stock = state.stocks.find((x) => x.competitorName === rival.name);
      const ownFrac = stock && stock.sharesOutstanding > 0
        ? Math.min(1, stock.owned / stock.sharesOutstanding)
        : 0;
      const price = Math.round(action.amount * (1 - ownFrac));
      const down = Math.round(price * 0.25);
      if (state.cash < down)
        return log(state, `Otillräcklig kassa – behöver minst ${msek(down)} (25 % handpenning).`, "warn");
      const loan = price - down;
      const acquired = (rival.portfolio ?? []).map((p) => ({
        ...p,
        owned: true,
        purchasePrice: p.askPrice,
        txHistory: [
          ...(p.txHistory ?? []),
          { type: "köp" as const, price: p.askPrice, month: state.month, year: state.year, party: `Förvärv av ${rival.name}` },
        ],
      }));
      // Egen blankning i bolaget stängs till kurs vid avnoteringen. Något
      // "dotterbolag" med evig intäkt skapas INTE längre – husen ger hyra i
      // portföljen och en skalbolagsintäkt ovanpå vore dubbelräkning.
      const shortSettle = stock && (stock.shortQty ?? 0) > 0
        ? Math.max(0, Math.round((stock.shortAvgPrice ?? stock.price) * stock.shortQty! * 1.5) + Math.round(stock.shortQty! * ((stock.shortAvgPrice ?? stock.price) - stock.price)))
        : 0;
      return {
        ...state,
        // Bolagets kassa följer med köpet – du köper hela bolaget, inte bara husen.
        cash: state.cash - down + Math.round(rival.cash ?? 0) + shortSettle,
        debt: state.debt + loan,
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
            t: `🏢 FÖRVÄRV: ${rival.name} fusioneras in i koncernen för ${msek(price)}${ownFrac > 0 ? ` (din aktiepost ${pct(ownFrac)} räknades av)` : ""} – ${acquired.length} fastigheter och ${msek(Math.round(rival.cash ?? 0))} i kassa tillförs!${rivalQuote(rival.name, "uppköpt", state.month) ? " " + rivalQuote(rival.name, "uppköpt", state.month) : ""}`,
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
      // Obligationsprogrammet styrs av kreditbetyget: bättre betyg ger
      // lägre kupong och ett större program (andel av eget kapital).
      if ((state.crisisMonthsLeft ?? 0) > 0)
        return log(state, "📜 Obligationsmarknaden är fryst under krisen — inga emissioner.", "warn");
      const info = creditRatingOf(state);
      if (info.bondCap <= 0)
        return log(state, `📜 Betyget ${info.rating} stänger obligationsmarknaden — stärk balansräkningen först.`, "warn");
      const outstanding = (state.bonds ?? []).reduce((a, b) => a + b.amount, 0);
      const room = info.bondCap - outstanding;
      if (room < 1_000_000)
        return log(state, `📜 Obligationsprogrammet är fullt (${msek(outstanding)} av ${msek(info.bondCap)} vid betyg ${info.rating}). Lös in eller förbättra betyget.`, "warn");
      const amount = Math.min(action.amount, room);
      if (amount < 1_000_000) return log(state, "Minsta obligation är 1 MSEK.", "warn");
      const rate = bondRateFor(state, info.rating);
      const matureAbs = state.year * 12 + state.month + action.years * 12;
      const newBond = { id: String(Date.now()), amount, rate, matureAbs };
      return {
        ...state,
        cash: state.cash + amount,
        bonds: [...(state.bonds ?? []), newBond],
        log: [{ t: `📜 Obligationsemission (betyg ${info.rating}): ${msek(amount)} till ${rate.toFixed(2)} % kupong, ${action.years} år. Program: ${msek(outstanding + amount)} av ${msek(info.bondCap)}.`, kind: "income" }, ...state.log],
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
        portfolio: state.portfolio.filter((x) => x.id !== action.id),
        listings: [...state.listings, { ...p, owned: false, askPrice: salePrice, tenants: [lbTenant], listedMonth: state.year * 12 + state.month, expiresMonth: state.year * 12 + state.month + 3, poolAskPrice: undefined, poolBaseRent: undefined }],
        pendingRenewals: dropRenewals(state, (r) => r.propertyId === p.id),
        log: [{ t: `🔄 Sale-Leaseback: ${p.typeLabel} i ${p.districtName} såld för ${msek(salePrice)}, hyrt tillbaka till ${kr(monthlyLease)}/mån i 10 år.`, kind: "income" }, ...state.log],
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
        return log(state, `Behöver ${msek(down)} i handpenning för att höja budet till ${msek(myBid)}.`, "warn");
      const round = cb.round ?? 1;
      const response = nextBidRound(myBid, round);
      if (!response.fold) {
        // Rivalen kontrar – budkriget eskalerar, spelaren betalar inget ännu.
        return {
          ...state,
          competingBid: { ...cb, amount: response.amount, round: round + 1, expiresAbs: state.year * 12 + state.month + 1 },
          log: [
            { t: `🔥 BUDKRIG (runda ${round + 1}): ${cb.rivalName} kontrar med ${msek(response.amount)} på ${listing.typeLabel} i ${listing.districtName}. Höj igen eller släpp taget.`, kind: "warn" },
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
        log: [{ t: `✅ Du vann budkriget! ${listing.typeLabel} i ${listing.districtName} köpt för ${msek(myBid)} efter ${round} ${round === 1 ? "runda" : "rundor"}.${rivalQuote(cb.rivalName, "förlust", round) ? " " + rivalQuote(cb.rivalName, "förlust", round) : ""}`, kind: "buy" }, ...state.log],
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
      if (curIdx >= 5) return log(state, "Fastigheten har redan energiklass A — maximalt möjlig.", "warn");
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
        log: [{ t: `⚡ Energiuppgradering beställd: ${p.typeLabel} i ${p.districtName} → klass ${nextClass} (−${kr(cost)}) – klar vid månadsskiftet.`, kind: "upg" }, ...state.log],
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
      const label = action.action === "raise" ? "+10 %" : action.action === "lower" ? "−10 %" : "oförändrad";
      return {
        ...state,
        pendingRenewals: remaining,
        portfolio: state.portfolio.map((p) =>
          p.id === propertyId
            ? { ...p, tenants: p.tenants.map((t) => t.id === tenantId ? { ...t, rent: newRent, monthsLeft: renewal.termTotal } : t) }
            : p,
        ),
        log: [{ t: `📄 Avtal förnyat med ${renewal.tenantName} i ${renewal.districtName}: ${kr(newRent)}/mån (${label}).`, kind: "income" }, ...state.log],
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
      // Utdelningen hamnar i ägarens privata förmögenhet (Bolag → Arv)
      // och blidkar kapitalmarknaden om en aktivistfond bygger position.
      const relief = dividendRelief(amt, equityOf(state));
      return {
        ...state,
        cash: state.cash - amt,
        dividendsPaid: (state.dividendsPaid ?? 0) + amt,
        ownerWealth: (state.ownerWealth ?? 0) + amt,
        takeoverPressure: Math.max(0, (state.takeoverPressure ?? 0) - relief),
        log: [{ t: `💰 Utdelning: ${msek(amt)} till ägaren${relief >= 1 ? ` – aktivistfonden lugnas (−${Math.round(relief)} pe)` : ""}.`, kind: "income" }, ...state.log],
      };
    }
    case "START_MEGA": {
      // Megaprojekt är LANDMÄRKEN med fasta platser i stadens omland –
      // de kräver inte längre ett helägt kvarter, utan stadens förtroende
      // (rykte) och ett etablerat bolag. Prestige – inte avkastning.
      const proj = MEGA_PROJECTS.find((m) => m.id === action.projectId);
      if (!proj) return state;
      if ((state.megaCompleted ?? []).includes(proj.id) || (state.megaActive ?? []).some((m) => m.projectId === proj.id))
        return log(state, `${proj.name} är redan ${state.megaCompleted?.includes(proj.id) ? "byggd" : "under uppförande"}.`, "info");
      if ((state.companyLevel ?? 1) < 4)
        return log(state, "Megaprojekt kräver ett etablerat bolag (nivå 4).", "warn");
      if (state.reputation < 60)
        return log(state, `Staden anförtror bara megaprojekt åt aktörer med gott rykte (60+, du har ${Math.round(state.reputation)}).`, "warn");
      if (state.cash < proj.cost)
        return log(state, `${proj.name} kostar ${msek(proj.cost)} — kassan räcker inte.`, "warn");
      return {
        ...state,
        cash: state.cash - proj.cost,
        megaActive: [
          ...(state.megaActive ?? []),
          { projectId: proj.id, blockId: "", district: proj.site.district, monthsLeft: proj.months, totalMonths: proj.months },
        ],
        reputation: Math.min(100, state.reputation + 2),
        log: [
          { t: `${proj.icon} MEGAPROJEKT: ${proj.name} byggstartar (${msek(proj.cost)}, klart om ~${proj.months} mån). Staden häpnar.`, kind: "event" },
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
      if (!info) return log(state, "Stadsdelsprojekt kräver ett slutet kvarter med flera tomter (stenstaden).", "warn");
      if ((state.companyLevel ?? 1) < CITY_PROJECT_MIN_LEVEL)
        return log(state, `Staden släpper bara fram kvartersbyggen för etablerade bolag (bolagsnivå ${CITY_PROJECT_MIN_LEVEL}).`, "warn");
      if (!eligibleCityBlocks(state, fullyOwnedBlocks(state)).includes(action.blockId))
        return log(state, "Kvarteret är inte helägt eller används redan av ett projekt.", "warn");
      const cost = cityProjectCost(action.blockId, profile, state);
      if (state.cash < cost)
        return log(state, `${profile.name} på kvarteret kostar ${msek(cost)} — kassan räcker inte.`, "warn");
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
            t: `${profile.icon} STADSDELSPROJEKT: ${profile.name} byggstartar i ${blockDistrictName(action.blockId)} — ${demolished.length} hus rivs, ${msek(cost)} investeras, klart om ~${profile.months} mån. Staden har aldrig sett något liknande.`,
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
        return log(state, `${lux.name} ägs redan.`, "info");
      if ((state.ownerWealth ?? 0) < lux.cost)
        return log(state, `${lux.name} kostar ${msek(lux.cost)} — dela ut mer vinst till ägaren först.`, "warn");
      return {
        ...state,
        ownerWealth: (state.ownerWealth ?? 0) - lux.cost,
        ownerLuxuries: [...(state.ownerLuxuries ?? []), lux.id],
        reputation: Math.min(100, state.reputation + (lux.reputation ?? 0)),
        log: [{ t: `${lux.icon} ${lux.name} — ${lux.desc}`, kind: "event" }, ...state.log],
      };
    }
    case "BUY_AMBIENT": {
      // Off market-affär: ett privatägt hus (dekorbebyggelse) köps loss
      // och blir en riktig fastighet i portföljen – beståndet VÄXER,
      // inga hus ersätts. Ägaren säljer mot premie (se landDeals.ts).
      const parcel = parcelById(action.parcelId);
      if (!parcel) return state;
      if (districtLocked(state, parcel.district)) return log(state, "🔒 Området är låst – berättelsen öppnar staden kapitel för kapitel. Fortsätt kampanjen så öppnas det.", "warn");
      const grown = new Set(state.ambientGrown ?? []);
      if (!hasAmbientBuilding(parcel, grown))
        return log(state, "Tomten bär inget privatägt hus.", "warn");
      if (occupiedParcelIds(state).has(parcel.id))
        return log(state, "Fastigheten ägs redan av ett bolag.", "warn");
      const deal = ambientAsk(parcel, state);
      const prof = ambientProfile(parcel);
      const { maxLtv } = loanTerms(state);
      const down = deal.ask * (1 - maxLtv);
      if (state.cash < down)
        return log(state, `Ägaren begär ${msek(deal.ask)} — handpenning ${msek(down)} saknas.`, "warn");
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
        txHistory: [{ type: "köp", price: deal.ask, month: state.month, year: state.year, party: "Privat ägare" }],
      };
      return {
        ...state,
        cash: state.cash - down,
        debt: state.debt + loan,
        portfolio: [...state.portfolio, prop],
        log: [
          {
            t: `🤝 OFF MARKET: Köpte ${prof.typeLabel.toLowerCase()} i ${d.name} av privat ägare för ${msek(deal.ask)} (${Math.round((deal.premium - 1) * 100)} % över värdet${deal.holdout ? " – en riktig nejsägare" : ""}).`,
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
        return log(state, "Området är redan planlagt.", "info");
      if ((state.ownedPlanAreas ?? []).includes(def.blockId))
        return log(state, "Du äger redan råmarken.", "info");
      const price = rawLandPrice(def.blockId, state);
      if (state.cash < price)
        return log(state, `Råmarken kostar ${msek(price)} — kassan räcker inte (råmark belånas inte).`, "warn");
      return {
        ...state,
        cash: state.cash - price,
        ownedPlanAreas: [...(state.ownedPlanAreas ?? []), def.blockId],
        log: [
          { t: `🌾 Köpte råmarken vid ${DISTRICTS.find((x) => x.id === def.district)?.name} för ${msek(price)}. Starta detaljplan för att göra den byggbar.`, kind: "buy" },
          ...state.log,
        ],
      };
    }
    case "START_PLAN": {
      const def = expansionByBlock(action.blockId);
      if (!def || def.kind !== "plan") return state;
      if (!(state.ownedPlanAreas ?? []).includes(def.blockId))
        return log(state, "Köp råmarken först.", "warn");
      if ((state.planProcesses ?? []).some((p) => p.blockId === def.blockId))
        return log(state, "Planprocessen pågår redan.", "info");
      const fee = planFee(def.blockId);
      if (state.cash < fee)
        return log(state, `Planavgift och utredningar kostar ${msek(fee)} — kassan räcker inte.`, "warn");
      const proc = newPlanProcess(def.blockId, state);
      return {
        ...state,
        cash: state.cash - fee,
        planProcesses: [...(state.planProcesses ?? []), proc],
        log: [
          {
            t: `📋 DETALJPLAN PÅBÖRJAD: Planansökan för ${proc.districtName} inlämnad (${msek(fee)}). Samråd inleds — klart om ~${proc.totalMonths} mån om allt går vägen.`,
            kind: "event",
          },
          ...state.log,
        ],
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
            name: "Privat områdessatsning",
            district: action.districtId,
            districtName: d?.name ?? action.districtId,
            monthsLeft: months,
            totalMonths: months,
            boost,
          },
        ],
        log: [{
          t: `🏗 Områdessatsning i ${d?.name ?? action.districtId}: ${msek(amount)} investeras – områdesutveckling +${(boost * 100).toFixed(1)} % när den står klar om ~${months} mån.`,
          kind: "upg",
        }, ...state.log],
      };
    }
    case "DO_IPO": {
      if (state.ipoActive) return log(state, "Bolaget är redan börsnoterat.", "warn");
      // Noteringen baseras på aktuellt marknadsvärde, inte historiska utpriser.
      const portVal = state.portfolio.reduce((a, p) => a + propMarketValue(p, state), 0);
      const raised = Math.round(portVal * 0.20);
      if (raised < 1_000_000) return log(state, "Portföljvärdet är för lågt för en börsnotering.", "warn");
      const TOTAL_SHARES = 10_000_000;
      const sharePrice = Math.max(0.01, equityOf(state) / TOTAL_SHARES);
      const playerStock: Stock = {
        id: "FBAB",
        name: "Fastighets AB (ditt bolag)",
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
      return {
        ...state,
        cash: state.cash + raised,
        ipoActive: true,
        ipoShares: { total: TOTAL_SHARES, public: 3_000_000 },
        ipoPrice: sharePrice,
        takeoverPressure: 0,
        reputation: Math.min(100, state.reputation + 10),
        stocks: state.stocks.some((s) => s.id === "FBAB")
          ? state.stocks
          : [...state.stocks, playerStock],
        log: [{
          t: `🎉 IPO genomförd! ${msek(raised)} insamlat (20 % av portföljvärde). 10 M aktier emitterade, 3 M i publik handel @ ${sharePrice.toFixed(2)} kr/aktie. Reputation +10.`,
          kind: "income",
        }, ...state.log],
      };
    }
    case "MARKET_ORDER": {
      const st = state.stocks.find((s) => s.id === action.stockId);
      if (!st) return state;
      if (st.competitorName === "__player__") return log(state, "Du kan inte handla aktier i ditt eget bolag.", "warn");
      const COURTAGE = 0.003;
      if (action.side === "buy") {
        const cost = Math.round(st.price * action.qty * (1 + COURTAGE));
        if (state.cash < cost) return log(state, "Inte tillräckligt med kapital för köpet.", "warn");
        const newOwned = st.owned + action.qty;
        const newAvg = (st.avgCost * st.owned + st.price * action.qty) / newOwned;
        return {
          ...state,
          cash: state.cash - cost,
          stocks: state.stocks.map((s) =>
            s.id === action.stockId ? { ...s, owned: newOwned, avgCost: newAvg } : s,
          ),
          log: [{ t: `📈 Marknadsorder: köpte ${action.qty} aktier i ${st.name} @ ${st.price.toFixed(2)} kr. Totalt ${kr(cost)}.`, kind: "income" }, ...state.log],
        };
      } else {
        if (st.owned < action.qty) return log(state, "Inte tillräckligt med aktier att sälja.", "warn");
        const proceeds = Math.round(st.price * action.qty * (1 - COURTAGE));
        return {
          ...state,
          cash: state.cash + proceeds,
          stocks: state.stocks.map((s) =>
            s.id === action.stockId ? { ...s, owned: s.owned - action.qty } : s,
          ),
          log: [{ t: `📉 Marknadsorder: sålde ${action.qty} aktier i ${st.name} @ ${st.price.toFixed(2)} kr. Erhöll ${kr(proceeds)}.`, kind: "expense" }, ...state.log],
        };
      }
    }
    case "SHORT_STOCK": {
      const st = state.stocks.find((s) => s.id === action.stockId);
      if (!st) return state;
      if (st.competitorName === "__player__") return log(state, "Kan inte blanka ditt eget bolag.", "warn");
      if (action.qty <= 0) return state;
      const collateral = Math.round(st.price * action.qty * 1.5); // 150% marginal
      if (state.cash < collateral) return log(state, `Otillräckligt kapital för blankning. Kräver ${kr(collateral)} (150 % marginal).`, "warn");
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
        log: [{ t: `📉 Blankning: Sålde ${action.qty} aktier i ${st.name} kort @ ${kr(st.price)}. Marginal: ${kr(collateral)}.`, kind: "warn" }, ...state.log],
      };
    }
    case "COVER_SHORT": {
      const st = state.stocks.find((s) => s.id === action.stockId);
      if (!st || !(st.shortQty ?? 0)) return log(state, "Ingen blankningsposition att täcka.", "warn");
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
          t: `✅ Täckte blankning i ${st.name}: ${qty} aktier @ ${kr(st.price)} (snitt ${kr(avgShortPrice)}). Resultat: ${pnl >= 0 ? "+" : ""}${kr(pnl)}.`,
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
        return log(state, `Industriköp betalas kontant – du behöver ${msek(action.amount)}.`, "warn");
      const ratio = action.amount / Math.max(1, ref);
      const accepted = ratio >= 1.25 || (ratio >= 1.1 && Math.random() < 0.7);
      if (!accepted)
        return log(state, `${comp.name} avböjde ditt bud på ${asset.name} (${msek(action.amount)}). Bjud minst 125 % av värdet (${msek(Math.round(ref * 1.25))}) för garanterat svar.`, "warn");
      const bought: IndustryAsset = {
        ...asset,
        txHistory: [{ type: "köp", price: action.amount, month: state.month, year: state.year, party: comp.name }, ...(asset.txHistory ?? [])],
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
          { t: `🤝 ${comp.name} sålde ${asset.name} till dig för ${msek(action.amount)} (premie ${pct(ratio - 1)}).`, kind: "buy" },
          ...state.log,
        ],
      };
    }
    case "BUY_INDUSTRY": {
      const asset = (state.industryListings ?? []).find((a) => a.id === action.id);
      if (!asset) return state;
      if (districtLocked(state, asset.district)) return log(state, "🔒 Området är låst – berättelsen öppnar staden kapitel för kapitel. Fortsätt kampanjen så öppnas det.", "warn");
      if (state.cash < asset.purchasePrice) return log(state, "❌ Otillräckliga medel.", "warn");
      const bought: IndustryAsset = { ...asset, txHistory: [{ type: "köp", price: asset.purchasePrice, month: state.month, year: state.year, party: "Spelare" }, ...(asset.txHistory ?? [])] };
      return {
        ...state,
        cash: state.cash - asset.purchasePrice,
        industryPortfolio: [...(state.industryPortfolio ?? []), bought],
        industryListings: (state.industryListings ?? []).filter((a) => a.id !== action.id),
        reputation: Math.min(100, state.reputation + 1),
        log: [{ t: `🏢 Köpte ${asset.name} för ${msek(asset.purchasePrice)}.`, kind: "buy" }, ...state.log],
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
        log: [{ t: `💰 Sålde ${asset.name} för ${msek(salePrice)}.`, kind: "sell" }, ...state.log],
      };
    }

    case "UPGRADE_INDUSTRY": {
      const asset = (state.industryPortfolio ?? []).find((a) => a.id === action.id);
      const upg = INDUSTRY_UPGRADES.find((u) => u.id === action.upg);
      if (!asset || !upg) return state;
      if (asset.upgrades.includes(action.upg)) return log(state, "❌ Uppgradering redan installerad.", "warn");
      const cost = Math.round(industryAssetValue(asset, state) * upg.cost);
      if (state.cash < cost) return log(state, `❌ Saknar ${msek(cost)} för uppgraderingen.`, "warn");
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
      if (state.cash < cost) return log(state, `❌ Saknar ${msek(cost)} för underhåll.`, "warn");
      return {
        ...state,
        cash: state.cash - cost,
        industryPortfolio: (state.industryPortfolio ?? []).map((a) =>
          a.id === action.id ? { ...a, condition: Math.min(100, a.condition + 15) } : a,
        ),
        log: [{ t: `🔧 Underhåll på ${asset.name}: skick +15 (${msek(cost)}).`, kind: "expense" }, ...state.log],
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
        log: [{ t: `⚡ PPA-avtal tecknat med ${action.contract.clientName} för ${asset.name}.`, kind: "income" }, ...state.log],
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
        log: [{ t: `❌ PPA-kontrakt annullerat för ${asset.name}.`, kind: "info" }, ...state.log],
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
        log: [{ t: `📦 Logistikkontrakt tecknat med ${action.contract.clientName} för ${asset.name}.`, kind: "income" }, ...state.log],
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
        log: [{ t: `🏨 Bokningskanaler uppdaterade för ${asset.name}.`, kind: "info" }, ...state.log],
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
        log: [{ t: `${!asset.managed ? "✅ Förvaltare aktiverad" : "🔴 Förvaltare inaktiverad"} för ${asset.name}.`, kind: "info" }, ...state.log],
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
        log: [{ t: `${!asset.insurance ? "🛡️ Försäkring tecknad" : "❌ Försäkring avslutad"} för ${asset.name}.`, kind: "info" }, ...state.log],
      };
    }

    case "NEXT_DAY":
      return advanceDay(state);
    case "NEXT_MONTH":
      // Manuellt månadssteg: kör hela månadssimuleringen och landa på dag 1
      // i den nya månaden så att den rullande kalendern förblir koherent.
      return { ...advanceMonth(state), day: 1 };
    case "FAST_FORWARD": {
      let s = state;
      const n = Math.min(action.months, 24);
      for (let i = 0; i < n; i++) {
        if (s.gameOver || s.pendingDecision) break;
        s = advanceMonth(s);
      }
      return { ...s, day: 1 };
    }
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
          return log(state, `Ombyggnad till ${target} ${target === 1 ? "lokal" : "lokaler"} kräver att högst ${target} är uthyrda – säg upp eller vänta ut kontrakt.`, "warn");
        cost = Math.max(150_000, Math.round(value * 0.04 * Math.abs(target - p.capacity)));
        months = 3;
        renovation = { kind: "lokalanpassning", targetCapacity: target };
      } else {
        if (p.tenants.length > 0)
          return log(state, "Fastigheten måste vara vakant för ett utvecklingsprojekt.", "warn");
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
                  { type: "nybygg" as const, price: cost, month: state.month, year: state.year, party: `Projekt: ${action.kind}` },
                ],
              }
            : x,
        ),
        log: [
          {
            t: `🏗️ Utvecklingsprojekt startat: ${action.kind} av ${p.typeLabel} i ${p.districtName} (${msek(cost)}, klart om ${months} mån).`,
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
        return log(state, "Fastigheten måste vara vakant för rivning & nybyggnation.", "warn");
      const t = PROP_TYPES[p.type];
      const cost = Math.round(p.area * t.buildCostM2 * buildCostMult(state) * 1.1);
      const months = Math.max(5, t.buildMonths + buildMonthsDelta(state));
      if (state.cash < cost)
        return log(state, `Rivning & nybyggnation kostar ${msek(cost)} (fastigheten måste vara vakant).`, "warn");
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
                  { type: "nybygg" as const, price: cost, month: state.month, year: state.year, party: "Rivning & nybyggnation" },
                ],
              }
            : x,
        ),
        log: [
          { t: `🏗️ Rivning & nybyggnation startad: ${p.typeLabel} i ${p.districtName} (${msek(cost)}, klart om ${months} mån).`, kind: "upg" },
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
        return log(state, `Kassan räcker inte för budet ${msek(myBid)}.`, "warn");
      // AI-motbud: sannolikheten sjunker per runda, agenda-distrikt trippel.
      let counter: { name: string; bid: number } | null = null;
      for (const c of state.competitors) {
        const aggression =
          (c.agenda?.kind === "district" && c.agenda.district === a.district ? 0.75 : 0.3) -
          a.round * 0.12;
        const theirBid = Math.round((myBid * 1.08) / 10_000) * 10_000;
        if (c.cash + (c.equity ?? 0) * 0.3 >= theirBid && Math.random() < aggression) {
          if (!counter || theirBid > counter.bid) counter = { name: c.name, bid: theirBid };
        }
      }
      if (counter) {
        return {
          ...state,
          auction: { ...a, currentBid: counter.bid, leader: counter.name, round: a.round + 1 },
          log: [
            { t: `⚡ ${counter.name} bjuder över: ${msek(counter.bid)} för detaljplanen i ${a.districtName}.`, kind: "warn" },
            ...state.log,
          ],
        };
      }
      // Inget motbud – spelaren leder; nästa AUCTION_BID klubbar.
      return {
        ...state,
        auction: { ...a, currentBid: myBid, leader: "player", round: a.round + 1 },
        log: [
          { t: `🔨 Ditt bud ${msek(myBid)} står högst i detaljplaneauktionen (${a.districtName}).`, kind: "info" },
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
    case "UPGRADE_COMPANY": {
      // Expansion är ett aktivt val: kraven ska vara uppfyllda och det
      // kostar pengar (nytt kontor, rekrytering, jurister).
      const next = nextTier(state.companyLevel ?? 1);
      if (!next) return log(state, "Bolaget är redan på högsta nivån.", "info");
      if (next.requiresIpo && !state.ipoActive)
        return log(state, `${next.name} kräver en genomförd börsnotering (IPO) – se Finans.`, "warn");
      if (!qualifiesFor(state, next))
        return log(
          state,
          `Kraven för ${next.name} är inte uppfyllda: ${msek(next.minEquity)} eget kapital och ${next.minUnits} färdiga fastigheter.`,
          "warn",
        );
      if (state.cash < next.upgradeCost)
        return log(state, `Expansionen kostar ${msek(next.upgradeCost)} (nytt kontor och organisation).`, "warn");
      const nyheter =
        next.unlocks.length > 0 ? " Nya funktioner har låsts upp!" : "";
      return {
        ...state,
        cash: state.cash - next.upgradeCost,
        companyLevel: next.level,
        reputation: Math.min(100, state.reputation + 4),
        log: [
          {
            t: `${next.icon} EXPANSION: ${state.companyName ?? "Bolaget"} är nu ${next.name.toLowerCase()}! ${next.desc}${nyheter} (Reputation +4)`,
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
