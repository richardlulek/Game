/* ============================================================
   BALANSREVISION – mäter eget kapital-delta för varje spelarhandling.
   Invariant: ingen enskild handling ska direkt ÖKA eget kapital
   (annat än marginellt brus). Positiva utfall = misstänkt gratis
   kapital; starkt negativa = ev. straff som känns fel.
   Kör: npx vite-node auditBalance.ts
   ============================================================ */
import { equityOf } from "./src/engine/finance";
import { initState } from "./src/engine/initState";
import { reducer } from "./src/engine/reducer";
import type { GameAction, GameState } from "./src/engine/types";

const results: { name: string; delta: number; note?: string }[] = [];

const realRandom = Math.random;
function audit(name: string, prep: () => { s: GameState; a: GameAction | GameAction[]; note?: string }) {
  Math.random = realRandom; // varje fall börjar med äkta slump
  try {
    const { s, a, note } = prep();
    const before = equityOf(s);
    let after = s;
    for (const act of Array.isArray(a) ? a : [a]) after = reducer(after, act);
    // Handling som inte gick igenom (log-warn utan förändring) markeras.
    const delta = equityOf(after) - before;
    const blocked = after === s;
    results.push({ name, delta: Math.round(delta), note: blocked ? "BLOCKERAD? " + (note ?? "") : note });
  } catch (e) {
    results.push({ name, delta: NaN, note: "KRASCH: " + String(e).slice(0, 80) });
  }
}

function fresh(cash = 500_000_000): GameState {
  const s = initState();
  return { ...s, cash, story: null, companyLevel: 6 };
}

// ── Fastighetsaffärer ────────────────────────────────────────────────
audit("BUY (köp annons till utpris)", () => {
  const s = fresh();
  return { s, a: { type: "BUY", id: s.listings[0].id } };
});
audit("PLACE_BID accepterat @97 % av utpris", () => {
  const s = fresh();
  Math.random = () => 0.0; // alltid accept
  return { s, a: { type: "PLACE_BID", id: s.listings[0].id, amount: Math.round(s.listings[0].askPrice * 0.97) } };
});
audit("PLACE_BID accepterat @78 % (lågbudsgamble)", () => {
  const s = fresh();
  Math.random = () => 0.0;
  return { s, a: { type: "PLACE_BID", id: s.listings[0].id, amount: Math.round(s.listings[0].askPrice * 0.78) } };
});
audit("SELL (snabbförsäljning direkt efter köp)", () => {
  let s = fresh();
  const id = s.listings[0].id;
  s = reducer(s, { type: "BUY", id });
  return { s, a: { type: "SELL", id } };
});
audit("BUY_LOT + BUILD (nybygge, direkt efter färdigt)", () => {
  let s = fresh();
  const lot = s.lots[0];
  s = reducer(s, { type: "BUY_LOT", id: lot.id });
  const before = equityOf(s);
  s = reducer(s, { type: "BUILD", id: lot.id, propType: "kontor" });
  // låt bygget bli klart utan månadsbrus: sätt buildLeft=0 manuellt vore fusk –
  // mät i stället direkta deltat av BUILD-beslutet (kostnad mot bokfört värde).
  return { s: { ...s, cash: s.cash + 0 }, a: { type: "DISMISS_TUTORIAL" }, note: `BUILD-delta ${Math.round((equityOf(s) - before) / 1e6)} Msek (se rad)` };
});
audit("BUY_AMBIENT (privathus off market)", () => {
  const s = fresh();
  // hitta ett dekorhus i centrum
  return { s, a: { type: "BUY_AMBIENT", parcelId: "centrum-0" }, note: "centrum-0 kanske ej dekor" };
});
audit("OFFER_TO_RIVAL @125 % av utpris", () => {
  const s = fresh();
  const c = s.competitors.find((x) => x.portfolio.length > 0)!;
  const p = c.portfolio[0];
  return { s, a: { type: "OFFER_TO_RIVAL", competitorName: c.name, propertyId: p.id, amount: Math.round(p.askPrice * 1.25) } };
});
audit("BID_OFFMARKET @110 % av utpris", () => {
  const s = fresh();
  const p = (s.worldPool ?? [])[0];
  return { s, a: { type: "BID_OFFMARKET", propertyId: p.id, amount: Math.round(p.askPrice * 1.1) } };
});
audit("SALE_LEASEBACK direkt efter köp", () => {
  let s = fresh();
  const id = s.listings[0].id;
  s = reducer(s, { type: "BUY", id });
  return { s, a: { type: "SALE_LEASEBACK", id } };
});

