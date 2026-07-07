/* ============================================================
   Månadssimulering – kärnan i spelloopen.
   Logiken är oförändrad från prototypen.
   ============================================================ */

import { fullyOwnedBlocks } from "./blocks";
import { EXPANSION_BLOCKS, PARCELS } from "./city";
import {
  OVERLOAD_COST_PER_PROP,
  OVERLOAD_WEAR_MULT,
  nextTier,
  orgLoadOf,
  qualifiesFor,
  tierForLevel,
  unitCount,
} from "./company";
import { DISTRICT_TIERS, tierOfDev } from "./districtTiers";
import { esgRatingOf } from "./esg";
import { AI_NAMES, DISTRICT_EVENTS, DISTRICTS, EVENTS, MILESTONES, POLITICAL_PARTIES, RARE_EVENTS } from "./data";
import { SCENARIOS, rivalScenarioProgress, rivalWinsScenario } from "./scenarios";
import { makeDecision } from "./decisions";
import { equityOf, loanTerms } from "./finance";
import { kr, msek } from "./format";
import { propAnnualOpex, propMarketValue, propPotentialRent } from "./property";
import { genListing, genLot, makeTenant } from "./generators";
import { seasonOf } from "./season";
import { RESEARCH, monthlyReputation, salariesTotal, wearMult } from "./progression";
import { newId, pick, rnd } from "./random";
import { applyStockNews, executeLimitOrders, priceStocks, quarterlyEarnings, stepSentiment, stockHoldingsValue } from "./stocks";
import { tickHotel, tickEnergy, tickLogistik } from "./industries";
import type { GameState, LogEntry, Offer } from "./types";

