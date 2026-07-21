import { describe, expect, it } from "vitest";
import { initState } from "../engine/initState";
import { advanceMonth } from "../engine/simulation";
import { reducer } from "../engine/reducer";
import { placeCity } from "../engine/city";
import { equityOf, loanTerms, ltvOf } from "../engine/finance";
import { propMarketValue, propPotentialRent, propAnnualOpex } from "../engine/property";
import { accessibilityOf } from "../engine/infrastructure";
import { obsolescenceFactor } from "../engine/lifecycle";
import { maxDevLevel, districtTier } from "../engine/districtTiers";
import { DISTRICTS, UPGRADES } from "../engine/data";
import { RESEARCH } from "../engine/progression";
import type { GameAction } from "../engine/types";

// Typshim för Node-miljön (undviker beroende av @types/node bara för detta).
declare const process: { env: Record<string, string | undefined> };

// 30 års soak/integration – icke-deterministisk och ~3–5 s. Körs INTE i den
// vanliga sviten (skulle ge flake/tid); kör med:  PLAYTEST=1 npx vitest run
// src/__tests__/playtest30.soak.test.ts   – rapport skrivs till stdout.
const suite = process.env.PLAYTEST === "1" ? describe : describe.skip;
suite("SPELTEST: 30 år, alla system i verklig simulering", () => {
  it("kör 360 månader utan krasch och håller alla invarianter", () => {
    let s = placeCity(initState());
    const R = (a: GameAction) => { try { s = reducer(s, a); } catch (e) { throw new Error(`Action ${a.type} kraschade: ${(e as Error).message}`); } };

    const counted = new Set<string>();
    const ev: Record<string, number> = {};
    const bump = (k: string) => (ev[k] = (ev[k] ?? 0) + 1);
    const scanLog = () => {
      for (const l of s.log.slice(0, 14)) {
        if (counted.has(l.t)) continue;
        counted.add(l.t);
        if (l.t.includes("RIKSBANKEN")) bump("riksbank-drag");
        if (l.t.includes("BUDKRIG")) bump("budkrig-rundor");
        if (l.t.includes("vann budkriget")) bump("budkrig-vinst");
        if (l.t.includes("bygger nytt") || l.t.includes("completed its new build")) bump("rival-nybygge");
        if (l.t.includes("is extending its building")) bump("rival-påbyggnad");
        if (l.t.includes("OPENED")) bump("infra-invigt");
        if (l.t.includes("BYGGSTART")) bump("infra-byggstart");
        if (l.t.includes("The city grows")) bump("stad-växer-notis");
        if (l.t.includes("UPTURN")) bump("boom");
        if (l.t.includes("DOWNTURN")) bump("bust");
        if (l.t.includes("Nybyggnation klar")) bump("egen-nybyggnation");
        if (l.t.includes("Extension done")) bump("egen-påbyggnad");
        if (l.t.includes("Totalrenovering klar")) bump("egen-totalrenovering");
        if (l.t.includes("DETALJPLANEAUKTION")) bump("auktion-släppt");
        if (l.t.includes("BANKRUPTCY")) bump("konkurs");
        if (l.t.includes("GOAL REACHED")) bump("vinst");
        if (l.t.includes("damage event") || l.t.includes("Damage event")) bump("skada");
        if (l.t.includes("FUSION")) bump("rival-fusion");
        if (l.t.includes("Distress sale")) bump("nödförsäljning");
        // Fas 2 – staden som organism:
        if (l.t.includes("Moving chain")) bump("flyttkedjepuls");
        if (l.t.includes("total renovation in")) bump("renovräkning-erbjuden");
        if (l.t.includes("RENOVICTION")) bump("renovräkning-vald");
        if (l.t.includes("Protests in")) bump("gentrifieringsprotest");
      }
    };

    const snapshots: string[] = [];
    let maxDev = 0;
    let bidsSeen = 0;
    let prevBid = false;
    let peakEquity = -Infinity;
    let worstCash = Infinity;
    let redevelops = 0;
    let bankruptYear: number | null = null;
    let peakHouses = 0;

    for (let m = 0; m < 360; m++) {
      // ── Rensa blockerare så månaden kan rulla ──
      let guard = 0;
      while (s.pendingDecision && guard++ < 5) {
        const opts = s.pendingDecision.options;
        let idx = opts.findIndex((o) => !o.effect.gameOver);
        if (idx < 0) idx = 0;
        R({ type: "RESOLVE_DECISION", optionIndex: idx });
      }
      guard = 0;
      while (s.auction && guard++ < 6) {
        const a = s.auction;
        const myBid = a.leader ? a.currentBid * 1.08 : a.minBid;
        if (s.cash > myBid * 4 && Math.random() < 0.4) R({ type: "AUCTION_BID" });
        else R({ type: "AUCTION_PASS" });
      }
      if (s.auction) R({ type: "AUCTION_PASS" });

      // ── Budkrig ──
      if (s.competingBid) {
        if (!prevBid) bidsSeen++;
        prevBid = true;
        const cb = s.competingBid;
        const down = cb.amount * 1.02 * (1 - loanTerms(s).maxLtv);
        if (s.cash > down * 3 && Math.random() < 0.5) R({ type: "ACCEPT_COMPETING_BID" });
        else R({ type: "PASS_COMPETING_BID" });
      } else prevBid = false;

      // ── Spelarens drag: en försiktig, solvent förvaltare med kassabuffert ──
      // Alla utgifter kräver att kassan efter köpet ligger kvar över bufferten.
      // Efter en ev. konkurs slutar spelaren agera – men VÄRLDEN rullar vidare
      // hela 30 år (rivaler, riksbank, konjunktur, infrastruktur, front).
      const BUF = 1_200_000;
      const canSpend = (cost: number) => s.cash - cost > BUF && !s.gameOver;
      if (!s.gameOver) {

      // Autoförvaltning så snart vi äger något (sköter uthyrning + underhåll).
      if (!s.globalManager?.active && s.portfolio.length >= 1)
        R({ type: "SET_GLOBAL_MANAGER", settings: { active: true, minCondition: 60, minTenantQuality: 0.5, rentTargetPct: 1.0 } });

      // Likviditetsvakt: dra revolverkredit om det tryter (bara med bestånd).
      if (s.cash < 400_000 && s.portfolio.length > 0) {
        if (s.revolving && s.revolving.used < s.revolving.limit) R({ type: "DRAW_REVOLVING", amount: Math.min(1_000_000, s.revolving.limit - s.revolving.used) });
        else if ((s.bonds ?? []).length < 2) R({ type: "ISSUE_BOND", amount: 4_000_000, years: 6 });
      }

      // Köp kassaflödande annonser med LÅG hävstång och rejäl reserv: bara
      // billiga objekt som täcker räntan, med kassa > 4 MSEK och LTV < 45 %.
      if (m % 2 === 0 && s.cash > 4_000_000 && ltvOf(s) < 0.45 && s.portfolio.filter((p) => p.status === "klar").length < 20) {
        const terms = loanTerms(s);
        const affordable = s.listings
          .filter((p) => p.status === "klar" && canSpend(p.askPrice * (1 - terms.maxLtv)))
          .filter((p) => propPotentialRent(p, s) - propAnnualOpex(p, s) > p.askPrice * terms.maxLtv * (terms.rate / 100));
        // Försiktig investerare: föredra objekt med sittande hyresgäster (kassaflöde
        // nu) framför tomma renovation opportunity som blöder tills de rustas.
        const buy = affordable.filter((p) => p.tenants.length > 0).sort((a, b) => a.askPrice - b.askPrice)[0]
          ?? affordable.sort((a, b) => a.askPrice - b.askPrice)[0];
        if (buy) R({ type: "BUY", id: buy.id });
      }

      // Amortera aggressivt när kassan är stark – håll LTV och ränta nere.
      if (m % 4 === 2 && s.debt > 0 && s.cash > 3_000_000) R({ type: "AMORT", amount: Math.min(s.cash - 2_500_000, s.debt * 0.2) });

      // Bygg nyproduktion när kassan är stark.
      if (m % 9 === 4) {
        const lot = s.lots.find((l) => !l.owned);
        if (lot && canSpend(lot.price * 1.6)) {
          R({ type: "BUY_LOT", id: lot.id });
          R({ type: "BUILD", id: lot.id, propType: "bostad" });
        }
      }

      // Fyll vakanser manuellt också (redundans mot autoförvaltaren).
      R({ type: "LEASE_ALL" });
      for (const p of s.portfolio) for (const app of p.applications ?? []) R({ type: "ACCEPT_APPLICATION", id: p.id, applicationId: app.id, contract: "standard" });

      // Energiuppgradering & förbättring (bara med marginal).
      if (m % 6 === 0) {
        const target = s.portfolio.find((p) => p.status === "klar" && (p.energyClass ?? "D") !== "A");
        if (target && canSpend(300_000)) R({ type: "IMPROVE_ENERGY", id: target.id });
      }
      if (m % 9 === 5 && UPGRADES[0]) {
        const t = s.portfolio.find((p) => p.status === "klar" && !p.upgrades.includes(UPGRADES[0].id));
        if (t && canSpend(UPGRADES[0].cost)) R({ type: "UPGRADE", id: t.id, upg: UPGRADES[0].id });
      }

      // Bolagsexpansion när kraven nås (låser upp fler system).
      R({ type: "UPGRADE_COMPANY" });

      // Höj distriktsutvecklingen när kassan är stark → Fas 2-taket stiger.
      if (m % 10 === 7 && s.cash > 6_000_000) {
        const d = DISTRICTS.find((x) => s.portfolio.filter((p) => p.district === x.id).length >= 2);
        if (d && canSpend(1_500_000)) R({ type: "INVEST_DISTRICT", districtId: d.id, amount: 1_500_000 });
      }

      // Utvecklingsprojekt på vakanta hus: påbyggnad + rivning/nybyggnation.
      if (m % 6 === 1) {
        const vacant = s.portfolio.find((p) => p.status === "klar" && p.tenants.length === 0);
        if (vacant && canSpend(propMarketValue(vacant, s) * 0.3)) R({ type: "START_RENOVATION", id: vacant.id, kind: "påbyggnad" });
      }
      if (m % 11 === 5) {
        const old = s.portfolio.find((p) => p.status === "klar" && p.tenants.length === 0 && (s.year - (p.builtYear ?? s.year)) >= 15);
        if (old && canSpend(old.area * 3000)) { const before = s.portfolio.filter((p) => p.status === "bygger").length; R({ type: "REDEVELOP", id: old.id }); if (s.portfolio.filter((p) => p.status === "bygger").length > before) redevelops++; }
      }

      // Finans: aktier/forskning/industri bara när vi är RIKA (skydda reserven).
      if (m % 5 === 0 && s.stocks.length && s.cash > 8_000_000) {
        const st = s.stocks[m % s.stocks.length];
        if (canSpend(st.price * 100)) R({ type: "BUY_SHARES", stockId: st.id, qty: 100 });
      }
      if (m % 13 === 7) { const owned = s.stocks.find((st) => st.owned > 0); if (owned) R({ type: "SELL_SHARES", stockId: owned.id, qty: Math.ceil(owned.owned / 2) }); }
      if (!s.activeResearch && s.cash > 8_000_000 && (s.researchDone?.length ?? 0) < RESEARCH.length) {
        const next = RESEARCH.find((r) => !(s.researchDone ?? []).includes(r.id));
        if (next) R({ type: "START_RESEARCH", id: next.id });
      }
      if (!s.ipoActive && equityOf(s) > 180_000_000) R({ type: "DO_IPO" });
      if (m % 12 === 3 && s.cash > 12_000_000) { const il = (s.industryListings ?? [])[0]; if (il && canSpend(il.purchasePrice * 0.5)) R({ type: "BUY_INDUSTRY", id: il.id }); }
      } // slut på spelarens drag (hoppas över efter konkurs)

      // ── Månadstick (världen rullar oavsett spelarens öde) ──
      const wasOver = s.gameOver;
      s = advanceMonth(s);
      s = placeCity(s);
      if (s.gameOver && !wasOver && bankruptYear === null) bankruptYear = s.year;

      // ── Invarianter ──
      expect(Number.isFinite(s.cash), `cash NaN vid m=${m}`).toBe(true);
      const eq = equityOf(s);
      expect(Number.isFinite(eq), `equity NaN vid m=${m}`).toBe(true);
      expect(s.month).toBeGreaterThanOrEqual(1);
      expect(s.month).toBeLessThanOrEqual(12);
      // Riksbanken (economyLife) styr marknadsräntan – ska hålla sig rimlig.
      expect(Number.isFinite(s.interestRate)).toBe(true);
      expect(s.interestRate).toBeGreaterThan(0);
      expect(s.interestRate).toBeLessThan(20);
      const seen = new Set<string>();
      for (const p of s.portfolio) {
        const v = propMarketValue(p, s);
        expect(Number.isFinite(v) && v >= 0, `värde NaN/neg m=${m} id=${p.id}`).toBe(true);
        const obs = obsolescenceFactor(p, s);
        expect(obs).toBeGreaterThanOrEqual(0.7);
        expect(obs).toBeLessThanOrEqual(1);
        // Fas 2: eget hus får aldrig ha fler utbyggnadsprojekt än distriktets tak.
        expect((p.devLevel ?? 0), `devLevel > tak m=${m} id=${p.id} distrikt=${p.district}`).toBeLessThanOrEqual(maxDevLevel(s, p.district));
        if (p.parcelId) { expect(seen.has(p.parcelId), `dubbel parcel m=${m}`).toBe(false); seen.add(p.parcelId); }
        maxDev = Math.max(maxDev, p.devLevel ?? 0);
      }
      // Fas 2 syns även på rivalernas hus – spåra högsta devLevel i hela staden.
      for (const c of s.competitors) for (const p of c.portfolio ?? []) maxDev = Math.max(maxDev, p.devLevel ?? 0);
      // INVARIANT: allt ägande ligger på kartan – inga spökhus utanför tomtpoolen.
      const offMap =
        s.portfolio.filter((p) => !p.parcelId).length +
        s.competitors.reduce((a, c) => a + (c.portfolio ?? []).filter((p) => !p.parcelId).length, 0);
      expect(offMap, `off-map-ägande m=${m}`).toBe(0);
      peakEquity = Math.max(peakEquity, eq);
      worstCash = Math.min(worstCash, s.cash);
      peakHouses = Math.max(peakHouses, s.portfolio.filter((p) => p.status === "klar").length);
      scanLog();

      if ((m + 1) % 60 === 0 || m === 0) {
        const dev = DISTRICTS.map((d) => `${d.id.slice(0, 4)}:${(s.districtDev?.[d.id] ?? 1).toFixed(2)}×${accessibilityOf(s, d.id).toFixed(2)}`).join(" ");
        snapshots.push(
          `  År ${s.year} · EK ${(eq / 1e6).toFixed(0)} MSEK · kassa ${(s.cash / 1e6).toFixed(1)} · skuld ${(s.debt / 1e6).toFixed(0)} · ` +
          `hus ${s.portfolio.filter((p) => p.status === "klar").length} · ambient ${s.ambientGrown?.length ?? 0} · ` +
          `ränta ${s.interestRate.toFixed(1)}% · maxDev ${maxDev} · dev[${dev}]`,
        );
      }
    }

    // ── Rapport ──
    const tierDist: Record<string, number> = {};
    for (const d of DISTRICTS) { const t = districtTier(s, d.id).name; tierDist[t] = (tierDist[t] ?? 0) + 1; }
    const rivalUnits = s.competitors.reduce((a, c) => a + (c.portfolio ?? []).length, 0);
    const withDev = s.portfolio.filter((p) => (p.devLevel ?? 0) > 0).length;

    const report = [
      "\n================= SPELTEST 30 ÅR – RAPPORT =================",
      `Simulerade ${s.year - 1} år (${(s.year - 1) * 12}+ månadstick) utan krasch – invarianter höll varje månad.`,
      `Spelaren (scriptad heuristik): ${bankruptYear ? `❌ konkurs år ${bankruptYear}` : "✅ överlevde 30 år"}`,
      `Eget kapital nu: ${(equityOf(s) / 1e6).toFixed(1)} MSEK (topp ${(peakEquity / 1e6).toFixed(1)}) · lägsta kassa ${(worstCash / 1e6).toFixed(1)} MSEK`,
      `Egna hus: ${s.portfolio.filter((p) => p.status === "klar").length} nu (som mest ${peakHouses}) · skuld ${(s.debt / 1e6).toFixed(1)} MSEK · nivå ${s.companyLevel ?? 1}`,
      "",
      "FAS 1 – Tillväxtfront:",
      `  Bakgrundshus uppförda (ambientGrown): ${s.ambientGrown?.length ?? 0}`,
      "",
      "FAS 2 – Investeringsdriven mognad:",
      `  Hus med utbyggnad (devLevel>0): ${withDev} · högsta devLevel: ${maxDev}`,
      `  Distriktsstatus: ${Object.entries(tierDist).map(([k, v]) => `${k}×${v}`).join(", ")}`,
      "",
      "MAKRO:",
      `  Riksbanken: marknadsränta ${s.interestRate.toFixed(2)}%`,
      `  Konkurrenter: ${s.competitors.length} st, ${rivalUnits} hus totalt`,
      "",
      "HÄNDELSER UNDER 30 ÅR (räknade ur loggen):",
      ...Object.entries(ev).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`),
      `  budkrig påbörjade: ${bidsSeen}`,
      `  egna rivning/nybyggnation-projekt: ${redevelops}`,
      "",
      "TIDSLINJE (vart 5:e år):",
      ...snapshots,
      "===========================================================\n",
    ].join("\n");
    console.log(report);

    // Bevisa att simuleringen verkligen levde och testade systemen (världen
    // agerar oavsett hur spelaren spelar – invarianterna kollas per månad ovan):
    expect(s.year).toBeGreaterThanOrEqual(30);                         // hela 30 år simulerades
    expect((ev["boom"] ?? 0) + (ev["bust"] ?? 0)).toBeGreaterThan(0);  // konjunkturcykler
    expect(ev["rival-nybygge"] ?? 0).toBeGreaterThan(0);              // rivalbyggen
    expect(bidsSeen).toBeGreaterThan(0);                               // budkrig
    expect((ev["infra-byggstart"] ?? 0) + (ev["infra-invigt"] ?? 0)).toBeGreaterThan(0); // infrastruktur
  }, 30_000); // 30 s timeout – hela 30-årsloopen tar några sekunder.
});