// ── Förbättringar (ska vara tidsstyrda: bara kostnad direkt) ────────
audit("MAINTAIN (underhåll, direkt delta)", () => {
  let s = fresh();
  const id = s.listings[0].id;
  s = reducer(s, { type: "BUY", id });
  return { s, a: { type: "MAINTAIN", id } };
});
audit("UPGRADE (första uppgraderingen)", () => {
  let s = fresh();
  const id = s.listings[0].id;
  s = reducer(s, { type: "BUY", id });
  return { s, a: { type: "UPGRADE", id, upg: "hiss" }, note: "upg-id kanske annat" };
});
audit("IMPROVE_ENERGY", () => {
  let s = fresh();
  const id = s.listings[0].id;
  s = reducer(s, { type: "BUY", id });
  return { s, a: { type: "IMPROVE_ENERGY", id } };
});

// ── Distrikt & mark ─────────────────────────────────────────────────
audit("INVEST_DISTRICT 10 Msek (utan egna hus där)", () => {
  const s = fresh();
  return { s, a: { type: "INVEST_DISTRICT", districtId: "centrum", amount: 10_000_000 } };
});
audit("INVEST_DISTRICT 10 Msek (MED stor portfölj i distriktet)", () => {
  let s = fresh(2_000_000_000);
  // köp alla centrum-annonser för att ha exponering
  for (const l of [...s.listings]) if (l.district === "centrum") s = reducer(s, { type: "BUY", id: l.id });
  return { s, a: { type: "INVEST_DISTRICT", districtId: "centrum", amount: 10_000_000 } };
});
audit("BUY_RAW_LAND (planmark)", () => {
  const s = fresh();
  return { s, a: { type: "BUY_RAW_LAND", blockId: "kulle-plan0" } };
});

// ── Finans ──────────────────────────────────────────────────────────
audit("ISSUE_BOND 100 Msek", () => {
  const s = fresh();
  return { s, a: { type: "ISSUE_BOND", amount: 100_000_000, years: 5 } };
});
audit("DRAW_REVOLVING 50 Msek", () => {
  const s = fresh();
  return { s, a: { type: "DRAW_REVOLVING", amount: 50_000_000 } };
});
audit("REFINANCE 100 Msek", () => {
  let s = fresh();
  for (const l of s.listings.slice(0, 3)) s = reducer(s, { type: "BUY", id: l.id });
  return { s, a: { type: "REFINANCE", amount: 100_000_000 } };
});
audit("DO_IPO", () => {
  const s = fresh(2_000_000_000);
  return { s, a: { type: "DO_IPO" } };
});

// ── Börs ────────────────────────────────────────────────────────────
audit("BUY_SHARES + SELL_SHARES rundtur", () => {
  const s = fresh();
  const st = s.stocks[0];
  return { s, a: [
    { type: "BUY_SHARES", stockId: st.id, qty: 1000 },
    { type: "SELL_SHARES", stockId: st.id, qty: 1000 },
  ] };
});
audit("SHORT_STOCK (öppna blankning)", () => {
  const s = fresh();
  return { s, a: { type: "SHORT_STOCK", stockId: s.stocks[0].id, qty: 1000 } };
});
audit("SHORT + COVER direkt (rundtur)", () => {
  const s = fresh();
  const st = s.stocks[0];
  return { s, a: [
    { type: "SHORT_STOCK", stockId: st.id, qty: 1000 },
    { type: "COVER_SHORT", stockId: st.id },
  ] };
});

// ── Industri ────────────────────────────────────────────────────────
audit("BUY_INDUSTRY (första listningen)", () => {
  const s = fresh();
  const a = (s.industryListings ?? [])[0];
  return { s, a: { type: "BUY_INDUSTRY", id: a.id } };
});
audit("BUY_INDUSTRY + SELL_INDUSTRY rundtur", () => {
  let s = fresh();
  const a = (s.industryListings ?? [])[0];
  s = reducer(s, { type: "BUY_INDUSTRY", id: a.id });
  return { s, a: { type: "SELL_INDUSTRY", id: a.id } };
});
audit("UPGRADE_INDUSTRY (första uppgraderingen)", () => {
  let s = fresh();
  const a0 = (s.industryListings ?? [])[0];
  s = reducer(s, { type: "BUY_INDUSTRY", id: a0.id });
  const asset = (s.industryPortfolio ?? [])[0];
  return { s, a: { type: "UPGRADE_INDUSTRY", id: asset.id, upg: "u1" }, note: "upg-id kanske annat" };
});

// ── Utskrift ────────────────────────────────────────────────────────
console.log("\n== BALANSREVISION: EK-delta per handling (Msek) ==");
for (const r of results) {
  const flag = isNaN(r.delta) ? "💥" : r.delta > 2_000_000 ? "🚨" : r.delta > 200_000 ? "⚠️ " : "  ";
  console.log(`${flag} ${(isNaN(r.delta) ? "  NaN" : (r.delta / 1e6).toFixed(1).padStart(8))}  ${r.name}${r.note ? "   [" + r.note + "]" : ""}`);
}