/** Stegar fram spelet en månad och returnerar det nya tillståndet. */
export function advanceMonth(state: GameState): GameState {
  // Ett pågående beslut eller en auktion måste lösas innan spelet går vidare.
  if (state.pendingDecision || state.auction) return state;

  let s: GameState = { ...state };
  let monthlyNOI = 0;
  const events: LogEntry[] = [];
  const prevSent = state.marketSentiment ?? 1; // sentiment innan månadens händelser

  // Track previous equity for delta display
  s.prevEquity = equityOf(state);

  // Market cycle management (boom / stable / bust)
  if (!s.marketCycle) {
    s.marketCycle = { phase: "stable", monthsRemaining: 18 };
  }
  s.marketCycle = { ...s.marketCycle, monthsRemaining: s.marketCycle.monthsRemaining - 1 };
  if (s.marketCycle.monthsRemaining <= 0) {
    const cur = s.marketCycle.phase;
    const next: "boom" | "stable" | "bust" = cur === "stable"
      ? (Math.random() < 0.55 ? "boom" : "bust")
      : "stable";
    const dur = next === "boom" ? 10 + Math.floor(Math.random() * 14)
              : next === "bust" ? 6 + Math.floor(Math.random() * 10)
              : 12 + Math.floor(Math.random() * 12);
    s.marketCycle = { phase: next, monthsRemaining: dur };
    if (next === "boom") {
      s.marketMod = +(s.marketMod * 1.08).toFixed(3);
      s.demandMod = +(s.demandMod * 1.04).toFixed(3);
      events.push({ t: `📈 KONJUNKTURUPPGÅNG! Fastighetsmarknaden stiger (${dur} mån kvar).`, kind: "income" });
    } else if (next === "bust") {
      s.marketMod = +(s.marketMod * 0.92).toFixed(3);
      s.demandMod = +(s.demandMod * 0.96).toFixed(3);
      events.push({ t: `📉 KONJUNKTURNEDGÅNG! Marknaden sviktar (${dur} mån kvar).`, kind: "warn" });
    } else {
      events.push({ t: `📊 Konjunkturen stabiliseras — stabilt läge (${dur} mån).`, kind: "event" });
    }
  }

  // Decrement recession counter
  if ((s.recessionMonthsLeft ?? 0) > 0) {
    s.recessionMonthsLeft = (s.recessionMonthsLeft ?? 0) - 1;
  }

  // Bond interest payments.
  // OBS: alla poster som bokförs i monthlyNOI får INTE också dras direkt
  // från kassan – hela liggaren appliceras en gång via
  // `s.cash += monthlyNOI - interest` längre ned. (Tidigare drogs dessa
  // kostnader dubbelt och industriintäkter räknades dubbelt.)
  for (const bond of s.bonds ?? []) {
    const bondInterest = Math.round((bond.amount * bond.rate) / 100 / 12);
    monthlyNOI -= bondInterest;
  }
  // Maturing bonds: auto-repay if possible, else penalize
  const nowAbsBond = s.year * 12 + s.month;
  const maturingBonds = (s.bonds ?? []).filter((b) => b.matureAbs <= nowAbsBond);
  for (const bond of maturingBonds) {
    if (s.cash >= bond.amount) {
      s.cash -= bond.amount;
      events.push({ t: `🏦 Obligation på ${msek(bond.amount)} återbetalad vid förfall.`, kind: "info" });
    } else {
      s.reputation = Math.max(0, s.reputation - 10);
      s.cash -= bond.amount * 0.5;
      events.push({ t: `⚠️ Obligation på ${msek(bond.amount)} kunde ej återbetalas! Reputation −10.`, kind: "warn" });
    }
  }
  s.bonds = (s.bonds ?? []).filter((b) => b.matureAbs > nowAbsBond);

  // Fixed rate expiry
  const nowAbs = s.year * 12 + s.month;
  if (s.rateMode === "fixed" && s.fixedUntilAbs && nowAbs >= s.fixedUntilAbs) {
    s.rateMode = "variable";
    s.fixedRate = undefined;
    s.fixedUntilAbs = undefined;
    events.push({ t: "🔓 Fast ränteperiod avslutad – tillbaka till rörlig ränta.", kind: "info" });
  }

  // Revolving credit monthly interest (1.5 % / year on used amount)
  if (s.revolving && s.revolving.used > 0) {
    const revInterest = Math.round((s.revolving.used * 0.015) / 12);
    monthlyNOI -= revInterest;
  }

  // Säsongseffekt på bostäder: högre efterfrågan på sommaren, lägre på vintern.
  const seasonName = seasonOf(s.month);
  const season = seasonName === "sommar" ? 1.08 : seasonName === "vinter" ? 0.94 : 1.0;

  // Organisationens kapacitet: fler självförvaltade hus än kontoret klarar
  // ger extra slitage (och administrativ merkostnad längre ned).
  const orgLoad = orgLoadOf(state);
  const overloadWear = orgLoad.over > 0 ? OVERLOAD_WEAR_MULT : 1;

  s.portfolio = s.portfolio.map((p) => {
    const np = { ...p };
    // Bygge fortskrider
    if (np.status === "bygger") {
      np.buildLeft -= 1;
      if (np.buildLeft <= 0) {
        np.status = "klar";
        if (np.renovation) {
          // Utvecklingsprojekt färdigt: totalrenovering eller påbyggnad.
          if (np.renovation.kind === "totalrenovering") {
            np.condition = 100;
            np.energyClass = "A";
            np.rentMult = +(np.rentMult * 1.15).toFixed(3);
            np.builtYear = s.year;
            events.push({
              t: `✨ Totalrenovering klar: ${np.typeLabel} i ${np.districtName} – skick 100, energiklass A, +15 % hyrespotential.`,
              kind: "income",
            });
          } else {
            np.area = Math.round(np.area * 1.25);
            np.capacity = Math.min(np.wholeBlock ? 9 : 4, np.capacity + 1);
            np.valueMult = +(np.valueMult * 1.2).toFixed(3);
            np.baseRent = Math.round(np.baseRent * 1.25);
            np.condition = Math.max(85, np.condition);
            events.push({
              t: `🏗️ Påbyggnad klar: ${np.typeLabel} i ${np.districtName} – +25 % yta, +1 hyresplats, +20 % värde.`,
              kind: "income",
            });
          }
          np.renovation = undefined;
          s.reputation = Math.min(100, s.reputation + 3);
        } else {
          np.vacancyMult = Math.max(0.6, np.vacancyMult * 0.80); // nyproducerat: 20 % lägre vakans
          s.reputation = Math.min(100, s.reputation + 5);
          events.push({
            t: `🏗️ Nyproduktion klar: ${np.typeLabel} i ${np.districtName}. Reputation +5.`,
            kind: "income",
          });
        }
      }
      return np;
    }
    // Global portföljdirektör – effektiva inställningar
    const gm = s.globalManager;
    const effectiveManaged = np.managed || (gm?.active ?? false);
    const effectiveMaintainThreshold = np.managerSettings?.maintainThreshold ?? gm?.minCondition ?? 45;
    const effectiveRentTargetPct = np.managerSettings?.rentTargetPct ?? gm?.rentTargetPct ?? 1.0;
    // Förvaltare: månadskostnad + auto-underhåll med konfigurerbar tröskel
    if (effectiveManaged) {
      if (np.managed) {
        // per-property manager fee
        const managerCost = Math.max(2000, Math.round(np.tenants.reduce((a, t) => a + t.rent, 0) * 0.03));
        monthlyNOI -= managerCost;
      }
      if (np.condition < effectiveMaintainThreshold) {
        const maintainCost = Math.round(propMarketValue(np, s) * 0.02);
        if (s.cash >= maintainCost) {
          monthlyNOI -= maintainCost;
          np.condition = Math.min(100, np.condition + 15);
          events.push({ t: `🔧 Förvaltare underhöll ${np.typeLabel} i ${np.districtName} (tröskel ${effectiveMaintainThreshold}).`, kind: "upg" });
        }
      }
    }
    // Building age extra wear
    const propAge = s.year - (np.builtYear ?? s.year);
    const ageFactor = propAge >= 30 ? 1.4 : propAge >= 15 ? 1.2 : 1.0;
    // Seasonal effect on vacancy for residential
    const seasonFactor = np.type === "bostad" ? season : 1.0;
    // Short-term rental: higher effective rent but higher vacancy, no tenants
    // Överbelastad organisation sliter på husen ingen hinner se till.
    const orgWear = effectiveManaged ? 1 : overloadWear;
    if (np.shortTerm) {
      const shortRent = Math.round((propPotentialRent(np, s) / np.capacity / 12) * 1.3 * (1 - 0.60 * seasonFactor));
      monthlyNOI += shortRent * np.capacity;
      np.totalEarnedRent = (np.totalEarnedRent ?? 0) + shortRent * np.capacity;
      // Wear is higher with short-term rentals
      np.condition = Math.max(10, np.condition - rnd(0.4, 1.0) * wearMult(s) * ageFactor * orgWear);
      return np;
    }
    // Slitage (långsammare med smart förvaltning, mer med byggnadsålder)
    np.condition = Math.max(10, np.condition - rnd(0.2, 0.7) * wearMult(s) * ageFactor * orgWear);
    // Zone change countdown
    if (np.pendingZoneChange) {
      if (np.pendingZoneChange.monthsLeft <= 1) {
        const newType = np.pendingZoneChange.targetType;
        const typeDef = { bostad: "Bostadshus", kontor: "Kontor", butik: "Butik", industri: "Industri/Lager" } as Record<string, string>;
        np.typeLabel = typeDef[newType] ?? newType;
        np.type = newType;
        np.pendingZoneChange = undefined;
        events.push({ t: `✅ Omklassning klar: ${np.districtName} är nu ${typeDef[newType]}.`, kind: "upg" });
      } else {
        np.pendingZoneChange = { ...np.pendingZoneChange, monthsLeft: np.pendingZoneChange.monthsLeft - 1 };
      }
    }
    // Hyresgästlogik
    const nextTenants: typeof np.tenants = [];
    for (const t of np.tenants) {
      // Tenant loyalty: consecutiveMonths halves default risk after 24+ months
      const consMonths = (t.consecutiveMonths ?? 0) + 1;
      const loyaltyFactor = consMonths >= 24 ? 0.5 : 1.0;
      const recFactor = (s.recessionMonthsLeft ?? 0) > 0 ? 2.5 : 1.0;
      // Seasonal effect on default risk for residential
      const effDefaultRisk = t.defaultRisk * loyaltyFactor * recFactor * (np.type === "bostad" ? (seasonFactor > 1 ? 0.9 : 1.1) : 1.0);
      if (Math.random() < effDefaultRisk) {
        const evictionCost = Math.round(t.rent * 2);
        monthlyNOI -= evictionCost;
        events.push({ t: `⚠️ ${t.name} i ${np.districtName} gick i konkurs. Vräkningskostnad: ${kr(evictionCost)}.`, kind: "expense" });
        continue;
      }
      // Anchor tenant designation at 36+ consecutive months
      const isAnchor = consMonths >= 36;
      if (t.monthsLeft <= 1) {
        if (effectiveManaged) {
          const rentTargetPct = effectiveRentTargetPct;
          const marketMo = propPotentialRent(np, s) / np.capacity / 12;
          const baseRent = Math.round(marketMo * t.quality);
          const targetRent = Math.round(baseRent * rentTargetPct);
          const premiumRatio = targetRent / Math.max(1, baseRent);
          // Anchor tenants have higher willingness to stay
          const willStay = premiumRatio <= 1.10 || Math.random() < (isAnchor ? 0.65 : 0.40);
          if (willStay) {
            const newRent = rentTargetPct < 1.0
              ? Math.min(t.rent, targetRent)
              : Math.max(t.rent, targetRent);
            monthlyNOI += t.rent;
            np.totalEarnedRent = (np.totalEarnedRent ?? 0) + t.rent;
            nextTenants.push({ ...t, monthsLeft: t.termTotal, rent: newRent, consecutiveMonths: consMonths, isAnchor });
            events.push({ t: `📄 Förvaltare förnyade avtal med ${t.name} i ${np.districtName}: ${kr(newRent)}/mån.`, kind: "info" });
          } else {
            events.push({ t: `📄 ${t.name} lämnade ${np.districtName} – för hög hyra vid förlängning.`, kind: "info" });
          }
        } else {
          // Pending renewal: player has one month to decide
          const alreadyPending = (s.pendingRenewals ?? []).some(
            r => r.propertyId === np.id && r.tenantId === t.id,
          );
          if (alreadyPending) {
            events.push({ t: `📄 ${t.name} lämnade ${np.districtName} (kontraktet ej förnyat).`, kind: "info" });
            s.pendingRenewals = (s.pendingRenewals ?? []).filter(
              r => !(r.propertyId === np.id && r.tenantId === t.id),
            );
          } else {
            s.pendingRenewals = [
              ...(s.pendingRenewals ?? []),
              { propertyId: np.id, tenantId: t.id, tenantName: t.name, districtName: np.districtName, currentRent: t.rent, termTotal: t.termTotal },
            ];
            nextTenants.push({ ...t, monthsLeft: 1, consecutiveMonths: consMonths, isAnchor });
            monthlyNOI += t.rent;
            np.totalEarnedRent = (np.totalEarnedRent ?? 0) + t.rent;
            events.push({ t: `⏰ Kontrakt med ${t.name} i ${np.districtName} löper ut — förhandla i Hyresgäster-fliken!`, kind: "warn" });
          }
        }
        continue;
      }
      monthlyNOI += t.rent;
      np.totalEarnedRent = (np.totalEarnedRent ?? 0) + t.rent;
      nextTenants.push({ ...t, monthsLeft: t.monthsLeft - 1, consecutiveMonths: consMonths, isAnchor });
    }
    np.tenants = nextTenants;
    // Konditionskaskad: fastighet under 35 % skick driver ut hyresgäster (~8 % chans/hyresgäst/mån)
    if (np.condition < 35 && !effectiveManaged && np.tenants.length > 0) {
      np.tenants = np.tenants.filter((t) => {
        if (Math.random() < 0.08) {
          events.push({ t: `😟 ${t.name} lämnade ${np.districtName} pga eftersatt underhåll (skick ${Math.round(np.condition)} %).`, kind: "warn" });
          return false;
        }
        return true;
      });
    }
    // Förvaltare: auto-uthyr med hyresgästmarknadskonkurrens
    if (effectiveManaged && np.status === "klar") {
      const emptyNow = np.capacity - np.tenants.length;
      const minQuality = gm?.minTenantQuality ?? 0;
      // Konkurrens: rivals med fastigheter i samma distrikt minskar fill-chansen
      const rivalUnits = s.competitors.reduce(
        (a, c) => a + c.portfolio.filter((p) => p.district === np.district).length, 0,
      );
      const playerUnits = s.portfolio.filter(
        (p) => p.district === np.district && p.status === "klar",
      ).length;
      const dominance = playerUnits / Math.max(1, playerUnits + rivalUnits); // 0–1
      const condFactor = Math.max(0.3, np.condition / 100);
      // fill-chans: 8–45 % beroende på kondition och marknadsandel
      const fillChance = Math.min(0.45, condFactor * (0.15 + 0.30 * (0.5 + dominance)));
      for (let i = 0; i < emptyNow; i++) {
        if (Math.random() > fillChance) continue;
        const base = propPotentialRent(np, s) / np.capacity / 12;
        const candidate = makeTenant(base, s.demandMod, np.condition);
        if (candidate.quality >= minQuality) {
          np.tenants = [...np.tenants, candidate];
          events.push({ t: `👔 Förvaltare hyrde ut i ${np.typeLabel} ${np.districtName}: ${kr(candidate.rent)}/mån.`, kind: "info" });
        }
      }
    }
    // Opex dras alltid
    monthlyNOI -= propAnnualOpex(np, s) / 12;
    return np;
  });

  // Städa förhandlingslistan: behåll bara ärenden där fastigheten fortfarande
  // ägs och hyresgästen fortfarande väntar på besked (monthsLeft ≤ 1).
  // Förnyade, uppsagda eller sålda ärenden försvinner därmed automatiskt.
  if ((s.pendingRenewals ?? []).length > 0) {
    s.pendingRenewals = (s.pendingRenewals ?? []).filter((r) => {
      const prop = s.portfolio.find((p) => p.id === r.propertyId);
      const tenant = prop?.tenants.find((t) => t.id === r.tenantId);
      return !!tenant && tenant.monthsLeft <= 1;
    });
  }

  // Global portföljdirektör: månadsarvode
  if (s.globalManager?.active) {
    const gmCost = 15000 + s.portfolio.length * 1500;
    monthlyNOI -= gmCost;
  }

  // ── Bolagets kontor: overhead och överbelastning ────────────────
  {
    const tier = tierForLevel(s.companyLevel ?? 1);
    if (tier.monthlyOverhead > 0) {
      monthlyNOI -= tier.monthlyOverhead;
      if (s.month % 3 === 0)
        events.push({ t: `🏢 Kontorskostnad (${tier.name}): ${kr(tier.monthlyOverhead)}/mån.`, kind: "expense" });
    }
    if (orgLoad.over > 0) {
      const adminCost = orgLoad.over * OVERLOAD_COST_PER_PROP;
      monthlyNOI -= adminCost;
      if (s.month % 3 === 0) {
        events.push({
          t: `⚠️ Organisationen är överbelastad: ${orgLoad.selfManaged} självförvaltade fastigheter men kapacitet för ${orgLoad.cap}. Merkostnad ${kr(adminCost)}/mån och snabbare slitage – expandera bolaget eller anlita förvaltare.`,
          kind: "warn",
        });
      }
    }
  }

  // ── Industrisektorer – månadsuppdatering ─────────────────────────────────
  {
    const portfolio = s.industryPortfolio ?? [];
    let allHighOcc = portfolio.filter((a) => a.sector === "hotell" && a.status === "klar").length > 0;
    s.industryPortfolio = portfolio.map((asset) => {
      if (asset.status === "bygger") {
        const newLeft = asset.buildLeft - 1;
        if (newLeft <= 0) {
          events.push({ t: `🏗️ ${asset.name} är färdigbyggd!`, kind: "income" });
          return { ...asset, status: "klar" as const, buildLeft: 0 };
        }
        return { ...asset, buildLeft: newLeft };
      }

      // Skickförsämring
      const wear = wearMult(s);
      const newCond = Math.max(10, asset.condition - rnd(0.15, 0.55) * wear);
      let na = { ...asset, condition: newCond };

      // Sektorspecifik tick
      let revenue = 0;
      let opex = 0;
      let tickEvents: LogEntry[] = [];
      if (na.sector === "hotell")    [revenue, opex, tickEvents] = tickHotel(na, s);
      else if (na.sector === "energi")   [revenue, opex, tickEvents] = tickEnergy(na, s);
      else if (na.sector === "logistik") [revenue, opex, tickEvents] = tickLogistik(na, s);

      const netNOI = revenue - opex;
      monthlyNOI += netNOI;
      na = { ...na, monthlyRevenue: revenue, monthlyOpex: opex, totalRevenue: na.totalRevenue + revenue };
      tickEvents.forEach((e) => events.push(e));

      // Kreditera PPA-kontrakt (dekrementera monthsLeft)
      if (na.sector === "energi" && na.energyMeta) {
        na.energyMeta = {
          ...na.energyMeta,
          ppaContracts: na.energyMeta.ppaContracts
            .map((c) => ({ ...c, monthsLeft: c.monthsLeft - 1 }))
            .filter((c) => c.monthsLeft > 0),
        };
      }

      // Kreditera logistikkontrakt (dekrementera monthsLeft)
      if (na.sector === "logistik" && na.logisticsMeta) {
        na.logisticsMeta = {
          ...na.logisticsMeta,
          throughputContracts: na.logisticsMeta.throughputContracts
            .map((c) => ({ ...c, monthsLeft: c.monthsLeft - 1 }))
            .filter((c) => c.monthsLeft > 0),
        };
      }

      // Hotellets OCC-streak för hotelKing
      if (na.sector === "hotell" && na.hotelMeta) {
        const streak = na.hotelMeta.highOccStreak ?? 0;
        if (streak < (na.hotelMeta.highOccStreak ?? 0) || streak === 0) allHighOcc = false;
      }

      return na;
    });

    // Aggregera ägt MW för energisynergi
    s.energyOwnedMW = s.industryPortfolio
      .filter((a) => a.sector === "energi" && a.status === "klar")
      .reduce((sum, a) => sum + (a.energyMeta?.installedMW ?? 0), 0);

    // hotelKing-scenario: räkna månader med hög OCC på alla hotell
    const hotell = s.industryPortfolio.filter((a) => a.sector === "hotell" && a.status === "klar");
    if (hotell.length > 0) {
      const allAbove80 = hotell.every((a) => (a.hotelMeta?.highOccStreak ?? 0) >= 1);
      s.hotelHighOccConsecutiveMonths = allAbove80
        ? (s.hotelHighOccConsecutiveMonths ?? 0) + 1
        : 0;
    }

    // Hotellsynergi: hotell i centrum/kulle ger reputationsbonus
    const hotelRepBonus = s.industryPortfolio
      .filter((a) => a.sector === "hotell" && a.status === "klar" && (a.district === "centrum" || a.district === "kulle"))
      .reduce((sum, a) => sum + (a.hotelMeta?.starRating ?? 0) * 0.05, 0);
    if (hotelRepBonus > 0) s.reputation = Math.min(100, s.reputation + hotelRepBonus);
  }

  // Insurance monthly cost + catastrophe events
  const insuredProps = s.portfolio.filter((p) => p.insurance && p.status === "klar");
  if (insuredProps.length > 0) {
    // Premium: 0.40 % av marknadsvärde per år (min 2 000 kr/mån per fastighet)
    const insCost = insuredProps.reduce(
      (sum, p) => sum + Math.max(2_000, Math.round((propMarketValue(p, s) * 0.004) / 12)),
      0,
    );
    monthlyNOI -= insCost;
    s.insuranceCost = insCost;
  } else {
    s.insuranceCost = 0;
  }
  // Catastrophe: ~1.5% chance per month affects uninsured properties
  if (Math.random() < 0.015 && s.portfolio.filter((p) => p.status === "klar").length > 0) {
    const uninsured = s.portfolio.filter((p) => !p.insurance && p.status === "klar");
    if (uninsured.length > 0) {
      const victim = pick(uninsured);
      const damage = Math.round(propMarketValue(victim, s) * 0.08);
      monthlyNOI -= damage;
      s.portfolio = s.portfolio.map((p) =>
        p.id === victim.id ? { ...p, condition: Math.max(10, p.condition - 25) } : p,
      );
      events.push({ t: `🔥 Skadehändelse: ${victim.typeLabel} i ${victim.districtName} drabbades (${kr(damage)} i skadekostnader). Teckning av försäkring rekommenderas!`, kind: "warn" });
    }
  }

  // CPI rent indexing at start of each year (month === 1)
  if (s.month === 1 && s.year > 1) {
    const cpiRate = 0.02; // 2 % per år
    let indexCount = 0;
    s.portfolio = s.portfolio.map((p) => ({
      ...p,
      tenants: p.tenants.map((t) => {
        indexCount++;
        return { ...t, rent: Math.round(t.rent * (1 + cpiRate)) };
      }),
    }));
    if (indexCount > 0)
      events.push({ t: `📊 Hyresindex: alla hyror justerade +2 % (KPI-indexering, ${indexCount} kontrakt).`, kind: "income" });
  }

  const effectiveRate = (s.rateMode === "fixed" && s.fixedRate != null) ? s.fixedRate : loanTerms(s).rate;
  const interest = (s.debt * (effectiveRate / 100)) / 12;
  s.cash += monthlyNOI - interest;

  // Monthly property tax (22% of positive net income, offset by depreciation + ESG class A bonus)
  {
    const netIncome = monthlyNOI - interest;
    if (netIncome > 0) {
      const monthlyDepreciation = s.portfolio.reduce((sum, p) => {
        if (p.status !== "klar") return sum;
        return sum + ((p.purchasePrice ?? p.askPrice) * 0.02) / 12;
      }, 0);
      const taxableIncome = Math.max(0, netIncome - monthlyDepreciation);
      const energyACount = s.portfolio.filter(p => p.energyClass === "A" && p.status === "klar").length;
      const taxRate = Math.max(0.10, 0.22 - (energyACount > 0 ? 0.03 : 0));
      const monthlyTax = Math.round(taxableIncome * taxRate);
      if (monthlyTax > 0) {
        s.cash -= monthlyTax;
        s.totalTaxPaid = (s.totalTaxPaid ?? 0) + monthlyTax;
        if (s.month % 3 === 0) {
          events.push({ t: `🏛️ Fastighetsskatt: ${kr(monthlyTax)}/mån (avdrag ${kr(Math.round(monthlyDepreciation))}/mån, skattesats ${Math.round(taxRate * 100)} %).`, kind: "expense" });
        }
      }
    }
  }

  // LTV-covenant (gäller från år 2): banken straffar överkreditering
  if (s.year > 1 && s.debt > 0) {
    const portfolioVal = s.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0);
    if (portfolioVal > 0) {
      const ltv = s.debt / portfolioVal;
      if (ltv > 0.85) {
        const penalty = Math.round((s.debt * 0.015) / 12);
        s.cash -= penalty;
        monthlyNOI -= penalty;
        s.reputation = Math.max(0, s.reputation - 1);
        events.push({ t: `🏦 LTV-VARNING: Skuldkvot ${Math.round(ltv * 100)} % överstiger 85 %! Bankavgift ${kr(penalty)}/mån (rep −1).`, kind: "warn" });
      } else if (ltv > 0.75) {
        const surcharge = Math.round((s.debt * 0.005) / 12);
        s.cash -= surcharge;
        monthlyNOI -= surcharge;
        events.push({ t: `⚠️ Skuldkvot ${Math.round(ltv * 100)} % (gräns 75 %) — räntepåslag ${kr(surcharge)}/mån.`, kind: "expense" });
      }
    }
  }

  // Obligatorisk amortering: 0.5 % av skulden/mån när LTV > 40 %
  if (s.debt > 0) {
    const portValAmort = s.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0);
    const ltvAmort = portValAmort > 0 ? s.debt / portValAmort : 1;
    if (ltvAmort > 0.40) {
      const amort = Math.round(s.debt * 0.005);
      s.cash -= amort;
      s.debt = Math.max(0, s.debt - amort);
      monthlyNOI -= amort;
      if (s.month % 3 === 0) {
        events.push({ t: `🏦 Obligatorisk amortering: ${kr(amort)}/mån (LTV ${Math.round(ltvAmort * 100)} %). Skulden minskar.`, kind: "expense" });
      }
    }
  }

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

  // ── Politiska val var 4:e år (absolut månad % 48 === 0) ────────
  {
    const absM = s.year * 12 + s.month;
    if (absM % 48 === 0) {
      const party = pick(POLITICAL_PARTIES);
      s = party.apply(s);
      s.electionResult = party.name;
      events.push({ t: `🗳️ KOMMUNALVAL: ${party.name} vann. ${party.desc}`, kind: "warn" });
    }
  }

  // ── Distressed competitor sales ─────────────────────────────────
  for (const comp of s.competitors) {
    if (comp.cash < 0 && (comp.portfolio ?? []).length > 0 && Math.random() < 0.30) {
      const selling = comp.portfolio[Math.floor(Math.random() * comp.portfolio.length)];
      const distressedPrice = Math.round(selling.askPrice * rnd(0.75, 0.88));
      const born = s.year * 12 + s.month;
      s.listings = [
        ...s.listings,
        { ...selling, owned: false, askPrice: distressedPrice, listedMonth: born, expiresMonth: born + 2, poolAskPrice: undefined, poolBaseRent: undefined },
      ];
      s.competitors = s.competitors.map((c) =>
        c.name === comp.name ? { ...c, portfolio: c.portfolio.filter((p) => p.id !== selling.id) } : c,
      );
      events.push({ t: `🚨 Nödförsäljning! ${comp.name} tvingas sälja ${selling.typeLabel} i ${selling.districtName} för ${msek(distressedPrice)} (−${Math.round((1 - distressedPrice / selling.askPrice) * 100)} %).`, kind: "warn" });
    }
  }

  // ── Rivalrace: beräkna ledande rivals framsteg ──────────────────
  const leadRival = s.scenarioId && s.scenarioId !== "sandbox" && s.competitors.length > 0
    ? s.competitors.reduce(
        (best, c) =>
          rivalScenarioProgress(c, s.scenarioId!, s) > rivalScenarioProgress(best, s.scenarioId!, s)
            ? c : best,
        s.competitors[0],
      )
    : null;
  const leadProgress = leadRival && s.scenarioId
    ? rivalScenarioProgress(leadRival, s.scenarioId, s) : 0;
  const rivalIsClose = leadProgress > 0.75; // rival within striking distance

  // ── Competing bid on active listing (~12 % chans/mån) ──────────
  if (!s.competingBid && s.listings.length > 0 && Math.random() < (rivalIsClose ? 0.28 : 0.12)) {
    const target = pick(s.listings.filter((p) => p.status === "klar"));
    if (target) {
      const rival = pick(s.competitors);
      const amount = Math.round(target.askPrice * rnd(1.02, 1.15));
      const absNow = s.year * 12 + s.month;
      s.competingBid = { listingId: target.id, rivalName: rival.name, amount, expiresAbs: absNow + 1 };
      events.push({ t: `⚡ BUDGIVNING: ${rival.name} lade ${msek(amount)} på ${target.typeLabel} i ${target.districtName}! Slå budet eller låt dem köpa.`, kind: "warn" });
    }
  } else if (s.competingBid) {
    // Expire competing bid and let rival buy
    const absNow = s.year * 12 + s.month;
    if (absNow > s.competingBid.expiresAbs) {
      const listing = s.listings.find((p) => p.id === s.competingBid!.listingId);
      if (listing) {
        s.listings = s.listings.filter((p) => p.id !== listing.id);
        s.competitors = s.competitors.map((c) =>
          c.name === s.competingBid!.rivalName
            ? { ...c, portfolio: [...(c.portfolio ?? []), listing], units: (c.portfolio ?? []).length + 1 }
            : c,
        );
        events.push({ t: `🏢 ${s.competingBid.rivalName} köpte ${listing.typeLabel} i ${listing.districtName} för ${msek(s.competingBid.amount)}.`, kind: "event" });
      }
      s.competingBid = undefined;
    }
  }

  // ── Rival merger (~2 % chans/mån) ──────────────────────────────
  if (s.competitors.length >= 2 && Math.random() < 0.02) {
    const idxA = Math.floor(Math.random() * s.competitors.length);
    let idxB = Math.floor(Math.random() * (s.competitors.length - 1));
    if (idxB >= idxA) idxB++;
    const ca = s.competitors[idxA];
    const cb = s.competitors[idxB];
    const merged = {
      ...ca,
      cash: ca.cash + cb.cash,
      portfolio: [...(ca.portfolio ?? []), ...(cb.portfolio ?? [])],
      units: (ca.portfolio ?? []).length + (cb.portfolio ?? []).length,
      equity: ca.equity + cb.equity,
      monthlyNOI: (ca.monthlyNOI ?? 0) + (cb.monthlyNOI ?? 0),
    };
    s.competitors = s.competitors.filter((_, i) => i !== idxA && i !== idxB);
    s.competitors = [...s.competitors, merged];
    events.push({ t: `🤝 FUSION: ${ca.name} och ${cb.name} slås ihop till en starkare aktör!`, kind: "warn" });
  }

  // ── Lokala distriktshändelser (~8 % chans/distrikt/mån) ─────────
  if (Math.random() < 0.08) {
    const ev = DISTRICT_EVENTS[Math.floor(Math.random() * DISTRICT_EVENTS.length)];
    s = ev.apply(s);
    events.push({ t: `🏘️ Lokalt: ${ev.text}`, kind: "event" });
  }

  // ── AI-konkurrenter agerar (riktiga portföljer + personligheter) ─
  // Rivalernas ekonomi värderas med samma formel som spelarens och
  // andas därmed med konjunktur, distriktutveckling och marknadsläge.
  const cyclePhase = s.marketCycle?.phase ?? "stable";
  const cycleNOI = cyclePhase === "boom" ? 1.10 : cyclePhase === "bust" ? 0.88 : 1.0;
  s.competitors = s.competitors.map((c) => {
    const nc = { ...c, portfolio: [...(c.portfolio ?? [])] };
    const portVal = nc.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0);
    nc.monthlyNOI = Math.round((portVal * 0.06 * cycleNOI) / 12);
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
          poolAskPrice: undefined,
          poolBaseRent: undefined,
        },
      ];
      events.push({ t: `🏷️ ${c.name} säljer ${selling.typeLabel} i ${selling.districtName} (${msek(sellPrice)}).`, kind: "event" });
    }
    nc.units = nc.portfolio.length;
    nc.equity = nc.cash + nc.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0);
    return nc;
  });
  // Konkurrent köper från marknaden med strategi-filtrering
  if (s.listings.length > 3 && Math.random() < (rivalIsClose ? 0.55 : 0.25)) {
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
  // Sentiment rör sig (påverkat av konjunkturcykeln och månadens
  // makrohändelser), aktier prissätts och utdelning betalas ut.
  const sent = stepSentiment(s.marketSentiment ?? 1, s.marketCycle?.phase);
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
  // Kvartalsvinster var tredje månad (Q1=3, Q2=6, Q3=9, Q4=12)
  if (s.month % 3 === 0) {
    const earnings = quarterlyEarnings(s.stocks, s.marketSentiment ?? 1);
    s.stocks = earnings.stocks;
    for (const ev of earnings.events) {
      events.push({ t: ev, kind: "event" });
    }
  }
  // Blankningskostnad: 0.5 %/mån av blankad position (lånar aktier)
  const shortCost = s.stocks.reduce((a, st) => {
    if (!(st.shortQty ?? 0)) return a;
    return a + Math.round(st.price * st.shortQty! * 0.005);
  }, 0);
  if (shortCost > 0) {
    s.cash -= shortCost;
    events.push({ t: `📉 Blankningskostnad: ${kr(shortCost)}/mån (låneavgift 0,5 %).`, kind: "expense" });
  }
  // Tvångstäckning om aktie stigit > 80 % från blankningspris
  s.stocks = s.stocks.map((st) => {
    if (!(st.shortQty ?? 0) || !st.shortAvgPrice) return st;
    if (st.price > st.shortAvgPrice * 1.80) {
      const qty = st.shortQty!;
      const pnl = Math.round(qty * (st.shortAvgPrice - st.price));
      const collateral = Math.round(st.shortAvgPrice * qty * 1.5);
      s.cash += Math.max(0, collateral + pnl);
      events.push({ t: `🚨 Marginalkrav! Blankning i ${st.name} tvångstäckt @ ${kr(st.price)}. Förlust: ${kr(Math.abs(pnl))}.`, kind: "warn" });
      return { ...st, shortQty: 0, shortAvgPrice: 0 };
    }
    return st;
  });
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

  // ── IPO: uppdatera aktiekurs + beräkna uppköpstryck ────────────
  if (s.ipoActive && s.ipoShares) {
    // Uppdatera FBAB-kurs baserat på eget kapital
    s.stocks = s.stocks.map((st) => {
      if (st.id !== "FBAB") return st;
      const newPrice = Math.max(0.01, equityOf(s) / s.ipoShares!.total);
      return { ...st, prevPrice: st.price, price: newPrice, history: [...st.history, newPrice].slice(-32) };
    });
    // Beräkna uppköpstryck (0–100)
    const fbabStock = s.stocks.find((st) => st.id === "FBAB");
    const curPrice = fbabStock?.price ?? 1;
    const ipoRef = s.ipoPrice ?? curPrice;
    let pressureDelta = 1.5; // bas per månad
    if (s.marketCycle?.phase === "bust") pressureDelta += 3;
    if ((s.recessionMonthsLeft ?? 0) > 0) pressureDelta += 2;
    if (s.reputation > 70) pressureDelta -= 2;
    if (ipoRef > 0 && curPrice < ipoRef * 0.70) pressureDelta += 5; // kurs rasat >30 %
    const oldPressure = s.takeoverPressure ?? 0;
    s.takeoverPressure = Math.max(0, Math.min(100, oldPressure + pressureDelta));
    if (s.takeoverPressure >= 75 && oldPressure < 75) {
      events.push({ t: `⚠️ Uppköpstrycket stiger (${Math.round(s.takeoverPressure)} %)! Aktivister samlar aktier i ditt bolag.`, kind: "warn" });
    }
    if (s.takeoverPressure >= 100 && !s.pendingDecision) {
      const portVal2 = s.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0);
      const buybackCost = Math.round(portVal2 * 0.08);
      s.pendingDecision = {
        id: "hostile_takeover",
        title: "Fientligt uppköpsbud",
        text: "PE Nordic Activist Fund har ackumulerat aktier och kräver nu att bolaget säljs. Försvara dig eller sälj.",
        options: [
          {
            label: "Köp tillbaka aktier",
            detail: `${msek(buybackCost)} · tryck → 20 · rep +3`,
            effect: {
              cash: -buybackCost,
              reputation: 3,
              takeoverPressure: -80,
              log: "Köpte tillbaka aktier och försvarade kontrollen. Uppköpstrycket sjunker markant.",
              logKind: "income",
            },
          },
          {
            label: "PR-offensiv",
            detail: "2 MSEK · tryck −40 · rep +8",
            effect: {
              cash: -2_000_000,
              reputation: 8,
              takeoverPressure: -40,
              log: "PR-kampanj stärkte varumärket och dämpar uppköpstrycket tillfälligt.",
              logKind: "income",
            },
          },
          {
            label: "Acceptera uppköpsbudet",
            detail: "Bolaget säljs — spelet avslutas",
            effect: {
              gameOver: true,
              log: "Bolaget såldes till PE Nordic Activist Fund. Spelet är slut.",
              logKind: "warn",
            },
          },
        ],
      };
      events.push({ t: "🚨 FIENTLIGT BUD: PE Nordic kräver att bolaget säljs. Beslut krävs omedelbart!", kind: "warn" });
    }
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

  // Revolving credit auto-unlock at rep 40
  if (s.reputation >= 40 && !s.revolving) {
    const portVal = s.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0);
    const limit = Math.max(500_000, Math.round(portVal * 0.05));
    s.revolving = { limit, used: 0 };
    events.push({ t: `💳 Revolverande kredit aktiverad: ${kr(limit)} tillgängligt (5 % av portföljvärde).`, kind: "income" });
  }

  // Advisory board auto-unlock at rep milestones
  const advisors = s.advisors ?? [];
  if (s.reputation >= 60 && !advisors.includes("ekonom")) {
    s.advisors = [...advisors, "ekonom"];
    events.push({ t: "🎓 Rådgivarstyrelse: Ekonomisk rådgivare tillkommen (rep 60+). Ger analysstöd.", kind: "info" });
  }
  if (s.reputation >= 80 && !advisors.includes("jurist") && !(s.advisors ?? []).includes("jurist")) {
    s.advisors = [...(s.advisors ?? advisors), "jurist"];
    events.push({ t: "⚖️ Rådgivarstyrelse: Juridisk rådgivare tillkommen (rep 80+). Halverar omklasningstid.", kind: "info" });
  }
  if (s.reputation >= 95 && !advisors.includes("kapitalstrateg") && !(s.advisors ?? []).includes("kapitalstrateg")) {
    s.advisors = [...(s.advisors ?? advisors), "kapitalstrateg"];
    events.push({ t: "📊 Rådgivarstyrelse: Kapitalstrateg tillkommen (rep 95+). Sänker räntepåslag.", kind: "info" });
  }

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
    const ownedList = s.portfolio.filter((p) => p.district === d.id && p.status === "klar");
    const ownedHere = ownedList.length;
    const cur = dev[d.id] ?? 1;
    // Skötta hus gentrifierar, förfallna drar ned hela distriktet.
    const avgCond = ownedHere > 0 ? ownedList.reduce((a, p) => a + p.condition, 0) / ownedHere : 62;
    const condPull = ((avgCond - 62) / 100) * 0.002;
    const growth = 0.0015 * ownedHere + condPull + rnd(-0.0025, 0.004);
    // Hotellsynergi: hotell i distriktet höjer distriktsutvecklingen
    const hotelBonus = (s.industryPortfolio ?? [])
      .filter((a) => a.sector === "hotell" && a.district === d.id && a.status === "klar")
      .reduce((sum, a) => sum + (a.hotelMeta?.starRating ?? 0) * 0.002, 0);
    dev[d.id] = Math.max(0.85, Math.min(1.6, +(cur * (1 + growth + hotelBonus)).toFixed(4)));
  }
  s.districtDev = dev;

  // ── Distriktsöden: statusbyten är händelser i staden ─────────────
  {
    const tiers: Record<string, string> = { ...(s.districtTiers ?? {}) };
    for (const d of DISTRICTS) {
      const tier = tierOfDev(dev[d.id] ?? 1);
      const prev = tiers[d.id];
      if (prev && prev !== tier.id) {
        const prevIdx = DISTRICT_TIERS.findIndex((t) => t.id === prev);
        const newIdx = DISTRICT_TIERS.findIndex((t) => t.id === tier.id);
        const up = newIdx > prevIdx;
        events.push({
          t: up
            ? `${tier.icon} STADSOMVANDLING: ${d.name} klassas nu som ${tier.name} – hyror och värden lyfter i takt med områdets rykte.`
            : `${tier.icon} ${d.name} har halkat ned till ${tier.name} – eftersatt underhåll och svag utveckling pressar området.`,
          kind: up ? "income" : "warn",
        });
      }
      tiers[d.id] = tier.id;
    }
    s.districtTiers = tiers;
  }

  // ── Helkvarter: fira när ett slutet kvarter blir helägt ──────────
  {
    const current = fullyOwnedBlocks(s);
    const known = new Set(s.ownedBlocks ?? []);
    for (const blockId of current) {
      if (!known.has(blockId)) {
        s.reputation = Math.min(100, s.reputation + 2);
        events.push({
          t: `🏆 HELKVARTER! ${s.companyName ?? "Bolaget"} äger nu hela kvarteret ${blockId.replace("-kv", " ")} – samordnad drift ger +10 % hyra och −15 % driftkostnad (rep +2).`,
          kind: "income",
        });
      }
    }
    s.ownedBlocks = current;
  }

  // ── ESG: betygsbyten och grönt lån ───────────────────────────────
  {
    const rating = esgRatingOf(s);
    const prev = s.esgRating;
    if (prev && prev !== rating.letter) {
      if (rating.spreadDelta < 0)
        events.push({ t: `🌱 ESG-betyg ${rating.letter}: grönt lån aktivt – räntepåslaget sänks med ${Math.abs(rating.spreadDelta).toFixed(2)} %-enheter.`, kind: "income" });
      else if (rating.spreadDelta > 0)
        events.push({ t: `🏭 ESG-betyg ${rating.letter}: bankerna kräver ${rating.spreadDelta.toFixed(2)} %-enheter extra i räntepåslag. Energiuppgradera beståndet!`, kind: "warn" });
      else events.push({ t: `♻️ ESG-betyg ändrat till ${rating.letter}.`, kind: "info" });
    }
    s.esgRating = rating.letter;
    // Dålig hållbarhet göder aktivister efter börsnoteringen.
    if (s.ipoActive && rating.spreadDelta > 0)
      s.takeoverPressure = Math.min(100, (s.takeoverPressure ?? 0) + 1.5);
  }

  // ── Rivalagendor: utspel när målen närmar sig ────────────────────
  s.competitors = s.competitors.map((c) => {
    const ag = c.agenda;
    if (!ag || ag.announced) return c;
    const progress =
      ag.kind === "district"
        ? c.portfolio.filter((p) => p.district === ag.district).length / ag.target
        : ag.kind === "units"
          ? c.portfolio.filter((p) => p.status === "klar").length / ag.target
          : c.equity / ag.target;
    if (progress >= 1) {
      events.push({ t: `🏁 ${c.name} har nått sitt mål: ${ag.label}. Rivalen växlar upp – räkna med hårdare konkurrens.`, kind: "warn" });
      return { ...c, agenda: { ...ag, announced: true } };
    }
    return c;
  });

  // ── Detaljplaneauktion: kommunen släpper nytt kvarter ────────────
  {
    const absM = s.year * 12 + s.month;
    const unlocked = new Set(s.unlockedBlocks ?? []);
    const nextBlock = EXPANSION_BLOCKS.find((b) => !unlocked.has(b.blockId));
    if (!s.auction && nextBlock && absM % 30 === 0) {
      const parcels = PARCELS.filter((p) => p.blockId === nextBlock.blockId);
      const d = DISTRICTS.find((x) => x.id === nextBlock.district)!;
      const landValue = parcels.reduce((a, p) => a + p.w * p.d * 2 * d.base * 0.18, 0);
      const minBid = Math.round((landValue * s.marketMod * 0.8) / 10_000) * 10_000;
      s.auction = {
        blockId: nextBlock.blockId,
        district: nextBlock.district,
        districtName: d.name,
        parcels: parcels.length,
        minBid,
        currentBid: minBid,
        leader: null,
        round: 0,
      };
      events.push({
        t: `🏛️ DETALJPLANEAUKTION: Kommunen släpper ett nytt kvarter i ${d.name} (${parcels.length} tomter, utrop ${msek(minBid)}). Spelet pausar tills auktionen avgjorts.`,
        kind: "event",
      });
    }
  }

  // Råvarupris/byggkostnad mjukt tillbaka mot normalt
  s.buildCostMod = +(((s.buildCostMod ?? 1) * 0.85 + 0.15)).toFixed(3);

  // ── Beslutshändelse (~6 %) ──────────────────────────────────────
  if (Math.random() < 0.06) {
    const decision = makeDecision(s);
    s.pendingDecision = decision;
    events.push({ t: `🤔 Beslut krävs: ${decision.title}`, kind: "event" });
  }

  // ── Utgångna listings återgår till världspoolen ─────────────────
  const nowAbs2 = s.year * 12 + s.month;
  const expiredListings: typeof s.listings = [];
  s.listings = s.listings.filter((p) => {
    if ((p.expiresMonth ?? Infinity) <= nowAbs2) {
      // Tillbaka till poolen med ursprungspriset återställt (annars skulle
      // marknadspåslaget ackumuleras varje gång objektet listas om) och
      // utan tomtruta – poolen är abstrakt tills objektet syns igen.
      expiredListings.push({
        ...p,
        askPrice: p.poolAskPrice ?? p.askPrice,
        baseRent: p.poolBaseRent ?? p.baseRent,
        poolAskPrice: undefined,
        poolBaseRent: undefined,
        parcelId: undefined,
        listedMonth: undefined,
        expiresMonth: undefined,
      });
      return false;
    }
    return true;
  });
  s.worldPool = [...(s.worldPool ?? []), ...expiredListings];
  s.lots = s.lots.filter((l) => {
    if (!l.owned && (l.expiresMonth ?? Infinity) <= nowAbs2) {
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
    const born = nowAbs2;
    s.listings = [
      ...s.listings,
      ...toReveal.map((p) => ({
        ...p,
        // Snapshot av grundpriset så att det kan återställas vid utgång.
        poolAskPrice: p.askPrice,
        poolBaseRent: p.baseRent,
        askPrice: Math.round(p.askPrice * s.marketMod),
        baseRent: Math.round(p.baseRent * s.marketMod),
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

  // Lånelöptid: refinansiering var 48–72 månad
  if (s.debt > 0) {
    const nowAbs3 = s.year * 12 + s.month;
    if (!s.debtMatureAbs) {
      s.debtMatureAbs = nowAbs3 + 48 + Math.floor(Math.random() * 24);
    } else if (nowAbs3 >= s.debtMatureAbs) {
      const cycle = s.marketCycle?.phase ?? "stable";
      const recSpread = (s.recessionMonthsLeft ?? 0) > 0 ? 2.0 : 0;
      const cycleSpread = cycle === "bust" ? 1.5 : cycle === "boom" ? -0.5 : 0;
      const repSpread = s.reputation < 40 ? 2.5 : s.reputation < 60 ? 1.0 : 0;
      const oldRate = s.interestRate;
      const baseRate = loanTerms(s).rate + cycleSpread + recSpread + repSpread;
      s.interestRate = +(Math.min(12, Math.max(2, baseRate)).toFixed(2));
      s.debtMatureAbs = nowAbs3 + 48 + Math.floor(Math.random() * 24);
      const rateDiff = +(s.interestRate - oldRate).toFixed(2);
      events.push({
        t: `🏦 REFINANSIERING: Lånet förfaller. Ny ränta ${s.interestRate.toFixed(1)} % (${rateDiff >= 0 ? "+" : ""}${rateDiff.toFixed(1)} %). Marknad: ${cycle}${recSpread > 0 ? ", lågkonjunktur" : ""}.`,
        kind: rateDiff > 0.25 ? "warn" : "income",
      });
    }
  }

  // ── Bolagsresan: hint när kraven för nästa nivå uppnås ──────────
  // Själva expansionen är spelarens beslut (UPGRADE_COMPANY) – den
  // kostar pengar och görs i Bolag-panelen. Hinten loggas en gång.
  {
    const tier = nextTier(s.companyLevel ?? 1);
    if (tier && qualifiesFor(s, tier) && s.levelUpOfferedFor !== tier.level) {
      s.levelUpOfferedFor = tier.level;
      events.push({
        t: `📈 ${s.companyName ?? "Bolaget"} uppfyller kraven för ${tier.name}! Öppna Bolag och expandera (${msek(tier.upgradeCost)}).`,
        kind: "income",
      });
    }
  }

  // Tid
  s.month += 1;
  if (s.month > 12) {
    s.month = 1;
    s.year += 1;
    s.marketMod = +(s.marketMod * rnd(0.99, 1.04)).toFixed(3);
    // Årsbokslut: hur gick året för bolaget?
    const prevYearEq = s.history[s.history.length - 12]?.equity;
    if (prevYearEq !== undefined && prevYearEq !== 0) {
      const eqNow = equityOf(s);
      const diffPct = Math.round(((eqNow - prevYearEq) / Math.abs(prevYearEq)) * 100);
      events.push({
        t: `📆 ÅRSBOKSLUT ${s.year - 1}: eget kapital ${msek(eqNow)} (${diffPct >= 0 ? "+" : ""}${diffPct} % under året), ${unitCount(s)} fastigheter i beståndet.`,
        kind: diffPct >= 0 ? "income" : "warn",
      });
    }
  }

  // Win condition check
  if (!s.gameWon && s.scenarioId && s.scenarioId !== "sandbox") {
    const sc = SCENARIOS.find((x) => x.id === s.scenarioId);
    if (sc?.check(s)) {
      s.gameWon = true;
      s.log = [
        { t: `🏆 MÅL UPPNÅTT: ${sc.title} – ${sc.subtitle}! Spelat klart år ${s.year}.`, kind: "income" },
        ...s.log,
      ];
    }
  }

  // Rival race: rival som når scenariomålet före spelaren = förlust för spelaren
  if (!s.gameOver && !s.gameWon && s.scenarioId && s.scenarioId !== "sandbox") {
    for (const rival of s.competitors) {
      if (rivalWinsScenario(rival, s.scenarioId, s)) {
        s.gameOver = true;
        s.log = [
          { t: `🏳️ ${rival.name} nådde målet "${s.scenarioId}" före dig — du förlorade racet!`, kind: "warn" },
          ...s.log,
        ];
        break;
      }
    }
  }

  // Milestone checking
  const doneMilestones = s.milestones ?? [];
  for (const ms of MILESTONES) {
    if (!doneMilestones.includes(ms.id) && ms.check(s)) {
      s.milestones = [...doneMilestones, ms.id];
      s.reputation = Math.min(100, s.reputation + 3);
      events.push({ t: `🏅 MILSTOLPE: ${ms.title} – ${ms.desc} (Belöning: ${ms.reward})`, kind: "income" });
    }
  }

  const net = monthlyNOI - interest;
  const summary: LogEntry = {
    t: `Månad ${s.month}/${s.year}: driftnetto ${kr(monthlyNOI)} − ränta ${kr(interest)} = ${kr(net)}.`,
    kind: net >= 0 ? "income" : "expense",
  };
  s.log = [...events, summary, ...s.log].slice(0, 70);

  const equity = equityOf(s);
  s.history = [...s.history, { month: s.history.length, equity }].slice(-120);

  if (s.cash < -200_000 && s.cash >= -1_000_000 && !s.gameOver) {
    s.log = [{ t: `🚨 KASSAVARNING: Kassan ${kr(s.cash)}. Konkurs vid −1 000 000 kr!`, kind: "warn" }, ...s.log];
  }
  if (s.cash < -1_000_000) {
    s.gameOver = true;
    s.log = [{ t: "💥 KONKURS! Kassan under −1 000 000 kr. Spelet är slut.", kind: "warn" }, ...s.log];
  }
  return s;
}
